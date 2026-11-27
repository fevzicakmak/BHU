#!/usr/bin/env node
/** Capture genuine native screenshot candidates; never signs or uploads a distribution build. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Core = require('../core.js');
const BUNDLE = 'com.fevzicakmak.bhu';
const SPEC = 'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/';
const OUTPUT = join(ROOT, 'test-artifacts', 'app-store-screenshot-candidates');
const VIEWS = ['accounts', 'iap'];
const PRODUCTION_FILES = ['app.js', 'core.js', 'styles.css'];
const ACCEPTED = { iPhone: [[1179, 2556], [1206, 2622]], iPad: [[2064, 2752], [2048, 2732]] };
const PREFERRED = {
  iPhone: ['iPhone 18 Pro', 'iPhone 17 Pro', 'iPhone 16 Pro', 'iPhone 15 Pro', 'iPhone 14 Pro', 'iPhone 17', 'iPhone 16', 'iPhone 15'],
  iPad: ['iPad Pro 13-inch (M5)', 'iPad Pro 13-inch (M4)', 'iPad Pro (12.9-inch) (6th generation)', 'iPad Air 13-inch (M3)', 'iPad Air 13-inch (M2)'],
};

// This runs only in a disposable simulator app copy. It exercises production
// event handlers; it never changes UI text, StoreKit responses or entitlements.
const IAP_AUTOMATION = String.raw`
;(() => {
  let started = false;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rect = element => {
    const r = element.getBoundingClientRect();
    return [r.top, r.right, r.bottom, r.left].map(value => Math.round(value * 100) / 100);
  };
  const visible = element => {
    const r = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (r.width <= 0 || r.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return false;
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return !!hit && (element === hit || element.contains(hit));
  };
  const emit = report => console.log('BHU_CAPTURE_UI ' + JSON.stringify(report));
  const attempt = async () => {
    if (started || document.readyState !== 'complete' || document.querySelector('#app-loading') || document.querySelector('#app[inert]')) return;
    started = true;
    try {
      const settings = document.querySelector('header [data-action="open-settings"]');
      if (!settings) throw new Error('SETTINGS_ACTION_MISSING');
      settings.click();
      await pause(100);
      const open = document.querySelector('.modal [data-action="open-multi-account"]');
      if (!open) throw new Error('MULTI_ACCOUNT_ACTION_MISSING');
      open.click();
      let settled = false;
      for (let index = 0; index < 160; index++) {
        const title = document.querySelector('#modal-title');
        const status = document.querySelector('#purchase-status');
        const purchase = document.querySelector('[data-action="purchase-multi-account"]');
        if (title?.textContent.trim() === 'Çoklu Hesap' && status?.textContent.trim() && purchase && !status.textContent.includes('Satın alma bilgileri yükleniyor') && !purchase.textContent.includes('Satın alma bilgileri yükleniyor')) { settled = true; break; }
        await pause(250);
      }
      if (!settled) throw new Error('REAL_PURCHASE_STATUS_NOT_SETTLED');
      for (let sample = 0; sample < 12; sample++) {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const modal = document.querySelector('.modal');
        const controls = {
          modal,
          title: document.querySelector('#modal-title'),
          feature: modal?.querySelector('.plan-card h3'),
          freeRule: modal?.querySelector('.plan-card > p:not(.eyebrow)'),
          restore: modal?.querySelector('[data-action="restore-purchases"]'),
          purchase: modal?.querySelector('[data-action="purchase-multi-account"]'),
        };
        if (Object.values(controls).some(element => !element)) throw new Error('REAL_PAYWALL_CONTROL_MISSING');
        const statusText = document.querySelector('#purchase-status').textContent.trim();
        const purchaseText = controls.purchase.textContent.trim();
        if (purchaseText === 'Çoklu Hesap açık') throw new Error('UNEXPECTED_ALREADY_UNLOCKED_UI');
        const featureVisible = controls.feature.textContent.includes('Ana hesaplarınızı ayrı ayrı takip edin');
        const freeRulePresent = controls.freeRule.textContent.includes('Bir ana hesap ve onun alt hesapları ücretsizdir.');
        emit({ view: 'iap', ready: featureVisible && freeRulePresent,
          statusText, purchaseText, purchaseEnabled: !controls.purchase.disabled,
          visible: Object.fromEntries(Object.entries(controls).map(([key, element]) => [key, visible(element)])),
          bounds: Object.fromEntries(Object.entries(controls).map(([key, element]) => [key, rect(element)])) });
        await pause(400);
      }
    } catch (error) { emit({ view: 'iap', ready: false, error: String(error.message) }); }
  };
  document.addEventListener('kasa:render', attempt);
  const timer = setInterval(() => { if (started) clearInterval(timer); else attempt(); }, 200);
  attempt();
})();
`;

const IAP_PYTHON_GATE = String.raw`
def capture_iap_ui(output, layout):
    if re.search(r'To Native\s*->\s+KasaPurchases\s+(?:purchase|restore)\b', output, re.IGNORECASE):
        raise RuntimeError('A purchase or restoration was invoked during read-only IAP capture.')
    if not re.search(r'To Native\s*->\s+KasaPurchases\s+getStatus\b', output, re.IGNORECASE):
        raise RuntimeError('Waiting for the real native purchase-status request.')
    reports = []
    for line in output.splitlines():
        if 'BHU_CAPTURE_UI ' in line:
            try:
                report, _ = json.JSONDecoder().raw_decode(line.split('BHU_CAPTURE_UI ', 1)[1])
                if report.get('view') == 'iap' and report.get('ready') is True:
                    reports.append(report)
            except (ValueError, TypeError, AttributeError):
                continue
    if len(reports) < 2:
        raise RuntimeError('Waiting for two settled, actual IAP UI measurements.')
    required = {'modal', 'title', 'feature', 'freeRule', 'restore', 'purchase'}
    previous = None
    for report in reports[-2:]:
        if set(report.get('bounds', {})) != required or set(report.get('visible', {})) != required:
            raise RuntimeError('Actual IAP UI geometry is incomplete.')
        if not all(report['visible'].values()) or not report.get('statusText') or not report.get('purchaseText'):
            raise RuntimeError('Actual IAP title, feature or restore controls are not visible.')
        safe = layout['safe']
        for name, rect in report['bounds'].items():
            if not isinstance(rect, list) or len(rect) != 4 or any(isinstance(n, bool) or not isinstance(n, (int,float)) or not math.isfinite(n) for n in rect):
                raise RuntimeError('Actual IAP UI contains invalid geometry.')
            top,right,bottom,left = rect
            if not (bottom > top and right > left and top >= safe['top']-2 and left >= safe['left']-2 and bottom <= safe['bottom']+2 and right <= safe['right']+2):
                raise RuntimeError('Actual IAP control exceeds the native UIKit safe area: '+name)
            if previous and any(abs(n-before)>1 for n,before in zip(rect, previous['bounds'][name])):
                raise RuntimeError('Waiting for stable actual IAP UI geometry.')
        if previous and (report['statusText'] != previous['statusText'] or report['purchaseText'] != previous['purchaseText']):
            raise RuntimeError('Waiting for a stable real Apple purchase status.')
        previous = report
    return {**reports[-1], 'nativeStatusRead': True, 'purchaseOrRestoreBridgeCallObserved': False}

`;

const CHECK_IAP_HARNESS = String.raw`
import ast,copy,hashlib,json,math,re,shutil,subprocess,sys,tempfile,textwrap
from pathlib import Path
source=sys.stdin.read()
ROOT=Path(sys.argv[1]); node=sys.argv[2]
tree=ast.parse(source)
gate=next(item for item in tree.body if isinstance(item,ast.FunctionDef) and item.name=='capture_iap_ui')
namespace={'json':json,'math':math,'re':re}
exec(compile(ast.Module(body=[gate],type_ignores=[]),'generated-iap-gate','exec'),namespace)
check=namespace['capture_iap_ui']; keys=['modal','title','feature','freeRule','restore','purchase']
report={'view':'iap','ready':True,'statusText':'Apple status unavailable','purchaseText':'Purchase unavailable','visible':{key:True for key in keys},'bounds':{key:[200,800,900,200] for key in keys}}
layout={'safe':{'top':32,'right':1032,'bottom':1356,'left':0}}
bridge='[log] To Native -> KasaPurchases getStatus 123'
def log(a,b=None,native=bridge):
    return native+chr(10)+'BHU_CAPTURE_UI '+json.dumps(a)+chr(10)+'BHU_CAPTURE_UI '+json.dumps(b or a)
assert check(log(report),layout)['nativeStatusRead'] is True
failures=[]
bad=copy.deepcopy(report);bad['bounds']['modal'][2]=1376;failures.append(('outside modal',log(bad)))
bad=copy.deepcopy(report);bad['visible']['restore']=False;failures.append(('hidden restore',log(bad)))
failures.append(('missing native status',log(report,native='')))
for method in ['purchase','restore']:
    failures.append((method+' invoked',log(report,native=bridge+chr(10)+'To Native -> KasaPurchases '+method+' 456')))
for name,text in failures:
    try:check(text,layout)
    except RuntimeError:pass
    else:raise SystemExit('Generated IAP gate accepted '+name)
start=source.index('        source_names = ')
end=source.index("        command(['codesign', '--force', '--deep'",start)
injection=textwrap.dedent(source[start:end])
names=['app.js','core.js','styles.css']
before={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names}
with tempfile.TemporaryDirectory(prefix='bhu-iap-harness-check-') as folder:
    test_app=Path(folder)/'App.app';public=test_app/'public';public.mkdir(parents=True)
    for name in names:shutil.copy2(ROOT/name,public/name)
    metadata={}
    scope={'ROOT':ROOT,'test_app':test_app,'metadata':metadata,'hashlib':hashlib}
    exec(compile(injection,'generated-iap-copy-injection','exec'),scope)
    actual=(public/'app.js').read_bytes();original=(ROOT/'app.js').read_bytes()
    assert actual.startswith(original+bytes([10])), 'Automation must append an actual newline, not literal backslash-n.'
    subprocess.run([node,'--check',str(public/'app.js')],check=True)
    assert metadata['captureAutomation']['compiledSourceSHA256BeforeAutomation']==before
    outside=Path(folder)/'outside-app.js';outside.write_bytes(original)
    (public/'app.js').unlink();(public/'app.js').symlink_to(outside)
    try:exec(compile(injection,'generated-iap-copy-symlink-guard','exec'),scope)
    except RuntimeError:pass
    else:raise SystemExit('Disposable copy injection followed a resource symlink.')
    assert outside.read_bytes()==original
assert before=={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names}
print('PASS generated IAP gate: actual native status accepted; unsafe/hidden/buy/restore rejected; appended full app.js passes node --check; symlink target and production source unchanged.')
`;

function productionDigests() {
  return Object.fromEntries(PRODUCTION_FILES.map(name => [name, createHash('sha256').update(readFileSync(join(ROOT, name))).digest('hex')]));
}

function fixture(family) {
  if (!Object.hasOwn(PREFERRED, family)) throw new Error('Unsupported screenshot fixture family.');
  const accountRows = family === 'iPhone' ? [
    ['demo-root', 'Örnek', null], ['demo-cash', 'Kasa', 'demo-root'],
  ] : [
    ['demo-root', 'Örnek İşletme', null], ['demo-cash', 'Kasa', 'demo-root'],
    ['demo-bank', 'Banka', 'demo-root'], ['demo-pos', 'POS', 'demo-root'],
  ];
  const accounts = accountRows.map(([id, name, parentId]) => ({ id, name, parentId, includeInParentTotals: true, createdAt: '2026-11-01T09:00:00.000Z' }));
  const transactions = [
    ['demo-root', 'income', 2000000, '2026-11-02', 'Örnek İşletme', 'Açılış bakiyesi'],
    ['demo-root', 'expense', 350000, '2026-11-03', 'Örnek Tedarikçi', 'Malzeme alımı'],
    ['demo-cash', 'income', 1850000, '2026-11-05', 'Örnek Müşteri', 'Satış tahsilatı'],
    ['demo-cash', 'expense', 420000, '2026-11-08', 'Örnek Tedarikçi', 'İşletme gideri'],
    ['demo-bank', 'income', 7420000, '2026-11-12', 'Örnek Müşteri', 'Hizmet bedeli'],
    ['demo-bank', 'expense', 2350000, '2026-11-16', 'Örnek İşletme', 'Kira ödemesi'],
    ['demo-pos', 'income', 3860000, '2026-11-20', 'Örnek Müşteri', 'Kartlı satış'],
    ['demo-pos', 'expense', 190000, '2026-11-23', 'Örnek İşletme', 'Banka komisyonu'],
  ].map(([kasaId, type, amountCents, date, customerName, description], index) => ({
    id: `demo-tx-${index + 1}`,
    kasaId: family === 'iPhone' ? (kasaId === 'demo-bank' ? 'demo-root' : kasaId === 'demo-pos' ? 'demo-cash' : kasaId) : kasaId,
    type, amountCents, date, customerName, description,
    attachments: [], createdAt: `${date}T12:00:00.000Z`,
  }));
  const data = Core.normalizeState({ version: 2, kasalar: accounts, transactions, activeKasaId: 'demo-root', revision: null });
  if (data.kasalar.filter(account => account.parentId === null).length !== 1) throw new Error('Screenshot fixture must remain within free single-root access.');
  return data;
}

function replaceOnce(text, before, after) {
  const first = text.indexOf(before);
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) throw new Error('Native screenshot harness anchor changed; review before capturing.');
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function prepareHarness(family, view = 'accounts') {
  if (!VIEWS.includes(view)) throw new Error('Unsupported screenshot view.');
  const outputFamily = view === 'iap' ? `${family}-iap` : family;
  let source = readFileSync(join(ROOT, 'scripts', 'smoke-ios.py'), 'utf8');
  source = replaceOnce(source, 'ROOT = Path(__file__).resolve().parents[1]', `ROOT = Path(${JSON.stringify(ROOT)})`);
  source = replaceOnce(source, "ARTIFACTS = ROOT / 'test-artifacts'", `ARTIFACTS = Path(${JSON.stringify(join(OUTPUT, 'raw', outputFamily))})`);
  source = replaceOnce(source, '        if not candidates:\n',
    `        preferred = ${JSON.stringify(PREFERRED[family])}\n        candidates = sorted([(runtime, item) for runtime, item in candidates if item.get('name') in preferred], key=lambda item: preferred.index(item[1]['name']))\n        if not candidates:\n`);
  const start = source.indexOf('        fixture = {');
  const end = source.indexOf('        raw = json.dumps(fixture,', start);
  if (start < 0 || end < 0 || source.indexOf('        fixture = {', start + 1) >= 0) throw new Error('Native fixture anchor changed; no capture attempted.');
  // Capacitor may truncate console payloads: keep the invisible revision marker
  // at the start of the raw file, never in an account name shown in the image.
  const seed = `        fixture = json.loads(${JSON.stringify(JSON.stringify(fixture(family)))})\n        fixture.pop('revision', None)\n        fixture = {'revision': marker, **fixture}\n`;
  source = source.slice(0, start) + seed + source.slice(end);
  source = replaceOnce(source, "        run('install', device, str(test_app), limit=120, stage='Install signed simulator test copy')",
    "        run('status_bar', device, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100', stage='Set screenshot status bar')\n        run('install', device, str(test_app), limit=120, stage='Install signed simulator test copy')");
  if (view === 'iap') {
    source = replaceOnce(source, 'import argparse\n', 'import argparse\nimport hashlib\n');
    source = replaceOnce(source, '\ndef main():\n', '\n' + IAP_PYTHON_GATE + '\ndef main():\n');
    const beforeSign = "        command(['codesign', '--force', '--deep', '--sign', '-', '--timestamp=none', str(test_app)], limit=45)";
    const injection = `        source_names = ${JSON.stringify(PRODUCTION_FILES)}\n        source_hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source_names}\n        for name in source_names:\n            resource = test_app / 'public' / name\n            if (test_app / 'public').is_symlink() or resource.is_symlink() or not resource.resolve(strict=True).is_relative_to(test_app.resolve()):\n                raise RuntimeError('Simulator-copy resource escapes the disposable application; refusing to modify it.')\n        compiled_hashes = {name: hashlib.sha256((test_app / 'public' / name).read_bytes()).hexdigest() for name in source_names}\n        if source_hashes != compiled_hashes:\n            raise RuntimeError('Compiled simulator resources do not match unchanged production source.')\n        automation = ${JSON.stringify(IAP_AUTOMATION)}\n        with (test_app / 'public' / 'app.js').open('a', encoding='utf-8') as target:\n            target.write('\\n' + automation + '\\n')\n        metadata['captureAutomation'] = {'view': 'iap', 'testCopyOnly': True, 'actions': ['open-settings', 'open-multi-account'], 'purchaseOrRestoreTriggered': False, 'productionSourceSHA256': source_hashes, 'compiledSourceSHA256BeforeAutomation': compiled_hashes, 'disposableAppJSSHA256AfterAutomation': hashlib.sha256((test_app / 'public' / 'app.js').read_bytes()).hexdigest()}\n`;
    source = replaceOnce(source, beforeSign, injection + beforeSign);
    source = replaceOnce(source, "                        safe_area_layout(output, metadata['deviceType'])\n", "                        layout_before_capture = safe_area_layout(output, metadata['deviceType'])\n                        capture_iap_ui(output, layout_before_capture)\n");
    const record = "                            record.update({'safeAreaLayoutVerified': True, 'safeAreaLayout': layout})";
    source = replaceOnce(source, record, record + "\n                            record['captureUI'] = capture_iap_ui(log_path.read_text(encoding='utf-8', errors='replace'), layout)");
  }
  // The existing native read, unchanged file, two cold launches, paint and safe-area checks stay mandatory.
  for (const gate of ['for attempt in (1, 2):', "'safeAreaLayoutVerified': True", 'NATIVE_READ.search(output)', 'state_file.read_text', 'safe_area_layout(output,']) {
    if (!source.includes(gate)) throw new Error('A mandatory native screenshot proof gate is missing.');
  }
  return source;
}

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: ROOT, encoding: 'utf8', timeout: 1_200_000, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${binary} failed (${result.status ?? result.error?.code ?? 'unknown'}).`);
  return result.stdout;
}

const EXPORT_PNG = String.raw`
import hashlib,json,sys
from pathlib import Path
from PIL import Image
source,destination,family=sys.argv[1:]
accepted={'iPhone':[(1179,2556),(1206,2622)],'iPad':[(2064,2752),(2048,2732)]}
with Image.open(source) as image:
    image.load()
    if image.format!='PNG' or image.mode not in ('RGB','RGBA') or image.size not in accepted[family]:
        raise SystemExit('Screenshot is not a supported, unscaled native PNG for the required display family.')
    if 'transparency' in image.info or (image.mode=='RGBA' and image.getchannel('A').getextrema()!=(255,255)):
        raise SystemExit('Screenshot contains transparent pixels; do not flatten or fabricate a background.')
    rgb=image.convert('RGB')
    expected=hashlib.sha256(rgb.tobytes()).hexdigest()
    options={key:image.info[key] for key in ('icc_profile','dpi') if key in image.info}
    rgb.save(destination,format='PNG',**options)
    size=image.size
with Image.open(destination) as exported:
    exported.load()
    if exported.mode!='RGB' or exported.size!=size or hashlib.sha256(exported.tobytes()).hexdigest()!=expected:
        raise SystemExit('Lossless RGB screenshot export verification failed.')
print(json.dumps({'width':size[0],'height':size[1],'mode':'RGB','opaque':True,'sourcePixelsPreserved':True,'rgbPixelSHA256':expected}))
`;

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--check') {
    const samples = Object.fromEntries(Object.keys(PREFERRED).map(family => [family, fixture(family)]));
    if (JSON.stringify(Core.totals(samples.iPhone.transactions)) !== JSON.stringify(Core.totals(samples.iPad.transactions))) throw new Error('Family fixtures must preserve the same income, expense and balance totals.');
    for (const family of Object.keys(PREFERRED)) for (const view of VIEWS) command('python3', ['-c', 'import sys; compile(sys.stdin.read(), "native-screenshot-harness", "exec")'], { input: prepareHarness(family, view), stdio: ['pipe', 'inherit', 'inherit'] });
    command('python3', ['-c', CHECK_IAP_HARNESS, ROOT, process.execPath], { input: prepareHarness('iPad', 'iap'), stdio: ['pipe', 'inherit', 'inherit'] });
    new Function(IAP_AUTOMATION);
    command('python3', ['-c', 'import sys; compile(sys.stdin.read(), "lossless-screenshot-export", "exec")'], { input: EXPORT_PNG, stdio: ['pipe', 'inherit', 'inherit'] });
    console.log(JSON.stringify({ checked: true, views: VIEWS, fixtures: Object.fromEntries(Object.entries(samples).map(([family, data]) => [family, { sampleAccounts: data.kasalar.length, freeRootAccounts: data.kasalar.filter(account => account.parentId === null).length, sampleTransactions: data.transactions.length, totals: Core.totals(data.transactions) }])), productionSourceSHA256: productionDigests(), sourceHarnessFileUnmodified: true, acceptedPortraitDimensions: ACCEPTED }));
    return;
  }
  const options = {};
  if (args.length % 2) throw new Error('Screenshot arguments require option/value pairs.');
  for (let index = 0; index < args.length; index += 2) {
    if (!['--app', '--family', '--view'].includes(args[index]) || Object.hasOwn(options, args[index])) throw new Error('Unsupported or duplicate screenshot argument.');
    options[args[index]] = args[index + 1];
  }
  const family = options['--family'];
  const view = options['--view'] || 'accounts';
  if (!options['--app'] || !Object.hasOwn(PREFERRED, family) || !VIEWS.includes(view)) throw new Error('Usage: node scripts/ios-app-store-screenshots.mjs --app <Debug simulator App.app> --family iPhone|iPad [--view accounts|iap]; or --check');
  if (process.platform !== 'darwin') throw new Error('Native capture requires macOS and an installed matching Xcode/iOS Simulator runtime.');
  const app = resolve(ROOT, options['--app']);
  const data = fixture(family);
  const productionBefore = productionDigests();
  if (!isAbsolute(app) || !app.endsWith('.app') || !existsSync(join(app, 'Info.plist'))) throw new Error('Compiled simulator application was not found.');
  const outputFamily = view === 'iap' ? `${family}-iap` : family;
  const dir = join(OUTPUT, outputFamily), raw = join(OUTPUT, 'raw', outputFamily);
  if (existsSync(dir) || existsSync(raw)) throw new Error('Capture output already exists; use a fresh job instead of accepting stale screenshots.');
  mkdirSync(dir, { recursive: true });
  mkdirSync(raw, { recursive: true });
  const temporary = mkdtempSync(join(tmpdir(), 'bhu-store-screenshot-'));
  try {
    const harness = join(temporary, 'capture.py');
    writeFileSync(harness, prepareHarness(family, view), { mode: 0o600 });
    command('python3', [harness, app, BUNDLE, '--device-family', family, '--timeout', '900']);
    const evidence = JSON.parse(readFileSync(join(raw, 'native-ios-startup.json'), 'utf8'));
    if (evidence.bundleId !== BUNDLE || evidence.deviceFamily !== family || evidence.launches?.length !== 2 || evidence.launches.some(item => !item.nativeRead || !item.fixtureReturnedToJS || !item.contentPaintDetected || !item.safeAreaLayoutVerified || !item.snapshotUnchanged)) throw new Error('Required native screenshot proof is incomplete.');
    if (view === 'iap' && (!evidence.captureAutomation?.testCopyOnly || evidence.captureAutomation.purchaseOrRestoreTriggered !== false || evidence.launches.some(item => item.captureUI?.ready !== true))) throw new Error('Actual native IAP UI capture proof is incomplete.');
    const productionAfter = productionDigests();
    if (JSON.stringify(productionBefore) !== JSON.stringify(productionAfter)) throw new Error('Production source changed during screenshot capture.');
    const name = view === 'iap' ? '02-coklu-hesap.png' : '01-hesaplar.png';
    const destination = join(dir, name);
    const exported = command('python3', ['-c', EXPORT_PNG, join(raw, 'native-ios-startup.png'), destination, family], { stdio: ['ignore', 'pipe', 'inherit'] });
    const pixels = JSON.parse(exported);
    const report = { bundleId: BUNDLE, sourceCommit: process.env.GITHUB_SHA || null, nativeSimulator: true, simulatorModel: evidence.deviceType,
      sdk: evidence.activeSDK, runtime: evidence.runtime, family, view, buildConfiguration: 'Debug', productionSourceModified: false,
      productionSourceSHA256Before: productionBefore, productionSourceSHA256After: productionAfter,
      disposableCopyAutomation: view === 'iap' ? evidence.captureAutomation : null,
      syntheticSampleOnly: true, freeRootAccounts: data.kasalar.filter(account => account.parentId === null).length,
      accountCount: data.kasalar.length, transactionCount: data.transactions.length, storeKitEntitlementBypass: false,
      capture: 'Actual simctl framebuffer after native file read and stable UIKit/DOM safe-area checks', coldLaunchesVerified: 2,
      screenshot: name, screenshotSHA256: createHash('sha256').update(readFileSync(destination)).digest('hex'), ...pixels,
      specification: SPEC, screenshotScope: view === 'iap' ? 'Actual multi-account feature offer and restore control with real Apple status' : 'Account tree and income/expense/balance summary',
      iapUI: view === 'iap' ? evidence.launches.at(-1).captureUI : null, requiresVisualReview: true,
      doesNotVerify: ['Other tabs or modal screenshots', 'Real-device StoreKit purchase or restoration', 'Hardware protection', 'App Store review or release approval'] };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    if (JSON.stringify(productionBefore) !== JSON.stringify(productionDigests())) throw new Error('Production source changed during screenshot capture.');
  }
}

try { main(); } catch (error) { console.error(`Screenshot capture stopped: ${error.message}`); process.exitCode = 1; }
