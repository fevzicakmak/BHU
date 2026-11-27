#!/usr/bin/env node
/** Fixed-BHU draft preparation. Never submits a review, releases an app, changes price, or expires a build. */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = resolve(ROOT, '.ios-signing');
const ORIGIN = 'https://api.appstoreconnect.apple.com';
export const APP_ID = '6835483226', IAP_ID = '6835484249', BUNDLE = 'com.fevzicakmak.bhu';
export const PRODUCT = 'com.fevzicakmak.bhu.multipleaccounts';
const VERSION = '1.0', BUILD = '5.1';
export class DraftError extends Error {
  constructor(message, details = {}) { super(message); Object.assign(this, details); }
}
const check = (ok, message) => { if (!ok) throw new DraftError(message); };
const count = text => [...text].length;
const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
const digest = value => createHash('sha256').update(stable(value)).digest('hex');
function rid(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}={0,2}$/.test(value), 'Invalid resource identifier.');
  return encodeURIComponent(value);
}
function attributes(resource, keys) { return Object.fromEntries(keys.map(key => [key, resource?.attributes?.[key] ?? null])); }
const relationship = (resource, key) => resource?.relationships?.[key]?.data ?? null;
function owned(resource) {
  const app = relationship(resource, 'app');
  check(!app || (app.type === 'apps' && app.id === APP_ID), 'Foreign application relationship.');
}

