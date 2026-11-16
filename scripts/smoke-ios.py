#!/usr/bin/env python3
"""Check the real bundled iOS app's native read/JavaScript bridge on two cold launches.

Uses a disposable simulator matching the active Xcode SDK, an ad-hoc-signed
TEST COPY of the simulator app, and synthetic on-device data. No distribution
certificate, production test hooks, StoreKit bypass or real user records are used.
"""
import argparse
from collections import Counter
import errno
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'test-artifacts'
BAD_STARTUP = re.compile(
    r'\b(?:UNIMPLEMENTED|STORAGE_READ_FAILED)\b|STARTUP JS ERROR|Capacitor:\s*FATAL ERROR|'
    r'WebView (?:failed to load|failed provisional navigation|process terminated)|JS Eval error|'
    r'\b(?:ReferenceError|TypeError|SyntaxError):|Error loading plugin KasaStorage', re.IGNORECASE)
NATIVE_READ = re.compile(r'To Native\s*->\s+KasaStorage\s+read\b', re.IGNORECASE)


def bitmap_paint_metrics(path):
    """Sample a macOS sips BMP, excluding system status/navigation strips.

    This rejects a uniform WKWebView background; it does not verify individual
    controls, account text, accessibility or the correctness of the layout.
    """
    data = path.read_bytes()
    if len(data) < 54 or data[:2] != b'BM':
        raise RuntimeError('Screenshot conversion did not return a BMP image.')
    offset = struct.unpack_from('<I', data, 10)[0]
    dib_size, width, signed_height, planes, depth, compression = struct.unpack_from('<IiiHHI', data, 14)
    height = abs(signed_height)
    if dib_size < 40 or width <= 0 or height == 0 or planes != 1 or depth not in (24, 32) or compression not in (0, 3):
        raise RuntimeError(f'Unsupported screenshot BMP: {width}x{height}, {depth}bit, compression={compression}.')
    pixel_bytes = depth // 8
    channels = (2, 1, 0)  # Default BMP pixel order is BGR or BGRA.
    if compression == 3:
        if depth != 32 or len(data) < 66:
            raise RuntimeError('Unsupported BMP color masks.')
        masks = struct.unpack_from('<III', data, 54)
        shifts = tuple(mask.bit_length() - 8 for mask in masks)
        if any(shift < 0 or shift % 8 or mask != 255 << shift for mask, shift in zip(masks, shifts)):
            raise RuntimeError('Screenshot BMP must use full 8bit RGB color channels.')
        channels = tuple(shift // 8 for shift in shifts)
        if len(set(channels)) != 3 or max(channels) >= pixel_bytes:
            raise RuntimeError('Invalid screenshot BMP color channels.')
    stride = ((width * depth + 31) // 32) * 4
    if offset < 14 + dib_size or offset + stride * height > len(data):
        raise RuntimeError('Screenshot BMP pixel data is incomplete.')
    left, right, top, bottom = width // 10, width * 9 // 10, height // 5, height * 4 // 5
    colors = Counter()
    for y in range(top, bottom, max(1, (bottom - top) // 100)):
        row = y if signed_height < 0 else height - 1 - y
        for x in range(left, right, max(1, (right - left) // 100)):
            start = offset + row * stride + x * pixel_bytes
            colors[tuple(data[start + channel] >> 4 for channel in channels)] += 1
    samples = sum(colors.values())
    nonmodal = (samples - max(colors.values(), default=0)) / max(1, samples)
    return {'width': width, 'height': height, 'centralSampleCount': samples,
            'quantizedColors': len(colors), 'nonmodalFraction': round(nonmodal, 5),
            'painted': len(colors) >= 8 and nonmodal >= .01}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=Path)
    parser.add_argument('bundle_id')
    parser.add_argument('--device-family', choices=['iPhone', 'iPad'], default='iPhone')
    parser.add_argument('--storage-tests', action='store_true', help='Run the real native storage XCTest suite on this owned simulator')
    parser.add_argument('--timeout', type=int, default=600, help='Command/startup budget; failure diagnostics add bounded time')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('Requires macOS, Xcode and a matching installed iOS Simulator runtime.')
    app = args.app.resolve()
    if not app.is_dir() or app.suffix != '.app':
        raise SystemExit(f'Built simulator app not found: {app}')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]+', args.bundle_id):
        raise SystemExit('Invalid bundle identifier.')
    ARTIFACTS.mkdir(exist_ok=True)
    deadline = time.monotonic() + args.timeout
    device = None
    console = None
    console_master = None
    console_log = None
    staging = None
    metadata = {'bundleId': args.bundle_id, 'hostArchitecture': os.uname().machine, 'deviceFamily': args.device_family,
                'timings': [], 'launches': [],
                'nativeStorageTests': {'status': 'not-run' if args.storage_tests else 'not-requested'},
                'doesNotVerify': ['StoreKit purchases or restoration', 'hardware-backed file protection and lock-state enforcement',
                                 'real-device document/photo/printing flows', 'App Store distribution signing or upload',
                                 'individual controls, account text, accessibility or layout correctness']}

    def command(parts, limit=45, check=True, stage=None, cwd=None, log_path=None):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f'Native startup time budget exhausted before {stage or parts[0]}.')
        started = time.monotonic()
        if stage:
            print(f'BEGIN {stage}', flush=True)
        record = {'stage': stage or ' '.join(parts[:3]), 'command': parts}
        try:
            if log_path is None:
                result = subprocess.run(parts, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        cwd=cwd, timeout=min(limit, remaining), check=False)
                output = result.stdout
                errors = result.stderr
            else:
                with log_path.open('w', encoding='utf-8') as output_file:
                    result = subprocess.run(parts, text=True, stdout=output_file, stderr=subprocess.STDOUT,
                                            cwd=cwd, timeout=min(limit, remaining), check=False)
                output = log_path.read_text(encoding='utf-8', errors='replace')
                errors = ''
            record['exitCode'] = result.returncode
            if check and result.returncode:
                raise RuntimeError(f'{stage or parts[0]} failed ({result.returncode}):\n{output[-3000:]}\n{errors[-3000:]}')
            return output.strip()
        except subprocess.TimeoutExpired as error:
            record['timedOut'] = True
            raise TimeoutError(f'{stage or " ".join(parts[:3])} timed out after {min(limit, remaining):.1f}s.') from error
        finally:
            record['seconds'] = round(time.monotonic() - started, 2)
            metadata['timings'].append(record)
            if stage:
                print(f'END {stage}: {record["seconds"]:.2f}s' + (' TIMEOUT' if record.get('timedOut') else ''), flush=True)

    def run(*parts, limit=45, check=True, stage=None):
        return command(['xcrun', 'simctl', *parts], limit=limit, check=check, stage=stage)

    def pump_console(timeout=.25):
        if console_master is None or console_log is None:
            time.sleep(timeout); return
        ready, _, _ = select.select([console_master], [], [], timeout)
        if ready:
            try:
                chunk = os.read(console_master, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                chunk = b''
            if chunk:
                console_log.write(chunk); console_log.flush()

    def stop_console():
        nonlocal console, console_master, console_log
        if console is not None:
            if console.poll() is None:
                console.terminate()
                try:
                    console.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    console.kill(); console.wait(timeout=5)
            pump_console(0)
            console = None
        if console_master is not None:
            os.close(console_master); console_master = None
        if console_log is not None:
            console_log.close(); console_log = None

    def diagnostics(error):
        # Run even when the main time budget expired, before app/simulator teardown.
        # Preserve screenshots and bounded unified logs rather than an empty console artifact.
        metadata['failure'] = str(error)
        (ARTIFACTS / 'native-ios-failure.json').write_text(json.dumps(metadata, indent=2) + '\n')
        if not device:
            return
        captures = [
            ('native-ios-failure-screenshot.log', ['xcrun', 'simctl', 'io', device, 'screenshot', '--type=png', str(ARTIFACTS / 'native-ios-failure.png')], 15),
            ('native-ios-unified.log', ['xcrun', 'simctl', 'spawn', device, 'log', 'show', '--last', '3m', '--style', 'compact', '--info', '--predicate',
             f'process == "App" OR subsystem BEGINSWITH "com.apple.WebKit" OR eventMessage CONTAINS[c] "{args.bundle_id}" OR eventMessage CONTAINS[c] "KasaStorage"'], 25),
            ('native-ios-launchctl.log', ['xcrun', 'simctl', 'spawn', device, 'launchctl', 'list'], 10),
            ('native-ios-host-processes.log', ['ps', '-axo', 'pid,ppid,%cpu,%mem,etime,comm'], 5),
            ('native-ios-host-memory.log', ['memory_pressure', '-Q'], 5),
            ('native-ios-host-coresimulator.log', ['/usr/bin/log', 'show', '--last', '3m', '--style', 'compact', '--info', '--predicate',
             'subsystem BEGINSWITH "com.apple.CoreSimulator" OR process == "Simulator" OR process == "SimulatorTrampoline"'], 20),
        ]
        for name, parts, timeout in captures:
            try:
                result = subprocess.run(parts, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=False)
                (ARTIFACTS / name).write_text(f'exitCode={result.returncode}\n{result.stdout[-400000:]}', encoding='utf-8')
            except Exception as capture_error:
                (ARTIFACTS / name).write_text(f'Diagnostic capture failed: {capture_error}\n', encoding='utf-8')
            pump_console(0)
        print('Failure screenshot, console and unified-log diagnostics saved to test-artifacts/.', flush=True)

    try:
        sdk = command(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-version'], limit=15)
        version = tuple(int(n) for n in sdk.split('.')[:2])
        if len(version) != 2:
            raise RuntimeError(f'Unexpected active iOS Simulator SDK version: {sdk}')
        metadata['activeSDK'] = sdk
        metadata['activeXcode'] = command(['xcode-select', '-p'], limit=15)
        devices = json.loads(run('list', 'devices', 'available', '-j'))['devices']
        candidates = [(runtime, item) for runtime, entries in devices.items() if '.iOS-' in runtime
                      and tuple(int(n) for n in re.findall(r'\d+', runtime.split('iOS-')[-1]))[:2] == version
                      for item in entries if item.get('isAvailable', True) and item.get('name', '').startswith(args.device_family)]
        if not candidates:
            raise RuntimeError(f'No available {args.device_family} runtime matches active Xcode SDK {sdk}. Install its matching iOS runtime; do not mix a newer runtime with an older Xcode.')
        runtime, template = candidates[0]
        metadata.update({'runtime': runtime, 'deviceType': template['name'], 'disposableSimulator': True})
        device_type = template.get('deviceTypeIdentifier')
        if not device_type:
            types = json.loads(run('list', 'devicetypes', '-j'))['devicetypes']
            device_type = next((item['identifier'] for item in types if item['name'] == template['name']), None)
        if not device_type:
            raise RuntimeError(f'Cannot determine selected {args.device_family} device type.')

        # Sign only a simulator-test copy: ad-hoc signing is certificate-free and is
        # NOT App Store/distribution signing. ARM simulators can reject unsigned code.
        staging = tempfile.TemporaryDirectory(prefix='bhu-ios-smoke-')
        test_app = Path(staging.name) / app.name
        shutil.copytree(app, test_app, symlinks=True)
        command(['codesign', '--force', '--deep', '--sign', '-', '--timestamp=none', str(test_app)], limit=45)
        command(['codesign', '--verify', '--deep', '--strict', str(test_app)], limit=20)
        metadata['signature'] = 'Ad-hoc simulator test copy only; original artifact unchanged'
        token = uuid.uuid4().hex[:10]
        device = run('create', f'BHU CI Smoke {token}', device_type, runtime)
        if not re.fullmatch(r'[A-Fa-f0-9-]{36}', device):
            raise RuntimeError(f'Unexpected disposable simulator identifier: {device}')
        metadata['deviceUDID'] = device
        print(f'Active SDK {sdk}; booting matching {template["name"]} ({runtime}).', flush=True)
        run('boot', device, stage='Boot disposable simulator')
        simulator_app = Path(metadata['activeXcode']) / 'Applications' / 'Simulator.app'
        if not simulator_app.is_dir():
            raise RuntimeError(f'Active Xcode Simulator.app not found: {simulator_app}')
        # A booted launchd is not sufficient evidence that headless graphics and
        # MobileInstallation are ready. Attach the active Xcode's Simulator UI.
        command(['open', '-a', str(simulator_app), '--args', '-CurrentDeviceUDID', device], limit=20,
                stage='Attach Simulator UI to owned device')
        run('bootstatus', device, '-b', limit=300, stage='Wait for OS boot status')
        ready_screenshot = ARTIFACTS / 'native-ios-ready.png'
        metadata['readiness'] = {}
        # Give each independent service its own bounded readiness phase. A slow
        # first framebuffer must not leave the installation registry a 1s budget.
        for service, budget in (('framebuffer', 120), ('application registry', 90)):
            ready_deadline = min(deadline, time.monotonic() + budget)
            last_error = None
            ready_attempt = 0
            while time.monotonic() < ready_deadline:
                ready_attempt += 1
                try:
                    limit = min(30, max(1, ready_deadline-time.monotonic()))
                    stage = f'Readiness {service} attempt {ready_attempt}'
                    if service == 'framebuffer':
                        run('io', device, 'screenshot', '--type=png', str(ready_screenshot), limit=limit, stage=stage)
                        if not ready_screenshot.is_file() or ready_screenshot.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
                            raise RuntimeError('Simulator framebuffer did not return a PNG screenshot.')
                    else:
                        registry = run('listapps', device, limit=limit, stage=stage)
                        if not registry:
                            raise RuntimeError('Simulator application registry returned no response.')
                    metadata['readiness'][service] = {'responded': True, 'attempts': ready_attempt}
                    break
                except (RuntimeError, TimeoutError) as error:
                    last_error = str(error)
                    print(f'Simulator services not ready: {last_error}', flush=True)
                    if time.monotonic() < ready_deadline:
                        time.sleep(2)
            else:
                raise RuntimeError(f'Simulator {service} readiness expired before installing BHU: {last_error}')
        run('install', device, str(test_app), limit=120, stage='Install signed simulator test copy')
        container = Path(run('get_app_container', device, args.bundle_id, 'data')).resolve()
        if not container.is_dir() or device not in container.parts:
            raise RuntimeError('Unexpected simulator data container; refusing to seed it.')
        state_file = container / 'Library' / 'Application Support' / 'KasaPro' / 'state.json'
        if state_file.exists():
            raise RuntimeError('Fresh simulator already contains app data; refusing to overwrite it.')
        marker = f'BHU-CI-{token}'
        fixture = {'version': 2, 'kasalar': [{'id': 'ci-smoke-root', 'name': marker,
                   'parentId': None, 'includeInParentTotals': True, 'createdAt': '2026-11-15T12:00:00.000Z'}],
                   'transactions': [], 'activeKasaId': 'ci-smoke-root', 'revision': f'ci-smoke-{token}'}
        raw = json.dumps(fixture, separators=(',', ':'), ensure_ascii=False)
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(raw, encoding='utf-8')
        if args.storage_tests:
            metadata['nativeStorageTests'] = {'status': 'running', 'host': 'SwiftPM XCTest runner sandbox'}
            package = ROOT / 'ios' / 'App' / 'CapApp-SPM'
            scheme_log = ARTIFACTS / 'native-ios-storage-schemes.log'
            scheme_output = command(['xcodebuild', '-list', '-json'], limit=120, cwd=package,
                                    stage='Discover native storage package test scheme', log_path=scheme_log)
            # Some Xcode versions prefix a package-resolution note before JSON.
            start = scheme_output.find('{')
            if start < 0:
                raise RuntimeError('Xcode returned no native package scheme JSON.')
            scheme_data, _ = json.JSONDecoder().raw_decode(scheme_output[start:])
            schemes = []
            for value in scheme_data.values():
                if isinstance(value, dict):
                    schemes.extend(value.get('schemes', []))
            scheme = next((name for name in ['CapApp-SPM', 'CapApp-SPM-Package'] if name in schemes), None)
            if scheme is None:
                raise RuntimeError(f'Native storage package scheme unavailable: {schemes}')
            result_bundle = ARTIFACTS / 'native-ios-storage.xcresult'
            if result_bundle.exists():
                shutil.rmtree(result_bundle)
            test_log = ARTIFACTS / 'native-ios-storage-tests.log'
            command(['xcodebuild', '-scheme', scheme, '-destination', f'id={device}',
                     '-derivedDataPath', str(ROOT / 'ios-build' / 'storage-tests-derived'),
                     '-resultBundlePath', str(result_bundle), '-parallel-testing-enabled', 'NO',
                     '-maximum-concurrent-test-simulator-destinations', '1', 'CODE_SIGNING_ALLOWED=NO', 'test'],
                    limit=600, cwd=package, stage='Run real native storage XCTest suite', log_path=test_log)
            summary_text = command(['xcrun', 'xcresulttool', 'get', 'test-results', 'summary', '--path', str(result_bundle)],
                                   limit=30, stage='Read native XCTest result summary')
            summary = json.loads(summary_text)
            (ARTIFACTS / 'native-ios-storage-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
            passed = int(summary.get('passedTests', 0))
            failed = int(summary.get('failedTests', 0))
            skipped = int(summary.get('skippedTests', 0))
            total = int(summary.get('totalTestCount', 0))
            if failed or passed < 6 or total < 7 or skipped > 1:
                raise RuntimeError(f'Native XCTest coverage was not completed: passed={passed}, failed={failed}, skipped={skipped}.')
            if state_file.read_text(encoding='utf-8') != raw:
                raise RuntimeError('Native storage tests unexpectedly changed the BHU app sandbox fixture.')
            metadata['nativeStorageTests'] = {'status': 'passed', 'passed': passed, 'failed': failed, 'skipped': skipped, 'total': total,
                'host': 'SwiftPM XCTest runner sandbox', 'log': test_log.name, 'xcresult': result_bundle.name,
                'appSnapshotUnchanged': True, 'hardwareProtectionVerified': False}
            print(f'PASS native storage XCTest: {passed} passed, {skipped} skipped; BHU app snapshot untouched.', flush=True)
        else:
            metadata['nativeStorageTests'] = {'status': 'not-requested'}

        environment = os.environ.copy(); environment['SIMCTL_CHILD_NSUnbufferedIO'] = 'YES'
        records = metadata['launches']

        for attempt in (1, 2):
            launched_at = time.monotonic()
            print(f'BEGIN Native cold launch {attempt}', flush=True)
            log_path = ARTIFACTS / f'native-ios-startup-{attempt}.log'
            screenshot = ARTIFACTS / ('native-ios-startup.png' if attempt == 1 else 'native-ios-relaunch.png')
            record = {'launch': attempt, 'nativeRead': False, 'fixtureReturnedToJS': False,
                      'contentPaintDetected': False, 'snapshotUnchanged': False,
                      'screenshot': screenshot.name, 'log': log_path.name}
            records.append(record)
            console_log = log_path.open('wb')
            console_master, slave = pty.openpty()
            os.set_blocking(console_master, False)
            try:
                console = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console-pty', '--terminate-running-process', device, args.bundle_id],
                                           stdin=slave, stdout=slave, stderr=slave, env=environment, start_new_session=True)
            finally:
                os.close(slave)
            launch_deadline = min(deadline, time.monotonic() + (120 if attempt == 1 else 90))
            proof = False
            while time.monotonic() < launch_deadline:
                pump_console()
                output = log_path.read_text(encoding='utf-8', errors='replace')
                if BAD_STARTUP.search(output):
                    raise RuntimeError(f'Native/JavaScript startup error in {log_path.name}:\n{output[-5000:]}')
                returned_fixture = any('TO JS' in line and 'raw' in line and marker in line for line in output.splitlines())
                if NATIVE_READ.search(output) and returned_fixture and 'WebView loaded' in output:
                    proof = True; break
                if console.poll() is not None:
                    raise RuntimeError(f'Console exited before startup proof in {log_path.name}:\n{output[-5000:]}')
            if not proof:
                raise RuntimeError(f'Timed out waiting for actual KasaStorage.read and matching TO JS payload: {log_path.name}')
            record.update({'nativeRead': True, 'fixtureReturnedToJS': True, 'webViewLoaded': True})
            # A completed navigation/native read can precede the first GPU paint
            # on a fresh simulator. Never accept a uniform native background.
            paint_deadline = min(deadline, time.monotonic() + 90)
            paint_attempt = 0
            last_paint_error = None
            with tempfile.TemporaryDirectory(prefix='bhu-ios-paint-') as paint_directory:
                bitmap = Path(paint_directory) / 'screenshot.bmp'
                while time.monotonic() < paint_deadline:
                    paint_attempt += 1
                    pump_console(0)
                    output = log_path.read_text(encoding='utf-8', errors='replace')
                    if BAD_STARTUP.search(output) or console.poll() is not None:
                        raise RuntimeError(f'App failed while waiting for content paint: {log_path.name}')
                    try:
                        screenshot.unlink(missing_ok=True)
                        bitmap.unlink(missing_ok=True)
                        remaining = max(.1, paint_deadline-time.monotonic())
                        run('io', device, 'screenshot', '--type=png', str(screenshot), limit=min(20, remaining),
                            stage=f'Cold launch {attempt} paint screenshot {paint_attempt}')
                        remaining = max(.1, paint_deadline-time.monotonic())
                        command(['sips', '-s', 'format', 'bmp', str(screenshot), '--out', str(bitmap)],
                                limit=min(15, remaining), stage=f'Cold launch {attempt} inspect screenshot {paint_attempt}')
                        metrics = bitmap_paint_metrics(bitmap)
                        record['paint'] = {**metrics, 'attempts': paint_attempt}
                        print(f'Content paint sample: {json.dumps(metrics, sort_keys=True)}', flush=True)
                        if metrics['painted']:
                            record['contentPaintDetected'] = True
                            break
                        last_paint_error = f'Uniform or insufficient central content: {metrics}'
                    except (RuntimeError, TimeoutError) as error:
                        last_paint_error = str(error)
                        print(f'Content paint not ready: {error}', flush=True)
                    retry_at = min(paint_deadline, time.monotonic()+2)
                    while time.monotonic() < retry_at:
                        pump_console()
                else:
                    raise RuntimeError(f'Content paint did not appear within its 90s budget: {last_paint_error}')
            pump_console(0)
            output = log_path.read_text(encoding='utf-8', errors='replace')
            if BAD_STARTUP.search(output) or console.poll() is not None:
                raise RuntimeError(f'App failed after native storage returned: {log_path.name}')
            if state_file.read_text(encoding='utf-8') != raw:
                raise RuntimeError('Launching unexpectedly replaced the seeded native snapshot.')
            record['snapshotUnchanged'] = True
            run('terminate', device, args.bundle_id, check=False, limit=15)
            stop_console()
            print(f'PASS real native bridge and unchanged persistent snapshot on cold launch {attempt} ({time.monotonic()-launched_at:.2f}s).', flush=True)

        metadata['launches'] = records
        if metadata['nativeStorageTests']['status'] != 'passed':
            metadata['doesNotVerify'].append('native writes, compare-and-swap and write-failure preservation')
        (ARTIFACTS / 'native-ios-startup.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
        print('Native startup smoke passed twice. Artifacts contain only synthetic data.', flush=True)
    except Exception as error:
        if metadata.get('nativeStorageTests', {}).get('status') == 'running':
            metadata['nativeStorageTests']['status'] = 'failed'
        if metadata['nativeStorageTests']['status'] != 'passed':
            metadata['doesNotVerify'].append('native writes, compare-and-swap and write-failure preservation')
        diagnostics(error)
        raise
    finally:
        stop_console()
        if device:
            for action in ('terminate', 'shutdown', 'delete'):
                parts = ['xcrun', 'simctl', action, device] + ([args.bundle_id] if action == 'terminate' else [])
                try:
                    subprocess.run(parts, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False)
                except subprocess.TimeoutExpired:
                    pass
        if staging is not None:
            staging.cleanup()


if __name__ == '__main__':
    main()
