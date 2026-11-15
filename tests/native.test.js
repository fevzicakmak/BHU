'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');
const Native = require('../native.js');
const KEY = 'kasa-pro-data-v1';
const account = (id, parentId = null) => ({ id, name: id, parentId, includeInParentTotals: true, createdAt: '2026-11-15T12:00:00.000Z' });
const snapshot = (accounts = [account('a')]) => Core.normalizeState({ version: 2, kasalar: accounts, transactions: [], activeKasaId: accounts[0]?.id || null });
function memoryStorage(raw = null) {
  const values = new Map(raw === null ? [] : [[KEY, raw]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}
function harness({ nativeRaw = null, webRaw = null, native = true, pro = false } = {}) {
  const storage = memoryStorage(webRaw);
  const bridge = { raw: nativeRaw, pro, reads: 0, writes: [], exports: [], attachments: [], prints: [], statusCalls: 0, writeError: null, readError: null, statusError: null,
    purchaseResult: null, restoreResult: null, importResult: { status: 'cancelled' }, exportResult: { status: 'shared' } };
  const plugins = {
    KasaStorage: {
      async read() { bridge.reads++; if (bridge.readError) throw bridge.readError; return { raw: bridge.raw }; },
      async write(args) {
        bridge.writes.push(args);
        if (bridge.writeError) throw bridge.writeError;
        if (args.expectedRaw !== bridge.raw) throw Object.assign(new Error('Native snapshot changed'), { code: 'STORAGE_CONFLICT' });
        bridge.raw = args.raw; return { raw: bridge.raw };
      }
    },
    KasaDocuments: {
      async exportBackup(args) { bridge.exports.push(args); return bridge.exportResult; },
      async importBackup() { return bridge.importResult; },
      async exportFile(args) { bridge.attachments.push(args); return bridge.exportResult; },
      async printReport(args) { bridge.prints.push(args); return { status: 'printed' }; }
    },
    KasaPurchases: {
      async getStatus() { bridge.statusCalls++; if (bridge.statusError) throw bridge.statusError; return { isPro: bridge.pro, productId: 'test.multiple_accounts', productAvailable: true, price: '₺99,99' }; },
      async purchase() { const result = bridge.purchaseResult || { isPro: true }; if (result.isPro) bridge.pro = true; return result; },
      async restore() { const result = bridge.restoreResult || { isPro: false }; bridge.pro = result.isPro === true; return result; },
      async addListener() { return { remove() {} }; }
    }
  };
  const capacitor = { isNativePlatform: () => native, getPlatform: () => native ? 'ios' : 'web', isPluginAvailable: () => true, registerPlugin: name => plugins[name] };
  return { bridge, storage, runtime: Native.createRuntime({ capacitor, core: Core, storage, key: KEY }) };
}

test('one root and all descendants stay free; expanding root accounts requires purchase', () => {
  const base = snapshot([account('a'), account('child', 'a')]);
  assert.equal(Native.requiresPurchase(base, snapshot([account('a'), account('child', 'a'), account('grandchild', 'child')])), false);
  assert.equal(Native.requiresPurchase(base, snapshot([account('a'), account('child', 'a'), account('b')])), true);
  assert.equal(Native.requiresPurchase(snapshot([]), snapshot([account('a')])), false);
});
test('reparenting and deletion cannot bypass the root-account limit', () => {
  const base = snapshot([account('a'), account('b', 'a'), account('c', 'a')]);
  assert.equal(Native.requiresPurchase(base, snapshot([account('a'), account('b'), account('c', 'a')])), true);
  assert.equal(Native.requiresPurchase(base, snapshot([account('b'), account('c')])), true);
});
test('existing multiple-root records remain editable; import cannot add unknown accounts for free', () => {
  const base = snapshot([account('a'), account('b')]);
  const renamed = structuredClone(base); renamed.kasalar[0].name = 'Renamed';
  assert.equal(Native.requiresPurchase(base, renamed), false);
  assert.equal(Native.requiresPurchase(base, snapshot([account('a'), account('b', 'a')])), false);
  assert.equal(Native.requiresPurchase(base, base, { importing: true }), false);
  assert.equal(Native.requiresPurchase(base, snapshot([account('x'), account('y')]), { importing: true }), true);
});
test('native load reads the native snapshot instead of stale web storage', async () => {
  const nativeRaw = JSON.stringify(snapshot([account('native')]));
  const h = harness({ nativeRaw, webRaw: JSON.stringify(snapshot([account('web')])) });
  const loaded = await h.runtime.load();
  assert.equal(loaded.raw, nativeRaw); assert.equal(loaded.state.kasalar[0].id, 'native');
  assert.equal(h.runtime.currentRaw(), nativeRaw); assert.equal(h.bridge.writes.length, 0);
});
test('valid legacy web data migrates once without deleting or rewriting the original', async () => {
  const webRaw = JSON.stringify({ kasalar: [{ id: 'legacy', name: 'Legacy' }], transactions: [{ id: 't', kasaId: 'legacy', type: 'income', amount: 1.235, date: '2026-11-15' }] });
  const h = harness({ webRaw });
  const loaded = await h.runtime.load();
  assert.equal(loaded.migrated, true); assert.equal(loaded.state.transactions[0].amountCents, 124);
  assert.equal(h.storage.getItem(KEY), webRaw); assert.equal(h.bridge.raw, webRaw); assert.equal(h.bridge.writes.length, 1);
  const loadedAgain = await h.runtime.load();
  assert.equal(loadedAgain.migrated, false); assert.equal(h.bridge.writes.length, 1);
});
test('native read failure never silently falls back to web storage', async () => {
  const h = harness({ webRaw: JSON.stringify(snapshot()) });
  h.bridge.readError = Object.assign(new Error('Native file is unavailable'), { code: 'STORAGE_READ_FAILED' });
  await assert.rejects(h.runtime.load(), /Native file is unavailable/);
  assert.equal(h.bridge.writes.length, 0); assert.equal(h.runtime.currentRaw(), null);
});
test('corrupt native and legacy snapshots remain recoverable and are never written over', async () => {
  for (const options of [{ nativeRaw: '{broken' }, { webRaw: '{broken' }]) {
    const h = harness(options);
    await assert.rejects(h.runtime.load(), error => error.raw === '{broken');
    assert.equal(h.bridge.writes.length, 0);
    if (options.webRaw) assert.equal(h.storage.getItem(KEY), '{broken');
  }
});
test('failed and conflicting native writes preserve currentRaw and the last saved state', async () => {
  const raw = JSON.stringify(snapshot()); const h = harness({ nativeRaw: raw });
  await h.runtime.load();
  const next = snapshot([account('a'), account('child', 'a')]);
  h.bridge.writeError = Object.assign(new Error('Disk full'), { code: 'STORAGE_WRITE_FAILED' });
  await assert.rejects(h.runtime.save(next, raw), error => error.code === 'STORAGE_WRITE_FAILED');
  assert.equal(h.runtime.currentRaw(), raw); assert.equal(h.bridge.raw, raw);
  h.bridge.writeError = null; h.bridge.raw = JSON.stringify(snapshot([account('other')]));
  await assert.rejects(h.runtime.save(next, raw), error => error.code === 'STORAGE_CONFLICT');
  assert.equal(h.runtime.currentRaw(), raw);
});
test('native saves validate before writing and acknowledge only the native success', async () => {
  const raw = JSON.stringify(snapshot()); const h = harness({ nativeRaw: raw }); await h.runtime.load();
  const invalid = snapshot(); invalid.kasalar[0].parentId = 'missing';
  await assert.rejects(h.runtime.save(invalid, raw)); assert.equal(h.bridge.writes.length, 0);
  const result = await h.runtime.save(snapshot([account('a'), account('child', 'a')]), raw);
  assert.equal(result.raw, h.bridge.raw); assert.equal(h.runtime.currentRaw(), result.raw); assert.equal(result.state.kasalar.length, 2);
});
test('unavailable or revoked entitlement denies expansion but does not block existing data changes', async () => {
  const h = harness(); await h.runtime.load();
  const one = snapshot(), two = snapshot([account('a'), account('b')]);
  h.bridge.statusError = new Error('Store unavailable');
  await h.runtime.checkAccess(one, one);
  await assert.rejects(h.runtime.checkAccess(one, two), error => error.code === 'MULTI_ACCOUNT_REQUIRED');
  h.bridge.statusError = null; h.bridge.pro = true; await h.runtime.checkAccess(one, two);
  h.bridge.pro = false;
  await assert.rejects(h.runtime.checkAccess(one, two), error => error.code === 'MULTI_ACCOUNT_REQUIRED');
});
test('cancelled and pending purchases do not unlock; verified purchase and restore do', async () => {
  const h = harness();
  h.bridge.purchaseResult = { isPro: false, cancelled: true };
  assert.equal((await h.runtime.purchase()).isPro, false);
  h.bridge.purchaseResult = { isPro: false, pending: true };
  assert.equal((await h.runtime.purchase()).isPro, false);
  h.bridge.purchaseResult = { isPro: true };
  await h.runtime.purchase(); assert.equal((await h.runtime.getPurchaseStatus()).isPro, true);
  h.bridge.pro = false; h.bridge.restoreResult = { isPro: true };
  assert.equal((await h.runtime.restore()).isPro, true);
});
test('native documents preserve cancellation and return selected JSON without changing storage', async () => {
  const h = harness({ nativeRaw: JSON.stringify(snapshot()) }); await h.runtime.load(); const before = h.bridge.raw;
  await h.runtime.exportBackup(before, 'backup.json'); assert.deepEqual(h.bridge.exports[0], { data: before, fileName: 'backup.json' });
  h.bridge.exportResult = { status: 'cancelled' }; assert.equal((await h.runtime.exportBackup(before, 'backup.json')).status, 'cancelled');
  assert.equal((await h.runtime.importBackup()).status, 'cancelled');
  h.bridge.importResult = { status: 'selected', data: before, fileName: 'restored.json' };
  assert.equal((await h.runtime.importBackup()).data, before); assert.equal(h.bridge.raw, before);
});
test('native attachment sharing and printing delegate explicit content to the native document plugin', async () => {
  const h = harness();
  await h.runtime.exportAttachment({ name: 'receipt.txt', type: 'text/plain', url: 'data:text/plain;base64,YWJj' });
  assert.deepEqual(h.bridge.attachments[0], { dataBase64: 'YWJj', fileName: 'receipt.txt', type: 'text/plain' });
  const result = await h.runtime.printReport('<html><body>Report</body></html>', 'Kasa raporu');
  assert.deepEqual(h.bridge.prints[0], { html: '<html><body>Report</body></html>', jobName: 'Kasa raporu' });
  assert.equal(result.status, 'printed');
});
test('ordinary web usage retains local storage and is not coupled to StoreKit', async () => {
  const raw = JSON.stringify(snapshot()); const h = harness({ native: false, webRaw: raw });
  assert.equal(h.runtime.isNative, false); await h.runtime.load();
  await h.runtime.checkAccess(snapshot(), snapshot([account('a'), account('b')]));
  const saved = await h.runtime.save(snapshot([account('a'), account('b')]), raw);
  assert.equal(h.storage.getItem(KEY), saved.raw); assert.equal(h.bridge.reads, 0); assert.equal(h.bridge.statusCalls, 0);
});
