/* Native boundaries. Web keeps its existing storage; iOS uses verified native plugins. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaNative = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  function requiresPurchase(before, candidate, { importing = false } = {}) {
    const roots = data => data.kasalar.filter(account => account.parentId == null).length;
    const next = roots(candidate);
    if (next <= 1) return false;
    if (next > roots(before)) return true;
    const known = new Set(before.kasalar.map(account => account.id));
    return importing && candidate.kasalar.some(account => !known.has(account.id));
  }
  function createRuntime(options = {}) {
    const core = options.core || root.KasaCore;
    const capacitor = options.capacitor || root.Capacitor;
    const storage = options.storage || { getItem: key => root.localStorage.getItem(key), setItem: (key, value) => root.localStorage.setItem(key, value) };
    const key = options.key || 'kasa-pro-data-v1';
    const isNative = Boolean(capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'ios');
    const plugin = name => capacitor.registerPlugin(name);
    const files = isNative ? plugin('KasaStorage') : null;
    const documents = isNative ? plugin('KasaDocuments') : null;
    const purchases = isNative ? plugin('KasaPurchases') : null;
    let lastRaw = null;
    const empty = () => core.normalizeState({ version: 2, kasalar: [], transactions: [], activeKasaId: null, revision: null });
    function nativeError(error) {
      if (error?.code === 'STORAGE_CONFLICT') return Object.assign(new Error('Veriler başka bir pencerede değişti. Güncel verileri yükleyin; taslağınız korunacak.'), { code: error.code });
      return error instanceof Error ? error : Object.assign(new Error(error?.message || 'Cihaz işlemi tamamlanamadı.'), { code: error?.code });
    }
    return {
      isNative,
      currentRaw: () => lastRaw,
      async load() {
        let raw = null, migrated = false;
        try {
          raw = isNative ? (await files.read()).raw ?? null : storage.getItem(key);
          if (isNative && raw === null) {
            const legacy = storage.getItem(key);
            if (legacy !== null) {
              raw = legacy;
              core.normalizeState(JSON.parse(legacy)); // Validate before copying; never silently replace damaged data.
              await files.write({ raw: legacy, expectedRaw: null });
              migrated = true;
            }
          }
          const state = raw === null ? empty() : core.normalizeState(JSON.parse(raw));
          lastRaw = raw;
          let recovery = raw && (migrated || JSON.parse(raw).version !== 2) ? raw : null;
          if (isNative && !recovery) { try { recovery = storage.getItem(key); } catch (_) { /* Native state remains usable if legacy web storage is unavailable. */ } }
          return { raw, state, recoveryRaw: recovery, migrated };
        } catch (error) {
          const failure = nativeError(error);
          failure.raw = raw;
          throw failure; // A native error must never switch writes to localStorage.
        }
      },
      async save(candidate, expectedRaw) {
        const normalized = core.normalizeState(candidate);
        let result;
        if (isNative) {
          const raw = JSON.stringify(normalized);
          if (new TextEncoder().encode(raw).length > 24 * 1024 * 1024) throw new Error('Cihazdaki kayıt dosyası 24 MB sınırını aşıyor. Kayıt değiştirilmedi; gereksiz belgeleri azaltabilirsiniz.');
          try { await files.write({ raw, expectedRaw }); } catch (error) { throw nativeError(error); }
          result = { state: normalized, raw };
        } else result = core.saveSnapshot(storage, key, normalized, expectedRaw);
        lastRaw = result.raw;
        return result;
      },
      async checkAccess(before, candidate, policy = {}) {
        if (!isNative || !requiresPurchase(before, candidate, policy)) return true;
        let status;
        try { status = await purchases.getStatus(); } catch (_) { /* Unknown entitlement is never an unlock. */ }
        if (status?.isPro === true) return true;
        throw Object.assign(new Error('Bir ana hesap ve alt hesapları ücretsizdir. İkinci ana hesap için Çoklu Hesap satın alımı gerekir.'), { code: 'MULTI_ACCOUNT_REQUIRED' });
      },
      async getPurchaseStatus() {
        if (!isNative) return { isPro: false, productAvailable: false, nativeOnly: true };
        return purchases.getStatus();
      },
      async purchase() {
        if (!isNative) throw new Error('Satın alma iOS uygulamasında kullanılabilir.');
        const result = await purchases.purchase();
        if (result.cancelled || result.pending) return result;
        return purchases.getStatus();
      },
      async restore() {
        if (!isNative) throw new Error('Satın alımları geri yükleme iOS uygulamasında kullanılabilir.');
        await purchases.restore();
        return purchases.getStatus();
      },
      async exportBackup(data, fileName) {
        if (!isNative) return null;
        return documents.exportBackup({ data, fileName });
      },
      async importBackup() {
        if (!isNative) return null;
        return documents.importBackup();
      },
      async exportAttachment(file) {
        if (!isNative) return null;
        return documents.exportFile({ dataBase64: file.url.slice(file.url.indexOf(',') + 1), fileName: file.name, type: file.type });
      },
      async printReport(html, jobName) {
        if (!isNative) return null;
        return documents.printReport({ html, jobName });
      }
    };
  }
  return { createRuntime, requiresPurchase };
});
