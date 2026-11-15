'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Suggestions = require('../suggestions.js');
const tx = (id, patch = {}) => ({ id, kasaId: 'a', type: 'income', customerName: 'İpek Çağrı', description: 'Tahsilat', createdAt: '2026-11-15T12:00:00.000Z', ...patch });
const collect = (transactions, patch = {}) => Suggestions.collect({ transactions, accountIds: ['a'], field: 'customerName', ...patch });
test('Turkish text and ASCII equivalents match without changing the saved spelling', () => {
  assert.equal(collect([tx('1')], { query: 'ipek cagri' })[0].value, 'İpek Çağrı');
  assert.equal(collect([tx('1', { customerName: 'IŞIK ŞİRKETİ' })], { query: 'isik sirketi' })[0].value, 'IŞIK ŞİRKETİ');
});
test('old matching values remain discoverable beyond the former 40-entry cutoff', () => {
  const list = [tx('old', { customerName: 'Aranan eski cari' }), ...Array.from({ length: 70 }, (_, i) => tx(String(i), { customerName: `Yeni ${i}` }))];
  assert.equal(collect(list, { query: 'Aranan' })[0].value, 'Aranan eski cari');
});
test('case and whitespace variants deduplicate and display the latest spelling', () => {
  const results = collect([tx('1', { customerName: ' İPEK   ÇAĞRI ', createdAt: '2026-11-14' }), tx('2')]);
  assert.equal(results.length, 1); assert.equal(results[0].value, 'İpek Çağrı'); assert.match(results[0].meta, /2 kayıtta/);
});
test('account scope excludes unrelated accounts but permits explicitly included descendants', () => {
  const list = [tx('1'), tx('2', { kasaId: 'b', customerName: 'Alt hesap' }), tx('3', { kasaId: 'c', customerName: 'Başka hesap' })];
  assert.equal(collect(list).length, 1);
  assert.equal(collect(list, { accountIds: ['a', 'b'] }).length, 2);
});
test('description suggestions respect transaction type and prioritize the selected customer', () => {
  const list = [tx('1'), tx('2', { type: 'expense', description: 'Kargo' }), tx('3', { customerName: 'Ali', description: 'Danışmanlık' })];
  const result = collect(list, { field: 'description', customerName: 'ipek cagri' });
  assert.equal(result[0].value, 'Tahsilat'); assert.match(result[0].meta, /Bu cari/);
  assert(!result.some(item => item.value === 'Kargo'));
  assert.equal(collect(list, { field: 'description', type: 'expense' })[0].value, 'Kargo');
});
test('common descriptions deduplicate with history and prefix matches rank first', () => {
  const result = collect([tx('1'), tx('2', { description: 'Ödeme tahsilatı' })], { field: 'description', common: ['Tahsilat', 'Satış'], query: 'tah' });
  assert.equal(result.length, 2); assert.equal(result[0].value, 'Tahsilat'); assert.match(result[0].meta, /1 kayıtta/);
});
test('search combines names and descriptions, counting one record once', () => {
  const result = collect([tx('1', { customerName: 'Satış', description: 'Satış' })], { field: 'search' });
  assert.equal(result.length, 1); assert.match(result[0].meta, /1 kayıtta/);
});
test('limits are applied after matching and collection does not mutate records', () => {
  const list = [tx('1'), tx('2', { customerName: 'Ali' })], before = JSON.stringify(list);
  assert.equal(collect(list, { limit: 1 }).length, 1); assert.equal(JSON.stringify(list), before);
  assert.equal(collect(list, { query: 'bulunamayan' }).length, 0);
});
test('account completion preserves allowed IDs, root option and disabled restrictions', () => {
  const options = [{ value: '', label: 'Üst hesap yok (ana hesap)' }, { value: 'a', label: '— Şube', selected: true }, { value: 'blocked', label: 'Şube 2', disabled: true }];
  assert.equal(Suggestions.selectOptions(options, 'sube')[0].value, 'a');
  assert.equal(Suggestions.selectOptions(options, 'ana hesap')[0].value, '');
  assert.equal(Suggestions.selectOptions(options, '')[0].value, 'a');
  assert(!Suggestions.selectOptions(options, '').some(item => item.value === 'blocked'));
});
