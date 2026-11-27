#!/usr/bin/env node
/**
 * Read-only, single-app App Store preparation audit. Never edits Apple records.
 * Endpoints/fields checked against Apple's public App Store Connect OpenAPI 4.6.1:
 * https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip
 * https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions
 * https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appinfos-_id_-appinfolocalizations
 * https://developer.apple.com/documentation/appstoreconnectapi/get-v1-inapppurchasepriceschedules-_id_-manualprices
 * https://developer.apple.com/documentation/appstoreconnectapi/get-v2-appavailabilities-_id_-territoryavailabilities
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToken, BUNDLE_ID } from './ios-testflight-status.mjs';

export const APP_ID = '6835483226';
export const IAP_ID = '6835484249';
export const PRODUCT_ID = 'com.fevzicakmak.bhu.multipleaccounts';
const ORIGIN = 'https://api.appstoreconnect.apple.com';
const MAX_BYTES = 1024 * 1024;
const EU = new Set('AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE'.split(' '));
const APP_STATES = new Set('ACCEPTED DEVELOPER_REMOVED_FROM_SALE DEVELOPER_REJECTED IN_REVIEW INVALID_BINARY METADATA_REJECTED PENDING_APPLE_RELEASE PENDING_CONTRACT PENDING_DEVELOPER_RELEASE PENDING_RELEASE PREPARE_FOR_SUBMISSION PREORDER_READY_FOR_SALE PROCESSING_FOR_APP_STORE PROCESSING_FOR_DISTRIBUTION READY_FOR_REVIEW READY_FOR_SALE READY_FOR_DISTRIBUTION REJECTED REMOVED_FROM_SALE WAITING_FOR_EXPORT_COMPLIANCE WAITING_FOR_REVIEW REPLACED_WITH_NEW_VERSION REPLACED_WITH_NEW_INFO NOT_APPLICABLE'.split(' '));
const IAP_STATES = new Set('MISSING_METADATA WAITING_FOR_UPLOAD PROCESSING_CONTENT READY_TO_SUBMIT WAITING_FOR_REVIEW IN_REVIEW DEVELOPER_ACTION_NEEDED PENDING_BINARY_APPROVAL APPROVED DEVELOPER_REMOVED_FROM_SALE REMOVED_FROM_SALE REJECTED PREPARE_FOR_SUBMISSION'.split(' '));
const ASSET_STATES = new Set(['AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'COMPLETE', 'FAILED']);
export class ReadinessError extends Error {}
const check = (value, message) => { if (!value) throw new ReadinessError(message); };
const unknown = (reason, extra = {}) => ({ known: false, reason, ...extra });
const present = value => typeof value === 'string' && value.trim().length > 0;
const length = value => typeof value === 'string' ? [...value].length : 0;
const bool = value => typeof value === 'boolean' ? value : null;
const state = (value, values) => values.has(value) ? value : null;
const locale = value => typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(value) ? value : null;
function id(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}={0,2}$/.test(value), 'Invalid Apple resource identifier.');
  return encodeURIComponent(value);
}

/** Only documented read paths reached through the verified BHU relationships. */
export function assertReadPath(path) {
  check(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[?#]/.test(path), 'Read path is not permitted.');
  const segments = path.slice(1).split('/');
  if (path === '/v1/apps') return;
  check(segments.length === 4, 'Read path is not permitted.');
  const [version, resource, encodedId, relationship] = segments;
  let decoded;
  try { decoded = decodeURIComponent(encodedId); } catch (_) { throw new ReadinessError('Read path is not permitted.'); }
  check(id(decoded) === encodedId, 'Read path is not permitted.');
  const paths = {
    'v1/apps': ['appStoreVersions', 'appInfos', 'inAppPurchasesV2', 'appAvailabilityV2'],
    'v1/appStoreVersions': ['appStoreVersionLocalizations', 'appStoreReviewDetail'],
    'v1/appInfos': ['appInfoLocalizations'],
    'v1/appStoreVersionLocalizations': ['appScreenshotSets'],
    'v1/appScreenshotSets': ['appScreenshots'],
    'v1/inAppPurchasePriceSchedules': ['manualPrices', 'automaticPrices'],
    'v1/inAppPurchaseAvailabilities': ['availableTerritories'],
    'v2/inAppPurchases': ['inAppPurchaseLocalizations', 'appStoreReviewScreenshot', 'iapPriceSchedule', 'inAppPurchaseAvailability'],
    'v2/appAvailabilities': ['territoryAvailabilities'],
  };
  check(paths[`${version}/${resource}`]?.includes(relationship), 'Read path is not permitted.');
  if (resource === 'apps') check(decoded === APP_ID, 'A different application is not permitted.');
  if (resource === 'inAppPurchases') check(decoded === IAP_ID, 'A different product is not permitted.');
}

async function readJSON(response) {
  const reader = response.body?.getReader();
  check(reader, 'Apple returned an invalid response.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new ReadinessError('Apple response exceeded the size limit.'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ReadinessError) throw error;
    throw new ReadinessError('Apple returned an invalid response.');
  } finally { reader.releaseLock(); }
}

export function createReadClient({ env = process.env, fetchImpl = globalThis.fetch, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  createToken(env, nowSeconds); // Never contact Apple with malformed credentials.
  let authentication = 'team', calls = 0;
  const deadline = Date.now() + 240000;
  return {
    get authentication() { return authentication; },
    async get(path, parameters = {}, optional = true) {
      assertReadPath(path);
      if (calls >= 60 || Date.now() >= deadline) return unknown('REQUEST_BUDGET_REACHED');
      const url = new URL(path, ORIGIN); url.search = new URLSearchParams(parameters).toString();
      check(url.origin === ORIGIN, 'Read origin is not permitted.');
      const request = async () => {
        calls++;
        try {
          return await fetchImpl(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.min(20000, deadline - Date.now()))),
            headers: { Authorization: `Bearer ${createToken(env, nowSeconds, authentication)}`, Accept: 'application/json' } });
        } catch (_) {
          if (optional) return null;
          throw new ReadinessError('BHU app lookup request failed.');
        }
      };
      let response = await request();
      if (path === '/v1/apps' && response?.status === 401 && authentication === 'team') {
        try { await response.body?.cancel(); } catch (_) { /* No raw server output. */ }
        authentication = 'individual'; response = await request();
      }
      if (!response) return unknown('REQUEST_FAILED');
      if (!response.ok) {
        try { await response.body?.cancel(); } catch (_) { /* No raw server output. */ }
        const code = Number.isInteger(response.status) ? response.status : null;
        if (!optional || code === 401) throw new ReadinessError(`Apple authorization or app lookup failed (HTTP ${code ?? 'unknown'}).`);
        return unknown('HTTP_UNAVAILABLE', { httpStatus: code });
      }
      try { return { known: true, json: await readJSON(response) }; }
      catch (error) { if (!optional) throw error; return unknown('INVALID_RESPONSE'); }
    },
  };
}

