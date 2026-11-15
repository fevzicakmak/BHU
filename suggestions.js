/* Local suggestion ranking shared by the UI and regression tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaSuggestions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const key = value => String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
  const fold = value => key(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  function createIndex({ transactions, accountIds, field, type = 'income', customerName = '', common = [] }) {
    const scope = new Set(accountIds), entries = new Map(), customer = fold(customerName);
    function add(raw, kind, transaction = null) {
      const value = raw?.trim().replace(/\s+/g, ' ');
      if (!value) return;
      const normalized = key(value);
      let entry = entries.get(normalized);
      if (!entry) { entry = { value, kind, count: 0, preferred: false, last: '', common: !transaction, records: new Set() }; entries.set(normalized, entry); }
      if (!transaction) return;
      if (!entry.records.has(transaction.id)) { entry.count++; entry.records.add(transaction.id); }
      entry.common = false;
      if (entry.kind !== kind) entry.kind = 'Geçmiş kayıt';
      if (transaction.createdAt >= entry.last) { entry.last = transaction.createdAt; entry.value = value; }
      if (field === 'description' && customer && fold(transaction.customerName) === customer) entry.preferred = true;
    }
    // Match before limiting so older values remain discoverable.
    for (const tx of transactions) {
      if (!scope.has(tx.kasaId) || (field === 'description' && tx.type !== type)) continue;
      if (field === 'search') { add(tx.customerName, 'Cari', tx); add(tx.description, 'Açıklama', tx); }
      else add(tx[field], field === 'customerName' ? 'Cari' : 'Açıklama', tx);
    }
    if (field === 'description') common.forEach(value => add(value, 'Hazır açıklama'));
    const ranked = [...entries.values()].sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.count - a.count
      || b.last.localeCompare(a.last) || a.value.localeCompare(b.value, 'tr-TR')).map((entry, rank) => ({ value: entry.value, rank, search: fold(entry.value),
        meta: entry.common ? 'Hazır açıklama' : `${entry.kind} · ${entry.count} kayıtta${entry.preferred ? ' · Bu cari' : ''}` }));
    return { query(query = '', limit = 8) {
      const needle = fold(query);
      const matched = needle ? ranked.filter(entry => entry.search.includes(needle)).sort((a, b) => Number(b.search.startsWith(needle)) - Number(a.search.startsWith(needle)) || a.rank - b.rank) : ranked;
      return matched.slice(0, limit).map(entry => ({ value: entry.value, label: entry.value, meta: entry.meta }));
    } };
  }
  function collect(options) { return createIndex(options).query(options.query, options.limit); }
  function selectOptions(options, query, limit = 30) {
    const needle = fold(query);
    return options.filter(option => !option.disabled && (!needle || fold(option.label).includes(needle)))
      .sort((a, b) => !needle ? Number(Boolean(b.selected)) - Number(Boolean(a.selected)) : Number(fold(b.label.replace(/^[—\s]+/, '')).startsWith(needle)) - Number(fold(a.label.replace(/^[—\s]+/, '')).startsWith(needle)))
      .slice(0, limit).map(option => ({ value: option.value, label: option.label, meta: option.selected ? 'Seçili hesap' : 'Hesap' }));
  }
  return { key, fold, createIndex, collect, selectOptions };
});