export function assertRequest(method, path) {
  check(typeof path === 'string' && !/[?#]/.test(path) && path.startsWith('/') && !path.startsWith('//'), 'Request route is forbidden.');
  if (method === 'GET' && ['/v1/apps', '/v1/builds'].includes(path)) return;
  if (method === 'POST' && ['/v1/appStoreReviewDetails', '/v1/inAppPurchaseAvailabilities'].includes(path)) return;
  const parts = path.slice(1).split('/');
  check([3, 4, 5].includes(parts.length), 'Request route is forbidden.');
  let value; try { value = decodeURIComponent(parts[2]); } catch (_) { throw new DraftError('Request route is forbidden.'); }
  check(rid(value) === parts[2], 'Request route is forbidden.');
  const resource = `${parts[0]}/${parts[1]}`, tail = parts.slice(3).join('/');
  if (method === 'GET') {
    const allowed = {
      'v1/apps': ['appInfos', 'appStoreVersions', 'inAppPurchasesV2'],
      'v1/appInfos': ['appInfoLocalizations'],
      'v1/appStoreVersions': ['appStoreVersionLocalizations', 'appStoreReviewDetail'],
      'v2/inAppPurchases': ['inAppPurchaseAvailability', 'iapPriceSchedule'],
      'v1/inAppPurchaseAvailabilities': ['availableTerritories'],
      'v1/inAppPurchasePriceSchedules': ['manualPrices', 'automaticPrices'],
    };
    check(allowed[resource]?.includes(tail), 'Request route is forbidden.');
    if (resource === 'v1/apps') check(value === APP_ID, 'Another application is forbidden.');
    if (resource === 'v2/inAppPurchases') check(value === IAP_ID, 'Another product is forbidden.');
    return;
  }
  check(method === 'PATCH' && ((parts.length === 3 && ['v1/appInfoLocalizations', 'v1/appInfos', 'v1/appStoreVersionLocalizations', 'v1/appStoreVersions', 'v1/appStoreReviewDetails'].includes(resource)) || (resource === 'v1/appStoreVersions' && tail === 'relationships/build')), 'Request route is forbidden.');
}

export function validateSession(session, now = Math.floor(Date.now() / 1000)) {
  check(session?.appId === APP_ID && typeof session.token === 'string' && session.token.length < 6000, 'Invalid protected Apple session.');
  try {
    const [head, body, signature, extra] = session.token.split('.');
    const h = JSON.parse(Buffer.from(head, 'base64url')), p = JSON.parse(Buffer.from(body, 'base64url'));
    check(!extra && signature && h.alg === 'ES256' && p.aud === 'appstoreconnect-v1' && Number.isSafeInteger(p.exp) && p.exp === session.expiresAt && Number.isSafeInteger(p.iat) && p.iat <= now + 30 && p.exp - p.iat <= 300 && p.exp > now + 5 && p.exp <= now + 330, 'Invalid or expired protected Apple session.');
  } catch (_) { throw new DraftError('Invalid or expired protected Apple session.'); }
}

export function createClient(session, { fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  validateSession(session, now());
  let requests = 0;
  return async function request(method, path, parameters = {}, body) {
    assertRequest(method, path); validateSession(session, now());
    check(++requests <= 80, 'Apple request budget exceeded.');
    const url = new URL(path, ORIGIN); url.search = new URLSearchParams(parameters).toString();
    let response;
    try {
      response = await fetchImpl(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (_) { throw new DraftError('Apple request did not return a definitive result.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch (_) { /* Never print raw Apple diagnostics. */ }
      throw new DraftError('Apple request was rejected.', { outcome: 'rejected', httpStatus: response.status });
    }
    if (response.status === 204) return null;
    const reader = response.body?.getReader(); check(reader, 'Invalid Apple response.');
    const chunks = []; let bytes = 0;
    try {
      while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error(); } chunks.push(Buffer.from(item.value)); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (_) { throw new DraftError('Apple response could not be verified.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    finally { reader.releaseLock(); }
  };
}

function collection(json, type) {
  check(Array.isArray(json?.data) && !json.links?.next && json.data.length <= 200 && json.data.every(x => x.type === type), 'Incomplete Apple collection.');
  for (const item of json.data) rid(item.id);
  return json.data;
}
function single(json, type, nullable = false) {
  if (nullable && json?.data === null) return null;
  check(json?.data?.type === type, 'Unexpected Apple resource.'); rid(json.data.id); return json.data;
}
function unique(values, predicate, description) {
  const matches = values.filter(predicate); check(matches.length === 1, description); return matches[0];
}
function desiredInputs(metadata, notes, contact) {
  check(metadata?.name === 'BHU' && metadata.publisher === 'Fevzi Çakmak' && metadata.supportURL === 'https://fevzicakmak.github.io/BHU/support.html' && metadata.privacyPolicyURL === 'https://fevzicakmak.github.io/BHU/privacy.html', 'Canonical metadata identity mismatch.');
  for (const [key, max] of Object.entries({ name: 30, subtitle: 30, description: 4000, keywords: 100, promotionalText: 170 })) check(typeof metadata[key] === 'string' && count(metadata[key]) > 0 && count(metadata[key]) <= max, 'Canonical metadata is incomplete or too long.');
  check(typeof notes === 'string' && count(notes) < 4000 && notes.includes(PRODUCT), 'Review notes are incomplete.');
  check(contact && Object.keys(contact).sort().join(',') === 'email,firstName,lastName,phone' && [contact.firstName, contact.lastName, contact.email, contact.phone].every(x => typeof x === 'string' && x.trim() === x && x.length > 0), 'Private review contact is incomplete.');
  check(`${contact.firstName} ${contact.lastName}`.normalize('NFC') === metadata.publisher.normalize('NFC') && contact.email === metadata.supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) && /^\+[1-9][0-9]{7,14}$/.test(contact.phone), 'Private review contact is invalid.');
  return { info: { name: metadata.name, subtitle: metadata.subtitle, privacyPolicyUrl: metadata.privacyPolicyURL }, localization: { description: metadata.description, keywords: metadata.keywords, promotionalText: metadata.promotionalText, supportUrl: metadata.supportURL }, review: { contactFirstName: contact.firstName, contactLastName: contact.lastName, contactPhone: contact.phone, contactEmail: contact.email, demoAccountRequired: false, notes: notes.trim() } };
}

async function savedPrice(request, date) {
  const schedule = single(await request('GET', `/v2/inAppPurchases/${IAP_ID}/iapPriceSchedule`, { 'fields[inAppPurchasePriceSchedules]': 'baseTerritory' }), 'inAppPurchasePriceSchedules');
  const current = [];
  for (const kind of ['manualPrices', 'automaticPrices']) {
    const json = await request('GET', `/v1/inAppPurchasePriceSchedules/${rid(schedule.id)}/${kind}`, { 'filter[territory]': 'TUR', include: 'territory,inAppPurchasePricePoint', 'fields[inAppPurchasePrices]': 'startDate,endDate,inAppPurchasePricePoint,territory', 'fields[inAppPurchasePricePoints]': 'customerPrice', 'fields[territories]': 'currency', limit: '200' });
    for (const item of collection(json, 'inAppPurchasePrices')) {
      const a = item.attributes ?? {}, territory = relationship(item, 'territory'), point = relationship(item, 'inAppPurchasePricePoint');
      const p = json.included?.find(x => x.type === 'inAppPurchasePricePoints' && x.id === point?.id);
      const t = json.included?.find(x => x.type === 'territories' && x.id === territory?.id);
      check(territory?.id === 'TUR' && t?.attributes?.currency === 'TRY' && typeof p?.attributes?.customerPrice === 'string' && /^\d+(?:\.\d+)?$/.test(p.attributes.customerPrice) && [a.startDate, a.endDate].every(x => x == null || (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))), 'Saved Turkey price could not be verified.');
      if ((!a.startDate || a.startDate <= date) && (!a.endDate || a.endDate > date)) current.push(Number(p.attributes.customerPrice));
    }
  }
  check(current.length > 0 && current.every(x => x === 149.99), 'Saved Turkey price is not uniquely 149.99 TRY.');
  return { dateUTC: date, customerPrice: '149.99', currency: 'TRY' };
}

/** Returned plan is PRIVATE: it contains the intended contact data. Never log it. */
export async function compilePlan({ request, metadata, notes, contact, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const desired = desiredInputs(metadata, notes, contact), baseline = {}, operations = [];
  const apps = collection(await request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE, 'fields[apps]': 'bundleId,primaryLocale', limit: '2' }), 'apps');
  check(apps.length === 1 && apps[0].id === APP_ID && apps[0].attributes?.bundleId === BUNDLE && apps[0].attributes?.primaryLocale === 'tr', 'Expected Turkish BHU application was not found.');
  const infos = collection(await request('GET', `/v1/apps/${APP_ID}/appInfos`, { 'fields[appInfos]': 'state,appStoreState,primaryCategory,app', include: 'primaryCategory,app', limit: '200' }), 'appInfos');
  infos.forEach(owned);
  const info = unique(infos, x => (x.attributes?.state ?? x.attributes?.appStoreState) === 'PREPARE_FOR_SUBMISSION', 'No unique editable app information.');
  check(Object.hasOwn(info.relationships?.primaryCategory ?? {}, 'data'), 'Primary category relationship is incomplete; no category change authorized.');
  const versions = collection(await request('GET', `/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': VERSION, 'filter[platform]': 'IOS', 'fields[appStoreVersions]': 'versionString,platform,appVersionState,appStoreState,copyright,releaseType,build,app', include: 'build,app', 'fields[builds]': 'version', 'fields[apps]': 'bundleId', limit: '200' }), 'appStoreVersions');
  versions.forEach(owned);
  const version = unique(versions, x => x.attributes?.versionString === VERSION && x.attributes?.platform === 'IOS', 'No unique BHU iOS version 1.0.');
  check((version.attributes?.appVersionState ?? version.attributes?.appStoreState) === 'PREPARE_FOR_SUBMISSION', 'App Store version is not an editable draft.');
  check(Object.hasOwn(version.relationships?.build ?? {}, 'data'), 'Selected build relationship is incomplete; no build change authorized.');
  const builds = await request('GET', '/v1/builds', { 'filter[app]': APP_ID, 'filter[version]': BUILD, include: 'preReleaseVersion,app', 'fields[builds]': 'version,processingState,expired,preReleaseVersion,app', 'fields[preReleaseVersions]': 'version,platform', limit: '200' });
  const build = unique(collection(builds, 'builds'), x => {
    owned(x); const p = relationship(x, 'preReleaseVersion'); const marketing = builds.included?.find(v => v.type === 'preReleaseVersions' && v.id === p?.id);
    return x.attributes?.version === BUILD && marketing?.attributes?.version === VERSION && marketing?.attributes?.platform === 'IOS';
  }, 'No unique BHU build 5.1 for iOS version 1.0.');
  check(build.attributes?.processingState === 'VALID' && build.attributes?.expired === false, 'Build 5.1 is not valid for testing and draft selection.');
  const selected = relationship(version, 'build');
  check(!selected || (selected.type === 'builds' && selected.id === build.id), 'A different build was selected; review before replacing it.');
  const product = unique(collection(await request('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`, { 'filter[productId]': PRODUCT, 'fields[inAppPurchases]': 'productId,inAppPurchaseType,familySharable,state', limit: '200' }), 'inAppPurchases'), x => x.id === IAP_ID && x.attributes?.productId === PRODUCT, 'Expected BHU purchase product was not found.');
  check(product.attributes?.inAppPurchaseType === 'NON_CONSUMABLE', 'BHU product is not Non-Consumable.');
  baseline.app = attributes(apps[0], ['bundleId', 'primaryLocale']);
  baseline.info = { id: info.id, state: info.attributes?.state ?? info.attributes?.appStoreState, primaryCategory: relationship(info, 'primaryCategory') };
  baseline.version = { id: version.id, ...attributes(version, ['versionString', 'platform', 'appVersionState', 'appStoreState', 'copyright', 'releaseType']), build: selected };
  baseline.build = { id: build.id, ...attributes(build, ['version', 'processingState', 'expired']) };
  baseline.product = { id: product.id, ...attributes(product, ['productId', 'inAppPurchaseType', 'familySharable', 'state']) };
  function patch(label, type, resource, changes) {
    const changed = Object.fromEntries(Object.entries(changes).filter(([key, value]) => stable(resource.attributes?.[key] ?? null) !== stable(value)));
    if (Object.keys(changed).length) operations.push({ label, method: 'PATCH', path: `/v1/${type}/${rid(resource.id)}`, body: { data: { type, id: resource.id, attributes: changed } } });
  }
  const il = unique(collection(await request('GET', `/v1/appInfos/${rid(info.id)}/appInfoLocalizations`, { 'fields[appInfoLocalizations]': 'locale,name,subtitle,privacyPolicyUrl', limit: '200' }), 'appInfoLocalizations'), x => x.attributes?.locale === 'tr', 'Existing Turkish app localization is required.');
  baseline.infoLocalization = { id: il.id, ...attributes(il, ['locale', ...Object.keys(desired.info)]) }; patch('turkishAppInformation', 'appInfoLocalizations', il, desired.info);
  if (!relationship(info, 'primaryCategory')) operations.push({ label: 'missingPrimaryCategory', method: 'PATCH', path: `/v1/appInfos/${rid(info.id)}`, body: { data: { type: 'appInfos', id: info.id, relationships: { primaryCategory: { data: { type: 'appCategories', id: 'FINANCE' } } } } } });
  const vl = unique(collection(await request('GET', `/v1/appStoreVersions/${rid(version.id)}/appStoreVersionLocalizations`, { 'fields[appStoreVersionLocalizations]': 'locale,description,keywords,promotionalText,supportUrl', limit: '200' }), 'appStoreVersionLocalizations'), x => x.attributes?.locale === 'tr', 'Existing Turkish version localization is required.');
  baseline.versionLocalization = { id: vl.id, ...attributes(vl, ['locale', ...Object.keys(desired.localization)]) }; patch('turkishVersionText', 'appStoreVersionLocalizations', vl, desired.localization);
  patch('copyright', 'appStoreVersions', version, { copyright: '2026 Fevzi Çakmak' });
  if (!selected) operations.push({ label: 'attachVerifiedBuild5_1', method: 'PATCH', path: `/v1/appStoreVersions/${rid(version.id)}/relationships/build`, body: { data: { type: 'builds', id: build.id } } });
  const review = single(await request('GET', `/v1/appStoreVersions/${rid(version.id)}/appStoreReviewDetail`, { 'fields[appStoreReviewDetails]': Object.keys(desired.review).join(',') }), 'appStoreReviewDetails', true);
  baseline.review = review ? { id: review.id, ...attributes(review, Object.keys(desired.review)) } : null;
  if (review) patch('reviewContactAndNotes', 'appStoreReviewDetails', review, desired.review);
  else operations.push({ label: 'reviewContactAndNotes', method: 'POST', path: '/v1/appStoreReviewDetails', body: { data: { type: 'appStoreReviewDetails', attributes: desired.review, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } } });
  const availability = single(await request('GET', `/v2/inAppPurchases/${IAP_ID}/inAppPurchaseAvailability`, { 'fields[inAppPurchaseAvailabilities]': 'availableInNewTerritories' }), 'inAppPurchaseAvailabilities');
  const countries = collection(await request('GET', `/v1/inAppPurchaseAvailabilities/${rid(availability.id)}/availableTerritories`, { 'fields[territories]': 'currency', limit: '200' }), 'territories').map(x => x.id).sort();
  check(countries.every(x => /^[A-Z]{3}$/.test(x)) && new Set(countries).size === countries.length && typeof availability.attributes?.availableInNewTerritories === 'boolean', 'Existing product availability is incomplete.');
  baseline.availability = { id: availability.id, countries, availableInNewTerritories: availability.attributes.availableInNewTerritories };
  if (!countries.includes('TUR')) {
    baseline.turkeyPrice = await savedPrice(request, new Date(nowSeconds * 1000).toISOString().slice(0, 10));
    operations.push({ label: 'addTurkeyWithoutOtherTerritoryChanges', method: 'POST', path: '/v1/inAppPurchaseAvailabilities', body: { data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: availability.attributes.availableInNewTerritories }, relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: IAP_ID } }, availableTerritories: { data: [...countries, 'TUR'].sort().map(id => ({ type: 'territories', id })) } } } } });
  }
  for (const operation of operations) assertRequest(operation.method, operation.path);
  const core = { schemaVersion: 1, appId: APP_ID, version: VERSION, build: BUILD, baseline, operations };
  return { ...core, createdAt: nowSeconds, expiresAt: nowSeconds + 1800, fingerprint: digest(core) };
}