function collection(result, type, max = 200) {
  if (!result.known) return result;
  const data = result.json?.data;
  if (!Array.isArray(data) || data.length > max || data.some(x => x?.type !== type)) return unknown('INVALID_COLLECTION');
  if (result.json.links?.next) return unknown('INCOMPLETE_COLLECTION'); // No blind pagination or misleading zero counts.
  try { for (const item of data) id(item.id); } catch (_) { return unknown('INVALID_RESOURCE_ID'); }
  return { known: true, data, included: Array.isArray(result.json.included) ? result.json.included : [] };
}
function single(result, type) {
  if (!result.known) return result;
  if (result.json?.data === null) return { known: true, present: false };
  const data = result.json?.data;
  if (data?.type !== type) return unknown('INVALID_RESOURCE');
  try { id(data.id); } catch (_) { return unknown('INVALID_RESOURCE_ID'); }
  return { known: true, present: true, data };
}
function boundApp(item) {
  const app = item.relationships?.app?.data;
  check(!app || (app.type === 'apps' && app.id === APP_ID), 'Apple returned a different application relationship.');
}
function httpsPresent(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch (_) { return false; }
}
function assetSummary(result, type) {
  const item = single(result, type); if (!item.known || !item.present) return item;
  const attributes = item.data.attributes ?? {};
  return { known: true, present: true, deliveryState: state(attributes.assetDeliveryState?.state, ASSET_STATES),
    nonemptyFile: Number.isSafeInteger(attributes.fileSize) ? attributes.fileSize > 0 : null };
}

