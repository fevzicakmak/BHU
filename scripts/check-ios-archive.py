#!/usr/bin/env python3
"""Read-only mechanical inspection of an unsigned iPhoneOS Release .xcarchive.

Run after a fresh `npm run ios:sync` and xcodebuild archive:
  python3 scripts/check-ios-archive.py path/BHU.xcarchive --output report.json

The report is evidence about this archive, not App Store approval or signing.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys
from xml.parsers.expat import ExpatError

ROOT = Path(__file__).resolve().parents[1]
OWN_MANIFEST = ROOT / 'ios/App/CapApp-SPM/Sources/CapApp-SPM/Resources/PrivacyInfo.xcprivacy'
CORDOVA_EXTRAS = {'cordova.js', 'cordova_plugins.js'}
DOES_NOT_VERIFY = [
    'Distribution signing, provisioning profiles, certificates or Team ownership',
    'App Store Connect app/product registration, upload or review approval',
    'Real-device installation, protected-file behavior or data durability',
    'Real StoreKit purchases, restore, prices or production entitlement delivery',
    'Legal completeness of App Privacy, Privacy Manifests or export compliance',
]


def json_value(value):
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    if isinstance(value, bytes):
        return {'base64': base64.b64encode(value).decode('ascii')}
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def unresolved(value):
    return isinstance(value, str) and ('$' + '(' in value or '$' + '{' in value)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip()) and not unresolved(value)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def inspect_archive(archive):
    report = {
        'schemaVersion': 1,
        'generatedAtUTC': datetime.now(timezone.utc).isoformat(),
        'archive': str(archive),
        'status': 'failed',
        'checks': [],
        'errors': [],
        'doesNotVerify': list(DOES_NOT_VERIFY),
    }

    def check(name, condition, failure):
        report['checks'].append({'name': name, 'passed': bool(condition)})
        if not condition:
            report['errors'].append(failure)
        return bool(condition)

    def read_json(path, label):
        try:
            value = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(value, dict):
                raise ValueError('expected a JSON object')
            return value
        except (OSError, ValueError) as error:
            check(label, False, f'{label}: {error}')
            return None

    def read_plist(path, label):
        try:
            with path.open('rb') as stream:
                value = plistlib.load(stream)
            if not isinstance(value, dict):
                raise ValueError('expected a plist dictionary')
            return value
        except (OSError, ValueError, plistlib.InvalidFileException, ExpatError) as error:
            check(label, False, f'{label}: {error}')
            return None

    if not check('archive_directory', archive.is_dir() and archive.suffix == '.xcarchive',
                 'Archive must be an existing .xcarchive directory.'):
        return report
    apps = sorted(path for path in (archive / 'Products/Applications').glob('*.app') if path.is_dir())
    report['applicationPaths'] = [str(path.relative_to(archive)) for path in apps]
    if not check('one_main_application', len(apps) == 1,
                 f'Expected exactly one Products/Applications/*.app; found {len(apps)}.'):
        return report
    app = apps[0]
    if not check('application_inside_archive', app.resolve().is_relative_to(archive),
                 'Application resolves outside the archive.'):
        return report
    info = read_plist(app / 'Info.plist', 'application_info_plist')
    expected = read_json(ROOT / 'capacitor.config.json', 'repository_capacitor_config')
    source_info = read_plist(ROOT / 'ios/App/App/Info.plist', 'source_info_plist')
    if info is None or expected is None or source_info is None:
        return report

    report['application'] = {
        'path': str(app.relative_to(archive)),
        'bundleId': info.get('CFBundleIdentifier'),
        'displayName': info.get('CFBundleDisplayName'),
        'version': info.get('CFBundleShortVersionString'),
        'build': info.get('CFBundleVersion'),
        'minimumOSVersion': info.get('MinimumOSVersion'),
        'deviceFamilies': info.get('UIDeviceFamily'),
        'supportedPlatforms': info.get('CFBundleSupportedPlatforms'),
        'platformName': info.get('DTPlatformName'),
        'sdkName': info.get('DTSDKName'),
        'sdkBuild': info.get('DTSDKBuild'),
        'platformVersion': info.get('DTPlatformVersion'),
        'capacitorDebug': info.get('CAPACITOR_DEBUG'),
        'productId': info.get('KasaMultipleAccountsProductID'),
        'purchasesEnabled': info.get('KasaPurchasesEnabled'),
    }
    check('bundle_id_matches_config', nonempty(expected.get('appId')) and info.get('CFBundleIdentifier') == expected['appId'],
          'Archived CFBundleIdentifier does not match repository capacitor.config.json appId.')
    check('display_name_matches_config', nonempty(expected.get('appName')) and info.get('CFBundleDisplayName') == expected['appName'],
          'Archived CFBundleDisplayName does not match repository capacitor.config.json appName.')
    check('iphoneos_platform', info.get('CFBundleSupportedPlatforms') == ['iPhoneOS']
          and info.get('DTPlatformName', 'iphoneos') == 'iphoneos',
          'Archive must target iPhoneOS, not iPhoneSimulator or another platform.')
    families = info.get('UIDeviceFamily')
    check('iphone_and_ipad_families', isinstance(families, list) and all(type(item) is int for item in families)
          and sorted(families) == [1, 2], 'UIDeviceFamily must contain exactly iPhone (1) and iPad (2).')
    for field in ('CFBundleShortVersionString', 'CFBundleVersion'):
        check(f'resolved_{field}', nonempty(info.get(field)), f'{field} is missing, empty or an unresolved build variable.')
    for field in ('KasaMultipleAccountsProductID', 'KasaPurchasesEnabled'):
        source_value, actual = source_info.get(field), info.get(field)
        valid_source = nonempty(source_value) if field.endswith('ProductID') else type(source_value) is bool
        check(f'{field}_matches_source', valid_source and type(actual) is type(source_value) and actual == source_value,
              f'Archived {field} does not match ios/App/App/Info.plist.')
    debug = info.get('CAPACITOR_DEBUG')
    debug_disabled = debug is None or debug is False or (type(debug) is int and debug == 0)
    if isinstance(debug, str):
        debug_disabled = not unresolved(debug) and debug.strip().lower() in ('', 'false', 'no', '0')
    check('capacitor_debug_disabled', debug_disabled, 'CAPACITOR_DEBUG is enabled, unresolved or not a recognized disabled value.')

    executable = info.get('CFBundleExecutable')
    valid_executable = nonempty(executable) and executable == Path(executable).name and executable not in ('.', '..')
    check('main_executable_name', valid_executable, 'CFBundleExecutable is missing, unresolved or not a file name.')
    architectures = []
    if valid_executable:
        binary = app / executable
        if check('main_executable_present', binary.is_file() and binary.resolve().is_relative_to(app.resolve()),
                 'The main executable is missing or resolves outside the application.'):
            try:
                result = subprocess.run(['xcrun', 'lipo', '-archs', str(binary)], text=True,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False)
                if check('lipo_succeeded', result.returncode == 0, f'xcrun lipo failed: {result.stderr.strip()}'):
                    architectures = result.stdout.strip().split()
                    check('arm64_device_executable', 'arm64' in architectures
                          and not any(arch.startswith('x86_64') or arch == 'i386' for arch in architectures),
                          f'Main executable must include arm64 and exclude simulator Intel architectures: {architectures}.')
            except (OSError, subprocess.TimeoutExpired) as error:
                check('lipo_succeeded', False, f'Cannot inspect executable architectures; macOS/Xcode xcrun is required: {error}')
    report['architectures'] = architectures

    icons = info.get('CFBundleIcons') or {}
    primary = (icons.get('CFBundlePrimaryIcon') or {}) if isinstance(icons, dict) else {}
    icon_name = info.get('CFBundleIconName') or (primary.get('CFBundleIconName') if isinstance(primary, dict) else None)
    assets_car = app / 'Assets.car'
    report['icons'] = {'iconName': icon_name, 'assetsCarPresent': assets_car.is_file()}
    check('compiled_app_icon', nonempty(icon_name), 'Compiled Info.plist has no resolved CFBundleIconName for the primary icon.')
    check('compiled_asset_catalog', assets_car.is_file() and assets_car.stat().st_size > 0, 'Assets.car is missing or empty.')

    embedded = read_json(app / 'capacitor.config.json', 'embedded_capacitor_config')
    if embedded is not None:
        server = embedded.get('server')
        check('no_remote_server_url', server is None or (isinstance(server, dict) and 'url' not in server),
              'Embedded Capacitor config contains server.url or an invalid server configuration.')
        check('embedded_identity_matches', embedded.get('appId') == expected.get('appId')
              and embedded.get('appName') == expected.get('appName'), 'Embedded Capacitor appId/appName do not match repository config.')
        report['embeddedCapacitorConfig'] = embedded

    public = app / 'public'
    dist = ROOT / 'dist'
    assets = []
    expected_files = {path.relative_to(dist).as_posix(): path for path in dist.rglob('*') if path.is_file()} if dist.is_dir() else {}
    actual_files = {path.relative_to(public).as_posix(): path for path in public.rglob('*') if path.is_file()} if public.is_dir() else {}
    check('fresh_dist_available', bool(expected_files), 'dist/ is missing or empty; run npm run ios:sync before archiving.')
    check('embedded_public_present', public.is_dir() and public.resolve().is_relative_to(app.resolve()), 'Archived application has no self-contained public/ web assets.')
    check('all_dist_assets_present', not (set(expected_files) - set(actual_files)),
          f'Archived public/ is missing dist assets: {sorted(set(expected_files) - set(actual_files))}.')
    extras = sorted(set(actual_files) - set(expected_files))
    check('only_generated_cordova_extras', set(extras).issubset(CORDOVA_EXTRAS),
          f'Unexpected public/ assets outside dist/: {sorted(set(extras) - CORDOVA_EXTRAS)}.')
    for relative, source in sorted(expected_files.items()):
        target = actual_files.get(relative)
        if target is None:
            continue
        try:
            if not check(f'asset_inside_app:{relative}', target.resolve().is_relative_to(app.resolve()), f'Archived public/{relative} resolves outside the app.'):
                continue
            original, bundled = source.read_bytes(), target.read_bytes()
            matches = original == bundled
            assets.append({'path': relative, 'bytes': len(bundled), 'sha256': sha256(bundled), 'matchesDist': matches})
            check(f'asset:{relative}', matches, f'Archived public/{relative} differs byte-for-byte from dist/{relative}.')
        except OSError as error:
            check(f'asset:{relative}', False, f'Cannot read public/{relative}: {error}')
    report['assets'] = {'comparisonSource': 'Repository dist/ built by the caller before archive', 'files': assets,
                        'generatedCordovaExtras': sorted(set(extras) & CORDOVA_EXTRAS),
                        'unexpectedExtras': sorted(set(extras) - CORDOVA_EXTRAS)}

    forbidden = []
    for path in app.rglob('*'):
        relative = path.relative_to(app)
        parts = [part.lower() for part in relative.parts]
        if path.suffix.lower() in ('.storekit', '.xctest') or any(part in ('tests', 'test-artifacts') for part in parts):
            forbidden.append(relative.as_posix())
    report['forbiddenTestPaths'] = sorted(forbidden)
    check('no_test_payloads', not forbidden, f'Test content is embedded in the app: {sorted(forbidden)}.')

    source_manifest = read_plist(OWN_MANIFEST, 'source_privacy_manifest')
    manifests = []
    own_paths = []
    for path in sorted(app.rglob('PrivacyInfo.xcprivacy')):
        relative = path.relative_to(app)
        contents = read_plist(path, f'privacy_manifest:{relative.as_posix()}')
        bundle_names = [re.sub(r'[^a-z0-9]', '', part[:-7].lower()) for part in relative.parts if part.lower().endswith('.bundle')]
        own = any(name in ('capappspmcapappspm', 'capappspm') for name in bundle_names)
        manifests.append({'path': relative.as_posix(), 'isOwnCapAppResource': own, 'contents': json_value(contents)})
        if own:
            own_paths.append(relative.as_posix())
            check(f'own_privacy_matches:{relative.as_posix()}', contents is not None and source_manifest is not None and contents == source_manifest,
                  f'Bundled CapApp privacy manifest differs from source: {relative.as_posix()}.')
    check('own_capapp_privacy_resource_present', bool(own_paths), 'CapApp SPM resource bundle PrivacyInfo.xcprivacy was not found in the archive.')
    report['privacyManifests'] = {'sourcePath': str(OWN_MANIFEST.relative_to(ROOT)), 'ownResourcePaths': own_paths, 'manifests': manifests,
                                  'legalCompletenessAssessed': False}
    report['status'] = 'passed' if not report['errors'] else 'failed'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path, help='Unsigned Release iPhoneOS .xcarchive to inspect')
    parser.add_argument('--output', type=Path, required=True, help='JSON report path outside the archive')
    args = parser.parse_args()
    archive, output = args.archive.resolve(), args.output.resolve()
    if output.is_relative_to(archive):
        parser.error('--output must be outside the archive; inspection never changes archive contents.')
    try:
        report = inspect_archive(archive)
    except Exception as error:
        report = {'schemaVersion': 1, 'archive': str(archive), 'status': 'failed',
                  'errors': [f'Inspection could not finish: {type(error).__name__}: {error}'],
                  'doesNotVerify': list(DOES_NOT_VERIFY)}
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(json_value(report), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except OSError as error:
        print(f'Cannot write inspection report: {error}', file=sys.stderr)
        return 2
    print(f'iOS archive inspection {report["status"]}: {output}')
    for error in report.get('errors', []):
        print(f' - {error}', file=sys.stderr)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
