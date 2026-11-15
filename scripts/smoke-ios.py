#!/usr/bin/env python3
"""Check the real bundled iOS app's native read/JavaScript bridge on two cold launches.

Uses a disposable simulator matching the active Xcode SDK, an ad-hoc-signed
TEST COPY of the simulator app, and synthetic on-device data. No distribution
certificate, production test hooks, StoreKit bypass or real user records are used.
"""
import argparse
import errno
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=Path)
    parser.add_argument('bundle_id')
    parser.add_argument('--timeout', type=int, default=300, help='Command/startup budget; failure diagnostics add bounded time')
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
    metadata = {'bundleId': args.bundle_id, 'hostArchitecture': os.uname().machine}

    def command(parts, limit=45, check=True):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Native startup smoke exceeded its total time budget.')
        result = subprocess.run(parts, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=min(limit, remaining), check=False)
        if check and result.returncode:
            raise RuntimeError(f'{parts[0]} {parts[1]} failed ({result.returncode}):\n{result.stdout[-3000:]}\n{result.stderr[-3000:]}')
        return result.stdout.strip()

    def run(*parts, limit=45, check=True):
        return command(['xcrun', 'simctl', *parts], limit=limit, check=check)

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
                      for item in entries if item.get('isAvailable', True) and item.get('name', '').startswith('iPhone')]
        if not candidates:
            raise RuntimeError(f'No available iPhone runtime matches active Xcode SDK {sdk}. Install its matching iOS runtime; do not mix a newer runtime with an older Xcode.')
        runtime, template = candidates[0]
        metadata.update({'runtime': runtime, 'deviceType': template['name'], 'disposableSimulator': True})
        device_type = template.get('deviceTypeIdentifier')
        if not device_type:
            types = json.loads(run('list', 'devicetypes', '-j'))['devicetypes']
            device_type = next((item['identifier'] for item in types if item['name'] == template['name']), None)
        if not device_type:
            raise RuntimeError('Cannot determine selected iPhone device type.')

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
        run('boot', device)
        run('bootstatus', device, '-b', limit=180)
        run('install', device, str(test_app), limit=45)
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
        environment = os.environ.copy(); environment['SIMCTL_CHILD_NSUnbufferedIO'] = 'YES'
        records = []

        for attempt in (1, 2):
            log_path = ARTIFACTS / f'native-ios-startup-{attempt}.log'
            console_log = log_path.open('wb')
            console_master, slave = pty.openpty()
            os.set_blocking(console_master, False)
            try:
                console = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console-pty', '--terminate-running-process', device, args.bundle_id],
                                           stdin=slave, stdout=slave, stderr=slave, env=environment, start_new_session=True)
            finally:
                os.close(slave)
            launch_deadline = min(deadline, time.monotonic() + (60 if attempt == 1 else 45))
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
            settling = time.monotonic() + 2
            while time.monotonic() < settling:
                pump_console()
            output = log_path.read_text(encoding='utf-8', errors='replace')
            if BAD_STARTUP.search(output) or console.poll() is not None:
                raise RuntimeError(f'App failed after native storage returned: {log_path.name}')
            screenshot = ARTIFACTS / ('native-ios-startup.png' if attempt == 1 else 'native-ios-relaunch.png')
            run('io', device, 'screenshot', '--type=png', str(screenshot), limit=20)
            if state_file.read_text(encoding='utf-8') != raw:
                raise RuntimeError('Launching unexpectedly replaced the seeded native snapshot.')
            records.append({'launch': attempt, 'nativeRead': True, 'fixtureReturnedToJS': True, 'snapshotUnchanged': True,
                            'screenshot': screenshot.name, 'log': log_path.name})
            run('terminate', device, args.bundle_id, check=False, limit=15)
            stop_console()
            print(f'PASS real native bridge and unchanged persistent snapshot on cold launch {attempt}.', flush=True)

        metadata.update({'launches': records, 'doesNotVerify': ['StoreKit purchases or restoration', 'native writes/file protection',
                        'real-device document/photo/printing flows', 'App Store distribution signing or upload']})
        (ARTIFACTS / 'native-ios-startup.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
        print('Native startup smoke passed twice. Artifacts contain only synthetic data.', flush=True)
    except Exception as error:
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