async function screenshotSummary(client, localizationId) {
  const sets = collection(await client.get(`/v1/appStoreVersionLocalizations/${id(localizationId)}/appScreenshotSets`, { 'fields[appScreenshotSets]': 'screenshotDisplayType', limit: '50' }), 'appScreenshotSets', 30);
  if (!sets.known) return sets;
  const groups = [];
  for (const set of sets.data) {
    const shots = collection(await client.get(`/v1/appScreenshotSets/${id(set.id)}/appScreenshots`, { 'fields[appScreenshots]': 'assetDeliveryState,fileSize', limit: '50' }), 'appScreenshots', 50);
    const display = set.attributes?.screenshotDisplayType;
    groups.push({ displayType: typeof display === 'string' && /^(?:APP_IPHONE|APP_IPAD|APP_DESKTOP|APP_WATCH|APP_APPLE_TV|APP_VISION_PRO)[A-Z0-9_]*$/.test(display) ? display : null,
      ...(shots.known ? { known: true, count: shots.data.length,
        complete: shots.data.filter(x => x.attributes?.assetDeliveryState?.state === 'COMPLETE').length,
        failed: shots.data.filter(x => x.attributes?.assetDeliveryState?.state === 'FAILED').length } : shots) });
  }
  return { known: true, sets: groups, allSetsKnown: groups.every(x => x.known) };
}

async function versionSummary(client, version) {
  const versions = collection(await client.get(`/v1/apps/${APP_ID}/appStoreVersions`, {
    'filter[versionString]': version, 'filter[platform]': 'IOS', 'fields[appStoreVersions]': 'versionString,platform,appStoreState,appVersionState,releaseType,copyright,build,app',
    include: 'build', 'fields[builds]': 'version', limit: '200',
  }), 'appStoreVersions');
  if (!versions.known) return versions;
  for (const item of versions.data) boundApp(item);
  if (versions.data.length === 0) return { known: true, found: false };
  if (versions.data.length !== 1 || versions.data[0].attributes?.versionString !== version || versions.data[0].attributes?.platform !== 'IOS') return unknown('AMBIGUOUS_VERSION');
  const item = versions.data[0], a = item.attributes ?? {};
  const buildLink = item.relationships?.build?.data;
  const build = versions.included.find(x => x.type === 'builds' && x.id === buildLink?.id);
  const number = build?.attributes?.version;
  const result = { known: true, found: true, state: state(a.appVersionState ?? a.appStoreState, APP_STATES),
    releaseType: ['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED'].includes(a.releaseType) ? a.releaseType : null,
    copyrightPresent: present(a.copyright), buildAttached: Boolean(buildLink),
    attachedBuildNumber: typeof number === 'string' && /^[0-9]+(?:\.[0-9]+){0,2}$/.test(number) ? number : null };
  const review = single(await client.get(`/v1/appStoreVersions/${id(item.id)}/appStoreReviewDetail`, {
    'fields[appStoreReviewDetails]': 'contactFirstName,contactLastName,contactPhone,contactEmail,demoAccountRequired,demoAccountName,demoAccountPassword,notes',
  }), 'appStoreReviewDetails');
  if (!review.known || !review.present) result.review = review;
  else {
    const value = review.data.attributes ?? {};
    result.review = { known: true, present: true, contactNamePresent: present(value.contactFirstName) && present(value.contactLastName),
      contactPhonePresent: present(value.contactPhone), contactEmailPresent: present(value.contactEmail), notesPresent: present(value.notes),
      demoAccountRequired: bool(value.demoAccountRequired), demoAccountNamePresent: present(value.demoAccountName), demoAccountPasswordPresent: present(value.demoAccountPassword) };
  }
  const localizations = collection(await client.get(`/v1/appStoreVersions/${id(item.id)}/appStoreVersionLocalizations`, {
    'fields[appStoreVersionLocalizations]': 'locale,description,keywords,promotionalText,supportUrl', limit: '50',
  }), 'appStoreVersionLocalizations', 20);
  if (!localizations.known) result.localizations = localizations;
  else {
    const entries = [];
    for (const localization of localizations.data) {
      const v = localization.attributes ?? {};
      entries.push({ locale: locale(v.locale), descriptionLength: length(v.description), keywordsLength: length(v.keywords), promotionalTextLength: length(v.promotionalText),
        supportHttpsUrlPresent: httpsPresent(v.supportUrl), supportUrlMatchesExpected: v.supportUrl === 'https://fevzicakmak.github.io/BHU/support.html',
        screenshots: await screenshotSummary(client, localization.id) });
    }
    result.localizations = { known: true, entries };
  }
  return result;
}

