import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ID, IAP_ID, BUNDLE, PRODUCT, DraftError, assertRequest, validateSession, createClient, compilePlan, applyPlan, privatePath, summarize } from '../scripts/ios-store-draft.mjs';

const NOW = 1795798000;
const metadata = { name: 'BHU', publisher: 'Fevzi Çakmak', supportEmail: 'review@example.test', subtitle: 'Test subtitle', description: 'Approved description', keywords: 'ledger,cash', promotionalText: 'Approved promotion', supportURL: 'https://fevzicakmak.github.io/BHU/support.html', privacyPolicyURL: 'https://fevzicakmak.github.io/BHU/privacy.html' };
const contact = { firstName: 'Fevzi', lastName: 'Çakmak', email: 'review@example.test', phone: '+900000000001' };
const notes = `Private reviewer notes for ${PRODUCT}. Not for public artifacts.`;
const one = (type, id, attributes = {}, relationships = {}) => ({ type, id, attributes, relationships });
const link = (type, id) => ({ data: { type, id } });
const list = (...data) => ({ data });
const clone = value => structuredClone(value);
function fixture() {
  return {
    '/v1/apps': list(one('apps', APP_ID, { bundleId: BUNDLE, primaryLocale: 'tr' })),
    [`/v1/apps/${APP_ID}/appInfos`]: list(one('appInfos', 'info-1', { state: 'PREPARE_FOR_SUBMISSION' }, { app: link('apps', APP_ID), primaryCategory: { data: null } })),
    [`/v1/apps/${APP_ID}/appStoreVersions`]: list(one('appStoreVersions', 'version-1', { versionString: '1.0', platform: 'IOS', appVersionState: 'PREPARE_FOR_SUBMISSION', releaseType: 'AFTER_APPROVAL', copyright: null }, { app: link('apps', APP_ID), build: { data: null } })),
    '/v1/builds': { data: [one('builds', 'build-5', { version: '5.1', processingState: 'VALID', expired: false }, { app: link('apps', APP_ID), preReleaseVersion: link('preReleaseVersions', 'pre-1') })], included: [one('preReleaseVersions', 'pre-1', { version: '1.0', platform: 'IOS' })] },
    [`/v1/apps/${APP_ID}/inAppPurchasesV2`]: list(one('inAppPurchases', IAP_ID, { productId: PRODUCT, inAppPurchaseType: 'NON_CONSUMABLE', familySharable: false, state: 'MISSING_METADATA' })),
    '/v1/appInfos/info-1/appInfoLocalizations': list(one('appInfoLocalizations', 'info-tr', { locale: 'tr', name: 'BHU', subtitle: null, privacyPolicyUrl: null })),
    '/v1/appStoreVersions/version-1/appStoreVersionLocalizations': list(one('appStoreVersionLocalizations', 'version-tr', { locale: 'tr', description: null, keywords: null, promotionalText: null, supportUrl: null })),
    '/v1/appStoreVersions/version-1/appStoreReviewDetail': { data: null },
    [`/v1/apps/${APP_ID}/appAvailabilityV2`]: { data: one('appAvailabilities', 'app-availability-1', { availableInNewTerritories: true }) },
    '/v2/appAvailabilities/app-availability-1/territoryAvailabilities': list(
      one('territoryAvailabilities', 'tur-record-opaque', { available: true, releaseDate: null, preOrderEnabled: false }, { territory: link('territories', 'TUR') }),
      one('territoryAvailabilities', 'usa-record', { available: true, releaseDate: '2026-12-01', preOrderEnabled: false }, { territory: link('territories', 'USA') }),
      one('territoryAvailabilities', 'fra-record', { available: false, releaseDate: null, preOrderEnabled: false }, { territory: link('territories', 'FRA') })),
    [`/v2/inAppPurchases/${IAP_ID}/inAppPurchaseAvailability`]: { data: one('inAppPurchaseAvailabilities', 'availability-1', { availableInNewTerritories: true }) },
    '/v1/inAppPurchaseAvailabilities/availability-1/availableTerritories': list(...['USA', 'GBR', 'NOR'].map(id => one('territories', id, { currency: 'USD' }))),
    [`/v2/inAppPurchases/${IAP_ID}/iapPriceSchedule`]: { data: one('inAppPurchasePriceSchedules', 'schedule-1') },
    '/v1/inAppPurchasePriceSchedules/schedule-1/manualPrices': { data: [one('inAppPurchasePrices', 'price-1', { startDate: null, endDate: null }, { territory: link('territories', 'TUR'), inAppPurchasePricePoint: link('inAppPurchasePricePoints', 'point-1') })], included: [one('territories', 'TUR', { currency: 'TRY' }), one('inAppPurchasePricePoints', 'point-1', { customerPrice: '149.99' })] },
    '/v1/inAppPurchasePriceSchedules/schedule-1/automaticPrices': list(),
  };
}
function mock(data = fixture(), fail = null) {
  const calls = [];
  const request = async (method, path, parameters = {}, body) => {
    assertRequest(method, path); calls.push({ method, path, parameters, body: clone(body) });
    if (method === 'GET') { assert(Object.hasOwn(data, path), path); return clone(data[path]); }
    if (fail && fail.path === path) throw new DraftError('Sanitized mock failure.', { outcome: fail.outcome, ...(fail.httpStatus ? { httpStatus: fail.httpStatus } : {}) });
    return { data: { type: body.data.type, id: body.data.id ?? 'created-1' } };
  };
  return { data, request, calls, writes: () => calls.filter(x => x.method !== 'GET') };
}
const prepare = m => compilePlan({ request: m.request, metadata, notes, contact, nowSeconds: NOW });
const apply = (m, plan, extra = {}) => applyPlan({ plan, request: m.request, metadata, notes, contact, nowSeconds: NOW, ...extra });
function session(patch = {}) {
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ aud: 'appstoreconnect-v1', iat: NOW, exp: NOW + 300 })).toString('base64url');
  return { appId: APP_ID, token: `${h}.${b}.signature`, expiresAt: NOW + 300, ...patch };
}

