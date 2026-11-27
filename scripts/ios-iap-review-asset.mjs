#!/usr/bin/env node
/** Fixed BHU non-consumable review screenshot only. No submission, pricing or replacement.
 * Apple OpenAPI 4.6.1: InAppPurchaseAppStoreReviewScreenshot{Create,Update}Request.
 * https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect
 */
import { createHash } from 'node:crypto';
import { constants as FS, closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID, BUNDLE, AssetsError, inspectPNG, validateSession, validateUploadOperations } from './ios-app-store-assets.mjs';

export const IAP_ID = '6835484249', PRODUCT_ID = 'com.fevzicakmak.bhu.multipleaccounts';
const TYPE = 'inAppPurchaseAppStoreReviewScreenshots', FILE_NAME = 'bhu-coklu-hesap-review.png';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), PRIVATE = resolve(ROOT, '.ios-signing');
const ORIGIN = 'https://api.appstoreconnect.apple.com', VERSION = '1.0';
const check = (ok, message) => { if (!ok) throw new AssetsError(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
}
const stable = value => JSON.stringify(sorted(value)), digest = value => sha(stable(value));
function rid(id) { check(typeof id === 'string' && /^[A-Za-z0-9_-]{1,500}={0,2}$/.test(id), 'Invalid Apple resource identifier.'); return encodeURIComponent(id); }
const relation = (resource, name) => resource?.relationships?.[name]?.data;
function one(json, type) { check(json?.data?.type === type, 'Unexpected Apple review resource.'); rid(json.data.id); return json.data; }
function many(json, type) {
  check(Array.isArray(json?.data) && json.data.length <= 200 && !json.links?.next && json.data.every(x => x?.type === type), 'Incomplete Apple review collection.');
  for (const resource of json.data) rid(resource.id);
  return json.data;
}
function state(resource) { const value = resource?.attributes?.assetDeliveryState?.state; return ['AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'COMPLETE', 'FAILED'].includes(value) ? value : 'UNKNOWN'; }
function imageDescriptor(image) { const { family, path, width, height, fileSize, sha256, md5, fileName } = image; return { family, path, width, height, fileSize, sha256, md5, fileName }; }
export function inspectReviewPNG(data, path = null) {
  // Select the validator from the actual PNG header; preserve every original byte.
  const nativePad = Buffer.isBuffer(data) && data.length >= 24
    && [[2064, 2752], [2048, 2732]].some(([width, height]) => data.readUInt32BE(16) === width && data.readUInt32BE(20) === height);
  return { ...inspectPNG(data, nativePad ? 'iPad' : 'iPhone', path), fileName: FILE_NAME };
}
function reviewedImage(image, reviewedSha256) {
  check(image && Buffer.isBuffer(image.data), 'A native reviewed PNG is required.');
  const checked = inspectReviewPNG(image.data, image.path);
  check(stable(imageDescriptor(checked)) === stable(imageDescriptor(image)), 'Review screenshot bytes or descriptor changed.');
  check(typeof reviewedSha256 === 'string' && /^[a-f0-9]{64}$/.test(reviewedSha256) && reviewedSha256 === checked.sha256,
    'Manual visual review must identify the exact screenshot SHA-256.');
  return checked;
}
export function assertReviewRequest(method, path) {
  check(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[?#]/.test(path), 'Review asset route is forbidden.');
  if (method === 'GET' && ['/v1/apps', `/v1/apps/${APP_ID}/appStoreVersions`, `/v1/apps/${APP_ID}/inAppPurchasesV2`].includes(path)) return;
  if (method === 'POST' && path === `/v1/${TYPE}`) return;
  const match = path.match(new RegExp(`^/v1/${TYPE}/([^/]+)$`));
  let id; try { id = match && decodeURIComponent(match[1]); } catch (_) { throw new AssetsError('Review asset route is forbidden.'); }
  check(match && rid(id) === match[1] && ['GET', 'PATCH'].includes(method), 'Review asset route is forbidden.');
}
async function readJSON(response) {
  const reader = response.body?.getReader(); check(reader, 'Apple review response is invalid.');
  let total = 0; const chunks = [];
  try {
    while (true) { const item = await reader.read(); if (item.done) break; total += item.value.byteLength; check(total <= 1024 * 1024, 'Apple review response is too large.'); chunks.push(Buffer.from(item.value)); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) { throw new AssetsError('Apple review response could not be verified.'); }
  finally { reader.releaseLock(); }
}
export function createReviewClient(session, { fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  validateSession(session, now()); let requests = 0;
  const deadline = Math.min(Date.now() + 240000, (session.expiresAt - 10) * 1000), capabilities = new WeakMap();
  function remaining() { validateSession(session, now()); check(Date.now() < deadline && ++requests <= 80, 'Review asset request budget expired.'); return Math.min(20000, Math.max(1, deadline - Date.now())); }
  return {
    validateOperations(operations, image) {
      const checked = validateUploadOperations(operations, image, session.token);
      for (const operation of checked) capabilities.set(operation, image.sha256);
      return checked;
    },
    async request(method, path, parameters = {}, body) {
      assertReviewRequest(method, path); const timeout = remaining(), url = new URL(path, ORIGIN); url.search = new URLSearchParams(parameters).toString();
      if (method === 'POST') check(body?.data?.type === TYPE && body.data.attributes?.fileName === FILE_NAME
        && Number.isSafeInteger(body.data.attributes.fileSize) && body.data.attributes.fileSize > 0 && body.data.attributes.fileSize <= 10 * 1024 * 1024
        && relation(body.data, 'inAppPurchaseV2')?.type === 'inAppPurchases' && relation(body.data, 'inAppPurchaseV2')?.id === IAP_ID, 'Review reservation is not for the fixed product.');
      if (method === 'PATCH') check(body?.data?.type === TYPE && path === `/v1/${TYPE}/${rid(body.data.id)}` && body.data.attributes?.uploaded === true
        && /^[a-f0-9]{32}$/.test(body.data.attributes.sourceFileChecksum), 'Invalid review asset commit.');
      let response;
      try { response = await fetchImpl(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(timeout), headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
      catch (_) { throw new AssetsError('Review API request has no definitive result.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
      if (!response.ok) { try { await response.body?.cancel(); } catch (_) {} throw new AssetsError('Review API request was rejected.', { outcome: 'rejected', httpStatus: response.status }); }
      try { return await readJSON(response); }
      catch (_) { throw new AssetsError('Review API response could not be verified.', { outcome: method === 'GET' ? 'read_failed' : 'unknown' }); }
    },
    async upload(operation, image) {
      check(capabilities.get(operation) === image.sha256 && sha(image.data) === image.sha256, 'Review upload was not authorized for these bytes.');
      capabilities.delete(operation); const timeout = remaining(); let response;
      try { response = await fetchImpl(operation.url, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(timeout), headers: operation.headers,
        body: image.data.subarray(operation.offset, operation.offset + operation.length) }); }
      catch (_) { throw new AssetsError('Review bytes upload has no definitive result.', { outcome: 'unknown' }); }
      if (!response.ok) { try { await response.body?.cancel(); } catch (_) {} throw new AssetsError('Review bytes upload was rejected.', { outcome: 'rejected', httpStatus: response.status }); }
      try { await response.body?.cancel(); } catch (_) {}
    },
  };
}
const assetFields = { [`fields[${TYPE}]`]: 'fileName,fileSize,sourceFileChecksum,assetDeliveryState,inAppPurchaseV2', include: 'inAppPurchaseV2' };
function summarizeAsset(resource) {
  check(relation(resource, 'inAppPurchaseV2')?.type === 'inAppPurchases' && relation(resource, 'inAppPurchaseV2')?.id === IAP_ID, 'Review screenshot belongs to another product.');
  return { id: resource.id, fileName: resource.attributes?.fileName ?? null, fileSize: resource.attributes?.fileSize ?? null,
    md5: resource.attributes?.sourceFileChecksum?.toLowerCase() ?? null, state: state(resource) };
}
async function discover(request) {
  const apps = many(await request('GET', '/v1/apps', { 'filter[bundleId]': BUNDLE, 'fields[apps]': 'bundleId,primaryLocale', limit: '2' }), 'apps');
  check(apps.length === 1 && apps[0].id === APP_ID && apps[0].attributes?.bundleId === BUNDLE && apps[0].attributes?.primaryLocale === 'tr', 'Expected Turkish BHU application was not found.');
  const versions = many(await request('GET', `/v1/apps/${APP_ID}/appStoreVersions`, { 'filter[versionString]': VERSION, 'filter[platform]': 'IOS',
    'fields[appStoreVersions]': 'versionString,platform,appStoreState,appVersionState', limit: '200' }), 'appStoreVersions');
  check(versions.length === 1 && versions[0].attributes?.versionString === VERSION && versions[0].attributes?.platform === 'IOS'
    && (versions[0].attributes?.appVersionState ?? versions[0].attributes?.appStoreState) === 'PREPARE_FOR_SUBMISSION', 'IAP review image requires the editable BHU 1.0 iOS draft.');
  const products = many(await request('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`, { 'filter[productId]': PRODUCT_ID,
    'fields[inAppPurchases]': 'productId,inAppPurchaseType,state,appStoreReviewScreenshot', include: 'appStoreReviewScreenshot', limit: '2' }), 'inAppPurchases');
  check(products.length === 1 && products[0].id === IAP_ID && products[0].attributes?.productId === PRODUCT_ID
    && products[0].attributes?.inAppPurchaseType === 'NON_CONSUMABLE', 'Expected BHU non-consumable product was not found.');
  const product = products[0]; check(['MISSING_METADATA', 'READY_TO_SUBMIT'].includes(product.attributes?.state), 'The fixed IAP is not in an editable draft state.');
  const existing = relation(product, 'appStoreReviewScreenshot'); check(existing !== undefined, 'Review screenshot relationship could not be verified.');
  let screenshot = null;
  if (existing !== null) {
    check(existing?.type === TYPE, 'Unexpected review screenshot relationship.');
    const resource = one(await request('GET', `/v1/${TYPE}/${rid(existing.id)}`, assetFields), TYPE);
    check(resource.id === existing.id, 'Existing review screenshot identifier changed.'); screenshot = summarizeAsset(resource);
  }
  return { appId: APP_ID, bundleId: BUNDLE, version: VERSION, versionId: versions[0].id, draftState: 'PREPARE_FOR_SUBMISSION',
    iapId: IAP_ID, productId: PRODUCT_ID, inAppPurchaseType: 'NON_CONSUMABLE', iapState: product.attributes.state, screenshot };
}
export async function compileReviewPlan({ request, image, reviewedSha256 }) {
  const checked = reviewedImage(image, reviewedSha256), baseline = await discover(request), existing = baseline.screenshot;
  if (existing) check(existing.fileName === checked.fileName && existing.fileSize === checked.fileSize && existing.md5 === checked.md5 && existing.state === 'COMPLETE',
    'Existing IAP review screenshot is preserved; it is not an exact completed match.');
  const material = { schemaVersion: 1, appId: APP_ID, iapId: IAP_ID, productId: PRODUCT_ID, baseline, image: imageDescriptor(checked),
    reviewedSha256, action: existing ? 'reuse' : 'upload' };
  return { ...material, planHash: digest(material) };
}
function safeReceipt(plan) {
  return { schemaVersion: 1, appId: APP_ID, iapId: IAP_ID, productId: PRODUCT_ID, completed: false,
    asset: { id: plan.baseline.screenshot?.id ?? null, family: plan.image.family, fileName: plan.image.fileName, sha256: plan.image.sha256, md5: plan.image.md5,
      created: false, state: plan.action === 'reuse' ? 'COMPLETE' : 'NOT_STARTED' },
    doesNotVerify: ['Real-device StoreKit purchasing or displayed price', 'App Review submission or approval'] };
}
export async function applyReviewPlan({ client, plan, image, reviewedSha256, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), pollAttempts = 16 }) {
  const fresh = await compileReviewPlan({ request: client.request, image, reviewedSha256 }), { planHash, ...material } = plan ?? {};
  check(planHash === digest(material) && stable(plan) === stable(fresh), 'IAP review screenshot plan is stale or changed.');
  check(Number.isSafeInteger(pollAttempts) && pollAttempts > 0 && pollAttempts <= 20, 'Invalid review asset polling budget.');
  const receipt = safeReceipt(fresh);
  try {
    if (fresh.action === 'upload') {
      receipt.asset.state = 'RESERVING';
      const reserved = one(await client.request('POST', `/v1/${TYPE}`, {}, { data: { type: TYPE, attributes: { fileName: image.fileName, fileSize: image.fileSize },
        relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: IAP_ID } } } } }), TYPE);
      receipt.asset.id = reserved.id; receipt.asset.created = true; receipt.asset.state = state(reserved);
      const parent = relation(reserved, 'inAppPurchaseV2'); check(!parent || parent.type === 'inAppPurchases' && parent.id === IAP_ID, 'Reserved review screenshot belongs to another product.');
      check(reserved.attributes?.fileName === image.fileName && reserved.attributes?.fileSize === image.fileSize, 'Reserved review screenshot does not match the file.');
      const operations = client.validateOperations(reserved.attributes?.uploadOperations, image);
      receipt.asset.state = 'UPLOADING'; for (const operation of operations) await client.upload(operation, image);
      receipt.asset.state = 'COMMITTING';
      const committed = one(await client.request('PATCH', `/v1/${TYPE}/${rid(reserved.id)}`, {}, { data: { type: TYPE, id: reserved.id,
        attributes: { uploaded: true, sourceFileChecksum: image.md5 } } }), TYPE);
      check(committed.id === reserved.id, 'Review commit returned another screenshot.'); receipt.asset.state = state(committed);
      for (let attempt = 0; attempt < pollAttempts; attempt++) {
        check(receipt.asset.state !== 'FAILED', 'Apple reported failed review screenshot processing.'); await wait(2000);
        const processed = one(await client.request('GET', `/v1/${TYPE}/${rid(reserved.id)}`, assetFields), TYPE);
        check(processed.id === reserved.id, 'Processed review screenshot identifier changed.'); const actual = summarizeAsset(processed);
        check(actual.fileName === image.fileName && actual.fileSize === image.fileSize && actual.md5 === image.md5, 'Processed review screenshot file differs from the reviewed original.');
        receipt.asset.state = actual.state; if (actual.state === 'COMPLETE') break;
      }
      check(receipt.asset.state === 'COMPLETE', 'Review screenshot processing is incomplete; inspect its recorded ID before retrying.');
    }
    receipt.completed = receipt.asset.state === 'COMPLETE'; return receipt;
  } catch (error) {
    receipt.failure = { message: error instanceof AssetsError ? error.message : 'IAP review screenshot preparation stopped.',
      outcome: error.outcome ?? 'stopped', ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}), inspectCreatedResourcesBeforeRetry: true };
    throw new AssetsError(receipt.failure.message, { receipt });
  }
}
function guardedPath(path, privateFile, newFile = false) {
  check(typeof path === 'string' && !path.includes('\0'), 'Invalid review asset file path.');
  const absolute = resolve(path), base = privateFile ? PRIVATE : ROOT, part = relative(base, absolute);
  check(part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
    && (privateFile || absolute !== PRIVATE && !absolute.startsWith(PRIVATE + sep)), privateFile ? 'Review private files must remain under .ios-signing.' : 'Review receipt must remain in the workspace outside .ios-signing.');
  let current = ROOT;
  for (const piece of relative(ROOT, absolute).split(sep)) {
    current = resolve(current, piece);
    try {
      const info = lstatSync(current); check(!info.isSymbolicLink(), 'Review asset file symlinks are forbidden.');
      check(!newFile || current !== absolute, 'A new review output file is required.');
      check(current === absolute || info.isDirectory(), 'Review file parent is not a directory.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return absolute;
}
function privateJSON(path) {
  const absolute = guardedPath(path, true), info = lstatSync(absolute);
  check(info.isFile() && !(info.mode & 0o077) && info.size <= 131072, 'Review private input is unavailable or has unsafe permissions.');
  let fd; try { fd = openSync(absolute, FS.O_RDONLY | FS.O_NOFOLLOW); return JSON.parse(readFileSync(fd, 'utf8')); }
  catch (_) { throw new AssetsError('Review private input could not be read.'); } finally { if (fd !== undefined) closeSync(fd); }
}
function openOutput(path, privateFile) {
  const absolute = guardedPath(path, privateFile, true); mkdirSync(dirname(absolute), { recursive: true, mode: privateFile ? 0o700 : 0o755 });
  return openSync(absolute, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
}
function parse(argv) {
  const mode = argv[0], flags = mode === '--plan' ? ['--session', '--image', '--reviewed-sha256', '--output']
    : ['--session', '--image', '--reviewed-sha256', '--plan', '--output'];
  check(['--plan', '--apply'].includes(mode) && argv.length === 1 + flags.length * 2, 'Use --plan or --apply with session, image, reviewed-sha256 and output.');
  const args = {};
  for (let n = 1; n < argv.length; n += 2) { check(flags.includes(argv[n]) && !Object.hasOwn(args, argv[n]) && argv[n + 1] && !argv[n + 1].startsWith('--'), 'Invalid IAP review screenshot argument.'); args[argv[n]] = argv[n + 1]; }
  return { mode, args };
}
async function main(argv) {
  const { mode, args } = parse(argv), session = privateJSON(args['--session']), path = resolve(args['--image']), info = lstatSync(path);
  check(info.isFile() && !info.isSymbolicLink() && info.size <= 10 * 1024 * 1024, 'Review screenshot input is unavailable or too large.');
  const image = inspectReviewPNG(readFileSync(path), path), reviewedSha256 = args['--reviewed-sha256']; reviewedImage(image, reviewedSha256);
  const client = createReviewClient(session);
  if (mode === '--plan') {
    const plan = await compileReviewPlan({ request: client.request, image, reviewedSha256 }); const fd = openOutput(args['--output'], true);
    try { writeFileSync(fd, JSON.stringify(plan, null, 2) + '\n'); } finally { closeSync(fd); }
    console.log(JSON.stringify({ planned: true, appId: APP_ID, iapId: IAP_ID, action: plan.action, sha256: image.sha256, planHash: plan.planHash })); return;
  }
  const plan = privateJSON(args['--plan']), fd = openOutput(args['--output'], false); let receipt;
  try {
    try { receipt = await applyReviewPlan({ client, plan, image, reviewedSha256 }); }
    catch (error) {
      if (error.receipt) receipt = error.receipt;
      else {
        writeFileSync(fd, JSON.stringify({ schemaVersion: 1, appId: APP_ID, iapId: IAP_ID, completed: false, asset: null,
          failure: { message: error instanceof AssetsError ? error.message : 'Review screenshot stopped before mutation.', outcome: 'stopped' } }, null, 2) + '\n'); throw error;
      }
    }
    writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n');
  } finally { closeSync(fd); }
  console.log(JSON.stringify(receipt)); if (!receipt.completed) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof AssetsError ? error.message : 'IAP review screenshot preparation failed without publishing private data.'); process.exitCode = 1;
});
