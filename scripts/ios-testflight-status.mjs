#!/usr/bin/env node
/** Read-only App Store Connect processing status; never uploads or edits a build. */
import { createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUNDLE_ID = 'com.fevzicakmak.bhu';
const ORIGIN = 'https://api.appstoreconnect.apple.com';
const MAX_RESPONSE = 1024 * 1024;
export class StatusError extends Error {}
const checked = (condition, message) => { if (!condition) throw new StatusError(message); };

export function createToken(env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const kid = env.APP_STORE_CONNECT_KEY_ID?.trim();
  const issuer = env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  checked(/^[A-Z0-9]{10}$/.test(kid || ''), 'Invalid APP_STORE_CONNECT_KEY_ID.');
  checked(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuer || ''), 'Invalid APP_STORE_CONNECT_ISSUER_ID.');
  checked(Number.isSafeInteger(nowSeconds) && nowSeconds > 0, 'Invalid token timestamp.');
  try {
    const pem = env.APP_STORE_CONNECT_PRIVATE_KEY;
    checked(typeof pem === 'string' && pem.trim().startsWith('-----BEGIN PRIVATE KEY-----'), 'Invalid App Store Connect private key.');
    const key = createPrivateKey(pem);
    checked(key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1', 'Invalid App Store Connect private key.');
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encode({ alg: 'ES256', kid, typ: 'JWT' })}.${encode({ iss: issuer, iat: nowSeconds, exp: nowSeconds + 300, aud: 'appstoreconnect-v1' })}`;
    return `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  } catch (_) { throw new StatusError('Invalid App Store Connect private key.'); }
}

function identifier(value) {
  checked(typeof value === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(value), 'Invalid App Store Connect resource identifier.');
  return value;
}

async function jsonResponse(response, stage) {
  const reader = response.body?.getReader();
  checked(reader, `${stage} returned an invalid response.`);
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) { await reader.cancel(); throw new StatusError(`${stage} response exceeded the size limit.`); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof StatusError) throw error;
    throw new StatusError(`${stage} returned an invalid response.`);
  } finally { reader.releaseLock(); }
}

export async function getStatus({ version, build, env = process.env, fetchImpl = globalThis.fetch, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const numericVersion = value => typeof value === 'string' && /^[1-9][0-9]{0,3}(?:\.[0-9]{1,2}){0,2}$/.test(value);
  checked(numericVersion(version) && numericVersion(build), 'Version and build must be valid numeric Apple version strings.');
  createToken(env, nowSeconds); // Validate credentials before any network request.
  async function get(path, parameters, stage, optional = false) {
    const url = new URL(path, ORIGIN);
    if (parameters) url.search = new URLSearchParams(parameters).toString();
    // Use standard Team API claims; requests below enforce GET and the exact BHU filters.
    const token = createToken(env, nowSeconds);
    let response;
    try {
      response = await fetchImpl(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch (_) { throw new StatusError(`${stage} request failed.`); }
    if (optional && [403, 404].includes(response.status)) {
      try { await response.body?.cancel(); } catch (_) { /* Primary processing status remains valid. */ }
      return null;
    }
    const serverTime = Date.parse(response.headers?.get('date') || '');
    const clock = Number.isFinite(serverTime) ? `; server clock delta ${Math.round(serverTime / 1000 - nowSeconds)}s` : '';
    checked(response.ok, `${stage} failed (HTTP ${Number.isInteger(response.status) ? response.status : 'unknown'}${clock}).`);
    return jsonResponse(response, stage);
  }
  const apps = await get('/v1/apps', { 'filter[bundleId]': BUNDLE_ID, 'fields[apps]': 'bundleId', limit: '2' }, 'App lookup');
  checked(Array.isArray(apps.data) && apps.data.length === 1 && !apps.links?.next && apps.data[0].type === 'apps' && apps.data[0].attributes?.bundleId === BUNDLE_ID, 'App lookup did not identify exactly one BHU application.');
  const appId = identifier(apps.data[0].id);
  const output = { appId, bundleId: BUNDLE_ID, version, build, found: false, processingState: null, usesNonExemptEncryption: null, expired: null, uploadedDate: null };
  const builds = await get('/v1/builds', { 'filter[app]': appId, 'filter[version]': build, include: 'preReleaseVersion', 'fields[builds]': 'version,processingState,usesNonExemptEncryption,expired,uploadedDate,preReleaseVersion,app', 'fields[preReleaseVersions]': 'version,platform', limit: '200' }, 'Build lookup');
  checked(Array.isArray(builds.data) && !builds.links?.next, 'Build lookup returned an invalid or incomplete result.');
  if (!builds.data.length) return output;
  const candidates = builds.data.filter(item => {
    checked(item.type === 'builds' && item.attributes?.version === build, 'Build lookup returned a different build number.');
    if (item.relationships?.app?.data) checked(item.relationships.app.data.id === appId, 'Build lookup returned a different application.');
    const relationship = item.relationships?.preReleaseVersion?.data;
    const marketing = builds.included?.find(value => value.type === 'preReleaseVersions' && value.id === relationship?.id);
    checked(marketing, 'Build lookup omitted the marketing version relationship.');
    return marketing.attributes?.version === version && marketing.attributes?.platform === 'IOS';
  });
  checked(candidates.length === 1, 'Build lookup did not identify exactly one requested iOS marketing version.');
  const selected = candidates[0], attributes = selected.attributes;
  checked(['PROCESSING', 'FAILED', 'INVALID', 'VALID'].includes(attributes.processingState), 'Build lookup returned an invalid processing state.');
  Object.assign(output, { found: true, processingState: attributes.processingState,
    usesNonExemptEncryption: typeof attributes.usesNonExemptEncryption === 'boolean' ? attributes.usesNonExemptEncryption : null,
    expired: typeof attributes.expired === 'boolean' ? attributes.expired : null,
    uploadedDate: typeof attributes.uploadedDate === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(attributes.uploadedDate) && Number.isFinite(Date.parse(attributes.uploadedDate)) ? attributes.uploadedDate : null });
  const detail = await get(`/v1/builds/${identifier(selected.id)}/buildBetaDetail`, { 'fields[buildBetaDetails]': 'internalBuildState,externalBuildState' }, 'Beta detail lookup', true);
  if (detail) {
    const states = detail.data?.attributes;
    for (const field of ['internalBuildState', 'externalBuildState']) {
      if (typeof states?.[field] === 'string' && /^[A-Z_]{1,80}$/.test(states[field])) output[field] = states[field];
    }
  }
  return output;
}

async function main(argv) {
  checked(argv.length === 6, 'Usage: --version VERSION --build BUILD --output REPORT.json');
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    checked(['--version', '--build', '--output'].includes(argv[index]) && !options[argv[index]], 'Invalid status command arguments.');
    options[argv[index]] = argv[index + 1];
  }
  checked(options['--output'] && !options['--output'].startsWith('-'), 'Invalid report output path.');
  const status = await getStatus({ version: options['--version'], build: options['--build'] });
  try {
    const output = resolve(options['--output']); mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(status, null, 2) + '\n', { mode: 0o600 });
  } catch (_) { throw new StatusError('Could not write the sanitized status report.'); }
  console.log(status.found ? `BHU ${status.version} (${status.build}): ${status.processingState}.` : `BHU ${status.version} (${status.build}): build not found yet.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof StatusError ? error.message : 'Status check failed.'); process.exitCode = 1; });
}