test('dry plan reads fixed app resources without writes; public summary excludes private review data', async () => {
  const m = mock(), p = await prepare(m), summary = summarize(p);
  assert.equal(p.operations.length, 7); assert.equal(m.writes().length, 0);
  assert.equal(p.appId, APP_ID); assert.equal(p.build, '5.1');
  const text = JSON.stringify(summary);
  for (const privateValue of [contact.phone, contact.email, contact.firstName, contact.lastName, notes, p.fingerprint]) assert(!text.includes(privateValue));
  assert.equal(summary.priceUnchanged, true); assert.equal(summary.doesNotSubmitOrPublish, true);
});

test('wrong app, product, marketing version, expired or processing build stop before any mutation', async () => {
  const mutations = [
    d => { d['/v1/apps'].data[0].id = 'another-app'; },
    d => { d[`/v1/apps/${APP_ID}/appInfos`].data[0].relationships.app = link('apps', 'another-app'); },
    d => { d[`/v1/apps/${APP_ID}/inAppPurchasesV2`].data[0].attributes.productId = 'wrong.product'; },
    d => { d['/v1/builds'].data[0].attributes.expired = true; },
    d => { d['/v1/builds'].data[0].attributes.processingState = 'PROCESSING'; },
    d => { d['/v1/builds'].included[0].attributes.version = '2.0'; },
    d => { d['/v1/builds'].data[0].relationships.app = link('apps', 'foreign'); },
  ];
  for (const mutation of mutations) { const d = fixture(); mutation(d); const m = mock(d); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0); }
});

test('a non-draft version or a different already-selected build is not overwritten', async () => {
  for (const mutation of [d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].attributes.appVersionState = 'WAITING_FOR_REVIEW'; }, d => { d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].relationships.build = link('builds', 'build-other'); }]) {
    const d = fixture(); mutation(d); const m = mock(d); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0);
  }
});

