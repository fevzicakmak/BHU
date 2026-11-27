#!/usr/bin/env node
/**
 * Fixed-BHU draft screenshots only. Never submits, releases, deletes, or replaces assets.
 * Protocol: https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect
 * The legacy enum names are documented in Apple's OpenAPI 4.6.1. Compatibility
 * with current screenshot dimensions is established only by server COMPLETE.
 */
import { createHash } from 'node:crypto';
import { constants as FS, closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = resolve(ROOT, '.ios-signing');
const ORIGIN = 'https://api.appstoreconnect.apple.com';
export const APP_ID = '6835483226', BUNDLE = 'com.fevzicakmak.bhu';
const VERSION = '1.0', LOCALE = 'tr', MAX_IMAGE = 10 * 1024 * 1024;
const FAMILIES = {
  iPhone: { displayType: 'APP_IPHONE_61', sizes: [[1179, 2556], [1206, 2622]], fileName: 'bhu-iphone-hesaplar.png' },
  iPad: { displayType: 'APP_IPAD_PRO_3GEN_129', sizes: [[2064, 2752], [2048, 2732]], fileName: 'bhu-ipad-hesaplar.png' },
};
export class AssetsError extends Error {
  constructor(message, details = {}) { super(message); Object.assign(this, details); }
}
const check = (ok, message) => { if (!ok) throw new AssetsError(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
}
const hash = value => sha(stable(value));
function rid(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}={0,2}$/.test(value), 'Invalid Apple resource identifier.');
  return encodeURIComponent(value);
}
const rel = (value, name) => value?.relationships?.[name]?.data ?? null;
function collection(json, type) {
  check(Array.isArray(json?.data) && json.data.length <= 200 && !json.links?.next && json.data.every(x => x?.type === type), 'Incomplete Apple collection.');
  for (const item of json.data) rid(item.id);
  return json.data;
}
function single(json, type) { check(json?.data?.type === type, 'Unexpected Apple resource.'); rid(json.data.id); return json.data; }

const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) { let n = 0xffffffff; for (const b of data) n = CRC[(n ^ b) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }

/** No resizing or image editing: parse and validate the supplied opaque native PNG. */
export function inspectPNG(data, family, path = null) {
  check(Buffer.isBuffer(data) && data.length > 60 && data.length <= MAX_IMAGE && Object.hasOwn(FAMILIES, family), 'Invalid screenshot input.');
  check(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Screenshot must be a PNG.');
  let offset = 8, ihdr = null, ended = false, seenIDAT = false, afterIDAT = false, chunkCount = 0;
  const compressed = [];
  while (offset < data.length) {
    check(++chunkCount <= 10000 && offset + 12 <= data.length, 'Malformed PNG screenshot.');
    const length = data.readUInt32BE(offset), end = offset + 12 + length;
    check(length <= MAX_IMAGE && end <= data.length, 'Malformed PNG screenshot.');
    const name = data.toString('ascii', offset + 4, offset + 8), contents = data.subarray(offset + 8, offset + 8 + length);
    check(/^[A-Za-z]{4}$/.test(name) && crc32(data.subarray(offset + 4, offset + 8 + length)) === data.readUInt32BE(offset + 8 + length), 'PNG checksum is invalid.');
    check(!['tRNS', 'acTL', 'fcTL', 'fdAT'].includes(name), 'Screenshot must not contain transparency or animation.');
    if (name === 'IHDR') {
      check(offset === 8 && ihdr === null && length === 13, 'Malformed PNG header.'); ihdr = contents;
    } else check(ihdr !== null, 'PNG header is missing.');
    if (name === 'IDAT') { check(!afterIDAT && length > 0, 'Malformed PNG image data.'); seenIDAT = true; compressed.push(contents); }
    else if (seenIDAT) afterIDAT = true;
    if (name === 'IEND') { check(length === 0 && end === data.length && seenIDAT, 'Malformed PNG end.'); ended = true; }
    else if (name[0] === name[0].toUpperCase()) check(['IHDR', 'IDAT', 'PLTE'].includes(name), 'Unsupported PNG critical chunk.');
    offset = end;
  }
  check(ended && ihdr, 'PNG image is incomplete.');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  check(ihdr[8] === 8 && ihdr[9] === 2 && ihdr[10] === 0 && ihdr[11] === 0 && ihdr[12] === 0, 'Screenshot must be opaque, non-interlaced, 8-bit RGB.');
  check(FAMILIES[family].sizes.some(size => size[0] === width && size[1] === height), 'Screenshot dimensions do not match the required family.');
  const rowLength = width * 3 + 1, expectedLength = rowLength * height;
  let pixels;
  try { pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedLength }); } catch (_) { throw new AssetsError('PNG image data is invalid.'); }
  check(pixels.length === expectedLength, 'PNG pixel data is incomplete.');
  for (let row = 0; row < height; row++) check(pixels[row * rowLength] <= 4, 'PNG filter is invalid.');
  return { family, path, width, height, fileSize: data.length, sha256: sha(data), md5: createHash('md5').update(data).digest('hex'),
    displayType: FAMILIES[family].displayType, fileName: FAMILIES[family].fileName, data };
}
function publicImage(image) { const { family, path, width, height, fileSize, sha256, md5, displayType, fileName } = image; return { family, path, width, height, fileSize, sha256, md5, displayType, fileName }; }
export function readImage(path, family) {
  const absolute = resolve(path), stat = lstatSync(absolute);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_IMAGE, 'Screenshot file is unavailable or too large.');
  return inspectPNG(readFileSync(absolute), family, absolute);
}

