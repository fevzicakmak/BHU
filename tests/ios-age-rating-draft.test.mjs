import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ID, BUNDLE, VERSION, SCHEMA, ANSWERS, ALL_FIELDS, PROTECTED_FIELDS, AgeDraftError, validAttribute, assertRequest, createClient, compilePlan, summarize, applyPlan } from '../scripts/ios-age-rating-draft.mjs';

const NOW = 1795795200;
const clone = value => JSON.parse(JSON.stringify(value));
const resource = (type, id, attributes = {}, relationships = {}) => ({ type, id, attributes, relationships });
const rel = (type, id) => ({ data: { type, id } });
const collection = data => ({ data, links: {} });
function fixture() {
  return {
    '/v1/apps': collection([resource('apps', APP_ID, { bundleId: BUNDLE, primaryLocale: 'tr' })]),
    [`/v1/apps/${APP_ID}/appInfos`]: collection([resource('appInfos', 'info-1', { state: 'PREPARE_FOR_SUBMISSION' }, { app: rel('apps', APP_ID), ageRatingDeclaration: rel('ageRatingDeclarations', 'age-1') })]),
    [`/v1/apps/${APP_ID}/appStoreVersions`]: collection([resource('appStoreVersions', 'version-1', { versionString: VERSION, platform: 'IOS', appVersionState: 'PREPARE_FOR_SUBMISSION' }, { app: rel('apps', APP_ID) })]),
    '/v1/appInfos/info-1/relationships/ageRatingDeclaration': { data: { type: 'ageRatingDeclarations', id: 'age-1' } },
    '/v1/appInfos/info-1/ageRatingDeclaration': { data: resource('ageRatingDeclarations', 'age-1', { ...Object.fromEntries(ALL_FIELDS.map(field => [field, null])), ageRatingOverrideV2: 'NONE' }) },
  };
}
function mock(data = fixture(), options = {}) {
  const calls = [];
  const request = async (method, path, parameters = {}, body) => {
    assertRequest(method, path, parameters, body);
    calls.push({ method, path, parameters: clone(parameters), ...(body ? { body: clone(body) } : {}) });
    if (method === 'GET') { assert(Object.hasOwn(data, path), `Unexpected mock GET ${path}`); return clone(data[path]); }
    if (options.failure) throw new AgeDraftError('PRIVATE raw details must not appear', options.failure);
    if (options.response !== undefined) return clone(options.response);
    const declaration = data['/v1/appInfos/info-1/ageRatingDeclaration'].data;
    if (!options.ignorePatch) Object.assign(declaration.attributes, clone(body.data.attributes));
    if (options.afterPatch) options.afterPatch(data);
    return { data: clone(declaration) };
  };
  return { data, request, calls, writes: () => calls.filter(call => call.method !== 'GET') };
}
const prepare = (m, extra = {}) => compilePlan({ request: m.request, nowSeconds: NOW, ...extra });
const apply = (m, plan, extra = {}) => applyPlan({ request: m.request, plan, nowSeconds: NOW + 1, ...extra });
const age = data => data['/v1/appInfos/info-1/ageRatingDeclaration'].data.attributes;