test('sparse relationship omissions are not mistaken for an empty selected build or missing category', async () => {
  for (const mutate of [d => { delete d[`/v1/apps/${APP_ID}/appInfos`].data[0].relationships.primaryCategory.data; }, d => { delete d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0].relationships.build.data; }]) {
    const data = fixture(); mutate(data); const m = mock(data); await assert.rejects(prepare(m), /relationship is incomplete/); assert.equal(m.writes().length, 0);
  }
});

test('apply recompiles fresh payloads and rejects stale metadata or a tampered private plan', async () => {
  const m = mock(), p = await prepare(m);
  m.data['/v1/appInfos/info-1/appInfoLocalizations'].data[0].attributes.subtitle = 'Owner changed this';
  await assert.rejects(apply(m, p), /stale or changed/); assert.equal(m.writes().length, 0);
  const n = mock(), original = await prepare(n), tampered = clone(original);
  tampered.operations[0].path = '/v1/apps/another-app';
  await assert.rejects(apply(n, tampered), /stale or changed/); assert.equal(n.writes().length, 0);
  await assert.rejects(apply(n, original, { contact: { ...contact, phone: '+900000000002' } }), /stale or changed/); assert.equal(n.writes().length, 0);
});

test('successful apply only updates approved draft fields, adds TUR last and preserves existing regions, price and release choice', async () => {
  const m = mock(), p = await prepare(m), receipt = await apply(m, p), writes = m.writes();
  assert.equal(receipt.status, 'completed'); assert.equal(writes.length, 7);
  const last = writes.at(-1);
  assert.equal(last.path, '/v1/inAppPurchaseAvailabilities'); assert.equal(last.method, 'POST');
  assert.deepEqual(last.body.data.relationships.availableTerritories.data.map(x => x.id), ['GBR', 'NOR', 'TUR', 'USA']);
  assert.equal(last.body.data.attributes.availableInNewTerritories, true);
  assert.equal(last.body.data.relationships.inAppPurchase.data.id, IAP_ID);
  assert(!writes.some(x => /Price|Submission|Release|expire/i.test(x.path)));
  for (const write of writes) {
    assert.equal(write.body.data.attributes?.releaseType, undefined);
    assert.equal(write.body.data.attributes?.primaryLocale, undefined);
    assert.equal(write.body.data.attributes?.familySharable, undefined);
  }
  assert.equal(receipt.publicReleaseTriggered, false); assert.equal(receipt.reviewSubmitted, false);
  for (const value of [contact.phone, contact.email, notes, contact.firstName]) assert(!JSON.stringify(receipt).includes(value));
});

test('ambiguous creation failure stops once with a sanitized partial receipt and no availability write', async () => {
  const m = mock(fixture(), { path: '/v1/appStoreReviewDetails', outcome: 'unknown' }), p = await prepare(m), recorded = [];
  await assert.rejects(apply(m, p, { record: r => recorded.push(clone(r)) }), error => {
    assert.equal(error.receipt.status, 'stopped'); assert.equal(error.receipt.operations.at(-1).outcome, 'unknown');
    assert(!JSON.stringify(error.receipt).includes(contact.phone)); return true;
  });
  assert.equal(m.writes().filter(x => x.path === '/v1/appStoreReviewDetails').length, 1);
  assert(!m.writes().some(x => x.path === '/v1/inAppPurchaseAvailabilities'));
  assert.equal(recorded.at(-1).operations.filter(x => x.outcome === 'accepted').length, 5);
});

test('known availability replacement rejection preserves accepted metadata in the receipt without retry or rollback', async () => {
  const m = mock(fixture(), { path: '/v1/inAppPurchaseAvailabilities', outcome: 'rejected', httpStatus: 409 }), p = await prepare(m);
  await assert.rejects(apply(m, p), error => {
    assert.equal(error.receipt.operations.length, 7); assert.deepEqual(error.receipt.operations.at(-1), { name: 'addTurkeyWithoutOtherTerritoryChanges', outcome: 'rejected', httpStatus: 409 }); return true;
  });
  assert.equal(m.writes().length, 7);
});

