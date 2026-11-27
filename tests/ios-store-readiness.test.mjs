import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { APP_ID, IAP_ID, PRODUCT_ID, assertReadPath, createReadClient, getReadiness } from '../scripts/ios-store-readiness.mjs';

const NOW = 1_795_000_000;
const PRIVATE = 'private-reviewer-secret-never-publish';
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
const env = () => ({ APP_STORE_CONNECT_KEY_ID: 'ABCDEF1234', APP_STORE_CONNECT_ISSUER_ID: '12345678-1234-1234-1234-123456789ABC', APP_STORE_CONNECT_PRIVATE_KEY: key.privateKey });
const one = (type, id, attributes = {}, relationships = {}) => ({ type, id, attributes, relationships });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const list = (...data) => ({ data });
const territory = id => one('territories', id, { currency: id === 'TUR' ? 'TRY' : 'USD' });
function price(currencyPrice = '149.99') {
  return { data: [one('inAppPurchasePrices', 'saved-price', { startDate: null, endDate: null, manual: true }, {
    territory: { data: { type: 'territories', id: 'TUR' } }, inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: 'selected-price-point' } },
  })], included: [one('inAppPurchasePricePoints', 'selected-price-point', { customerPrice: currencyPrice, proceeds: PRIVATE }), territory('TUR')] };
}
function fixture(patches = {}) {
  return {
    '/v1/apps': list(one('apps', APP_ID, { bundleId: 'com.fevzicakmak.bhu', primaryLocale: 'tr' })),
    [`/v1/apps/${APP_ID}/appInfos`]: list(one('appInfos', 'app-info', { state: 'PREPARE_FOR_SUBMISSION' }, { primaryCategory: { data: { type: 'appCategories', id: 'FINANCE' } } })),
    '/v1/appInfos/app-info/appInfoLocalizations': list(one('appInfoLocalizations', 'info-tr', { locale: 'tr', name: 'BHU', subtitle: PRIVATE, privacyPolicyUrl: 'https://fevzicakmak.github.io/BHU/privacy.html' })),
    [`/v1/apps/${APP_ID}/appStoreVersions`]: { data: [one('appStoreVersions', 'version-1', { versionString: '1.0', platform: 'IOS', appStoreState: 'PREPARE_FOR_SUBMISSION', releaseType: 'MANUAL', copyright: PRIVATE }, { build: { data: { type: 'builds', id: 'build-5' } } })], included: [one('builds', 'build-5', { version: '5.1', assetToken: PRIVATE })] },
    '/v1/appStoreVersions/version-1/appStoreReviewDetail': { data: one('appStoreReviewDetails', 'review-1', { contactFirstName: PRIVATE, contactLastName: PRIVATE, contactPhone: PRIVATE, contactEmail: PRIVATE, notes: PRIVATE, demoAccountRequired: false, demoAccountName: PRIVATE, demoAccountPassword: PRIVATE }) },
    '/v1/appStoreVersions/version-1/appStoreVersionLocalizations': list(one('appStoreVersionLocalizations', 'version-tr', { locale: 'tr', description: PRIVATE, keywords: PRIVATE, promotionalText: PRIVATE, supportUrl: 'https://fevzicakmak.github.io/BHU/support.html' })),
    '/v1/appStoreVersionLocalizations/version-tr/appScreenshotSets': list(one('appScreenshotSets', 'phone-set', { screenshotDisplayType: 'APP_IPHONE_69' })),
    '/v1/appScreenshotSets/phone-set/appScreenshots': list(one('appScreenshots', 'shot-1', { fileName: PRIVATE, assetToken: PRIVATE, imageAsset: { templateUrl: PRIVATE }, fileSize: 1024, assetDeliveryState: { state: 'COMPLETE', errors: [{ description: PRIVATE }] } })),
    [`/v1/apps/${APP_ID}/appAvailabilityV2`]: { data: one('appAvailabilities', 'app-availability', { availableInNewTerritories: false }) },
    '/v2/appAvailabilities/app-availability/territoryAvailabilities': list(
      one('territoryAvailabilities', 'tur-availability', { available: true }, { territory: { data: { type: 'territories', id: 'TUR' } } }),
      one('territoryAvailabilities', 'fra-availability', { available: false }, { territory: { data: { type: 'territories', id: 'FRA' } } })),
    [`/v1/apps/${APP_ID}/inAppPurchasesV2`]: list(one('inAppPurchases', IAP_ID, { productId: PRODUCT_ID, inAppPurchaseType: 'NON_CONSUMABLE', state: 'READY_TO_SUBMIT', familySharable: false, reviewNote: PRIVATE })),
    [`/v2/inAppPurchases/${IAP_ID}/inAppPurchaseLocalizations`]: list(one('inAppPurchaseLocalizations', 'iap-tr', { locale: 'tr', name: PRIVATE, description: PRIVATE, state: 'APPROVED' })),
    [`/v2/inAppPurchases/${IAP_ID}/appStoreReviewScreenshot`]: { data: one('inAppPurchaseAppStoreReviewScreenshots', 'iap-shot', { fileName: PRIVATE, assetToken: PRIVATE, fileSize: 2000, assetDeliveryState: { state: 'COMPLETE', warnings: [{ description: PRIVATE }] } }) },
    [`/v2/inAppPurchases/${IAP_ID}/inAppPurchaseAvailability`]: { data: one('inAppPurchaseAvailabilities', 'iap-availability', { availableInNewTerritories: false }) },
    '/v1/inAppPurchaseAvailabilities/iap-availability/availableTerritories': list(territory('TUR'), territory('USA')),
    [`/v2/inAppPurchases/${IAP_ID}/iapPriceSchedule`]: { data: one('inAppPurchasePriceSchedules', 'opaque_schedule_id', {}, { baseTerritory: { data: { type: 'territories', id: 'TUR' } } }) },
    '/v1/inAppPurchasePriceSchedules/opaque_schedule_id/manualPrices': price(),
    '/v1/inAppPurchasePriceSchedules/opaque_schedule_id/automaticPrices': list(),
    ...patches,
  };
}
function mock(patches = {}, options = {}) {
  const data = fixture(patches), calls = [];
  const fetchImpl = async (input, config) => {
    const url = new URL(input); calls.push({ url, config });
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(config.method, 'GET'); assert.equal(config.redirect, 'error');
    assert(config.signal instanceof AbortSignal);
    const token = config.headers.Authorization.slice('Bearer '.length);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
    assert.equal(claims.aud, 'appstoreconnect-v1');
    if (options.individual && url.pathname === '/v1/apps' && claims.iss) return reply({ errors: [{ detail: PRIVATE }] }, 401);
    if (options.individual) { assert.equal(claims.sub, 'user'); assert.equal(claims.iss, undefined); }
    assert(Object.hasOwn(data, url.pathname), `Unexpected endpoint ${url.pathname}`);
    const value = data[url.pathname];
    if (typeof value === 'number') return reply({ errors: [{ detail: PRIVATE }] }, value);
    if (value instanceof Error) throw value;
    return reply(value);
  };
  return { fetchImpl, calls };
}
async function audit(m = mock(), patch = {}) {
  return getReadiness({ env: env(), nowSeconds: NOW, fetchImpl: m.fetchImpl, ...patch });
}