export function summarize(plan) {
  return { appId: APP_ID, version: VERSION, build: BUILD, operationCount: plan.operations.length, operations: plan.operations.map(x => ({ name: x.label, method: x.method, fields: Object.keys(x.body.data?.attributes ?? x.body.data?.relationships ?? {}) })), doesNotSubmitOrPublish: true, priceUnchanged: true, unrelatedTerritoriesPreserved: true, privateContactOmitted: true };
}

export async function applyPlan({ plan, request, metadata, notes, contact, nowSeconds = Math.floor(Date.now() / 1000), record = () => {} }) {
  check(plan?.appId === APP_ID && plan.schemaVersion === 1 && Number.isSafeInteger(plan.createdAt) && plan.createdAt <= nowSeconds + 30 && plan.expiresAt === plan.createdAt + 1800 && plan.expiresAt > nowSeconds, 'Private plan is invalid or expired.');
  const fresh = await compilePlan({ request, metadata, notes, contact, nowSeconds });
  const content = p => ({ schemaVersion: p.schemaVersion, appId: p.appId, version: p.version, build: p.build, baseline: p.baseline, operations: p.operations });
  check(plan.fingerprint === digest(content(plan)) && stable(content(plan)) === stable(content(fresh)), 'Plan is stale or changed; prepare and review a fresh plan.');
  const receipt = { schemaVersion: 1, appId: APP_ID, version: VERSION, build: BUILD, reviewSubmitted: false, publicReleaseTriggered: false, priceChanged: false, operations: [], status: 'applying' };
  record(receipt);
  for (const operation of fresh.operations) {
    try {
      const result = await request(operation.method, operation.path, {}, operation.body);
      if (operation.label === 'attachVerifiedBuild5_1') {
        check(result === null || (result?.data?.type === 'builds' && result.data.id === operation.body.data.id), 'Build linkage response could not be verified.');
      } else {
        check(result?.data?.type === operation.body.data.type && !result.errors, 'Write response was not the expected resource.');
        rid(result.data.id);
        check(!operation.body.data.id || result.data.id === operation.body.data.id, 'Write response identified a different resource.');
        owned(result.data);
        const relatedVersion = relationship(result.data, 'appStoreVersion');
        check(!relatedVersion || relatedVersion.id === fresh.baseline.version.id, 'Write response identified a different App Store version.');
      }
      receipt.operations.push({ name: operation.label, outcome: 'accepted' }); record(receipt);
    } catch (error) {
      receipt.operations.push({ name: operation.label, outcome: error.outcome === 'rejected' ? 'rejected' : 'unknown', ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}) });
      receipt.status = 'stopped'; record(receipt);
      throw new DraftError('Draft preparation stopped; inspect the sanitized receipt and reread Apple state before any retry.', { receipt });
    }
  }
  receipt.status = 'completed'; record(receipt); return receipt;
}