test('HTTP success without an explicit matching resource is uncertain, never a verified draft update', async () => {
  for (const malformed of [{ errors: [] }, { data: { type: 'wrongType', id: 'x' } }, { data: { type: 'appInfoLocalizations', id: 'foreign-localization' } }, null]) {
    const m = mock(), p = await prepare(m);
    const request = async (method, ...args) => method === 'GET' ? m.request(method, ...args) : malformed;
    await assert.rejects(apply(m, p, { request }), error => {
      assert.equal(error.receipt.status, 'stopped'); assert.equal(error.receipt.operations.length, 1); assert.equal(error.receipt.operations[0].outcome, 'unknown'); return true;
    });
  }
});

test('future, different-currency or ambiguous saved prices cannot authorize opening Turkey sales', async () => {
  for (const mutation of [d => { d['/v1/inAppPurchasePriceSchedules/schedule-1/manualPrices'].included[1].attributes.customerPrice = '399'; }, d => { d['/v1/inAppPurchasePriceSchedules/schedule-1/manualPrices'].included[0].attributes.currency = 'EUR'; }, d => { d['/v1/inAppPurchasePriceSchedules/schedule-1/manualPrices'].data[0].attributes.startDate = '2030-01-01'; }]) {
    const d = fixture(); mutation(d); const m = mock(d); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0);
  }
});

test('incomplete territory pagination fails closed and never follows server-provided external links', async () => {
  const d = fixture(); d['/v1/inAppPurchaseAvailabilities/availability-1/availableTerritories'].links = { next: 'https://evil.example/steal' };
  const m = mock(d); await assert.rejects(prepare(m), /Incomplete Apple collection/); assert.equal(m.writes().length, 0);
});

test('app Turkey update uses only the fetched TUR record, preserves every other setting and keeps IAP changes last', async () => {
  const data = fixture(), rows = data['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data;
  rows[0].id = 'opaque_TUR_record=='; rows[0].attributes.available = false; rows[0].attributes.preOrderEnabled = true; rows[0].attributes.releaseDate = '2026-12-10';
  const m = mock(data), p = await prepare(m), receipt = await apply(m, p);
  const appWrite = m.writes().find(x => x.path.startsWith('/v1/territoryAvailabilities/'));
  assert.deepEqual(appWrite, { method: 'PATCH', path: '/v1/territoryAvailabilities/opaque_TUR_record%3D%3D', parameters: {}, body: { data: { type: 'territoryAvailabilities', id: 'opaque_TUR_record==', attributes: { available: true } } } });
  assert.equal(m.writes().filter(x => x.path.startsWith('/v1/territoryAvailabilities/')).length, 1);
  assert.equal(m.writes().at(-1).path, '/v1/inAppPurchaseAvailabilities');
  assert.equal(receipt.operations.length, 8); assert.equal(receipt.status, 'completed');
  assert.equal(data[`/v1/apps/${APP_ID}/appAvailabilityV2`].data.attributes.availableInNewTerritories, true);
  assert.equal(rows[1].attributes.releaseDate, '2026-12-01'); assert.equal(rows[2].attributes.available, false);
  const read = m.calls.find(x => x.path === '/v2/appAvailabilities/app-availability-1/territoryAvailabilities');
  assert.equal(read.parameters.include, 'territory');
});

test('missing, ambiguous, unlinked or incompletely paginated app Turkey rows cannot authorize a write', async () => {
  const mutate = [
    d => { d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data.shift(); },
    d => { const rows = d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data; rows.push(clone(rows[0])); },
    d => { delete d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data[0].relationships.territory.data; },
    d => { delete d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data[0].attributes.available; },
    d => { d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].links = { next: 'https://evil.example/read-other-app' }; },
  ];
  for (const change of mutate) { const d = fixture(); change(d); const m = mock(d); await assert.rejects(prepare(m)); assert.equal(m.writes().length, 0); }
});

test('a concurrent change to another app territory makes the entire private plan stale before any mutation', async () => {
  const d = fixture(); d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data[0].attributes.available = false;
  const m = mock(d), p = await prepare(m);
  d['/v2/appAvailabilities/app-availability-1/territoryAvailabilities'].data[1].attributes.preOrderEnabled = true;
  await assert.rejects(apply(m, p), /stale or changed/); assert.equal(m.writes().length, 0);
});