test('official 4.6.1 fields are exact: 26 answers and six protected decision/country fields', () => {
  assert.equal(SCHEMA.version, '4.6.1');
  assert.match(SCHEMA.url, /^https:\/\/developer\.apple\.com\//);
  assert.equal(ALL_FIELDS.length, 32); assert.equal(new Set(ALL_FIELDS).size, 32);
  assert.equal(Object.keys(ANSWERS).length, 26);
  assert.equal(Object.values(ANSWERS).filter(value => value === false).length, 13);
  assert.equal(Object.values(ANSWERS).filter(value => value === 'NONE').length, 13);
  for (const field of PROTECTED_FIELDS) assert(!Object.hasOwn(ANSWERS, field));
  assert(validAttribute('contests', 'INFREQUENT')); assert(!validAttribute('contests', false));
  assert(validAttribute('advertising', false)); assert(!validAttribute('advertising', 'NONE'));
  assert(validAttribute('kidsAgeBand', 'NINE_TO_ELEVEN')); assert(!validAttribute('kidsAgeBand', 'NONE'));
  assert(!validAttribute('ageRatingOverrideV2', 'FOUR_PLUS')); assert(!validAttribute('invented', null));
});

test('plan fills only explicit null answers and exposes concrete changes and null rollback without account/session data', async () => {
  const m = mock(), plan = await prepare(m), summary = summarize(plan);
  assert.equal(plan.changes.length, 26); assert.equal(m.writes().length, 0);
  assert.deepEqual(plan.operation.body.data.attributes, ANSWERS);
  assert.deepEqual(plan.rollbackForReviewOnly.body.data.attributes, Object.fromEntries(Object.keys(ANSWERS).map(field => [field, null])));
  assert(plan.changes.every(change => change.from === null && change.to === ANSWERS[change.field]));
  assert.equal(plan.expiresAt - plan.createdAt, 300);
  assert.equal(summary.answersToFill.length, 26); assert.equal(summary.forcedAgeRating, false);
  assert.equal(summary.reviewSubmitted, false); assert.equal(summary.publicReleaseTriggered, false);
  assert(!JSON.stringify(plan).includes('token')); assert(!JSON.stringify(plan).includes('contactPhone'));
});

test('nonnull answers, all age overrides, kids band, GRAC number and URL are preserved even if they conflict', async () => {
  const data = fixture(); Object.assign(age(data), { advertising: true, contests: 'INFREQUENT', parentalControls: false,
    ageRatingOverride: 'THIRTEEN_PLUS', ageRatingOverrideV2: 'SIXTEEN_PLUS', kidsAgeBand: 'SIX_TO_EIGHT',
    koreaAgeRatingOverride: 'FIFTEEN_PLUS', gracRatingClassificationNumber: 'saved-number', developerAgeRatingInfoUrl: 'https://example.org/age' });
  const m = mock(data), plan = await prepare(m), receipt = await apply(m, plan);
  assert.equal(receipt.status, 'completed'); assert.equal(receipt.readbackVerified, true); assert.equal(m.writes().length, 1);
  for (const field of [...PROTECTED_FIELDS, 'advertising', 'contests', 'parentalControls']) assert.equal(plan.operation.body.data.attributes[field], undefined);
  assert.deepEqual(plan.conflicts.map(x => x.field).sort(), ['advertising', 'contests']);
  assert.equal(age(data).advertising, true); assert.equal(age(data).ageRatingOverrideV2, 'SIXTEEN_PLUS');
  assert.equal(age(data).kidsAgeBand, 'SIX_TO_EIGHT');
});

test('omitted fields stay unknown; an omitted answer is not assumed null', async () => {
  const data = fixture(); delete age(data).sharedLocation; delete age(data).developerAgeRatingInfoUrl;
  const m = mock(data), plan = await prepare(m); assert.equal(plan.changes.length, 25);
  assert.deepEqual(plan.unknown.sort(), ['developerAgeRatingInfoUrl', 'sharedLocation']);
  assert(!Object.hasOwn(plan.operation.body.data.attributes, 'sharedLocation'));
  await apply(m, plan); assert(!Object.hasOwn(age(data), 'sharedLocation'));
});

test('a fully answered declaration produces a verified no-op with zero PATCH requests', async () => {
  const data = fixture(); Object.assign(age(data), ANSWERS); const m = mock(data), plan = await prepare(m), receipt = await apply(m, plan);
  assert.equal(plan.operation, null); assert.equal(plan.rollbackForReviewOnly, null);
  assert.equal(receipt.operationCount, 0); assert.equal(receipt.status, 'completed'); assert.equal(m.writes().length, 0);
});

test('wrong app identity, locale or owner relationships cannot authorize any write', async () => {
  for (const mutate of [
    d => { d['/v1/apps'].data[0].id = 'another-app'; },
    d => { d['/v1/apps'].data[0].attributes.bundleId = 'com.other.app'; },
    d => { d['/v1/apps'].data[0].attributes.primaryLocale = 'en-US'; },
    d => { d[`/v1/apps/${APP_ID}/appInfos`].data[0].relationships.app.data.id = 'another-app'; },
    d => { delete d[`/v1/apps/${APP_ID}/appInfos`].data[0].relationships.app; },
    d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].relationships.app.data.id = 'another-app'; },
  ]) { const data = fixture(); mutate(data); const m = mock(data); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0); }
});