async function infoSummary(client) {
  const infos = collection(await client.get(`/v1/apps/${APP_ID}/appInfos`, {
    include: 'primaryCategory', 'fields[appInfos]': 'appStoreState,state,app,primaryCategory', 'fields[appCategories]': 'platforms', limit: '200',
  }), 'appInfos', 20);
  if (!infos.known) return infos;
  const entries = [];
  for (const info of infos.data) {
    boundApp(info);
    // Apple may return only relationship links for a sparse fieldset. Missing
    // linkage is unknown, not proof that the app has no category configured.
    const category = info.relationships?.primaryCategory;
    let primaryCategoryPresent = null;
    if (category && Object.hasOwn(category, 'data')) {
      if (category.data === null) primaryCategoryPresent = false;
      else if (category.data?.type === 'appCategories') {
        try { id(category.data.id); primaryCategoryPresent = true; } catch (_) { /* Malformed linkage remains unknown. */ }
      }
    }
    const values = collection(await client.get(`/v1/appInfos/${id(info.id)}/appInfoLocalizations`, { 'fields[appInfoLocalizations]': 'locale,name,subtitle,privacyPolicyUrl', limit: '50' }), 'appInfoLocalizations', 20);
    entries.push({ state: state(info.attributes?.state ?? info.attributes?.appStoreState, APP_STATES), primaryCategoryPresent,
      localizations: values.known ? { known: true, entries: values.data.map(x => {
        const a = x.attributes ?? {};
        return { locale: locale(a.locale), nameLength: length(a.name), nameMatchesBHU: a.name === 'BHU', subtitleLength: length(a.subtitle),
          privacyHttpsUrlPresent: httpsPresent(a.privacyPolicyUrl), privacyUrlMatchesExpected: a.privacyPolicyUrl === 'https://fevzicakmak.github.io/BHU/privacy.html' };
      }) } : values });
  }
  return { known: true, entries };
}

