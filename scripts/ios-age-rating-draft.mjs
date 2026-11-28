#!/usr/bin/env node
/** BHU age-questionnaire draft only: never submits review, sets a rating, or releases an app. */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DraftError, privatePath, validateSession } from './ios-store-draft.mjs';

export { DraftError as AgeDraftError };
export const APP_ID = '6835483226', BUNDLE = 'com.fevzicakmak.bhu', VERSION = '1.0';
export const SCHEMA = Object.freeze({ version: '4.6.1', checkedOn: '2026-11-27',
  url: 'https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip',
  archiveSha256: '528ebf253c4fea45d619f8576bca14a418a1a878080e4bcdef833e932a7abcef' });
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PURPOSE = 'BHU 1.0 age-questionnaire draft', TTL = 300;
const BOOLEAN_FIELDS = ['advertising', 'ageAssurance', 'datingAndRelationships', 'gambling', 'healthOrWellnessTopics', 'lootBox', 'messagingAndChat', 'parentalControls', 'sharedLocation', 'socialMedia', 'socialMediaAgeRestricted', 'unrestrictedWebAccess', 'userGeneratedContent'];
const FREQUENCY_FIELDS = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons', 'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic'];
const FREQUENCIES = ['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE', 'INFREQUENT', 'FREQUENT'];
export const ANSWERS = Object.freeze(Object.fromEntries([
  ...BOOLEAN_FIELDS.map(key => [key, false]), ...FREQUENCY_FIELDS.map(key => [key, 'NONE']),
].sort(([a], [b]) => a.localeCompare(b))));
export const PROTECTED_FIELDS = Object.freeze(['ageRatingOverride', 'ageRatingOverrideV2', 'kidsAgeBand', 'koreaAgeRatingOverride', 'gracRatingClassificationNumber', 'developerAgeRatingInfoUrl']);
export const ALL_FIELDS = Object.freeze([...Object.keys(ANSWERS), ...PROTECTED_FIELDS].sort());
const check = (ok, message) => { if (!ok) throw new DraftError(message); };
const clone = value => JSON.parse(JSON.stringify(value));
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
}
const stable = value => JSON.stringify(ordered(value));
const digest = value => createHash('sha256').update(stable(value)).digest('hex');
function rid(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}={0,2}$/.test(value), 'Invalid Apple resource identifier.');
  return encodeURIComponent(value);
}
function state(resource) { return resource.attributes?.state ?? resource.attributes?.appVersionState ?? resource.attributes?.appStoreState; }
function linked(resource, key, type) {
  const value = resource.relationships?.[key]?.data;
  check(value?.type === type, 'Required Apple relationship is absent or has the wrong type.'); rid(value.id); return { type, id: value.id };
}
function owned(resource) { check(linked(resource, 'app', 'apps').id === APP_ID, 'Foreign application relationship.'); }
function single(json, type) {
  check(json?.data?.type === type && !Array.isArray(json.data), 'Unexpected Apple resource.'); rid(json.data.id); return json.data;
}
function collection(json, type) {
  check(Array.isArray(json?.data) && json.data.length <= 200 && !json.links?.next && json.data.every(item => item?.type === type), 'Incomplete Apple collection.');
  const ids = json.data.map(item => { rid(item.id); return item.id; });
  check(new Set(ids).size === ids.length, 'Duplicate Apple resource.'); return json.data;
}
function unique(values, predicate, message) { const matches = values.filter(predicate); check(matches.length === 1, message); return matches[0]; }

/** All 32 update attributes/types/enums were checked against Apple's official OpenAPI 4.6.1. */
export function validAttribute(field, value) {
  if (!ALL_FIELDS.includes(field)) return false;
  if (value === null) return true; // Official update schema explicitly allows null, including rollback.
  if (BOOLEAN_FIELDS.includes(field)) return typeof value === 'boolean';
  if (FREQUENCY_FIELDS.includes(field)) return FREQUENCIES.includes(value);
  const enums = {
    ageRatingOverride: ['NONE', 'NINE_PLUS', 'THIRTEEN_PLUS', 'SIXTEEN_PLUS', 'SEVENTEEN_PLUS', 'UNRATED'],
    ageRatingOverrideV2: ['NONE', 'NINE_PLUS', 'THIRTEEN_PLUS', 'SIXTEEN_PLUS', 'EIGHTEEN_PLUS', 'UNRATED'],
    kidsAgeBand: ['FIVE_AND_UNDER', 'SIX_TO_EIGHT', 'NINE_TO_ELEVEN'],
    koreaAgeRatingOverride: ['NONE', 'ALL', 'TWELVE_PLUS', 'FIFTEEN_PLUS', 'NINETEEN_PLUS'],
  };
  if (enums[field]) return enums[field].includes(value);
  return typeof value === 'string'; // Preserve, never write, the existing GRAC number / information URL.
}

