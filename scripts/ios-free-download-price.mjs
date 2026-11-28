#!/usr/bin/env node
/** Fixed BHU free download setup only. POST replaces a price schedule, so only
 * globally empty saved schedules may be written. Never touches IAP prices.
 * https://developer.apple.com/documentation/appstoreconnectapi/post-v1-apppriceschedules.md
 */
import { createHash } from 'node:crypto';
import { constants as FS, closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID, BUNDLE, AssetsError, validateSession } from './ios-app-store-assets.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), PRIVATE = resolve(ROOT, '.ios-signing');
const ORIGIN = 'https://api.appstoreconnect.apple.com', TEMP_ID = '${newprice-0}';
const check = (ok, message) => { if (!ok) throw new AssetsError(message); };
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])])) : value; }
const stable = value => JSON.stringify(sort(value)), hash = value => createHash('sha256').update(stable(value)).digest('hex');
function rid(id) { check(typeof id === 'string' && /^[A-Za-z0-9_-]{1,500}={0,2}$/.test(id), 'Invalid Apple price resource identifier.'); return encodeURIComponent(id); }
const rel = (resource, name) => resource?.relationships?.[name]?.data;
function one(json, type) { check(json?.data?.type === type, 'Unexpected Apple price resource.'); rid(json.data.id); return json.data; }
function zero(value) { return typeof value === 'string' && /^0+(?:\.0+)?$/.test(value); }
function decimal(value) { return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && value.length <= 30; }
function date(value) { return value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function freeScheduleBody(pointId, baseTerritory) {
  rid(pointId); check(['USA', 'TUR'].includes(baseTerritory), 'Only a verified existing USA or TUR base can be preserved.');
  return { data: { type: 'appPriceSchedules', relationships: { app: { data: { type: 'apps', id: APP_ID } },
    baseTerritory: { data: { type: 'territories', id: baseTerritory } }, manualPrices: { data: [{ type: 'appPrices', id: TEMP_ID }] } } },
    included: [{ type: 'appPrices', id: TEMP_ID, attributes: { startDate: null, endDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: pointId } } } }] };
}
export function assertFreePriceRequest(method, path) {
  check(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[?#]/.test(path), 'Free download price route is forbidden.');
  if (method === 'POST' && path === '/v1/appPriceSchedules') return;
  if (method === 'GET' && ['/v1/apps', `/v1/apps/${APP_ID}/appStoreVersions`, `/v1/apps/${APP_ID}/appPriceSchedule`, `/v1/apps/${APP_ID}/appPricePoints`].includes(path)) return;
  const match = path.match(/^\/(v1\/appPriceSchedules|v3\/appPricePoints)\/([^/]+)(?:\/(manualPrices|automaticPrices))?$/);
  let id; try { id = match && decodeURIComponent(match[2]); } catch (_) { throw new AssetsError('Free download price route is forbidden.'); }
  check(method === 'GET' && match && rid(id) === match[2]
    && (match[1] === 'v1/appPriceSchedules' ? Boolean(match[3]) : !match[3]), 'Free download price route is forbidden.');
}
async function readJSON(response) {
  const reader = response.body?.getReader(); check(reader, 'Apple price response is invalid.'); let total = 0; const chunks = [];
  try { while (true) { const item = await reader.read(); if (item.done) break; total += item.value.byteLength; check(total <= 1024 * 1024, 'Apple price response is too large.'); chunks.push(Buffer.from(item.value)); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { throw new AssetsError('Apple price response could not be verified.'); } finally { reader.releaseLock(); }
}
export function createFreePriceClient(session, { fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  validateSession(session, now()); let count = 0; const deadline = Math.min(Date.now() + 240000, (session.expiresAt - 10) * 1000);
  return { async request(method, path, parameters = {}, body) {
    assertFreePriceRequest(method, path); validateSession(session, now()); check(Date.now() < deadline && ++count <= 100, 'Free price request budget expired.');
    if (method === 'POST') { const pointId = body?.included?.[0]?.relationships?.appPricePoint?.data?.id, base = rel(body?.data, 'baseTerritory')?.id;
      check(stable(body) === stable(freeScheduleBody(pointId, base)), 'Only the fixed immediate free-price schedule payload is permitted.'); }
    const url = new URL(path, ORIGIN); url.search = new URLSearchParams(parameters).toString(); let response;
    try { response = await fetchImpl(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(Math.min(20000, Math.max(1, deadline - Date.now()))),
      headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch (_) { throw new AssetsError('Free price API request has no definitive result.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    if (!response.ok) { try { await response.body?.cancel(); } catch (_) {} throw new AssetsError('Free price API request was rejected.', { outcome: 'rejected', httpStatus: response.status }); }
    try { return await readJSON(response); } catch (_) { throw new AssetsError('Free price API response could not be verified.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
  } };
}
/** Traverse only same-endpoint ASC cursor pages, never arbitrary API-issued URLs. */
async function all(request, path, parameters, type) {
  let params = parameters; const values = [], included = [], seenIds = new Set(), seenPages = new Set();
  for (let page = 0; page < 20; page++) {
    const pageKey = stable(params); check(!seenPages.has(pageKey), 'Apple price pagination repeated.'); seenPages.add(pageKey);
    const json = await request('GET', path, params);
    check(Array.isArray(json?.data) && json.data.length <= 200 && values.length + json.data.length <= 3000, 'Apple price collection is incomplete or too large.');
    for (const item of json.data) { check(item?.type === type && !seenIds.has(item.id), 'Apple price collection has unexpected or duplicate resources.'); rid(item.id); seenIds.add(item.id); values.push(item); }
    check(!json.included || Array.isArray(json.included), 'Apple included price data is invalid.'); included.push(...(json.included ?? []));
    const next = json.links?.next;
    if (!next) {
      const expected = json.meta?.paging?.total; check(expected === undefined || Number.isSafeInteger(expected) && expected === values.length, 'Apple price collection count does not match.');
      return { data: values, included };
    }
    let url; try { url = new URL(next); } catch (_) { throw new AssetsError('Apple price pagination URL is invalid.'); }
    check(url.origin === ORIGIN && !url.username && !url.password && !url.hash && url.pathname === path, 'Foreign price pagination is forbidden.');
    const entries = [...url.searchParams]; check(entries.every(([key]) => key === 'cursor' || Object.hasOwn(parameters, key))
      && new Set(entries.map(([key]) => key)).size === entries.length && typeof url.searchParams.get('cursor') === 'string'
      && url.searchParams.get('cursor').length > 0 && url.searchParams.get('cursor').length <= 2000, 'Apple price pagination query is invalid.');
    for (const [key, value] of entries) check(key === 'cursor' || parameters[key] === value, 'Apple price pagination changed its scope.');
    // Apple's cursor links may omit sparse fieldsets or filters. Never let the
    // returned URL choose the next request's scope: keep the original query and
    // accept only its checked opaque cursor.
    params = { ...parameters, cursor: url.searchParams.get('cursor') };
  }
  throw new AssetsError('Apple price pagination exceeds the read budget.');
}
function point(resource, expectedTerritory = null) {
  check(resource?.type === 'appPricePoints' && decimal(resource.attributes?.customerPrice), 'Apple customer price is invalid.'); rid(resource.id);
  check(rel(resource, 'app')?.type === 'apps' && rel(resource, 'app')?.id === APP_ID, 'Price point belongs to another app.');
  const territory = rel(resource, 'territory'); check(territory?.type === 'territories' && /^[A-Z]{3}$/.test(territory.id)
    && (!expectedTerritory || territory.id === expectedTerritory), 'Price point territory is invalid.');
  return { id: resource.id, territory: territory.id, customerPrice: resource.attributes.customerPrice };
}
function includedResource(included, type, id) {
  const matches = included.filter(x => x?.type === type && x.id === id); check(matches.length > 0 && matches.every(x => stable(x) === stable(matches[0])), 'Included Apple price relationship could not be verified.'); return matches[0];
}
async function savedRows(request, scheduleId, kind, baseTerritory, pointCache) {
  const collection = await all(request, `/v1/appPriceSchedules/${rid(scheduleId)}/${kind}`, { 'fields[appPrices]': 'manual,startDate,endDate,appPricePoint,territory',
    'fields[appPricePoints]': 'customerPrice,app,territory', 'fields[territories]': 'currency', include: 'appPricePoint,territory', limit: '200' }, 'appPrices');
  const rows = [];
  for (const row of collection.data) {
    const attrs = row.attributes, territory = rel(row, 'territory'), pricePoint = rel(row, 'appPricePoint');
    check(typeof attrs?.manual === 'boolean' && attrs.manual === (kind === 'manualPrices') && date(attrs.startDate) && date(attrs.endDate)
      && (!attrs.startDate || !attrs.endDate || attrs.startDate < attrs.endDate), 'Saved price dates or source are ambiguous.');
    check(territory?.type === 'territories' && /^[A-Z]{3}$/.test(territory.id) && pricePoint?.type === 'appPricePoints', 'Saved price relationships are invalid.');
    rid(pricePoint.id);
    // The fixed verified schedule owns these saved rows. Apple allows only
    // include=appPricePoint,territory here, not nested appPricePoint.app.
    const resource = includedResource(collection.included, 'appPricePoints', pricePoint.id);
    check(decimal(resource.attributes?.customerPrice), 'Saved Apple customer price is invalid.');
    const nestedApp = rel(resource, 'app'), nestedTerritory = rel(resource, 'territory');
    const missingApp = nestedApp === undefined || nestedApp === null, missingTerritory = nestedTerritory === undefined || nestedTerritory === null;
    check(missingApp || nestedApp.type === 'apps' && nestedApp.id === APP_ID, 'Saved price point explicitly belongs to another app.');
    check(missingTerritory || nestedTerritory.type === 'territories' && nestedTerritory.id === territory.id, 'Saved price point explicitly has another territory.');
    let selected = { id: pricePoint.id, territory: territory.id, customerPrice: resource.attributes.customerPrice };
    const currency = includedResource(collection.included, 'territories', territory.id).attributes?.currency;
    check(typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) && (territory.id !== 'TUR' || currency === 'TRY'), 'Saved price currency is invalid.');
    if ((missingApp || missingTerritory) && [baseTerritory, 'TUR'].includes(territory.id)) {
      if (!pointCache.has(pricePoint.id)) {
        const detail = await request('GET', `/v3/appPricePoints/${rid(pricePoint.id)}`, { 'fields[appPricePoints]': 'customerPrice,app,territory',
          'fields[apps]': 'bundleId', 'fields[territories]': 'currency', include: 'app,territory' });
        const verified = point(one(detail, 'appPricePoints'), territory.id);
        check(includedResource(detail.included ?? [], 'territories', territory.id).attributes?.currency === currency, 'Saved price detail currency changed.');
        pointCache.set(pricePoint.id, verified);
      }
      check(stable(pointCache.get(pricePoint.id)) === stable(selected), 'Saved price detail differs from its scheduled relationship.');
      selected = pointCache.get(pricePoint.id);
    }
    rows.push({ id: row.id, manual: attrs.manual, startDate: attrs.startDate, endDate: attrs.endDate, pointId: selected.id,
      territory: territory.id, currency, customerPrice: selected.customerPrice });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
async function discoverSaved(request) {
  const apps = await all(request, '/v1/apps', { 'filter[bundleId]': BUNDLE, 'fields[apps]': 'bundleId,primaryLocale', limit: '2' }, 'apps');
  check(apps.data.length === 1 && apps.data[0].id === APP_ID && apps.data[0].attributes?.bundleId === BUNDLE && apps.data[0].attributes?.primaryLocale === 'tr', 'Expected Turkish BHU application was not found.');
  const versions = await all(request, `/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': '1.0', 'filter[platform]': 'IOS',
    'fields[appStoreVersions]': 'versionString,platform,appStoreState,appVersionState', limit: '200' }, 'appStoreVersions');
  check(versions.data.length === 1 && versions.data[0].attributes?.versionString === '1.0' && versions.data[0].attributes?.platform === 'IOS'
    && (versions.data[0].attributes?.appVersionState ?? versions.data[0].attributes?.appStoreState) === 'PREPARE_FOR_SUBMISSION', 'Free setup requires the editable BHU 1.0 iOS draft.');
  const scheduleJSON = await request('GET', `/v1/apps/${APP_ID}/appPriceSchedule`, { 'fields[appPriceSchedules]': 'app,baseTerritory,manualPrices,automaticPrices',
    'fields[apps]': 'bundleId', 'fields[territories]': 'currency', include: 'app,baseTerritory' });
  const schedule = one(scheduleJSON, 'appPriceSchedules');
  check(rel(schedule, 'app')?.type === 'apps' && rel(schedule, 'app')?.id === APP_ID, 'Saved price schedule belongs to another app.');
  const base = rel(schedule, 'baseTerritory'); check(base?.type === 'territories' && ['USA', 'TUR'].includes(base.id), 'Existing schedule base must be a verified USA or TUR territory.');
  const baseCurrency = includedResource(scheduleJSON.included ?? [], 'territories', base.id).attributes?.currency;
  check(baseCurrency === (base.id === 'USA' ? 'USD' : 'TRY'), 'Existing base currency could not be verified.');
  const pointCache = new Map(), manualPrices = await savedRows(request, schedule.id, 'manualPrices', base.id, pointCache),
    automaticPrices = await savedRows(request, schedule.id, 'automaticPrices', base.id, pointCache);
  return { appId: APP_ID, bundleId: BUNDLE, version: '1.0', versionId: versions.data[0].id, draftState: 'PREPARE_FOR_SUBMISSION',
    scheduleId: schedule.id, baseTerritory: base.id, baseCurrency, manualPrices, automaticPrices };
}
function ongoingTurkeyZero(baseline) {
  const tur = [...baseline.manualPrices, ...baseline.automaticPrices].filter(x => x.territory === 'TUR');
  // Undated ongoing zero is sufficient; dated or overlapping rows remain untouched and unverified.
  return tur.length === 1 && zero(tur[0].customerPrice) && tur[0].startDate === null && tur[0].endDate === null;
}
async function selectFreePoint(request, baseTerritory, baseCurrency) {
  const catalog = await all(request, `/v1/apps/${APP_ID}/appPricePoints`, { 'filter[territory]': baseTerritory, 'fields[appPricePoints]': 'customerPrice,app,territory',
    'fields[territories]': 'currency', 'fields[apps]': 'bundleId', include: 'app,territory', limit: '200' }, 'appPricePoints');
  const points = catalog.data.map(resource => point(resource, baseTerritory)), free = points.filter(x => zero(x.customerPrice));
  check(free.length === 1, 'A unique Apple zero-price point for the preserved base was not found.');
  const detail = await request('GET', `/v3/appPricePoints/${rid(free[0].id)}`, { 'fields[appPricePoints]': 'customerPrice,app,territory',
    'fields[apps]': 'bundleId', 'fields[territories]': 'currency', include: 'app,territory' });
  const selected = point(one(detail, 'appPricePoints'), baseTerritory);
  check(stable(selected) === stable(free[0]) && includedResource(detail.included ?? [], 'territories', baseTerritory).attributes?.currency === baseCurrency, 'Verified free price point changed or has another currency.');
  return { ...selected, currency: baseCurrency };
}
export async function compileFreePricePlan({ request }) {
  const baseline = await discoverSaved(request), rows = [...baseline.manualPrices, ...baseline.automaticPrices];
  let action, freePoint = null;
  if (rows.length) { check(ongoingTurkeyZero(baseline), 'Existing global pricing is preserved; it is not a proven ongoing TUR zero price.'); action = 'reuse'; }
  else { action = 'create'; freePoint = await selectFreePoint(request, baseline.baseTerritory, baseline.baseCurrency); }
  const material = { schemaVersion: 1, appId: APP_ID, purpose: 'Free application download; IAP pricing unchanged', baseline, action, freePoint };
  return { ...material, planHash: hash(material) };
}
function receiptFor(plan) {
  return { schemaVersion: 1, appId: APP_ID, action: plan.action, completed: false, scheduleId: plan.baseline.scheduleId, postAttempted: false,
    freeVerifiedForTUR: false, globalSavedRowsZero: false, manualPriceCount: plan.baseline.manualPrices.length, automaticPriceCount: plan.baseline.automaticPrices.length };
}
export async function applyFreePricePlan({ client, plan, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), pollAttempts = 3 }) {
  const fresh = await compileFreePricePlan({ request: client.request }), { planHash, ...material } = plan ?? {};
  check(planHash === hash(material) && stable(plan) === stable(fresh), 'Free download price plan is stale or changed.');
  check(Number.isSafeInteger(pollAttempts) && pollAttempts > 0 && pollAttempts <= 5, 'Invalid free price verification budget.');
  const receipt = receiptFor(fresh);
  try {
    let verified = fresh.baseline;
    if (fresh.action === 'create') {
      check(!verified.manualPrices.length && !verified.automaticPrices.length && zero(fresh.freePoint?.customerPrice), 'Only a globally empty saved schedule can be initialized.');
      receipt.postAttempted = true;
      const created = one(await client.request('POST', '/v1/appPriceSchedules', {}, freeScheduleBody(fresh.freePoint.id, fresh.baseline.baseTerritory)), 'appPriceSchedules');
      receipt.scheduleId = created.id;
      const owner = rel(created, 'app'); check(!owner || owner.type === 'apps' && owner.id === APP_ID, 'Created free schedule belongs to another app.');
      for (let attempt = 0; attempt < pollAttempts; attempt++) {
        if (attempt) await wait(2000); verified = await discoverSaved(client.request);
        const rows = [...verified.manualPrices, ...verified.automaticPrices];
        if (ongoingTurkeyZero(verified) && rows.every(x => zero(x.customerPrice) && x.startDate === null && x.endDate === null)) break;
      }
      receipt.scheduleId = verified.scheduleId;
      check(verified.baseTerritory === fresh.baseline.baseTerritory && verified.baseCurrency === fresh.baseline.baseCurrency && ongoingTurkeyZero(verified) && verified.manualPrices.length === 1
        && verified.manualPrices[0].pointId === fresh.freePoint.id && [...verified.manualPrices, ...verified.automaticPrices].every(x => zero(x.customerPrice) && x.startDate === null && x.endDate === null),
      'Saved free pricing could not be fully verified; inspect the schedule before retrying.');
    }
    const rows = [...verified.manualPrices, ...verified.automaticPrices]; receipt.freeVerifiedForTUR = ongoingTurkeyZero(verified);
    receipt.globalSavedRowsZero = rows.length > 0 && rows.every(x => zero(x.customerPrice) && x.startDate === null && x.endDate === null);
    receipt.manualPriceCount = verified.manualPrices.length; receipt.automaticPriceCount = verified.automaticPrices.length;
    receipt.completed = receipt.freeVerifiedForTUR; return receipt;
  } catch (error) {
    receipt.failure = { message: error instanceof AssetsError ? error.message : 'Free download price preparation stopped.', outcome: error.outcome ?? 'stopped',
      ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}), inspectScheduleBeforeRetry: true };
    throw new AssetsError(receipt.failure.message, { receipt });
  }
}
function guardedPath(path, privateFile, newFile = false) {
  check(typeof path === 'string' && !path.includes('\0'), 'Invalid free-price file path.'); const absolute = resolve(path), base = privateFile ? PRIVATE : ROOT, part = relative(base, absolute);
  check(part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part) && (privateFile || absolute !== PRIVATE && !absolute.startsWith(PRIVATE + sep)), 'Free-price output path is outside its allowed directory.');
  let current = ROOT;
  for (const piece of relative(ROOT, absolute).split(sep)) { current = resolve(current, piece); try { const info = lstatSync(current); check(!info.isSymbolicLink() && (!newFile || current !== absolute) && (current === absolute || info.isDirectory()), 'Free-price file path is unsafe or already exists.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  return absolute;
}
function readPrivate(path) {
  const absolute = guardedPath(path, true), info = lstatSync(absolute); check(info.isFile() && !(info.mode & 0o077) && info.size <= 1048576, 'Private free-price input is unavailable or has unsafe permissions.'); let fd;
  try { fd = openSync(absolute, FS.O_RDONLY | FS.O_NOFOLLOW); return JSON.parse(readFileSync(fd, 'utf8')); } catch (_) { throw new AssetsError('Private free-price input could not be read.'); } finally { if (fd !== undefined) closeSync(fd); }
}
function openOutput(path, privateFile) { const absolute = guardedPath(path, privateFile, true); mkdirSync(dirname(absolute), { recursive: true, mode: privateFile ? 0o700 : 0o755 }); return openSync(absolute, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600); }
function parse(argv) {
  const mode = argv[0], flags = mode === '--plan' ? ['--session', '--output'] : ['--session', '--plan', '--output'];
  check(['--plan', '--apply'].includes(mode) && argv.length === flags.length * 2 + 1, 'Use --plan or --apply with session and output.'); const args = {};
  for (let i = 1; i < argv.length; i += 2) { check(flags.includes(argv[i]) && !Object.hasOwn(args, argv[i]) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Invalid free-price argument.'); args[argv[i]] = argv[i + 1]; } return { mode, args };
}
async function main(argv) {
  const { mode, args } = parse(argv), session = readPrivate(args['--session']), client = createFreePriceClient(session);
  if (mode === '--plan') { const plan = await compileFreePricePlan({ request: client.request }), fd = openOutput(args['--output'], true);
    try { writeFileSync(fd, JSON.stringify(plan, null, 2) + '\n'); } finally { closeSync(fd); }
    console.log(JSON.stringify({ planned: true, appId: APP_ID, action: plan.action, savedManualCount: plan.baseline.manualPrices.length, savedAutomaticCount: plan.baseline.automaticPrices.length, planHash: plan.planHash })); return; }
  const plan = readPrivate(args['--plan']), fd = openOutput(args['--output'], false); let receipt;
  try { try { receipt = await applyFreePricePlan({ client, plan }); }
    catch (error) { if (error.receipt) receipt = error.receipt; else { writeFileSync(fd, JSON.stringify({ appId: APP_ID, completed: false, postAttempted: false,
      failure: { message: error instanceof AssetsError ? error.message : 'Free-price preparation stopped before mutation.', outcome: 'stopped' } }, null, 2) + '\n'); throw error; } }
    writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n'); } finally { closeSync(fd); }
  console.log(JSON.stringify(receipt)); if (!receipt.completed) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof AssetsError ? error.message : 'Free download pricing failed without publishing private data.'); process.exitCode = 1;
});
