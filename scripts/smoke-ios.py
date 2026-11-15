#!/usr/bin/env python3
"""Launch the real bundled iOS app twice and verify its native storage bridge.

Usage: python scripts/smoke-ios.py path/to/App.app com.fevzicakmak.bhu
Requires macOS/Xcode. Uses a disposable simulator and synthetic on-device data;
never bundles a test fixture or changes production app code. This proves native
startup/read/relaunch, not StoreKit purchasing, native writes or file protection.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
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
    parser.add_argument('--timeout', type=int, default=300, help='Overall command/startup budget in seconds')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('This smoke test requires macOS with Xcode and an installed iOS Simulator runtime.')
    app = args.app.resolve()
    if not app.is_dir() or app.suffix != '.app':
        raise SystemExit(f'Built simulator app not found: {app}')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]+', args.bundle_id):
        raise SystemExit('Invalid bundle identifier.')
    ARTIFACTS.mkdir(exist_ok=True)
    deadline = time.monotonic() + args.timeout
    device = None
    console = None

    def run(*parts, limit=45, check=True):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('iOS startup smoke test exceeded its total time budget.')
        result = subprocess.run(['xcrun', 'simctl', *parts], text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=min(limit, remaining), check=False)
        if check and result.returncode:
            raise RuntimeError(f'simctl {parts[0]} failed ({result.returncode}):\n{result.stdout[-5000:]}')
        return result.stdout.strip()

    def stop_console():
        nonlocal console
        if console is None:
            return
        if console.poll() is None:
            console.terminate()
            try:
                console.wait(timeout=5)
            except subprocess.TimeoutExpired:
                console.kill(); console.wait(timeout=5)
        console = None

    try:
        devices = json.loads(run('list', 'devices', 'available', '-j'))['devices']
        candidates = [(runtime, item) for runtime, entries in devices.items()
                      if '.iOS-' in runtime for item in entries
                      if item.get('isAvailable', True) and item.get('name', '').startswith('iPhone')]
        if not candidates:
            raise RuntimeError('No available iPhone simulator runtime. Install an iOS Simulator runtime in Xcode.')
        # Pick the newest installed runtime; create a fresh device so manually running
        # this script can never overwrite an existing developer simulator's app data.
        def runtime_version(candidate):
            return tuple(int(n) for n in re.findall(r'\d+', candidate[0].split('iOS-')[-1]))
        runtime, template = max(candidates, key=runtime_version)
        device_type = template.get('deviceTypeIdentifier')
        if not device_type:
            types = json.loads(run('list', 'devicetypes', '-j'))['devicetypes']
            device_type = next((item['identifier'] for item in types if item['name'] == template['name']), None)
        if not device_type:
            raise RuntimeError('Cannot determine the selected iPhone simulator device type.')
        token = uuid.uuid4().hex[:10]
        device = run('create', f'BHU CI Smoke {token}', device_type, runtime)
        if not re.fullmatch(r'[A-Fa-f0-9-]{36}', device):
            raise RuntimeError(f'Unexpected disposable simulator identifier: {device}')
        print(f'Booting disposable {template["name"]} ({runtime}).', flush=True)
        run('boot', device)
        run('bootstatus', device, '-b', limit=180)
        run('install', device, str(app), limit=45)
        container = Path(run('get_app_container', device, args.bundle_id, 'data')).resolve()
        if not container.is_dir() or device not in container.parts:
            raise RuntimeError('Unexpected simulator app data container; refusing to seed it.')
        state_file = container / 'Library' / 'Application Support' / 'KasaPro' / 'state.json'
        if state_file.exists():
            raise RuntimeError('The new simulator already contains app data; refusing to overwrite it.')
        marker = f'BHU-CI-{token}'
        fixture = {'version': 2, 'kasalar': [{'id': 'ci-smoke-root', 'name': marker,
                   'parentId': None, 'includeInParentTotals': True,
                   'createdAt': '2026-11-15T12:00:00.000Z'}], 'transactions': [],
                   'activeKasaId': 'ci-smoke-root', 'revision': f'ci-smoke-{token}'}
        raw = json.dumps(fixture, separators=(',', ':'), ensure_ascii=False)
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(raw, encoding='utf-8')
        environment = os.environ.copy()
        environment['SIMCTL_CHILD_NSUnbufferedIO'] = 'YES'
        records = []

        for attempt in (1, 2):
            log_path = ARTIFACTS / f'native-ios-startup-{attempt}.log'
            with log_path.open('wb') as log:
                console = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console',
                                            '--terminate-running-process', device, args.bundle_id],
                                           stdout=log, stderr=subprocess.STDOUT, env=environment)
                launch_deadline = min(deadline, time.monotonic() + (60 if attempt == 1 else 45))
                proof = False
                while time.monotonic() < launch_deadline:
                    output = log_path.read_text(encoding='utf-8', errors='replace')
                    if BAD_STARTUP.search(output):
                        raise RuntimeError(f'Native/JavaScript startup error. See {log_path.name}:\n{output[-5000:]}')
                    returned_fixture = any('TO JS' in line and 'raw' in line and marker in line
                                           for line in output.splitlines())
                    if NATIVE_READ.search(output) and returned_fixture and 'WebView loaded' in output:
                        proof = True
                        break
                    if console.poll() is not None:
                        raise RuntimeError(f'App console exited before native startup proof. See {log_path.name}:\n{output[-5000:]}')
                    time.sleep(.25)
                if not proof:
                    raise RuntimeError(f'Timed out waiting for KasaStorage.read and the matching native raw payload. See {log_path.name}.')
                # Allow the ledger/account screen to finish rendering before capture.
                time.sleep(2)
                output = log_path.read_text(encoding='utf-8', errors='replace')
                if BAD_STARTUP.search(output) or console.poll() is not None:
                    raise RuntimeError(f'App failed after native storage returned. See {log_path.name}.')
                screenshot = ARTIFACTS / ('native-ios-startup.png' if attempt == 1 else 'native-ios-relaunch.png')
                run('io', device, 'screenshot', '--type=png', str(screenshot), limit=20)
                if state_file.read_text(encoding='utf-8') != raw:
                    raise RuntimeError('Launching the app unexpectedly replaced the seeded native snapshot.')
                records.append({'launch': attempt, 'nativeRead': True, 'fixtureReturnedToJS': True,
                                'snapshotUnchanged': True, 'screenshot': screenshot.name, 'log': log_path.name})
                run('terminate', device, args.bundle_id, check=False, limit=15)
                stop_console()
            print(f'PASS native storage read, JavaScript bridge and unchanged snapshot on cold launch {attempt}.', flush=True)

        summary = {'bundleId': args.bundle_id, 'deviceType': template['name'], 'runtime': runtime,
                   'disposableSimulator': True, 'launches': records,
                   'doesNotVerify': ['StoreKit purchases or restoration', 'native write/file-protection behavior',
                                     'real-device document/photo/printing flows', 'App Store signing or upload']}
        (ARTIFACTS / 'native-ios-startup.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
        print('Native startup smoke passed twice. Artifacts contain only synthetic test data.', flush=True)
    finally:
        stop_console()
        if device:
            for action in ('shutdown', 'delete'):
                try:
                    subprocess.run(['xcrun', 'simctl', action, device], stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, timeout=20, check=False)
                except subprocess.TimeoutExpired:
                    pass


if __name__ == '__main__':
    main()