export function validateSession(session, now = Math.floor(Date.now() / 1000)) {
  check(session?.appId === APP_ID && typeof session.token === 'string' && session.token.length <= 6000, 'Invalid private Apple session.');
  try {
    const [header, payload, signature, extra] = session.token.split('.');
    const h = JSON.parse(Buffer.from(header, 'base64url')), p = JSON.parse(Buffer.from(payload, 'base64url'));
    check(!extra && signature && h.alg === 'ES256' && p.aud === 'appstoreconnect-v1' && Number.isSafeInteger(p.exp) && p.exp === session.expiresAt
      && Number.isSafeInteger(p.iat) && p.iat <= now + 30 && p.exp > p.iat && p.exp - p.iat <= 300 && p.exp > now + 10 && p.exp <= now + 330, 'Invalid or expired private Apple session.');
  } catch (_) { throw new AssetsError('Invalid or expired private Apple session.'); }
}
export function assertRequest(method, path) {
  check(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[?#]/.test(path), 'Asset API route is forbidden.');
  if (method === 'GET' && path === '/v1/apps') return;
  if (method === 'POST' && ['/v1/appScreenshotSets', '/v1/appScreenshots'].includes(path)) return;
  const segments = path.slice(1).split('/'); check([3, 4].includes(segments.length) && segments[0] === 'v1', 'Asset API route is forbidden.');
  let value; try { value = decodeURIComponent(segments[2]); } catch (_) { throw new AssetsError('Asset API route is forbidden.'); }
  check(rid(value) === segments[2], 'Asset API route is forbidden.');
  const resource = segments[1], tail = segments[3] || '';
  if (method === 'GET') {
    const allowed = { apps: ['appStoreVersions'], appStoreVersions: ['appStoreVersionLocalizations'], appStoreVersionLocalizations: ['appScreenshotSets'], appScreenshotSets: ['appScreenshots'], appScreenshots: [''] };
    check(allowed[resource]?.includes(tail), 'Asset API route is forbidden.');
    if (resource === 'apps') check(value === APP_ID, 'Another app is forbidden.');
  } else check(method === 'PATCH' && resource === 'appScreenshots' && !tail, 'Asset API route is forbidden.');
}

async function readJSON(response) {
  const reader = response.body?.getReader(); check(reader, 'Apple response is invalid.');
  const chunks = []; let total = 0;
  try {
    while (true) { const value = await reader.read(); if (value.done) break; total += value.value.byteLength; check(total <= 1024 * 1024, 'Apple response is too large.'); chunks.push(Buffer.from(value.value)); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) { throw new AssetsError('Apple response could not be verified.'); }
  finally { reader.releaseLock(); }
}
export function createClient(session, { fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  validateSession(session, now()); const deadline = Math.min(Date.now() + 240000, (session.expiresAt - 10) * 1000); let count = 0;
  const uploadCapabilities = new WeakMap();
  const remaining = () => { validateSession(session, now()); check(Date.now() < deadline && ++count <= 100, 'Asset request budget expired.'); return Math.min(20000, Math.max(1, deadline - Date.now())); };
  return {
    validateOperations(operations, image) {
      const checked = validateUploadOperations(operations, image, session.token);
      for (const operation of checked) uploadCapabilities.set(operation, image.sha256);
      return checked;
    },
    async request(method, path, parameters = {}, body) {
      assertRequest(method, path); const timeout = remaining(), url = new URL(path, ORIGIN); url.search = new URLSearchParams(parameters).toString();
      let response;
      try { response = await fetchImpl(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(timeout), headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
      catch (_) { throw new AssetsError('Asset API request has no definitive result.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
      if (!response.ok) { try { await response.body?.cancel(); } catch (_) {} throw new AssetsError('Asset API request was rejected.', { outcome: 'rejected', httpStatus: response.status }); }
      try { return response.status === 204 ? null : await readJSON(response); }
      catch (_) { throw new AssetsError('Asset API response could not be verified.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    },
    async upload(operation, image) {
      check(uploadCapabilities.get(operation) === image.sha256 && sha(image.data) === image.sha256, 'Upload operation was not authorized for these screenshot bytes.');
      uploadCapabilities.delete(operation);
      const timeout = remaining();
      let response;
      try { response = await fetchImpl(operation.url, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(timeout), headers: operation.headers, body: image.data.subarray(operation.offset, operation.offset + operation.length) }); }
      catch (_) { throw new AssetsError('Asset bytes upload has no definitive result.', { outcome: 'unknown' }); }
      if (!response.ok) { try { await response.body?.cancel(); } catch (_) {} throw new AssetsError('Asset bytes upload was rejected.', { outcome: 'rejected', httpStatus: response.status }); }
      try { await response.body?.cancel(); } catch (_) {}
    },
  };
}

/** Only API-issued signed upload operations, never an App Store bearer token. */
export function validateUploadOperations(operations, image, bearer = '') {
  check(Array.isArray(operations) && operations.length > 0 && operations.length <= 100, 'Upload operations are invalid.');
  const output = operations.map(operation => {
    check(operation?.method === 'PUT' && Number.isSafeInteger(operation.offset) && operation.offset >= 0 && Number.isSafeInteger(operation.length) && operation.length > 0
      && operation.offset + operation.length <= image.fileSize, 'Upload chunk bounds are invalid.');
    let url; try { url = new URL(operation.url); } catch (_) { throw new AssetsError('Upload destination is invalid.'); }
    const host = url.hostname.toLowerCase();
    check(url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && (host.endsWith('.apple.com') || host.endsWith('.icloud-content.com') || host.endsWith('.amazonaws.com'))
      && host !== 'api.appstoreconnect.apple.com' && !host.endsWith('.localhost'), 'Upload destination is not an approved asset host.');
    check(!bearer || !decodeURIComponent(url.href).includes(bearer), 'An API credential must never enter an upload URL.');
    check(Array.isArray(operation.requestHeaders) && operation.requestHeaders.length <= 40, 'Upload headers are invalid.');
    const headers = {}, seen = new Set();
    for (const header of operation.requestHeaders) {
      const name = header?.name?.toLowerCase(), value = header?.value;
      check(typeof name === 'string' && /^[a-z0-9-]+$/.test(name) && !seen.has(name) && typeof value === 'string' && value.length <= 8192 && !/[\r\n]/.test(value), 'Upload headers are invalid.');
      check(['content-type', 'content-length', 'content-md5', 'cache-control', 'content-disposition', 'host'].includes(name) || /^x-(?:amz|apple)-[a-z0-9-]+$/.test(name), 'Upload header is not allowlisted.');
      check(!/bearer\s/i.test(value) && (!bearer || !value.includes(bearer)), 'An API credential must never enter upload headers.');
      if (name === 'host') check(value.toLowerCase() === url.host.toLowerCase(), 'Upload Host header is invalid.');
      if (name === 'content-length') check(value === String(operation.length), 'Upload Content-Length is invalid.');
      seen.add(name); headers[name] = value;
    }
    return Object.freeze({ url: url.href, method: 'PUT', offset: operation.offset, length: operation.length, headers: Object.freeze(headers) });
  }).sort((a, b) => a.offset - b.offset);
  let next = 0; for (const operation of output) { check(operation.offset === next, 'Upload chunks overlap or leave gaps.'); next += operation.length; }
  check(next === image.fileSize, 'Upload chunks do not cover the whole screenshot.');
  return output;
}

function stateOf(value) { const s = value?.attributes?.assetDeliveryState?.state; return ['AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'COMPLETE', 'FAILED'].includes(s) ? s : 'UNKNOWN'; }
async function discover(request) {
  const apps = collection(await request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE, 'fields[apps]': 'bundleId,primaryLocale', limit: '2' }), 'apps');
  check(apps.length === 1 && apps[0].id === APP_ID && apps[0].attributes?.bundleId === BUNDLE && apps[0].attributes?.primaryLocale === LOCALE, 'Expected Turkish BHU application was not found.');
  const versions = collection(await request('GET', `/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': VERSION, 'filter[platform]': 'IOS', 'fields[appStoreVersions]': 'versionString,platform,appStoreState,appVersionState,app', include: 'app', limit: '200' }), 'appStoreVersions');
  check(versions.length === 1 && versions[0].attributes?.versionString === VERSION && versions[0].attributes?.platform === 'IOS', 'Expected BHU version was not found.');
  const version = versions[0], app = rel(version, 'app'); check(!app || app.type === 'apps' && app.id === APP_ID, 'Foreign app relationship.');
  check((version.attributes?.appVersionState ?? version.attributes?.appStoreState) === 'PREPARE_FOR_SUBMISSION', 'Screenshot changes require an editable draft.');
  const localizations = collection(await request('GET', `/v1/appStoreVersions/${rid(version.id)}/appStoreVersionLocalizations`, { 'fields[appStoreVersionLocalizations]': 'locale', limit: '50' }), 'appStoreVersionLocalizations');
  const matches = localizations.filter(x => x.attributes?.locale === LOCALE); check(matches.length === 1, 'Expected Turkish localization was not found.');
  const localization = matches[0];
  const sets = collection(await request('GET', `/v1/appStoreVersionLocalizations/${rid(localization.id)}/appScreenshotSets`, { 'fields[appScreenshotSets]': 'screenshotDisplayType,appStoreVersionLocalization', include: 'appStoreVersionLocalization', limit: '200' }), 'appScreenshotSets');
  const selected = [];
  for (const family of Object.keys(FAMILIES)) {
    const matching = sets.filter(x => x.attributes?.screenshotDisplayType === FAMILIES[family].displayType); check(matching.length <= 1, 'Multiple screenshot sets have the same target display type.');
    const set = matching[0] ?? null;
    if (set) {
      const parent = rel(set, 'appStoreVersionLocalization'); check(!parent || parent.type === 'appStoreVersionLocalizations' && parent.id === localization.id, 'Foreign screenshot localization.');
    }
    const shots = set ? collection(await request('GET', `/v1/appScreenshotSets/${rid(set.id)}/appScreenshots`, { 'fields[appScreenshots]': 'fileName,fileSize,sourceFileChecksum,assetDeliveryState,appScreenshotSet', include: 'appScreenshotSet', limit: '200' }), 'appScreenshots') : [];
    for (const shot of shots) { const parent = rel(shot, 'appScreenshotSet'); check(!parent || parent.type === 'appScreenshotSets' && parent.id === set.id, 'Foreign screenshot relationship.'); }
    selected.push({ family, displayType: FAMILIES[family].displayType, setId: set?.id ?? null, screenshots: shots.map(x => ({ id: x.id, fileName: x.attributes?.fileName ?? null,
      fileSize: x.attributes?.fileSize ?? null, sourceFileChecksum: x.attributes?.sourceFileChecksum ?? null, state: stateOf(x) })).sort((a, b) => a.id.localeCompare(b.id)) });
  }
  return { appId: APP_ID, bundleId: BUNDLE, version: VERSION, versionId: version.id, locale: LOCALE, localizationId: localization.id, state: 'PREPARE_FOR_SUBMISSION', sets: selected };
}

export async function compilePlan({ request, images }) {
  check(images && Object.keys(images).sort().join(',') === 'iPad,iPhone', 'Both reviewed screenshot families are required.');
  for (const family of Object.keys(FAMILIES)) {
    const image = images[family]; check(image?.family === family && image.displayType === FAMILIES[family].displayType && Buffer.isBuffer(image.data)
      && sha(image.data) === image.sha256 && createHash('md5').update(image.data).digest('hex') === image.md5, 'Screenshot bytes do not match their inspected descriptors.');
  }
  const baseline = await discover(request), actions = [];
  for (const family of Object.keys(FAMILIES)) {
    const set = baseline.sets.find(x => x.family === family), image = images[family];
    let existingScreenshotId = null;
    if (set.screenshots.length) {
      check(set.screenshots.length === 1 && set.screenshots[0].fileName === image.fileName && set.screenshots[0].fileSize === image.fileSize
        && set.screenshots[0].sourceFileChecksum?.toLowerCase() === image.md5 && set.screenshots[0].state === 'COMPLETE', 'Existing screenshots are preserved; the target set is not empty or an exact completed match.');
      existingScreenshotId = set.screenshots[0].id;
    }
    actions.push({ family, displayType: image.displayType, setId: set.setId, existingScreenshotId, action: existingScreenshotId ? 'reuse' : 'upload' });
  }
  const material = { schemaVersion: 1, appId: APP_ID, version: VERSION, locale: LOCALE, baseline,
    images: Object.fromEntries(Object.keys(FAMILIES).map(family => [family, publicImage(images[family])])), actions };
  return { ...material, planHash: hash(material) };
}

function safeReceipt(plan) {
  return { schemaVersion: 1, appId: APP_ID, version: VERSION, locale: LOCALE, completed: false,
    assets: plan.actions.map(a => ({ family: a.family, displayType: a.displayType, fileName: plan.images[a.family].fileName,
      sha256: plan.images[a.family].sha256, md5: plan.images[a.family].md5, setId: a.setId,
      screenshotId: a.existingScreenshotId, state: a.action === 'reuse' ? 'COMPLETE' : 'NOT_STARTED', setCreated: false, screenshotCreated: false })),
    doesNotVerify: ['Real-device installation or StoreKit purchases', 'App Review submission or approval', 'IAP review screenshot'] };
}
function samePlan(plan, fresh) { const { planHash, ...material } = plan ?? {}; return planHash === hash(material) && stable(plan) === stable(fresh); }

export async function applyPlan({ client, plan, images, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), pollAttempts = 16 }) {
  const fresh = await compilePlan({ request: client.request, images }); check(samePlan(plan, fresh), 'Screenshot plan is stale or was changed.');
  check(Number.isSafeInteger(pollAttempts) && pollAttempts > 0 && pollAttempts <= 20, 'Invalid asset polling budget.');
  const receipt = safeReceipt(fresh);
  try {
    for (const action of fresh.actions) {
      const item = receipt.assets.find(x => x.family === action.family), image = images[action.family];
      if (action.action === 'reuse') continue;
      if (!item.setId) {
        item.state = 'CREATING_SET';
        const set = single(await client.request('POST', '/v1/appScreenshotSets', {}, { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: image.displayType },
          relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: fresh.baseline.localizationId } } } } }), 'appScreenshotSets');
        item.setId = set.id; item.setCreated = true;
        check(set.attributes?.screenshotDisplayType === image.displayType, 'Created screenshot set did not match the planned display.');
        const parent = rel(set, 'appStoreVersionLocalization'); check(!parent || parent.type === 'appStoreVersionLocalizations' && parent.id === fresh.baseline.localizationId, 'Created screenshot set belongs to another localization.');
      }
      item.state = 'RESERVING_SCREENSHOT';
      const shot = single(await client.request('POST', '/v1/appScreenshots', {}, { data: { type: 'appScreenshots', attributes: { fileName: image.fileName, fileSize: image.fileSize },
        relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: item.setId } } } } }), 'appScreenshots');
      item.screenshotId = shot.id; item.screenshotCreated = true; item.state = stateOf(shot);
      const parent = rel(shot, 'appScreenshotSet');
      check(!parent || parent.type === 'appScreenshotSets' && parent.id === item.setId, 'Reserved screenshot belongs to another set.');
      check(shot.attributes?.fileName === image.fileName && shot.attributes?.fileSize === image.fileSize, 'Reserved screenshot does not match its planned file.');
      check(typeof client.validateOperations === 'function', 'Upload validation is unavailable.');
      const operations = client.validateOperations(shot.attributes?.uploadOperations, image);
      item.state = 'UPLOADING'; for (const operation of operations) await client.upload(operation, image);
      item.state = 'COMMITTING';
      const committed = single(await client.request('PATCH', `/v1/appScreenshots/${rid(shot.id)}`, {}, { data: { type: 'appScreenshots', id: shot.id,
        attributes: { uploaded: true, sourceFileChecksum: image.md5 } } }), 'appScreenshots');
      check(committed.id === shot.id, 'Commit returned another screenshot.'); item.state = stateOf(committed);
      // Always read back once, including when the commit response already says COMPLETE.
      for (let attempt = 0; attempt < pollAttempts; attempt++) {
        check(item.state !== 'FAILED', 'Apple reported failed screenshot processing.'); await wait(2000);
        const checked = single(await client.request('GET', `/v1/appScreenshots/${rid(shot.id)}`, { 'fields[appScreenshots]': 'fileName,fileSize,sourceFileChecksum,assetDeliveryState,appScreenshotSet', include: 'appScreenshotSet' }), 'appScreenshots');
        const owner = rel(checked, 'appScreenshotSet'); check(checked.id === shot.id && (!owner || owner.type === 'appScreenshotSets' && owner.id === item.setId), 'Processed screenshot relationship changed.');
        check(checked.attributes?.fileName === image.fileName && checked.attributes?.fileSize === image.fileSize
          && checked.attributes?.sourceFileChecksum?.toLowerCase() === image.md5, 'Processed screenshot file does not match the original.');
        item.state = stateOf(checked);
        if (item.state === 'COMPLETE') break;
      }
      check(item.state === 'COMPLETE', 'Screenshot processing is not complete; inspect the recorded resource before retrying.');
    }
    receipt.completed = receipt.assets.every(x => x.state === 'COMPLETE'); return receipt;
  } catch (error) {
    receipt.failure = { message: error instanceof AssetsError ? error.message : 'Screenshot preparation stopped.', outcome: error.outcome ?? 'stopped',
      ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}), inspectCreatedResourcesBeforeRetry: true };
    throw new AssetsError(receipt.failure.message, { receipt });
  }
}

function privatePath(path) {
  check(typeof path === 'string' && !path.includes('\0'), 'Invalid private file path.');
  const absolute = resolve(path), part = relative(PRIVATE, absolute);
  check(part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part), 'Private files must remain under .ios-signing.');
  let current = ROOT;
  for (const piece of relative(ROOT, absolute).split(sep)) { current = resolve(current, piece); try { check(!lstatSync(current).isSymbolicLink(), 'Private file symlinks are forbidden.'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  return absolute;
}
function readPrivate(path) {
  const absolute = privatePath(path), info = lstatSync(absolute); check(info.isFile() && !(info.mode & 0o077) && info.size <= 131072, 'Private JSON input is missing or has unsafe permissions.');
  let fd; try { fd = openSync(absolute, FS.O_RDONLY | FS.O_NOFOLLOW); return JSON.parse(readFileSync(fd, 'utf8')); } catch (_) { throw new AssetsError('Private JSON input could not be read.'); } finally { if (fd !== undefined) closeSync(fd); }
}
function writePrivate(path, value) {
  const absolute = privatePath(path); mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  let fd; try { fd = openSync(absolute, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600); fchmodSync(fd, 0o600); writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); }
  catch (_) { throw new AssetsError('Could not create a new private plan file.'); } finally { if (fd !== undefined) closeSync(fd); }
}
function receiptPath(path) {
  check(typeof path === 'string' && !path.includes('\0'), 'Invalid receipt file path.');
  const absolute = resolve(path), part = relative(ROOT, absolute);
  check(part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
    && absolute !== PRIVATE && !absolute.startsWith(PRIVATE + sep), 'Safe receipt must remain in the workspace outside private session files.');
  let current = ROOT;
  for (const piece of part.split(sep)) {
    current = resolve(current, piece);
    try {
      const info = lstatSync(current);
      check(!info.isSymbolicLink(), 'Receipt file symlinks are forbidden.');
      check(current !== absolute && info.isDirectory(), 'A new receipt file is required.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return absolute;
}
function parse(argv) {
  const mode = argv[0]; check(['--plan', '--apply'].includes(mode), 'Use --plan or --apply.');
  const allowed = mode === '--plan' ? ['--session', '--phone', '--ipad', '--output'] : ['--session', '--phone', '--ipad', '--plan', '--output'];
  const args = {};
  check(argv.length === allowed.length * 2 + 1, 'Invalid screenshot preparation arguments.');
  for (let i = 1; i < argv.length; i += 2) { check(allowed.includes(argv[i]) && !Object.hasOwn(args, argv[i]) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Invalid screenshot preparation argument.'); args[argv[i]] = argv[i + 1]; }
  return { mode, args };
}
async function main(argv) {
  const { mode, args } = parse(argv), session = readPrivate(args['--session']);
  const images = { iPhone: readImage(args['--phone'], 'iPhone'), iPad: readImage(args['--ipad'], 'iPad') }, client = createClient(session);
  if (mode === '--plan') {
    const plan = await compilePlan({ request: client.request, images }); writePrivate(args['--output'], plan);
    console.log(JSON.stringify({ planned: true, appId: APP_ID, version: VERSION, locale: LOCALE, planHash: plan.planHash,
      actions: plan.actions.map(a => ({ family: a.family, displayType: a.displayType, action: a.action, fileSize: plan.images[a.family].fileSize, sha256: plan.images[a.family].sha256 })) })); return;
  }
  const plan = readPrivate(args['--plan']), output = receiptPath(args['--output']); let receipt;
  mkdirSync(dirname(output), { recursive: true });
  // Reserve a private, non-overwriting receipt before any remote mutation.
  let fd;
  try {
    fd = openSync(output, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
    try { receipt = await applyPlan({ client, plan, images }); }
    catch (error) {
      if (error.receipt) receipt = error.receipt;
      else {
        writeFileSync(fd, JSON.stringify({ schemaVersion: 1, appId: APP_ID, completed: false, assets: [], failure: {
          message: error instanceof AssetsError ? error.message : 'Screenshot preparation stopped before mutations.', outcome: 'stopped' } }, null, 2) + '\n');
        throw error;
      }
    }
    writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n');
  } finally { if (fd !== undefined) closeSync(fd); }
  console.log(JSON.stringify(receipt)); if (!receipt.completed) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof AssetsError ? error.message : 'Screenshot preparation failed without publishing private data.'); process.exitCode = 1;
});
