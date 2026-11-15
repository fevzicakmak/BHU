/* Shared validation and accounting rules. No browser dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_CENTS = 1_000_000_000_000;
  const MAX_TOTAL = Number.MAX_SAFE_INTEGER;
  const MAX_FILE_BYTES = 1024 * 1024;
  const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream']);
  function ensure(test, message) { if (!test) throw new Error(message); }
  function text(value, max, label, required = false) {
    ensure(typeof value === 'string' && value.length <= max && (!required || value.trim().length), `${label} geçersiz.`);
    return value;
  }
  function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
  function normalizeName(value) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR'); }
  function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function parseCents(value, allowZero = false) {
    const input = String(value).trim();
    ensure(/^\d+(?:[.,]\d{1,2})?$/.test(input), 'Tutarı en fazla iki ondalık basamakla yazın (ör. 1250,50).');
    const [whole, fraction = ''] = input.replace(',', '.').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    ensure(Number.isSafeInteger(cents) && cents >= (allowZero ? 0 : 1) && cents <= MAX_CENTS, 'Tutar 0,01–10.000.000.000 TL arasında olmalı.');
    return cents;
  }
  function roundCents(value) {
    const [coefficient, exponent = '0'] = String(value).split('e');
    return Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
  }
  function centsInput(cents) { return (cents / 100).toFixed(2).replace('.', ','); }
  function safeSum(values) {
    let total = 0;
    for (const value of values) {
      total += value;
      ensure(Number.isSafeInteger(total) && Math.abs(total) <= MAX_TOTAL, 'Toplam tutar güvenli hesaplama sınırını aşıyor.');
    }
    return total;
  }
  function attachment(value) {
    ensure(value && typeof value === 'object' && validId(value.id), 'Belge kimliği geçersiz.');
    const name = text(value.name, 250, 'Belge adı', true);
    ensure(MIME_TYPES.has(value.type), 'Bu belge türü desteklenmiyor. SVG ve HTML dosyaları kabul edilmez.');
    ensure(Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= 8 * 1024 * 1024, 'Belge boyutu geçersiz.');
    ensure(typeof value.url === 'string' && value.url.length <= 12 * 1024 * 1024, 'Belge verisi geçersiz.');
    const prefix = `data:${value.type};base64,`;
    ensure(value.url.startsWith(prefix), 'Belge yalnızca dosya verisi içerebilir.');
    const encoded = value.url.slice(prefix.length);
    ensure(encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded), 'Belge verisi bozuk.');
    const bytes = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
    ensure(bytes === value.size, 'Belge boyutu ile içeriği uyuşmuyor.');
    return { id: value.id, name, type: value.type, size: value.size, url: value.url };
  }
  function normalizeState(value) {
    ensure(value && typeof value === 'object' && [undefined, 1, 2].includes(value.version), 'Yedek sürümü desteklenmiyor.');
    ensure(Array.isArray(value.kasalar) && value.kasalar.length <= 500, 'Hesap listesi geçersiz (en fazla 500 hesap).');
    ensure(Array.isArray(value.transactions) && value.transactions.length <= 20000, 'İşlem listesi geçersiz (en fazla 20.000 işlem).');
    const legacy = value.version !== 2;
    const ids = new Set(), names = new Set();
    const timestamp = (v, fallback) => {
      if (v === undefined && legacy) return fallback;
      ensure(typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)), 'Kayıt zamanı geçersiz.');
      return new Date(v).toISOString();
    };
    const kasalar = value.kasalar.map(k => {
      ensure(k && validId(k.id) && !ids.has(k.id), 'Hesap kimliği geçersiz veya tekrarlı.');
      ids.add(k.id);
      const name = text(k.name, 120, 'Hesap adı', true).trim();
      const key = normalizeName(name);
      ensure(!names.has(key), 'Hesap adları tekrarlanamaz.');
      names.add(key);
      ensure(k.parentId == null || validId(k.parentId), 'Üst hesap kimliği geçersiz.');
      ensure(k.includeInParentTotals === undefined || typeof k.includeInParentTotals === 'boolean', 'Alt hesap toplama seçimi geçersiz.');
      return { id: k.id, name, parentId: k.parentId ?? null, includeInParentTotals: k.includeInParentTotals !== false, createdAt: timestamp(k.createdAt, '1970-01-01T00:00:00.000Z') };
    });
    const byId = new Map(kasalar.map(k => [k.id, k]));
    for (const k of kasalar) {
      const seen = new Set([k.id]);
      let parent = k.parentId;
      while (parent) {
        ensure(byId.has(parent), 'Üst hesabı bulunamayan hesap var.');
        ensure(!seen.has(parent), 'Hesap ağında döngü var.');
        seen.add(parent);
        ensure(seen.size <= 32, 'En fazla 32 hesap seviyesi desteklenir.');
        parent = byId.get(parent).parentId;
      }
    }
    const txIds = new Set(), fileIds = new Set();
    const transactions = value.transactions.map(t => {
      ensure(t && validId(t.id) && !txIds.has(t.id), 'İşlem kimliği geçersiz veya tekrarlı.');
      txIds.add(t.id);
      ensure(ids.has(t.kasaId), 'İşlemin bağlı olduğu hesap bulunamıyor.');
      ensure(['income', 'expense'].includes(t.type), 'İşlem türü geçersiz.');
      ensure(validDate(t.date), 'İşlem tarihi geçersiz.');
      let amountCents = t.amountCents;
      if (legacy) {
        ensure(typeof t.amount === 'number' && Number.isFinite(t.amount) && t.amount > 0, 'Eski kaydın tutarı geçersiz.');
        amountCents = roundCents(t.amount);
      }
      ensure(Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= MAX_CENTS, 'İşlem tutarı geçersiz.');
      ensure(t.attachments === undefined || (Array.isArray(t.attachments) && t.attachments.length <= 20), 'En fazla 20 belge eklenebilir.');
      const attachments = (t.attachments || []).map(a => {
        const file = attachment(a);
        ensure(!fileIds.has(file.id), 'Belge kimliği tekrarlı.');
        fileIds.add(file.id);
        return file;
      });
      return { id: t.id, kasaId: t.kasaId, type: t.type, amountCents, date: t.date,
        customerName: text(t.customerName ?? '', 200, 'Cari adı'), description: text(t.description ?? '', 2000, 'Açıklama'),
        attachments, createdAt: timestamp(t.createdAt, `${t.date}T12:00:00.000Z`) };
    });
    safeSum(transactions.map(t => t.amountCents));
    return { version: 2, kasalar, transactions, activeKasaId: ids.has(value.activeKasaId) ? value.activeKasaId : (kasalar[0]?.id || null),
      revision: typeof value.revision === 'string' && value.revision.length <= 120 ? value.revision : null };
  }
  function descendants(accounts, id, includedOnly = false) {
    const children = new Map();
    for (const account of accounts) {
      if (includedOnly && !account.includeInParentTotals) continue;
      if (!children.has(account.parentId)) children.set(account.parentId, []);
      children.get(account.parentId).push(account.id);
    }
    const result = new Set([id]), queue = [id];
    for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) || []) {
      if (!result.has(child)) { result.add(child); queue.push(child); }
    }
    return result;
  }
  function totals(transactions) {
    const income = safeSum(transactions.filter(t => t.type === 'income').map(t => t.amountCents));
    const expense = safeSum(transactions.filter(t => t.type === 'expense').map(t => t.amountCents));
    return { income, expense, balance: income - expense };
  }
  function filterTransactions(transactions, filters) {
    const q = normalizeName(filters.searchText);
    const min = filters.minAmount ? parseCents(filters.minAmount, true) : 0;
    const max = filters.maxAmount ? parseCents(filters.maxAmount, true) : MAX_CENTS;
    ensure(!filters.startDate || validDate(filters.startDate), 'Başlangıç tarihi geçersiz.');
    ensure(!filters.endDate || validDate(filters.endDate), 'Bitiş tarihi geçersiz.');
    ensure(!filters.startDate || !filters.endDate || filters.startDate <= filters.endDate, 'Başlangıç tarihi bitiş tarihinden sonra olamaz.');
    ensure(min <= max, 'Minimum tutar maksimum tutardan büyük olamaz.');
    return transactions.filter(t => (!q || normalizeName(`${t.customerName} ${t.description}`).includes(q))
      && (filters.type === 'all' || t.type === filters.type) && (!filters.startDate || t.date >= filters.startDate)
      && (!filters.endDate || t.date <= filters.endDate) && t.amountCents >= min && t.amountCents <= max)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }
  function saveSnapshot(storage, key, candidate, expectedRaw) {
    // Compare the complete stored snapshot, including legacy snapshots without a revision.
    ensure(storage.getItem(key) === expectedRaw, 'Veriler başka bir sekmede değişti. Güncel verileri yükleyin; form taslağınız korunacak.');
    const normalized = normalizeState(candidate);
    const serialized = JSON.stringify(normalized);
    storage.setItem(key, serialized); // Exceptions must reach the UI. Never acknowledge failed writes.
    return { state: normalized, raw: serialized };
  }
  return { MAX_CENTS, MAX_FILE_BYTES, MIME_TYPES, normalizeName, localDate, validDate, parseCents, roundCents, centsInput,
    safeSum, attachment, normalizeState, descendants, totals, filterTransactions, saveSnapshot };
});