test('fixed app audit returns readiness facts without publishing reviewer data, notes, URLs or credentials', async () => {
  const m = mock(); const result = await audit(m);
  assert.equal(result.appId, APP_ID); assert.equal(result.bundleId, 'com.fevzicakmak.bhu'); assert.equal(result.primaryLocale, 'tr');
  assert.equal(result.readOnly, true); assert.equal(result.appVersion.found, true);
  assert.equal(result.appInfo.entries[0].primaryCategoryPresent, true);
  assert.equal(result.appVersion.attachedBuildNumber, '5.1');
  assert.equal(result.appVersion.review.contactPhonePresent, true);
  assert.equal(result.appVersion.review.demoAccountPasswordPresent, true);
  assert.equal(result.appVersion.localizations.entries[0].screenshots.sets[0].complete, 1);
  assert.equal(result.inAppPurchase.reviewScreenshot.deliveryState, 'COMPLETE');
  assert.equal(result.inAppPurchase.type, 'NON_CONSUMABLE');
  assert.equal(result.inAppPurchase.turkeySavedPrice.matchesTarget149_99TRY, true);
  assert.equal(result.appAvailability.euExcluded, true);
  assert.equal(result.inAppPurchase.availability.turkeyAvailable, true);
  const output = JSON.stringify(result);
  for (const secret of [PRIVATE, key.privateKey, 'Bearer ', 'templateUrl', 'assetToken', 'contactFirstName', 'demoAccountPassword"']) assert(!output.includes(secret), secret);
  for (const call of m.calls) {
    if (call.url.pathname.includes('Prices')) assert.equal(call.url.searchParams.get('filter[territory]'), 'TUR');
    assert(!call.url.pathname.endsWith('/pricePoints'), 'Potential price points are not saved price evidence');
  }
});

