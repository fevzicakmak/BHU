'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');
const legacy = () => ({ kasalar: [{ id: 'a', name: 'Ana', parentId: null, createdAt: '2026-11-01' }, { id: 'b', name: 'Alt', parentId: 'a', createdAt: '2026-11-01' }], transactions: [{ id: 't1', kasaId: 'b', amount: 0.1, type: 'income', date: '2026-11-15', createdAt: '2026-11-15', customerName: 'İpek', description: 'Satış' }, { id: 't2', kasaId: 'a', amount: 0.2, type: 'income', date: '2026-11-14', createdAt: '2026-11-14' }], activeKasaId: 'a' });
const filters = () => ({ searchText: '', type: 'all', startDate: '', endDate: '', minAmount: '', maxAmount: '' });
test('legacy records migrate to integer cents and round once', () => {
  const input = legacy(); input.transactions[0].amount = 1.235;
  const state = Core.normalizeState(input);
  assert.equal(state.version, 2); assert.equal(state.transactions[0].amountCents, 124);
  assert.equal(input.transactions[0].amount, 1.235);
  assert.deepEqual(Core.normalizeState(JSON.parse(JSON.stringify(state))), state);
});
test('missing legacy creation times gain deterministic defaults', () => {
  const input = legacy(); delete input.kasalar[0].createdAt; delete input.transactions[0].createdAt;
  assert.equal(Core.normalizeState(input).transactions[0].createdAt, '2026-11-15T12:00:00.000Z');
});
test('money parsing is exact, accepts Turkish decimal commas and rejects unsafe amounts', () => {
  assert.equal(Core.parseCents('1234,56'), 123456); assert.equal(Core.parseCents('0.01'), 1);
  assert.equal(Core.parseCents('0', true), 0);
  assert.equal(Core.roundCents(10.075), 1008);
  assert.equal(Core.roundCents(1.005), 101);
  assert.equal(Core.roundCents(1e-7), 0);
  for (const input of ['0', '-1', '1.234', '1,234.56', 'Infinity', '1e9', '', '10000000001']) assert.throws(() => Core.parseCents(input));
  assert.equal(Core.totals(Core.normalizeState(legacy()).transactions).income, 30);
});
test('cycles, missing parents, duplicate identifiers and normalized names are rejected', () => {
  const change = [x => { x.kasalar[0].parentId = 'b'; }, x => { x.kasalar[1].parentId = 'missing'; }, x => { x.kasalar[1].id = 'a'; }, x => { x.kasalar[1].name = '  ANA '; }, x => { x.transactions[0].kasaId = 'missing'; }, x => { x.transactions[1].id = 't1'; }];
  for (const mutate of change) { const input = legacy(); mutate(input); assert.throws(() => Core.normalizeState(input)); }
});
test('invalid dates, nonfinite and string amounts, types and future versions are rejected', () => {
  const change = [x => { x.transactions[0].date = '2026-02-30'; }, x => { x.transactions[0].amount = Infinity; }, x => { x.transactions[0].amount = '5'; }, x => { x.transactions[0].type = 'income" onclick="alert(1)'; }, x => { x.version = 99; }];
  for (const mutate of change) { const input = legacy(); mutate(input); assert.throws(() => Core.normalizeState(input)); }
});
test('included descendants exclude the entire branch below an excluded account', () => {
  const input = legacy(); input.kasalar.push({ id: 'c', name: 'Torun', parentId: 'b' });
  const state = Core.normalizeState(input);
  assert.deepEqual([...Core.descendants(state.kasalar, 'a', true)], ['a', 'b', 'c']);
  state.kasalar[1].includeInParentTotals = false;
  assert.deepEqual([...Core.descendants(state.kasalar, 'a', true)], ['a']);
  assert.deepEqual([...Core.descendants(state.kasalar, 'a')], ['a', 'b', 'c']);
});
test('filters combine dates, Turkish search, type and amount without mutating records', () => {
  const txs = Core.normalizeState(legacy()).transactions;
  const f = { ...filters(), searchText: 'ipek', minAmount: '0', maxAmount: '0,10', startDate: '2026-11-15', endDate: '2026-11-15' };
  assert.deepEqual(Core.filterTransactions(txs, f).map(t => t.id), ['t1']);
  assert.equal(txs.length, 2);
  assert.throws(() => Core.filterTransactions(txs, { ...f, endDate: '2026-11-01' }));
  assert.throws(() => Core.filterTransactions(txs, { ...filters(), minAmount: '10', maxAmount: '1' }));
});
test('valid documents round-trip; HTML, SVG, injected attributes and incorrect sizes are rejected', () => {
  const file = { id: 'doc', name: 'test.txt', type: 'text/plain', size: 3, url: 'data:text/plain;base64,YWJj' };
  assert.deepEqual(Core.attachment(file), file);
  for (const patch of [{ url: 'javascript:alert(1)' }, { type: 'text/html', url: 'data:text/html;base64,YWJj' }, { type: 'image/svg+xml' }, { url: 'x" onerror="alert(1)' }, { size: 100 }, { id: '"><img src=x>' }]) assert.throws(() => Core.attachment({ ...file, ...patch }));
  const large = 'a'.repeat(1024 * 1024);
  assert.equal(Core.attachment({ ...file, size: large.length, url: 'data:text/plain;base64,' + Buffer.from(large).toString('base64') }).size, large.length);
});
test('persistence failure and stale snapshots never replace the previous saved data', () => {
  let raw = JSON.stringify(legacy()), fail = false;
  const storage = { getItem: () => raw, setItem: (key, value) => { if (fail) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); raw = value; } };
  const expected = raw, candidate = Core.normalizeState(legacy());
  fail = true; assert.throws(() => Core.saveSnapshot(storage, 'key', candidate, expected)); assert.equal(raw, expected);
  fail = false; raw = 'other tab'; assert.throws(() => Core.saveSnapshot(storage, 'key', candidate, expected)); assert.equal(raw, 'other tab');
  raw = expected; const result = Core.saveSnapshot(storage, 'key', candidate, expected); assert.equal(JSON.parse(raw).version, 2); assert.equal(result.raw, raw);
});
test('local calendar date and strict date validation', () => {
  assert.equal(Core.localDate(new Date(2026, 10, 15, 0, 30)), '2026-11-15');
  assert.equal(Core.validDate('2024-02-29'), true); assert.equal(Core.validDate('2026-02-29'), false);
});