export function privatePath(path, base = PRIVATE) {
  const target = resolve(path), root = resolve(base);
  check(target.startsWith(root + sep), 'Private files must remain under .ios-signing.');
  let current = target;
  while (current.startsWith(root)) { if (existsSync(current)) check(!lstatSync(current).isSymbolicLink(), 'Symbolic links are forbidden for private files.'); if (current === root) break; current = dirname(current); }
  if (existsSync(root)) check(realpathSync(root) === root && (lstatSync(root).mode & 0o077) === 0, 'Private directory permissions are unsafe.');
  return target;
}
function readPrivate(path) { const p = privatePath(path); check((lstatSync(p).mode & 0o077) === 0, 'Private input permissions must be 0600.'); return JSON.parse(readFileSync(p, 'utf8')); }
function writePrivate(path, value) { const p = privatePath(path); mkdirSync(dirname(p), { recursive: true, mode: 0o700 }); const fd = openSync(p, 'wx', 0o600); try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); } finally { closeSync(fd); } }
function receiptWriter(path) {
  const p = resolve(path), base = resolve(ROOT, 'test-artifacts');
  check(p.startsWith(base + sep) && p.endsWith('.json'), 'Sanitized receipts must remain under test-artifacts.');
  let cursor = p;
  while (cursor.startsWith(base)) { if (existsSync(cursor)) check(!lstatSync(cursor).isSymbolicLink(), 'Symbolic receipt paths are forbidden.'); if (cursor === base) break; cursor = dirname(cursor); }
  check(!existsSync(p), 'Receipt already exists; use a fresh path and reread Apple state.');
  let reserved = false;
  return value => {
    mkdirSync(dirname(p), { recursive: true });
    if (!reserved) { const fd = openSync(p, 'wx', 0o600); closeSync(fd); reserved = true; }
    writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  };
}
async function main(args) {
  check(['--plan', '--apply'].includes(args[0]), 'Use --plan or --apply.');
  const mode = args.shift(), options = {};
  check(args.length % 2 === 0, 'Invalid command arguments.');
  for (let i = 0; i < args.length; i += 2) { check(['--session', '--contact', '--plan', '--output'].includes(args[i]) && !options[args[i]] && args[i + 1] && !args[i + 1].startsWith('-'), 'Invalid command arguments.'); options[args[i]] = args[i + 1]; }
  check(options['--session'] && options['--contact'] && options['--output'] && (mode !== '--apply' || options['--plan']), 'Missing command arguments.');
  check(Object.keys(options).length === (mode === '--plan' ? 3 : 4), 'Unexpected command arguments.');
  const session = readPrivate(options['--session']), contact = readPrivate(options['--contact']);
  const metadata = JSON.parse(readFileSync(resolve(ROOT, 'docs/ios/metadata.tr.json'), 'utf8')), notes = readFileSync(resolve(ROOT, 'docs/ios/app-review-notes.en.txt'), 'utf8');
  const request = createClient(session);
  if (mode === '--plan') { const plan = await compilePlan({ request, metadata, notes, contact }); writePrivate(options['--output'], plan); console.log(JSON.stringify(summarize(plan))); }
  else { const receipt = await applyPlan({ plan: readPrivate(options['--plan']), request, metadata, notes, contact, record: receiptWriter(options['--output']) }); console.log(JSON.stringify(receipt)); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error instanceof DraftError ? error.message : 'Store draft preparation failed.'); process.exitCode = 1; });