function territorySummary(ids) {
  return { known: true, count: ids.length, turkeyAvailable: ids.includes('TUR'), euTerritoriesAvailable: [...new Set(ids.filter(x => EU.has(x)))].sort(),
    euExcluded: !ids.some(x => EU.has(x)) };
}
async function availabilitySummary(client, product = false) {
  const resource = single(await client.get(product ? `/v2/inAppPurchases/${IAP_ID}/inAppPurchaseAvailability` : `/v1/apps/${APP_ID}/appAvailabilityV2`,
    product ? { 'fields[inAppPurchaseAvailabilities]': 'availableInNewTerritories' } : { 'fields[appAvailabilities]': 'availableInNewTerritories' }), product ? 'inAppPurchaseAvailabilities' : 'appAvailabilities');
  if (!resource.known || !resource.present) return resource;
  const values = collection(await client.get(product ? `/v1/inAppPurchaseAvailabilities/${id(resource.data.id)}/availableTerritories` : `/v2/appAvailabilities/${id(resource.data.id)}/territoryAvailabilities`,
    product ? { 'fields[territories]': 'currency', limit: '200' } : {
      include: 'territory', 'fields[territoryAvailabilities]': 'available,territory', 'fields[territories]': 'currency', limit: '200',
    }), product ? 'territories' : 'territoryAvailabilities');
  if (!values.known) return values;
  const ids = [];
  let missingTerritoryCount = 0, missingAvailabilityFlagCount = 0;
  for (const item of values.data) {
    const relationship = item.relationships?.territory?.data;
    const territory = product ? item.id : relationship?.id;
    if (typeof territory !== 'string' || !/^[A-Z]{3}$/.test(territory) || (!product && relationship?.type !== 'territories')) missingTerritoryCount++;
    if (!product && typeof item.attributes?.available !== 'boolean') missingAvailabilityFlagCount++;
    if (product || item.attributes?.available === true) ids.push(territory);
  }
  // Sparse relationship fieldsets do not by themselves guarantee linkage. Ask for
  // the documented include above, and never infer territory IDs from opaque IDs,
  // included-array order, omitted booleans or resource counts.
  if (missingTerritoryCount || missingAvailabilityFlagCount) return unknown('INCOMPLETE_TERRITORY_DATA', {
    observedRecordCount: values.data.length, missingTerritoryCount, missingAvailabilityFlagCount,
  });
  return { ...territorySummary(ids), availableInNewTerritories: bool(resource.data.attributes?.availableInNewTerritories) };
}

async function priceSummary(client, date) {
  const schedule = single(await client.get(`/v2/inAppPurchases/${IAP_ID}/iapPriceSchedule`, { 'fields[inAppPurchasePriceSchedules]': 'baseTerritory' }), 'inAppPurchasePriceSchedules');
  if (!schedule.known || !schedule.present) return schedule;
  const entries = [];
  for (const source of ['manualPrices', 'automaticPrices']) {
    const prices = collection(await client.get(`/v1/inAppPurchasePriceSchedules/${id(schedule.data.id)}/${source}`, {
      'filter[territory]': 'TUR', include: 'inAppPurchasePricePoint,territory', 'fields[inAppPurchasePrices]': 'startDate,endDate,manual,inAppPurchasePricePoint,territory',
      'fields[inAppPurchasePricePoints]': 'customerPrice', 'fields[territories]': 'currency', limit: '200',
    }), 'inAppPurchasePrices');
    if (!prices.known) return { ...prices, territory: 'TUR', scheduleDateUTC: date };
    for (const item of prices.data) {
      const a = item.attributes ?? {}, territoryId = item.relationships?.territory?.data?.id;
      const pointId = item.relationships?.inAppPurchasePricePoint?.data?.id;
      const point = prices.included.find(x => x.type === 'inAppPurchasePricePoints' && x.id === pointId);
      const territory = prices.included.find(x => x.type === 'territories' && x.id === territoryId);
      const customerPrice = point?.attributes?.customerPrice, currency = territory?.attributes?.currency;
      const start = a.startDate ?? null, end = a.endDate ?? null;
      if (territoryId !== 'TUR' || typeof customerPrice !== 'string' || !/^\d{1,7}(?:\.\d{1,4})?$/.test(customerPrice) || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
        || [start, end].some(x => x !== null && (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)))) return unknown('INCOMPLETE_PRICE_DATA');
      if ((start === null || start <= date) && (end === null || end > date)) entries.push({ source, customerPrice, currency, startDate: start, endDate: end });
    }
  }
  const unique = [...new Set(entries.map(x => `${x.currency}:${Number(x.customerPrice)}`))];
  return { known: true, territory: 'TUR', scheduleDateUTC: date, activeSavedPriceCandidates: entries, uniquePriceOnUtcDate: unique.length === 1,
    matchesTarget149_99TRY: unique.length === 1 ? unique[0] === 'TRY:149.99' : null };
}