test('app info explicitly includes the category linkage omitted by the live sparse-fieldset response', async () => {
  const m = mock();
  const fetchImpl = async (input, config) => {
    const url = new URL(input);
    if (url.pathname === `/v1/apps/${APP_ID}/appInfos`) {
      if (url.searchParams.get('include') !== 'primaryCategory') return reply(list(one('appInfos', 'app-info', { state: 'PREPARE_FOR_SUBMISSION' }, { primaryCategory: { links: { related: 'https://api.appstoreconnect.apple.com/v1/appInfos/app-info/primaryCategory' } } })));
      assert(url.searchParams.get('fields[appInfos]').split(',').includes('primaryCategory'));
      assert.equal(url.searchParams.get('fields[appCategories]'), 'platforms');
    }
    return m.fetchImpl(input, config);
  };
  const result = await audit({ fetchImpl });
  assert.equal(result.appInfo.entries[0].primaryCategoryPresent, true);
});

test('an explicitly empty category differs from missing or malformed linkage', async () => {
  const cases = [
    { relationship: { data: null }, expected: false },
    { relationship: { links: { related: 'https://example.invalid/private-link' } }, expected: null },
    { relationship: { data: { type: 'territories', id: 'TUR' } }, expected: null },
    { relationship: { data: { type: 'appCategories', id: '../private' } }, expected: null },
  ];
  for (const entry of cases) {
    const result = await audit(mock({ [`/v1/apps/${APP_ID}/appInfos`]: {
      data: [one('appInfos', 'app-info', { state: 'PREPARE_FOR_SUBMISSION' }, { primaryCategory: entry.relationship })],
      included: [one('appCategories', 'FINANCE', { platforms: ['IOS'] })],
    } }));
    assert.equal(result.appInfo.entries[0].primaryCategoryPresent, entry.expected);
    assert(!JSON.stringify(result).includes('private-link'));
  }
});

test('different application or product cannot be audited accidentally', async () => {
  const wrongApp = mock({ '/v1/apps': list(one('apps', '6835489999', { bundleId: 'com.fevzicakmak.bhu' })) });
  await assert.rejects(audit(wrongApp), /expected BHU application/);
  assert.equal(wrongApp.calls.length, 1);
  const wrongProduct = mock({ [`/v1/apps/${APP_ID}/inAppPurchasesV2`]: list(one('inAppPurchases', '9999', { productId: PRODUCT_ID })) });
  await assert.rejects(audit(wrongProduct), /expected BHU product/);
  assert(!wrongProduct.calls.some(x => x.url.pathname.startsWith('/v2/inAppPurchases/')));
});