test('only unique PREPARE app information and iOS 1.0 draft version may be used', async () => {
  for (const mutate of [
    d => { d[`/v1/apps/${APP_ID}/appInfos`].data[0].attributes.state = 'READY_FOR_SALE'; },
    d => { d[`/v1/apps/${APP_ID}/appInfos`].data.push({ ...clone(d[`/v1/apps/${APP_ID}/appInfos`].data[0]), id: 'info-2' }); },
    d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].attributes.versionString = '2.0'; },
    d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].attributes.platform = 'MAC_OS'; },
    d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].attributes.appVersionState = 'WAITING_FOR_REVIEW'; },
    d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].links.next = 'https://api.appstoreconnect.apple.com/next'; },
  ]) { const data = fixture(); mutate(data); const m = mock(data); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0); }
});

test('declaration must match both app-info linkage and the explicit relationship endpoint', async () => {
  for (const mutate of [
    d => { d[`/v1/apps/${APP_ID}/appInfos`].data[0].relationships.ageRatingDeclaration.data.id = 'different-age'; },
    d => { d['/v1/appInfos/info-1/relationships/ageRatingDeclaration'].data.id = 'different-age'; },
    d => { d['/v1/appInfos/info-1/ageRatingDeclaration'].data.id = 'different-age'; },
    d => { d['/v1/appInfos/info-1/relationships/ageRatingDeclaration'].data = null; },
  ]) { const data = fixture(); mutate(data); const m = mock(data); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0); }
});