async function productSummary(client, date) {
  const products = collection(await client.get(`/v1/apps/${APP_ID}/inAppPurchasesV2`, { 'filter[productId]': PRODUCT_ID,
    'fields[inAppPurchases]': 'productId,inAppPurchaseType,state,familySharable', limit: '200' }), 'inAppPurchases');
  if (!products.known) return products;
  if (products.data.length === 0) return { known: true, found: false };
  if (products.data.length !== 1 || products.data[0].id !== IAP_ID || products.data[0].attributes?.productId !== PRODUCT_ID) throw new ReadinessError('Product lookup did not identify the expected BHU product.');
  const a = products.data[0].attributes ?? {};
  const output = { known: true, found: true, productId: PRODUCT_ID, state: state(a.state, IAP_STATES),
    type: ['CONSUMABLE', 'NON_CONSUMABLE', 'NON_RENEWING_SUBSCRIPTION'].includes(a.inAppPurchaseType) ? a.inAppPurchaseType : null, familySharable: bool(a.familySharable) };
  const values = collection(await client.get(`/v2/inAppPurchases/${IAP_ID}/inAppPurchaseLocalizations`, {
    'fields[inAppPurchaseLocalizations]': 'locale,name,description,state', limit: '200',
  }), 'inAppPurchaseLocalizations', 30);
  output.localizations = values.known ? { known: true, entries: values.data.map(x => ({ locale: locale(x.attributes?.locale), nameLength: length(x.attributes?.name),
    descriptionLength: length(x.attributes?.description), state: state(x.attributes?.state, IAP_STATES) })) } : values;
  output.reviewScreenshot = assetSummary(await client.get(`/v2/inAppPurchases/${IAP_ID}/appStoreReviewScreenshot`, { 'fields[inAppPurchaseAppStoreReviewScreenshots]': 'assetDeliveryState,fileSize' }), 'inAppPurchaseAppStoreReviewScreenshots');
  output.availability = await availabilitySummary(client, true);
  output.turkeySavedPrice = await priceSummary(client, date);
  return output;
}

export async function getReadiness({ version = '1.0', env = process.env, fetchImpl = globalThis.fetch, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  check(typeof version === 'string' && /^[1-9][0-9]{0,3}(?:\.[0-9]{1,2}){0,2}$/.test(version), 'Invalid marketing version.');
  const client = createReadClient({ env, fetchImpl, nowSeconds });
  const apps = collection(await client.get('/v1/apps', { 'filter[bundleId]': BUNDLE_ID, 'fields[apps]': 'bundleId,primaryLocale', limit: '2' }, false), 'apps', 2);
  check(apps.known && apps.data.length === 1 && apps.data[0].id === APP_ID && apps.data[0].attributes?.bundleId === BUNDLE_ID, 'App lookup did not identify the expected BHU application.');
  const date = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
  const output = { schemaVersion: 1, appId: APP_ID, bundleId: BUNDLE_ID, primaryLocale: locale(apps.data[0].attributes?.primaryLocale), version, checkedAt: new Date(nowSeconds * 1000).toISOString(), authentication: client.authentication,
    readOnly: true, privacy: 'Contact values, review notes, demo credentials, asset URLs and raw server messages are omitted.',
    doesNotVerify: ['App Privacy or legal declarations', 'age-rating answers', 'DSA or agreements acceptance', 'real-device purchase/restore', 'App Review approval or public release'] };
  output.appInfo = await infoSummary(client);
  output.appVersion = await versionSummary(client, version);
  output.appAvailability = await availabilitySummary(client);
  output.inAppPurchase = await productSummary(client, date);
  return output;
}

async function main(argv) {
  check(argv.length === 4 && argv[0] === '--version' && argv[2] === '--output' && argv[3] && !argv[3].startsWith('-'), 'Usage: --version VERSION --output REPORT.json');
  const report = await getReadiness({ version: argv[1] });
  try {
    const output = resolve(argv[3]); mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  } catch (_) { throw new ReadinessError('Could not write sanitized readiness report.'); }
  console.log('BHU read-only store audit completed; unavailable fields remain unknown.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof ReadinessError ? error.message : 'Read-only store audit failed.'); process.exitCode = 1;
});