test('documented GET route guard rejects foreign origins, account resources, writes and other app/product paths', async () => {
  let called = false;
  const client = createReadClient({ env: env(), nowSeconds: NOW, fetchImpl: async () => { called = true; return reply({}); } });
  for (const path of ['https://evil.example/v1/apps', '//evil.example/v1/apps', '/v1/users', `/v1/apps/other/appInfos`, '/v2/inAppPurchases/other/iapPriceSchedule', `/v1/apps/${APP_ID}/appInfos?token=x`, '/v1/appInfos/a%2Fb/appInfoLocalizations', `/v1/apps/${APP_ID}/relationships`]) {
    await assert.rejects(client.get(path));
  }
  assert.equal(called, false);
  assert.doesNotThrow(() => assertReadPath('/v1/inAppPurchasePriceSchedules/opaque_id%3D/manualPrices'));
});

test('review-detail 403/404 and screenshot access failures stay unknown rather than missing', async () => {
  for (const code of [403, 404]) {
    const result = await audit(mock({ '/v1/appStoreVersions/version-1/appStoreReviewDetail': code,
      [`/v2/inAppPurchases/${IAP_ID}/appStoreReviewScreenshot`]: code }));
    assert.deepEqual(result.appVersion.review, { known: false, reason: 'HTTP_UNAVAILABLE', httpStatus: code });
    assert.equal(result.inAppPurchase.reviewScreenshot.known, false);
    assert.equal(result.inAppPurchase.reviewScreenshot.present, undefined);
    assert(!JSON.stringify(result).includes(PRIVATE));
  }
});

test('paginated availability cannot falsely claim all EU territories are excluded', async () => {
  const result = await audit(mock({ '/v1/inAppPurchaseAvailabilities/iap-availability/availableTerritories': {
    data: [territory('TUR')], links: { next: 'https://evil.example/steal-key' },
  } }));
  assert.equal(result.inAppPurchase.availability.known, false);
  assert.equal(result.inAppPurchase.availability.reason, 'INCOMPLETE_COLLECTION');
  assert.equal(result.inAppPurchase.availability.euExcluded, undefined);
});

test('available EU regions are identified, while missing territory relationships remain unknown', async () => {
  const yes = await audit(mock({ '/v1/inAppPurchaseAvailabilities/iap-availability/availableTerritories': list(territory('TUR'), territory('FRA')) }));
  assert.equal(yes.inAppPurchase.availability.euExcluded, false);
  assert.deepEqual(yes.inAppPurchase.availability.euTerritoriesAvailable, ['FRA']);
  const bad = await audit(mock({ '/v2/appAvailabilities/app-availability/territoryAvailabilities': list(one('territoryAvailabilities', 'bad', { available: true })) }));
  assert.equal(bad.appAvailability.known, false); assert.equal(bad.appAvailability.turkeyAvailable, undefined);
  assert.equal(bad.appAvailability.missingTerritoryCount, 1); assert.equal(bad.appAvailability.missingAvailabilityFlagCount, 0);
});

test('app availability explicitly includes territory linkage required by the live Apple relationship response', async () => {
  const m = mock();
  const fetchImpl = async (input, config) => {
    const url = new URL(input);
    if (url.pathname === '/v2/appAvailabilities/app-availability/territoryAvailabilities') {
      // The live response omitted linkage when only the sparse fieldset was sent.
      if (url.searchParams.get('include') !== 'territory') return reply(list(one('territoryAvailabilities', 'opaque-id', { available: true })));
      assert.equal(url.searchParams.get('fields[territoryAvailabilities]'), 'available,territory');
      assert.equal(url.searchParams.get('fields[territories]'), 'currency');
    }
    return m.fetchImpl(input, config);
  };
  const result = await audit({ fetchImpl });
  assert.equal(result.appAvailability.known, true);
  assert.equal(result.appAvailability.turkeyAvailable, true);
  assert.equal(result.appAvailability.euExcluded, true);
});