test('already matching metadata produces no mutations and does not query price or alter an existing category', async () => {
  const d = fixture();
  d[`/v1/apps/${APP_ID}/appInfos`].data[0].relationships.primaryCategory = link('appCategories', 'PRODUCTIVITY');
  d['/v1/appInfos/info-1/appInfoLocalizations'].data[0].attributes = { locale: 'tr', name: metadata.name, subtitle: metadata.subtitle, privacyPolicyUrl: metadata.privacyPolicyURL };
  d['/v1/appStoreVersions/version-1/appStoreVersionLocalizations'].data[0].attributes = { locale: 'tr', description: metadata.description, keywords: metadata.keywords, promotionalText: metadata.promotionalText, supportUrl: metadata.supportURL };
  const v = d[`/v1/apps/${APP_ID}/appStoreVersions`].data[0]; v.attributes.copyright = '2026 Fevzi Çakmak'; v.relationships.build = link('builds', 'build-5');
  d['/v1/appStoreVersions/version-1/appStoreReviewDetail'] = { data: one('appStoreReviewDetails', 'review-1', { contactFirstName: contact.firstName, contactLastName: contact.lastName, contactEmail: contact.email, contactPhone: contact.phone, demoAccountRequired: false, notes }) };
  d['/v1/inAppPurchaseAvailabilities/availability-1/availableTerritories'].data.push(one('territories', 'TUR'));
  const m = mock(d), p = await prepare(m); assert.equal(p.operations.length, 0); const r = await apply(m, p);
  assert.equal(r.status, 'completed'); assert.equal(m.writes().length, 0); assert(!m.calls.some(x => x.path.includes('Price')));
});

test('HTTP client rejects forbidden endpoints and never includes raw server details in errors', async () => {
  const calls = [], request = createClient(session(), { now: () => NOW, fetchImpl: async (url, config) => { calls.push({ url, config }); return new Response(JSON.stringify({ errors: [{ detail: contact.phone + notes }] }), { status: 400 }); } });
  for (const [method, path] of [['POST', '/v1/appStoreVersionSubmissions'], ['DELETE', '/v1/appStoreVersions/abc'], ['PATCH', '/v1/builds/abc'], ['GET', '/v1/users'], ['GET', '/v1/apps/other/appInfos'], ['GET', '/v2/inAppPurchases/other/iapPriceSchedule'], ['GET', '//evil.example/apps'], ['GET', '/v1/appInfos/a%2Fb/appInfoLocalizations']]) await assert.rejects(request(method, path));
  assert.equal(calls.length, 0);
  await assert.rejects(request('GET', '/v1/apps'), error => { assert.equal(error.httpStatus, 400); assert(!String(error).includes(contact.phone)); assert(!String(error).includes(notes)); return true; });
  assert.equal(new URL(calls[0].url).origin, 'https://api.appstoreconnect.apple.com'); assert.equal(calls[0].config.redirect, 'error'); assert(calls[0].config.signal instanceof AbortSignal);
});

test('expired or foreign short-lived sessions are rejected before requests', () => {
  assert.doesNotThrow(() => validateSession(session(), NOW));
  for (const value of [session({ appId: 'other' }), session({ expiresAt: NOW - 1 }), session({ token: 'bad' })]) assert.throws(() => validateSession(value, NOW));
  assert.throws(() => validateSession(session(), NOW + 300));
});

test('private plan paths reject traversal and symbolic links', () => {
  const folder = mkdtempSync(join(tmpdir(), 'bhu-draft-path-')); const base = join(folder, 'private'); mkdirSync(base, { mode: 0o700 });
  try {
    assert.equal(privatePath(join(base, 'plan.json'), base), join(base, 'plan.json'));
    assert.throws(() => privatePath(join(base, '..', 'public.json'), base));
    symlinkSync(folder, join(base, 'escape')); assert.throws(() => privatePath(join(base, 'escape', 'plan.json'), base));
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
