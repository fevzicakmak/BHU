import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ID, BUNDLE, AssetsError } from '../scripts/ios-app-store-assets.mjs';
import { createFreePriceClient, assertFreePriceRequest, compileFreePricePlan, applyFreePricePlan } from '../scripts/ios-free-download-price.mjs';

// Synthetic resources and mock credentials only; no private files or real account calls.
const epoch = () => Math.floor(Date.now() / 1000);
function session(now = epoch()) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { appId: APP_ID, expiresAt: now + 300, sourceCommit: 'a'.repeat(40), purpose: 'synthetic free download test',
    token: `${encode({ alg: 'ES256' })}.${encode({ aud: 'appstoreconnect-v1', iat: now, exp: now + 300 })}.synthetic-signature` };
}
const relationship = (type, id) => ({ data: { type, id } });
const currencies = { TUR: 'TRY', USA: 'USD', CAN: 'CAD' };
function point(id, territory = 'TUR', customerPrice = '0.00', appId = APP_ID) {
  return { type: 'appPricePoints', id, attributes: { customerPrice }, relationships: {
    app: relationship('apps', appId), territory: relationship('territories', territory) } };
}
function saved(id, territory = 'TUR', customerPrice = '0.00', changes = {}) {
  const { manual = true, startDate = null, endDate = null, ...rest } = changes;
  return { resource: { type: 'appPrices', id, attributes: { manual, startDate, endDate }, relationships: {
    appPricePoint: relationship('appPricePoints', `point-${id}`), territory: relationship('territories', territory) } },
    pricePoint: point(`point-${id}`, territory, customerPrice, rest.appId ?? APP_ID), territory, ...rest };
}
function mockApple(options = {}) {
  const lease = session(), calls = [], state = { manual: [], automatic: [], ...options };
  let scheduleId = 'schedule-old', posted = false; const savedDetails = new Map();
  const json = (data, extra = {}) => new Response(JSON.stringify({ data, ...extra }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const rowsResponse = (rows, extra = {}) => json(rows.map(row => row.resource), { included: rows.flatMap(row => {
    savedDetails.set(row.pricePoint.id, structuredClone(row.pricePoint));
    const nested = structuredClone(row.pricePoint); if (state.missingSavedNested) nested.relationships = {};
    return [nested, { type: 'territories', id: row.territory, attributes: { currency: currencies[row.territory] ?? 'XXX' } }];
  }), ...extra });
  function createdBaseRow() {
    const base = state.baseTerritory ?? 'USA', row = saved('new-base-zero', base);
    row.resource.relationships.appPricePoint = relationship('appPricePoints', 'zero-base'); row.pricePoint = point('zero-base', base);
    return row;
  }
  const fetchImpl = async (input, init) => {
    const url = new URL(input); calls.push({ url: input, method: init.method, body: init.body, headers: init.headers });
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${lease.token}`); assert.ok(init.signal);
    const path = url.pathname;
    if (init.method === 'GET' && path === '/v1/apps') {
      assert.equal(url.searchParams.get('filter[bundleId]'), BUNDLE);
      return json([{ type: 'apps', id: state.appId ?? APP_ID, attributes: { bundleId: BUNDLE, primaryLocale: 'tr' } }]);
    }
    if (init.method === 'GET' && path === `/v1/apps/${APP_ID}/appStoreVersions`) return json([{ type: 'appStoreVersions', id: 'version-1',
      attributes: { versionString: '1.0', platform: 'IOS', appVersionState: state.draftState ?? 'PREPARE_FOR_SUBMISSION' },
      relationships: { app: relationship('apps', APP_ID) } }]);
    if (init.method === 'GET' && path === `/v1/apps/${APP_ID}/appPriceSchedule`) {
      return json({ type: 'appPriceSchedules', id: scheduleId, relationships: {
        app: relationship('apps', state.scheduleAppId ?? APP_ID), baseTerritory: relationship('territories', state.baseTerritory ?? 'USA') } },
      { included: [{ type: 'apps', id: APP_ID, attributes: { bundleId: BUNDLE } }, { type: 'territories', id: state.baseTerritory ?? 'USA',
        attributes: { currency: currencies[state.baseTerritory ?? 'USA'] } }] });
    }
    const rows = path.match(/^\/v1\/appPriceSchedules\/([^/]+)\/(manualPrices|automaticPrices)$/);
    if (init.method === 'GET' && rows) {
      assert.equal(rows[1], scheduleId); assert.equal(url.searchParams.has('filter[territory]'), false, 'Saved price discovery must cover all territories');
      const kind = rows[2] === 'manualPrices' ? 'manual' : 'automatic';
      if (!posted && kind === 'manual' && state.foreignNext) return rowsResponse([], { links: { next: 'https://evil.example/collect?cursor=next' } });
      if (!posted && kind === 'manual' && state.secondPageManual && !url.searchParams.has('cursor')) {
        const next = new URL(url); next.searchParams.set('cursor', 'synthetic-next');
        return rowsResponse(state.manual, { links: { next: next.href } });
      }
      if (!posted && kind === 'manual' && state.secondPageManual && url.searchParams.get('cursor') === 'synthetic-next') return rowsResponse(state.secondPageManual);
      const selected = posted ? state.readbackEmpty ? [] : kind === 'manual'
        ? state.afterManual ?? [createdBaseRow()]
        : state.afterAutomatic ?? [saved('new-auto-zero', state.baseTerritory === 'TUR' ? 'USA' : 'TUR', '0.00', { manual: false })]
        : state[kind];
      return rowsResponse(selected);
    }
    if (init.method === 'GET' && path === `/v1/apps/${APP_ID}/appPricePoints`) {
      assert.equal(url.searchParams.get('filter[territory]'), state.baseTerritory ?? 'USA');
      if (state.catalogNext && !url.searchParams.has('cursor')) {
        const next = new URL(path, url.origin);
        next.search = new URLSearchParams({ cursor: 'catalog-next', ...state.catalogNext }).toString();
        return json([point('zero-base', state.baseTerritory ?? 'USA')], { links: { next: next.href } });
      }
      if (state.catalogNext && url.searchParams.get('cursor') === 'catalog-next') {
        assert.equal(url.searchParams.get('fields[appPricePoints]'), 'customerPrice,app,territory');
        assert.equal(url.searchParams.get('fields[territories]'), 'currency');
        assert.equal(url.searchParams.get('fields[apps]'), 'bundleId');
        assert.equal(url.searchParams.get('include'), 'app,territory');
        assert.equal(url.searchParams.get('limit'), '200');
        return json([point('paid-base', state.baseTerritory ?? 'USA', '9.99')], { meta: { paging: { total: 2 } } });
      }
      return json(state.catalog ?? [point('zero-base', state.baseTerritory ?? 'USA'), point('paid-base', state.baseTerritory ?? 'USA', '9.99')], { included: [
        { type: 'apps', id: APP_ID, attributes: { bundleId: BUNDLE } }, { type: 'territories', id: state.baseTerritory ?? 'USA', attributes: { currency: currencies[state.baseTerritory ?? 'USA'] } }] });
    }
    if (init.method === 'GET' && path === '/v3/appPricePoints/zero-base') return json(state.selectedPoint ?? point('zero-base', state.baseTerritory ?? 'USA'), { included: [
      { type: 'apps', id: APP_ID, attributes: { bundleId: BUNDLE } }, { type: 'territories', id: state.baseTerritory ?? 'USA', attributes: { currency: currencies[state.baseTerritory ?? 'USA'] } }] });
    const savedDetailMatch = path.match(/^\/v3\/appPricePoints\/([^/]+)$/);
    if (init.method === 'GET' && savedDetailMatch) {
      const detail = savedDetails.get(savedDetailMatch[1]); assert.ok(detail, 'Only already-linked saved price points may be fetched');
      const territory = detail.relationships.territory.data.id;
      return json(detail, { included: [{ type: 'apps', id: APP_ID, attributes: { bundleId: BUNDLE } },
        { type: 'territories', id: territory, attributes: { currency: currencies[territory] } }] });
    }
    if (init.method === 'POST' && path === '/v1/appPriceSchedules') {
      posted = true; scheduleId = 'schedule-new';
      if (state.ambiguousPost) throw new Error('private-upstream-detail-secret');
      return json({ type: 'appPriceSchedules', id: scheduleId, relationships: {
        app: relationship('apps', APP_ID), baseTerritory: relationship('territories', state.baseTerritory ?? 'USA') } });
    }
    assert.fail(`Unexpected mock request ${init.method} ${path}`);
  };
  return { client: createFreePriceClient(lease, { fetchImpl }), lease, calls, state };
}
const writes = mock => mock.calls.filter(call => call.method !== 'GET');
const prepare = mock => compileFreePricePlan({ request: mock.client.request });
const apply = (mock, plan, extra = {}) => applyFreePricePlan({ client: mock.client, plan, wait: async () => {}, ...extra });

test('free-price planning verifies the exact BHU editable draft and schedule ownership', async () => {
  for (const option of [{ appId: 'other-app' }, { draftState: 'WAITING_FOR_REVIEW' }, { scheduleAppId: 'other-app' }]) {
    const mock = mockApple(option); await assert.rejects(prepare(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
  const mock = mockApple(), plan = await prepare(mock); assert.equal(plan.action, 'create'); assert.equal(writes(mock).length, 0);
  const text = JSON.stringify(plan); assert.ok(!text.includes(mock.lease.token)); assert.ok(!text.includes('https://'));
});

test('nonempty saved prices anywhere, including future rows, prevent schedule replacement', async () => {
  for (const option of [{ manual: [saved('usa-paid', 'USA', '4.99')] },
    { automatic: [saved('can-paid', 'CAN', '2.99', { manual: false })] },
    { manual: [saved('future-tur-zero', 'TUR', '0.00', { startDate: '2035-01-01' })] },
    { manual: [saved('tur-zero'), saved('future-tur-paid', 'TUR', '9.99', { startDate: '2035-01-01' })] }]) {
    const mock = mockApple(option); await assert.rejects(prepare(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
});

test('an ongoing saved Turkish zero price is reused without any write', async () => {
  const mock = mockApple({ baseTerritory: 'TUR', manual: [saved('existing-zero')],
    automatic: [saved('existing-usa-zero', 'USA', '0.00', { manual: false })] });
  const plan = await prepare(mock); assert.equal(plan.action, 'reuse');
  const receipt = await apply(mock, plan); assert.equal(writes(mock).length, 0); assert.equal(receipt.freeVerifiedForTUR, true);
  assert.ok(!mock.calls.some(call => new URL(call.url).pathname.endsWith('/appPricePoints')));
});

test('only an actual unique catalog zero with verified app, territory and zero detail is selected', async () => {
  for (const option of [{ catalog: [point('paid-base', 'USA', '9.99')] },
    { catalog: [point('zero-base', 'USA'), point('another-zero', 'USA')] },
    { selectedPoint: point('zero-base', 'USA', '4.99') },
    { selectedPoint: point('zero-base', 'TUR', '0.00') },
    { selectedPoint: point('zero-base', 'USA', '0.00', 'other-app') }]) {
    const mock = mockApple(option); await assert.rejects(prepare(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
});

test('complete pagination discovers a hidden saved price and rejects foreign links', async () => {
  const hidden = mockApple({ secondPageManual: [saved('second-page-paid', 'USA', '1.99')] });
  await assert.rejects(prepare(hidden), AssetsError); assert.equal(writes(hidden).length, 0);
  assert.ok(hidden.calls.some(call => new URL(call.url).searchParams.get('cursor') === 'synthetic-next'));
  const foreign = mockApple({ foreignNext: true }); await assert.rejects(prepare(foreign), AssetsError); assert.equal(writes(foreign).length, 0);
  assert.ok(foreign.calls.every(call => new URL(call.url).origin === 'https://api.appstoreconnect.apple.com'));
});

test('cursor-only Apple catalog links preserve every original filter, fieldset and include', async () => {
  const mock = mockApple({ catalogNext: {} }), plan = await prepare(mock);
  assert.equal(plan.action, 'create'); assert.equal(plan.freePoint.customerPrice, '0.00');
  assert.equal(writes(mock).length, 0);
  const pages = mock.calls.filter(call => new URL(call.url).pathname === `/v1/apps/${APP_ID}/appPricePoints`);
  assert.equal(pages.length, 2);
  const first = new URL(pages[0].url), second = new URL(pages[1].url);
  for (const [key, value] of first.searchParams) assert.equal(second.searchParams.get(key), value);
  assert.equal(second.searchParams.get('cursor'), 'catalog-next');
});

test('supplied conflicting pagination filters, fields, includes or limits reject before another page or write', async () => {
  for (const catalogNext of [{ 'filter[territory]': 'TUR' }, { 'fields[appPricePoints]': 'customerPrice' },
    { 'fields[territories]': 'id' }, { 'fields[apps]': 'name' }, { include: 'territory' }, { limit: '100' }]) {
    const mock = mockApple({ catalogNext });
    await assert.rejects(prepare(mock), /pagination changed its scope/);
    assert.equal(writes(mock).length, 0);
    assert.equal(mock.calls.filter(call => new URL(call.url).pathname === `/v1/apps/${APP_ID}/appPricePoints`).length, 1);
  }
});

test('a newly saved price or a tampered plan stops stale apply before POST', async () => {
  const mock = mockApple(), plan = await prepare(mock); mock.state.manual = [saved('late-user-price', 'USA', '4.99')];
  await assert.rejects(apply(mock, plan), AssetsError); assert.equal(writes(mock).length, 0);
  const clean = mockApple(), current = await prepare(clean), tampered = structuredClone(current); tampered.action = 'reuse';
  await assert.rejects(apply(clean, tampered), AssetsError); assert.equal(writes(clean).length, 0);
});

test('empty global schedule preserves its USA base with one immediate zero POST and global read-back', async () => {
  const mock = mockApple(), plan = await prepare(mock), receipt = await apply(mock, plan);
  assert.equal(receipt.completed, true); assert.equal(receipt.freeVerifiedForTUR, true); assert.equal(receipt.globalSavedRowsZero, true);
  assert.equal(receipt.scheduleId, 'schedule-new'); assert.equal(receipt.postAttempted, true);
  const post = writes(mock); assert.equal(post.length, 1); assert.equal(new URL(post[0].url).pathname, '/v1/appPriceSchedules');
  const body = JSON.parse(post[0].body);
  assert.equal(body.data.type, 'appPriceSchedules');
  assert.deepEqual(body.data.relationships.app, relationship('apps', APP_ID));
  assert.deepEqual(body.data.relationships.baseTerritory, relationship('territories', 'USA'));
  assert.deepEqual(body.data.relationships.manualPrices.data, [{ type: 'appPrices', id: '${newprice-0}' }]);
  assert.equal(body.included.length, 1); assert.equal(body.included[0].id, '${newprice-0}');
  assert.deepEqual(body.included[0].attributes, { startDate: null, endDate: null });
  assert.deepEqual(body.included[0].relationships.appPricePoint, relationship('appPricePoints', 'zero-base'));
  const safe = JSON.stringify(receipt); assert.ok(!safe.includes(mock.lease.token)); assert.ok(!safe.includes('https://'));
  assert.ok(!mock.calls.some(call => /inAppPurchase/i.test(call.url)));
});

test('a pre-existing Turkish base is preserved when an empty schedule is initialized', async () => {
  const mock = mockApple({ baseTerritory: 'TUR' }), plan = await prepare(mock), receipt = await apply(mock, plan);
  assert.equal(receipt.completed, true); assert.equal(receipt.freeVerifiedForTUR, true);
  const body = JSON.parse(writes(mock)[0].body);
  assert.deepEqual(body.data.relationships.baseTerritory, relationship('territories', 'TUR'));
});

test('saved read-back without nested linkage verifies base and TUR details without fetching other territories', async () => {
  const mock = mockApple({ missingSavedNested: true, afterAutomatic: [
    saved('new-tur-zero', 'TUR', '0.00', { manual: false }), saved('new-can-zero', 'CAN', '0.00', { manual: false })] });
  const plan = await prepare(mock), receipt = await apply(mock, plan);
  assert.equal(receipt.completed, true); assert.equal(receipt.globalSavedRowsZero, true);
  assert.equal(receipt.manualPriceCount, 1); assert.equal(receipt.automaticPriceCount, 2);
  const postIndex = mock.calls.findIndex(call => call.method === 'POST');
  const detailCalls = mock.calls.slice(postIndex + 1).filter(call => new URL(call.url).pathname.startsWith('/v3/appPricePoints/'));
  assert.deepEqual(detailCalls.map(call => new URL(call.url).pathname).sort(), ['/v3/appPricePoints/point-new-tur-zero', '/v3/appPricePoints/zero-base']);
  assert.ok(!mock.calls.some(call => new URL(call.url).pathname.endsWith('/point-new-can-zero')));
});

test('explicit foreign nested linkage in any saved territory is rejected, while write catalog linkage remains strict', async () => {
  const foreignApp = saved('foreign-can-app', 'CAN', '0.00', { manual: false, appId: 'other-app' });
  const foreignTerritory = saved('foreign-can-territory', 'CAN', '0.00', { manual: false });
  foreignTerritory.pricePoint.relationships.territory = relationship('territories', 'USA');
  for (const row of [foreignApp, foreignTerritory]) {
    const mock = mockApple({ manual: [saved('existing-tur-zero')], automatic: [row] });
    await assert.rejects(prepare(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
  const missing = point('zero-base', 'USA'); missing.relationships = {};
  for (const option of [{ catalog: [missing] }, { selectedPoint: missing }]) {
    const mock = mockApple(option); await assert.rejects(prepare(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
});

test('incomplete or nonzero read-back records the POST result and cannot claim success', async () => {
  for (const option of [{ readbackEmpty: true }, { afterAutomatic: [saved('bad-auto', 'USA', '3.99', { manual: false })] }]) {
    const mock = mockApple(option), plan = await prepare(mock);
    await assert.rejects(apply(mock, plan, { pollAttempts: 2 }), error => {
      assert.equal(error.receipt.completed, false); assert.equal(error.receipt.scheduleId, 'schedule-new');
      assert.equal(error.receipt.postAttempted, true); assert.equal(error.receipt.failure.inspectScheduleBeforeRetry, true); return true;
    });
    assert.equal(writes(mock).length, 1);
  }
});

test('ambiguous POST never retries and emits no raw upstream error or credential', async () => {
  const mock = mockApple({ ambiguousPost: true }), plan = await prepare(mock);
  await assert.rejects(apply(mock, plan), error => {
    assert.equal(error.receipt.completed, false); assert.equal(error.receipt.postAttempted, true);
    assert.equal(error.receipt.failure.inspectScheduleBeforeRetry, true);
    const safe = JSON.stringify(error.receipt); assert.ok(!safe.includes('private-upstream-detail-secret')); assert.ok(!safe.includes(mock.lease.token)); return true;
  });
  assert.equal(writes(mock).length, 1);
});

test('route scope permits no IAP price, deletion, submission or foreign app mutation', () => {
  for (const [method, path] of [['POST', '/v1/inAppPurchasePriceSchedules'], ['DELETE', '/v1/appPriceSchedules/schedule-old'],
    ['PATCH', '/v1/appPriceSchedules/schedule-old'], ['POST', '/v1/appStoreVersionSubmissions'],
    ['GET', '/v1/apps/other/appPriceSchedule'], ['GET', '//evil.apple.com/x']]) assert.throws(() => assertFreePriceRequest(method, path), AssetsError);
});

test('short-lived client stops expired leases before requests and exposes no raw token property', async () => {
  const now = epoch(), lease = session(now); let time = now, requests = 0;
  const client = createFreePriceClient(lease, { now: () => time, fetchImpl: async () => { requests++; return new Response(JSON.stringify({ data: [] }), { status: 200 }); } });
  assert.equal(Object.hasOwn(client, 'sessionToken'), false);
  await client.request('GET', '/v1/apps'); assert.equal(requests, 1);
  time = now + 291; await assert.rejects(client.request('GET', '/v1/apps'), AssetsError); assert.equal(requests, 1);
});