test('included territories and incomplete availability flags cannot be used to invent a configured sales region', async () => {
  const missing = await audit(mock({ '/v2/appAvailabilities/app-availability/territoryAvailabilities': {
    data: [one('territoryAvailabilities', 'unlinked', { available: true }), one('territoryAvailabilities', 'no-flag', {}, { territory: { data: { type: 'territories', id: 'TUR' } } })],
    included: [territory('TUR'), territory('FRA')],
  } }));
  assert.deepEqual(missing.appAvailability, { known: false, reason: 'INCOMPLETE_TERRITORY_DATA', observedRecordCount: 2, missingTerritoryCount: 1, missingAvailabilityFlagCount: 1 });
  assert.equal(missing.appAvailability.turkeyAvailable, undefined);
  assert.equal(missing.appAvailability.euExcluded, undefined);
});

test('saved pricing is date-bounded and conflicting active prices are not promoted as the current price', async () => {
  const future = price('199.99'); future.data[0].attributes.startDate = '2030-01-01';
  const yes = await audit(mock({ '/v1/inAppPurchasePriceSchedules/opaque_schedule_id/automaticPrices': future }));
  assert.equal(yes.inAppPurchase.turkeySavedPrice.matchesTarget149_99TRY, true);
  const ambiguous = await audit(mock({ '/v1/inAppPurchasePriceSchedules/opaque_schedule_id/automaticPrices': price('199.99') }));
  assert.equal(ambiguous.inAppPurchase.turkeySavedPrice.uniquePriceOnUtcDate, false);
  assert.equal(ambiguous.inAppPurchase.turkeySavedPrice.matchesTarget149_99TRY, null);
  const inaccessible = await audit(mock({ '/v1/inAppPurchasePriceSchedules/opaque_schedule_id/automaticPrices': 403 }));
  assert.equal(inaccessible.inAppPurchase.turkeySavedPrice.known, false);
});

test('a foreign app relationship is rejected before its resource details are read', async () => {
  const version = fixture()[`/v1/apps/${APP_ID}/appStoreVersions`];
  version.data[0].relationships.app = { data: { type: 'apps', id: 'other-app' } };
  const m = mock({ [`/v1/apps/${APP_ID}/appStoreVersions`]: version });
  await assert.rejects(audit(m), /different application relationship/);
  assert(!m.calls.some(x => x.url.pathname.includes('appStoreReviewDetail')));
});

test('initial unauthorized Team JWT can negotiate same individual key without relaxing subsequent GET boundaries', async () => {
  const result = await audit(mock({}, { individual: true }));
  assert.equal(result.authentication, 'individual'); assert.equal(result.inAppPurchase.found, true);
});

test('invalid credentials and malformed version stop before any request; failures never disclose server details', async () => {
  let count = 0; const fetchImpl = async () => { count++; return reply({ errors: [{ detail: PRIVATE }] }, 401); };
  await assert.rejects(getReadiness({ env: { ...env(), APP_STORE_CONNECT_PRIVATE_KEY: PRIVATE }, fetchImpl }));
  await assert.rejects(getReadiness({ version: '../2', env: env(), fetchImpl }));
  assert.equal(count, 0);
  await assert.rejects(getReadiness({ env: env(), fetchImpl, nowSeconds: NOW }), error => {
    const output = String(error) + JSON.stringify(error);
    assert(!output.includes(PRIVATE)); assert(!output.includes(key.privateKey)); assert(!output.includes('Bearer ')); return true;
  });
  assert.equal(count, 2);
});

test('a transport or redirect error in an optional relationship remains sanitized unknown', async () => {
  const result = await audit(mock({ '/v1/appStoreVersions/version-1/appStoreReviewDetail': new Error(`${PRIVATE} Bearer token`) }));
  assert.deepEqual(result.appVersion.review, { known: false, reason: 'REQUEST_FAILED' });
  assert(!JSON.stringify(result).includes(PRIVATE));
});
