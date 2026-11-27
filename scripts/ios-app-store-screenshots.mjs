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
const ACCEPTED = { iPhone: [[1179, 2556], [1206, 2622]], iPad: [[2064, 2752], [2048, 2732]] };
const PREFERRED = {
  iPhone: ['iPhone 18 Pro', 'iPhone 17 Pro', 'iPhone 16 Pro', 'iPhone 15 Pro', 'iPhone 14 Pro', 'iPhone 17', 'iPhone 16', 'iPhone 15'],
  iPad: ['iPad Pro 13-inch (M5)', 'iPad Pro 13-inch (M4)', 'iPad Pro (12.9-inch) (6th generation)', 'iPad Air 13-inch (M3)', 'iPad Air 13-inch (M2)'],
};

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

function prepareHarness(family) {
  let source = readFileSync(join(ROOT, 'scripts', 'smoke-ios.py'), 'utf8');
  source = replaceOnce(source, 'ROOT = Path(__file__).resolve().parents[1]', `ROOT = Path(${JSON.stringify(ROOT)})`);
  source = replaceOnce(source, "ARTIFACTS = ROOT / 'test-artifacts'", `ARTIFACTS = Path(${JSON.stringify(join(OUTPUT, 'raw', family))})`);
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
    for (const family of Object.keys(PREFERRED)) command('python3', ['-c', 'import sys; compile(sys.stdin.read(), "native-screenshot-harness", "exec")'], { input: prepareHarness(family), stdio: ['pipe', 'inherit', 'inherit'] });
    command('python3', ['-c', 'import sys; compile(sys.stdin.read(), "lossless-screenshot-export", "exec")'], { input: EXPORT_PNG, stdio: ['pipe', 'inherit', 'inherit'] });
    console.log(JSON.stringify({ checked: true, fixtures: Object.fromEntries(Object.entries(samples).map(([family, data]) => [family, { sampleAccounts: data.kasalar.length, freeRootAccounts: data.kasalar.filter(account => account.parentId === null).length, sampleTransactions: data.transactions.length, totals: Core.totals(data.transactions) }])), sourceHarnessFileUnmodified: true, acceptedPortraitDimensions: ACCEPTED }));
    return;
  }
  if (args.length !== 4 || args[0] !== '--app' || args[2] !== '--family' || !Object.hasOwn(PREFERRED, args[3])) throw new Error('Usage: node scripts/ios-app-store-screenshots.mjs --app <Debug simulator App.app> --family iPhone|iPad; or --check');
  if (process.platform !== 'darwin') throw new Error('Native capture requires macOS and an installed matching Xcode/iOS Simulator runtime.');
  const app = resolve(ROOT, args[1]);
  const family = args[3];
  const data = fixture(family);
  if (!isAbsolute(app) || !app.endsWith('.app') || !existsSync(join(app, 'Info.plist'))) throw new Error('Compiled simulator application was not found.');
  const dir = join(OUTPUT, family), raw = join(OUTPUT, 'raw', family);
  if (existsSync(dir) || existsSync(raw)) throw new Error('Capture output already exists; use a fresh job instead of accepting stale screenshots.');
  mkdirSync(dir, { recursive: true });
  mkdirSync(raw, { recursive: true });
  const temporary = mkdtempSync(join(tmpdir(), 'bhu-store-screenshot-'));
  try {
    const harness = join(temporary, 'capture.py');
    writeFileSync(harness, prepareHarness(family), { mode: 0o600 });
    command('python3', [harness, app, BUNDLE, '--device-family', family, '--timeout', '900']);
    const evidence = JSON.parse(readFileSync(join(raw, 'native-ios-startup.json'), 'utf8'));
    if (evidence.bundleId !== BUNDLE || evidence.deviceFamily !== family || evidence.launches?.length !== 2 || evidence.launches.some(item => !item.nativeRead || !item.fixtureReturnedToJS || !item.contentPaintDetected || !item.safeAreaLayoutVerified || !item.snapshotUnchanged)) throw new Error('Required native screenshot proof is incomplete.');
    const destination = join(dir, '01-hesaplar.png');
    const exported = command('python3', ['-c', EXPORT_PNG, join(raw, 'native-ios-startup.png'), destination, family], { stdio: ['ignore', 'pipe', 'inherit'] });
    const pixels = JSON.parse(exported);
    const report = { bundleId: BUNDLE, sourceCommit: process.env.GITHUB_SHA || null, nativeSimulator: true, simulatorModel: evidence.deviceType,
      sdk: evidence.activeSDK, runtime: evidence.runtime, family, buildConfiguration: 'Debug', productionSourceModified: false,
      syntheticSampleOnly: true, freeRootAccounts: data.kasalar.filter(account => account.parentId === null).length,
      accountCount: data.kasalar.length, transactionCount: data.transactions.length, storeKitEntitlementBypass: false,
      capture: 'Actual simctl framebuffer after native file read and stable UIKit/DOM safe-area checks', coldLaunchesVerified: 2,
      screenshot: '01-hesaplar.png', screenshotSHA256: createHash('sha256').update(readFileSync(destination)).digest('hex'), ...pixels,
      specification: SPEC, screenshotScope: 'Account tree and income/expense/balance summary', requiresVisualReview: true,
      doesNotVerify: ['Other tabs or modal screenshots', 'Real-device StoreKit purchase or restoration', 'Hardware protection', 'App Store review or release approval'] };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

try { main(); } catch (error) { console.error(`Screenshot capture stopped: ${error.message}`); process.exitCode = 1; }