export function assertRequest(method, path, parameters = {}, body) {
  check(typeof path === 'string' && !/[?#]/.test(path) && path.startsWith('/') && !path.startsWith('//'), 'Age draft route is forbidden.');
  check(parameters && typeof parameters === 'object' && !Array.isArray(parameters) && Object.values(parameters).every(x => typeof x === 'string'), 'Invalid Apple query.');
  if (method === 'GET') {
    check(body === undefined, 'GET body is forbidden.');
    const allowed = path === '/v1/apps' ? ['filter[bundleId]', 'fields[apps]', 'limit']
      : path === `/v1/apps/${APP_ID}/appInfos` ? ['fields[appInfos]', 'include', 'fields[apps]', 'fields[ageRatingDeclarations]', 'limit']
      : path === `/v1/apps/${APP_ID}/appStoreVersions` ? ['filter[versionString]', 'filter[platform]', 'fields[appStoreVersions]', 'include', 'fields[apps]', 'limit']
      : /^\/v1\/appInfos\/[^/]+\/ageRatingDeclaration$/.test(path) ? ['fields[ageRatingDeclarations]']
      : /^\/v1\/appInfos\/[^/]+\/relationships\/ageRatingDeclaration$/.test(path) ? [] : null;
    check(allowed && Object.keys(parameters).every(key => allowed.includes(key)), 'Age draft route or query is forbidden.');
    if (path === '/v1/apps') check(parameters['filter[bundleId]'] === BUNDLE, 'Another application is forbidden.');
    if (path.endsWith('/appInfos')) check(parameters.include === 'app,ageRatingDeclaration', 'Explicit app and age declaration linkage is required.');
    if (path.endsWith('/appStoreVersions')) check(parameters['filter[versionString]'] === VERSION && parameters['filter[platform]'] === 'IOS' && parameters.include === 'app', 'Explicit BHU iOS version ownership linkage is required.');
    if (path.startsWith('/v1/appInfos/')) { const raw = path.split('/')[3]; let id; try { id = decodeURIComponent(raw); } catch (_) { throw new DraftError('Age draft route is forbidden.'); } check(rid(id) === raw, 'Age draft route is forbidden.'); }
    return;
  }
  check(method === 'PATCH' && Object.keys(parameters).length === 0 && /^\/v1\/ageRatingDeclarations\/[^/]+$/.test(path), 'Age draft route is forbidden.');
  const data = body?.data;
  check(body && Object.keys(body).join(',') === 'data' && data?.type === 'ageRatingDeclarations' && Object.keys(data).sort().join(',') === 'attributes,id,type' && path === `/v1/ageRatingDeclarations/${rid(data.id)}`, 'Invalid age draft update.');
  check(data.attributes && !Array.isArray(data.attributes) && Object.keys(data.attributes).length > 0
    && Object.entries(data.attributes).every(([field, value]) => Object.hasOwn(ANSWERS, field) && value === ANSWERS[field]), 'Only source-supported questionnaire answers may be written.');
}

/** Uses the existing protected five-minute session; never reads a P8 key or emits a token. */
export function createClient(session, { fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  function validate() {
    validateSession(session, now());
    const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url'));
    check(claims.exp > claims.iat && (session.issuedAt === undefined || claims.iat === session.issuedAt), 'Invalid protected Apple session lifetime.');
  }
  validate(); let requests = 0;
  return async function request(method, path, parameters = {}, body) {
    assertRequest(method, path, parameters, body); validate();
    check(++requests <= 30, 'Age draft request budget exceeded.');
    const url = new URL(path, 'https://api.appstoreconnect.apple.com'); url.search = new URLSearchParams(parameters).toString();
    let response;
    try {
      response = await fetchImpl(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (_) { throw new DraftError('Apple age request did not return a definitive result.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch (_) { /* Do not expose raw diagnostics. */ }
      throw new DraftError('Apple age request was rejected.', { outcome: 'rejected', httpStatus: response.status });
    }
    const reader = response.body?.getReader(); check(reader, 'Invalid Apple response.');
    const chunks = []; let bytes = 0;
    try {
      while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error(); } chunks.push(Buffer.from(item.value)); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (_) { throw new DraftError('Apple age response could not be verified.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    finally { reader.releaseLock(); }
  };
}

async function snapshot(request) {
  const apps = collection(await request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE, 'fields[apps]': 'bundleId,primaryLocale', limit: '2' }), 'apps');
  check(apps.length === 1 && apps[0].id === APP_ID && apps[0].attributes?.bundleId === BUNDLE && apps[0].attributes?.primaryLocale === 'tr', 'Expected Turkish BHU application was not found.');
  const infos = collection(await request('GET', `/v1/apps/${APP_ID}/appInfos`, { 'fields[appInfos]': 'state,app,ageRatingDeclaration', include: 'app,ageRatingDeclaration', 'fields[apps]': 'bundleId', 'fields[ageRatingDeclarations]': 'ageRatingOverrideV2', limit: '200' }), 'appInfos');
  infos.forEach(owned);
  const info = unique(infos, x => state(x) === 'PREPARE_FOR_SUBMISSION', 'No unique editable BHU app information.');
  const versions = collection(await request('GET', `/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': VERSION, 'filter[platform]': 'IOS', 'fields[appStoreVersions]': 'versionString,platform,appVersionState,appStoreState,app', include: 'app', 'fields[apps]': 'bundleId', limit: '200' }), 'appStoreVersions');
  versions.forEach(owned);
  const version = unique(versions, x => x.attributes?.versionString === VERSION && x.attributes?.platform === 'IOS', 'No unique BHU iOS version 1.0.');
  check(state(version) === 'PREPARE_FOR_SUBMISSION', 'BHU iOS version 1.0 is not an editable draft.');
  const fromInfo = linked(info, 'ageRatingDeclaration', 'ageRatingDeclarations');
  const linkage = single(await request('GET', `/v1/appInfos/${rid(info.id)}/relationships/ageRatingDeclaration`), 'ageRatingDeclarations');
  check(linkage.id === fromInfo.id, 'Age declaration linkage changed or belongs to another app information record.');
  const declaration = single(await request('GET', `/v1/appInfos/${rid(info.id)}/ageRatingDeclaration`, { 'fields[ageRatingDeclarations]': ALL_FIELDS.join(',') }), 'ageRatingDeclarations');
  check(declaration.id === linkage.id && declaration.attributes && typeof declaration.attributes === 'object' && !Array.isArray(declaration.attributes), 'Age declaration resource does not match the verified relationship.');
  for (const [field, value] of Object.entries(declaration.attributes)) check(validAttribute(field, value), 'Apple age declaration has an unknown field or value; reread the official schema.');
  return { app: { id: APP_ID, bundleId: BUNDLE, primaryLocale: 'tr' },
    info: { id: info.id, state: state(info), app: linked(info, 'app', 'apps'), ageRatingDeclaration: fromInfo },
    version: { id: version.id, versionString: VERSION, platform: 'IOS', state: state(version), app: linked(version, 'app', 'apps') },
    declaration: { id: declaration.id, attributes: clone(declaration.attributes) } };
}

const EVIDENCE = Object.freeze({
  features: ['package.json', 'index.html:8', 'app.js:210', 'app.js:462', 'ios/App/App/Info.plist', 'ios/App/CapApp-SPM/Sources/CapApp-SPM/KasaPurchasesPlugin.swift'],
  content: ['app.js:39', 'app.js:240', 'app.js:247', 'app.js:477', 'docs/ios/metadata/tr-TR/description.txt'],
  interpretation: 'Private user-entered ledger text/attachments are not public user publishing, chat, or developer-provided restricted content. Fixed support/privacy links leave the app; there is no unrestricted in-app browser. StoreKit is a one-time feature unlock, not gambling or a loot box.',
});
export async function compilePlan({ request, nowSeconds = Math.floor(Date.now() / 1000) }) {
  check(typeof request === 'function' && Number.isSafeInteger(nowSeconds) && nowSeconds > 0, 'Invalid age draft input.');
  const baseline = await snapshot(request), attrs = baseline.declaration.attributes;
  const changes = Object.entries(ANSWERS).filter(([field]) => Object.hasOwn(attrs, field) && attrs[field] === null).map(([field, to]) => ({ field, from: null, to }));
  const unknown = ALL_FIELDS.filter(field => !Object.hasOwn(attrs, field));
  const preserved = Object.fromEntries(Object.entries(attrs).filter(([field, value]) => PROTECTED_FIELDS.includes(field) || value !== null));
  const conflicts = Object.entries(ANSWERS).filter(([field, value]) => Object.hasOwn(attrs, field) && attrs[field] !== null && attrs[field] !== value).map(([field, expected]) => ({ field, saved: attrs[field], sourceSupported: expected }));
  const payload = attributes => ({ data: { type: 'ageRatingDeclarations', id: baseline.declaration.id, attributes } });
  const plan = { schemaVersion: 1, purpose: PURPOSE, appId: APP_ID, bundleId: BUNDLE, versionString: VERSION,
    createdAt: nowSeconds, expiresAt: nowSeconds + TTL, officialSchema: SCHEMA, evidence: EVIDENCE,
    baseline, baselineHash: digest(baseline), changes, preserved, unknown, conflicts,
    operation: changes.length ? { method: 'PATCH', path: `/v1/ageRatingDeclarations/${rid(baseline.declaration.id)}`, body: payload(Object.fromEntries(changes.map(x => [x.field, x.to]))) } : null,
    rollbackForReviewOnly: changes.length ? { method: 'PATCH', path: `/v1/ageRatingDeclarations/${rid(baseline.declaration.id)}`, body: payload(Object.fromEntries(changes.map(x => [x.field, null]))) } : null,
    reviewSubmitted: false, publicReleaseTriggered: false, forcedAgeRating: false };
  return { ...plan, planHash: digest(plan) };
}

export function summarize(plan) {
  return { appId: APP_ID, versionString: VERSION, expiresAt: plan.expiresAt,
    answersToFill: plan.changes, preserved: plan.preserved, missingFieldsLeftUnknown: plan.unknown, existingAnswersNeedingReview: plan.conflicts,
    rollbackAvailableForReview: !!plan.rollbackForReviewOnly, reviewSubmitted: false, publicReleaseTriggered: false, forcedAgeRating: false };
}

/** One PATCH at most, no retry and no automatic rollback after an uncertain response. */
export async function applyPlan({ plan, request, nowSeconds, now, record = () => {} }) {
  const clock = now ?? (nowSeconds === undefined ? () => Math.floor(Date.now() / 1000) : () => nowSeconds);
  check(typeof clock === 'function', 'Invalid age draft clock.');
  const startedAt = clock();
  check(plan && plan.schemaVersion === 1 && plan.purpose === PURPOSE && plan.appId === APP_ID && plan.bundleId === BUNDLE && plan.versionString === VERSION
    && Number.isSafeInteger(startedAt) && Number.isSafeInteger(plan.createdAt) && plan.createdAt <= startedAt + 5 && plan.createdAt > 0 && plan.expiresAt === plan.createdAt + TTL && plan.expiresAt > startedAt,
  'Age draft plan is invalid or expired.');
  const unsigned = { ...plan }; delete unsigned.planHash;
  check(plan.planHash === digest(unsigned), 'Age draft plan was changed.');
  const fresh = await compilePlan({ request, nowSeconds: plan.createdAt });
  check(stable(plan) === stable(fresh), 'Age draft plan is stale or changed; review a new plan.');
  const receipt = { appId: APP_ID, versionString: VERSION, status: 'started', fields: plan.changes.map(x => x.field),
    operationCount: 0, outcome: 'not_attempted', readbackVerified: false, readbackOutcome: 'not_attempted', reviewSubmitted: false, publicReleaseTriggered: false, forcedAgeRating: false };
  record(clone(receipt));
  if (!plan.operation) { receipt.status = 'completed'; receipt.readbackVerified = true; receipt.readbackOutcome = 'verified'; record(clone(receipt)); return receipt; }
  try {
    const operation = plan.operation;
    assertRequest(operation.method, operation.path, {}, operation.body);
    const beforeWrite = clock();
    check(Number.isSafeInteger(beforeWrite) && beforeWrite >= startedAt && plan.expiresAt > beforeWrite, 'Age draft plan expired during freshness reads.');
    receipt.operationCount = 1; receipt.outcome = 'unknown'; record(clone(receipt));
    const reply = single(await request(operation.method, operation.path, {}, operation.body), 'ageRatingDeclarations');
    check(reply.id === plan.baseline.declaration.id, 'Apple age update returned a different resource.');
    receipt.outcome = 'accepted'; receipt.readbackOutcome = 'pending'; record(clone(receipt));
    const saved = await snapshot(request), expected = clone(plan.baseline);
    for (const change of plan.changes) expected.declaration.attributes[change.field] = change.to;
    check(stable(saved) === stable(expected), 'Saved age declaration differs from the reviewed changes.');
    receipt.status = 'completed'; receipt.readbackVerified = true; receipt.readbackOutcome = 'verified'; record(clone(receipt)); return receipt;
  } catch (error) {
    receipt.status = 'stopped';
    if (receipt.outcome === 'accepted') {
      receipt.readbackOutcome = ['read_failed', 'rejected'].includes(error.outcome) ? error.outcome : 'unverified';
      if (Number.isInteger(error.httpStatus) && error.httpStatus >= 400 && error.httpStatus < 600) receipt.readbackHttpStatus = error.httpStatus;
    } else {
      if (error instanceof DraftError && ['unknown', 'rejected'].includes(error.outcome)) receipt.outcome = error.outcome;
      if (Number.isInteger(error.httpStatus) && error.httpStatus >= 400 && error.httpStatus < 600) receipt.httpStatus = error.httpStatus;
    }
    record(clone(receipt));
    throw new DraftError('Age draft stopped; inspect the sanitized receipt and reread Apple state before any retry.', { receipt });
  }
}

function readPrivate(path) {
  const p = privatePath(path); check(lstatSync(p).isFile() && (lstatSync(p).mode & 0o077) === 0 && lstatSync(p).size <= 1024 * 1024, 'Unsafe protected age input.');
  return JSON.parse(readFileSync(p, 'utf8'));
}
function writePrivate(path, value) {
  const p = privatePath(path); mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const fd = openSync(p, 'wx', 0o600); try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); } finally { closeSync(fd); }
}
function receiptWriter(path) {
  const p = resolve(path), base = resolve(ROOT, 'test-artifacts');
  check(p.startsWith(base + sep) && p.endsWith('.json') && !existsSync(p), 'Use a fresh sanitized receipt path under test-artifacts.');
  let cursor = p;
  while (cursor.startsWith(base)) { if (existsSync(cursor)) check(!lstatSync(cursor).isSymbolicLink(), 'Symbolic receipt paths are forbidden.'); if (cursor === base) break; cursor = dirname(cursor); }
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
  check(args.length % 2 === 0, 'Invalid age draft arguments.');
  for (let i = 0; i < args.length; i += 2) { check(['--session', '--plan', '--output'].includes(args[i]) && !options[args[i]] && args[i + 1] && !args[i + 1].startsWith('-'), 'Invalid age draft arguments.'); options[args[i]] = args[i + 1]; }
  check(options['--session'] && options['--output'] && Object.keys(options).length === (mode === '--plan' ? 2 : 3) && (mode !== '--apply' || options['--plan']), 'Missing or unexpected age draft arguments.');
  const request = createClient(readPrivate(options['--session']));
  if (mode === '--plan') { const plan = await compilePlan({ request }); writePrivate(options['--output'], plan); console.log(JSON.stringify(summarize(plan))); }
  else console.log(JSON.stringify(await applyPlan({ plan: readPrivate(options['--plan']), request, record: receiptWriter(options['--output']) })));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error instanceof DraftError ? error.message : 'Age draft preparation failed.'); process.exitCode = 1; });