test('live-shaped sparse relationships require exact includes for ownership and declaration data', async () => {
  const m = mock(), seen = [];
  const request = async (method, path, parameters = {}, body) => {
    seen.push({ method, path, parameters });
    const response = await m.request(method, path, parameters, body);
    if (path.endsWith('/appInfos') && parameters.include !== 'app,ageRatingDeclaration') {
      for (const item of response.data) for (const key of ['app', 'ageRatingDeclaration']) item.relationships[key] = { links: { related: 'https://api.appstoreconnect.apple.com/related' } };
    }
    if (path.endsWith('/appStoreVersions') && parameters.include !== 'app') {
      for (const item of response.data) item.relationships.app = { links: { related: 'https://api.appstoreconnect.apple.com/related' } };
    }
    return response;
  };
  const plan = await prepare(m, { request });
  assert.equal(plan.changes.length, 26);
  assert.equal(seen.find(call => call.path.endsWith('/appInfos')).parameters.include, 'app,ageRatingDeclaration');
  assert.equal(seen.find(call => call.path.endsWith('/appStoreVersions')).parameters.include, 'app');
  assert(seen.some(call => call.path.endsWith('/relationships/ageRatingDeclaration')));
  for (const [path, parameters] of [
    [`/v1/apps/${APP_ID}/appInfos`, {}], [`/v1/apps/${APP_ID}/appInfos`, { include: 'app' }],
    [`/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': VERSION, 'filter[platform]': 'IOS' }],
    [`/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': VERSION, 'filter[platform]': 'IOS', include: 'app,build' }],
  ]) assert.throws(() => assertRequest('GET', path, parameters), /linkage/);
});

test('unknown schema fields or malformed saved enums stop rather than inventing an answer', async () => {
  for (const [field, value] of [['newQuestion', null], ['contests', false], ['gambling', 'NONE'], ['kidsAgeBand', 'FOUR_PLUS'], ['ageRatingOverrideV2', 'FOUR_PLUS']]) {
    const data = fixture(); age(data)[field] = value; const m = mock(data); await assert.rejects(prepare(m), /schema/); assert.equal(m.writes().length, 0);
  }
});

test('expired, future-dated and modified plans are rejected before a write', async () => {
  for (const mutate of [p => { p.createdAt = NOW + 100; }, p => { p.expiresAt = NOW - 1; }, p => { p.changes[0].to = true; }, p => { p.operation.path = '/v1/ageRatingDeclarations/foreign'; }]) {
    const m = mock(), plan = await prepare(m); mutate(plan); await assert.rejects(apply(m, plan)); assert.equal(m.writes().length, 0);
  }
  const m = mock(), plan = await prepare(m); await assert.rejects(apply(m, plan, { nowSeconds: NOW + 300 }), /expired/); assert.equal(m.writes().length, 0);
});

test('live answers, protected choices, missing fields and linked draft changes trigger stale guard', async () => {
  for (const mutate of [d => { age(d).advertising = false; }, d => { age(d).ageRatingOverrideV2 = 'THIRTEEN_PLUS'; }, d => { delete age(d).contests; }, d => { d[`/v1/apps/${APP_ID}/appInfos`].data[0].id = 'changed-info'; }]) {
    const m = mock(), plan = await prepare(m); mutate(m.data); await assert.rejects(apply(m, plan)); assert.equal(m.writes().length, 0);
  }
});

test('plan that expires during freshness GETs cannot authorize a PATCH even with a fresh session', async () => {
  const m = mock(), plan = await prepare(m); let clock = NOW + 299;
  const request = async (...args) => { const response = await m.request(...args); if (args[0] === 'GET') clock = NOW + 300; return response; };
  await assert.rejects(applyPlan({ plan, request, now: () => clock }), error => {
    assert.equal(error.receipt.outcome, 'not_attempted'); assert.equal(error.receipt.operationCount, 0); return true;
  });
  assert.equal(m.writes().length, 0);
});

test('successful apply performs one questionnaire PATCH, verifies saved answers and leaves every protected field intact', async () => {
  const m = mock(), plan = await prepare(m), records = [], receipt = await apply(m, plan, { record: r => records.push(r) });
  assert.equal(receipt.status, 'completed'); assert.equal(receipt.outcome, 'accepted'); assert.equal(receipt.readbackVerified, true);
  assert.equal(m.writes().length, 1); assert.equal(m.writes()[0].path, '/v1/ageRatingDeclarations/age-1');
  assert.deepEqual(m.writes()[0].body.data.attributes, ANSWERS);
  assert.equal(age(m.data).ageRatingOverrideV2, 'NONE'); assert.equal(age(m.data).kidsAgeBand, null);
  assert.equal(records.at(-1).status, 'completed');
  assert(m.calls.every(call => call.method === 'GET' || call.path.startsWith('/v1/ageRatingDeclarations/')));
  assert(!m.calls.some(call => /Submission|Release|territoryAgeRatings|inAppPurchase|build/.test(call.path)));
});

test('rejected or uncertain write is attempted once, returns sanitized receipt, and is never retried or rolled back', async () => {
  for (const failure of [{ outcome: 'rejected', httpStatus: 422 }, { outcome: 'unknown' }]) {
    const m = mock(fixture(), { failure }), plan = await prepare(m), records = [];
    await assert.rejects(apply(m, plan, { record: r => records.push(r) }), error => {
      assert.equal(error.receipt.status, 'stopped'); assert.equal(error.receipt.outcome, failure.outcome); assert.equal(error.receipt.readbackVerified, false);
      assert(!JSON.stringify(error.receipt).includes('PRIVATE')); return true;
    });
    assert.equal(m.writes().length, 1); assert.equal(records.at(-1).status, 'stopped');
  }
});

test('malformed or wrong-resource HTTP success never counts as verified completion', async () => {
  for (const response of [null, { errors: [] }, { data: { type: 'ageRatingDeclarations', id: 'foreign' } }, { data: { type: 'apps', id: APP_ID } }]) {
    const m = mock(fixture(), { response }), plan = await prepare(m);
    await assert.rejects(apply(m, plan), error => { assert.equal(error.receipt.outcome, 'unknown'); assert.equal(error.receipt.readbackVerified, false); return true; });
    assert.equal(m.writes().length, 1);
  }
});

test('readback catches unsaved answers and unexpected changes to protected fields without an automatic rollback', async () => {
  for (const options of [{ ignorePatch: true }, { afterPatch: d => { age(d).ageRatingOverrideV2 = 'EIGHTEEN_PLUS'; } }]) {
    const m = mock(fixture(), options), plan = await prepare(m);
    await assert.rejects(apply(m, plan), error => { assert.equal(error.receipt.outcome, 'accepted'); assert.equal(error.receipt.readbackVerified, false); return true; });
    assert.equal(m.writes().length, 1);
  }
});

test('HTTP readback rejection preserves accepted write outcome and reports separate readback failure', async () => {
  const m = mock(), plan = await prepare(m); let patched = false;
  const request = async (...args) => {
    if (patched && args[0] === 'GET') throw new AgeDraftError('PRIVATE readback diagnostic', { outcome: 'rejected', httpStatus: 403 });
    const result = await m.request(...args); if (args[0] === 'PATCH') patched = true; return result;
  };
  await assert.rejects(apply(m, plan, { request }), error => {
    assert.equal(error.receipt.outcome, 'accepted'); assert.equal(error.receipt.readbackOutcome, 'rejected');
    assert.equal(error.receipt.readbackHttpStatus, 403); assert.equal(error.receipt.httpStatus, undefined);
    assert.equal(error.receipt.readbackVerified, false); assert(!JSON.stringify(error.receipt).includes('PRIVATE')); return true;
  });
  assert.equal(m.writes().length, 1);
});

test('route guard allows only fixed BHU reads and source-supported declaration updates', () => {
  for (const [method, path, params, body] of [
    ['POST', '/v1/reviewSubmissions', {}, {}], ['PATCH', `/v1/apps/${APP_ID}`, {}, {}],
    ['GET', '/v1/apps/foreign/appInfos'], ['GET', '/v1/apps', { 'filter[bundleId]': 'com.other.app' }],
    ['GET', `/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': '2.0', 'filter[platform]': 'IOS' }],
    ['GET', '/v1/appInfos/..%2Fsecret/ageRatingDeclaration'], ['GET', '/v1/appInfos/info-1/ageRatingDeclaration?x=y'],
    ['GET', '/v1/appInfos/info-1/ageRatingDeclaration', { include: 'anything' }],
    ['PATCH', '/v1/ageRatingDeclarations/age-1', {}, { data: { type: 'ageRatingDeclarations', id: 'age-1', attributes: { ageRatingOverrideV2: 'NONE' } } }],
    ['PATCH', '/v1/ageRatingDeclarations/age-1', {}, { data: { type: 'ageRatingDeclarations', id: 'age-1', attributes: { advertising: true } } }],
    ['PATCH', '/v1/ageRatingDeclarations/age-1', {}, { data: { type: 'ageRatingDeclarations', id: 'age-1', attributes: { advertising: null } } }],
  ]) assert.throws(() => assertRequest(method, path, params, body));
});

function session(iat = NOW, exp = NOW + 300) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { appId: APP_ID, token: `${encode({ alg: 'ES256' })}.${encode({ aud: 'appstoreconnect-v1', iat, exp })}.mock-signature`, expiresAt: exp };
}
test('mock HTTP client uses Apple origin, blocks redirects and rechecks five-minute session on every request', async () => {
  const calls = []; let clock = NOW;
  const request = createClient(session(), { now: () => clock, fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ data: [] }), { status: 200 }); } });
  await request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE });
  assert.equal(new URL(calls[0].url).origin, 'https://api.appstoreconnect.apple.com'); assert.equal(calls[0].options.redirect, 'error');
  clock = NOW + 300; await assert.rejects(request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE }), /expired/); assert.equal(calls.length, 1);
  assert.throws(() => createClient(session(NOW, NOW + 301), { now: () => NOW }));
  assert.throws(() => createClient(session(NOW + 20, NOW + 10), { now: () => NOW }), /lifetime/);
  assert.throws(() => createClient({ ...session(), issuedAt: NOW - 1 }, { now: () => NOW }), /lifetime/);
});

test('HTTP/network error diagnostics and secrets never enter public errors or receipts', async () => {
  const request = createClient(session(), { now: () => NOW, fetchImpl: async () => new Response('PRIVATE token and raw diagnostics', { status: 403 }) });
  await assert.rejects(request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE }), error => { assert.equal(error.httpStatus, 403); assert(!error.message.includes('PRIVATE')); return true; });
  const uncertain = createClient(session(), { now: () => NOW, fetchImpl: async () => { throw new Error('PRIVATE network text'); } });
  await assert.rejects(uncertain('PATCH', '/v1/ageRatingDeclarations/age-1', {}, { data: { type: 'ageRatingDeclarations', id: 'age-1', attributes: { advertising: false } } }), error => { assert.equal(error.outcome, 'unknown'); assert(!error.message.includes('PRIVATE')); return true; });
});
