import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createToken, getStatus, StatusError } from '../scripts/ios-testflight-status.mjs';

const NOW = 1_795_000_000;
const BUNDLE = 'com.fevzicakmak.bhu';
const APP = '1234567890';
const BUILD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRE_RELEASE = '11111111-2222-4333-8444-555555555555';
const keys = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
});
const credentials = () => ({
  APP_STORE_CONNECT_KEY_ID: 'ABCDEF1234',
  APP_STORE_CONNECT_ISSUER_ID: '12345678-1234-1234-1234-123456789ABC',
  APP_STORE_CONNECT_PRIVATE_KEY: keys.privateKey,
});
const app = () => ({ type: 'apps', id: APP, attributes: { bundleId: BUNDLE } });
const build = () => ({
  type: 'builds', id: BUILD,
  attributes: { version: '3.1', processingState: 'VALID', usesNonExemptEncryption: false,
    expired: false, uploadedDate: '2026-11-16T12:00:00Z' },
  relationships: { preReleaseVersion: { data: { type: 'preReleaseVersions', id: PRE_RELEASE } } },
});
const preRelease = () => ({ type: 'preReleaseVersions', id: PRE_RELEASE,
  attributes: { version: '1.0', platform: 'IOS' } });
const beta = () => ({ type: 'buildBetaDetails', id: BUILD,
  attributes: { internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'READY_FOR_BETA_SUBMISSION' } });
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

function mockedAPI({ apps = [app()], builds = [build()], included = [preRelease()], betaStatus = 200,
  betaBody = { data: beta() }, failApps = null } = {}) {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    const headers = new Headers(options.headers);
    calls.push({ url, options, headers });
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.redirect, 'error');
    assert.match(headers.get('authorization') ?? '', /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const requestToken = headers.get('authorization').slice('Bearer '.length);
    const requestClaims = JSON.parse(Buffer.from(requestToken.split('.')[1], 'base64url'));
    assert.equal(requestClaims.aud, 'appstoreconnect-v1');
    assert.equal(requestClaims.scope, undefined, 'Use the standard Team API token claims');
    if (url.pathname === '/v1/apps') {
      assert.equal(url.searchParams.get('filter[bundleId]'), BUNDLE);
      if (failApps) return failApps;
      return response({ data: apps });
    }
    if (url.pathname === '/v1/builds') {
      assert.equal(url.searchParams.get('filter[app]'), APP);
      assert.equal(url.searchParams.get('filter[version]'), '3.1');
      assert(url.searchParams.get('include')?.split(',').includes('preReleaseVersion'));
      return response({ data: builds, included });
    }
    if (url.pathname === `/v1/builds/${BUILD}/buildBetaDetail`) return response(betaBody, betaStatus);
    throw new Error('Unexpected API endpoint in read-only status check');
  };
  return { fetchImpl, calls };
}
async function status(mock, patch = {}) {
  return getStatus({ version: '1.0', build: '3.1', env: credentials(), nowSeconds: NOW,
    fetchImpl: mock.fetchImpl, ...patch });
}

function isStatusError(error) { assert(error instanceof StatusError); return true; }

test('token is a short-lived verifiable ES256 JWT with the requested issuer and key ID', () => {
  const env = credentials();
  const token = createToken(env, NOW);
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const signature = Buffer.from(parts[2], 'base64url');
  assert.equal(header.alg, 'ES256'); assert.equal(header.kid, env.APP_STORE_CONNECT_KEY_ID);
  assert.equal(payload.iss, env.APP_STORE_CONNECT_ISSUER_ID);
  assert.equal(payload.aud, 'appstoreconnect-v1');
  assert(Number.isInteger(payload.exp) && payload.exp > NOW && payload.exp <= NOW + 1200);
  if (payload.iat !== undefined) assert.equal(payload.iat, NOW);
  assert.equal(signature.length, 64, 'ES256 signature must be IEEE-P1363, not DER');
  assert(verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, signature));
  assert(!token.includes('PRIVATE KEY'));
});

test('missing or malformed API credentials are rejected without echoing private material', () => {
  const cases = Object.keys(credentials()).map(key => ({ ...credentials(), [key]: '' }));
  cases.push({ ...credentials(), APP_STORE_CONNECT_PRIVATE_KEY: 'synthetic-invalid-private-key-secret' });
  cases.push({ ...credentials(), APP_STORE_CONNECT_ISSUER_ID: 'not-an-issuer-uuid' });
  cases.push({ ...credentials(), APP_STORE_CONNECT_KEY_ID: 'bad\nkey' });
  const otherCurve = generateKeyPairSync('ec', { namedCurve: 'secp384r1',
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
  cases.push({ ...credentials(), APP_STORE_CONNECT_PRIVATE_KEY: otherCurve.privateKey });
  for (const env of cases) assert.throws(() => createToken(env, NOW), error => {
    isStatusError(error);
    assert(!String(error.message).includes('synthetic-invalid-private-key-secret'));
    assert(!String(error.message).includes('BEGIN PRIVATE KEY'));
    return true;
  });
});

test('correct app, build and linked iOS marketing version return processing and beta state through GET only', async () => {
  const mock = mockedAPI();
  const result = await status(mock);
  assert.equal(result.appId, APP); assert.equal(result.bundleId, BUNDLE);
  assert.equal(result.version, '1.0'); assert.equal(result.build, '3.1');
  assert.equal(result.found, true); assert.equal(result.processingState, 'VALID');
  assert.equal(result.usesNonExemptEncryption, false); assert.equal(result.expired, false);
  assert.equal(result.uploadedDate, '2026-11-16T12:00:00Z');
  assert.equal(result.internalBuildState, 'IN_BETA_TESTING');
  assert.equal(result.externalBuildState, 'READY_FOR_BETA_SUBMISSION');
  assert.equal(mock.calls.length, 3);
  assert(!JSON.stringify(result).includes(keys.privateKey));
  assert(!JSON.stringify(result).includes('Bearer '));
});

test('an empty exact-build query reports found:false without fabricating processing success', async () => {
  const mock = mockedAPI({ builds: [], included: [] });
  const result = await status(mock);
  assert.equal(result.found, false); assert.equal(result.processingState, null);
  assert.equal(result.version, '1.0'); assert.equal(result.build, '3.1');
  assert.equal(mock.calls.length, 2);
});

test('a different marketing version is rejected even when another unrelated included version matches', async () => {
  const wrong = preRelease(); wrong.attributes.version = '2.0';
  const unrelated = preRelease(); unrelated.id = '99999999-2222-4333-8444-555555555555';
  const mock = mockedAPI({ included: [wrong, unrelated] });
  await assert.rejects(status(mock), isStatusError);
  assert.equal(mock.calls.length, 2);
});

test('non-iOS pre-release versions cannot masquerade as the requested iOS build', async () => {
  const wrong = preRelease(); wrong.attributes.platform = 'MAC_OS';
  await assert.rejects(status(mockedAPI({ included: [wrong] })), isStatusError);
});

test('a returned different build number is never reported as the requested build', async () => {
  const wrong = build(); wrong.attributes.version = '4.0';
  const mock = mockedAPI({ builds: [wrong] });
  let result;
  try { result = await status(mock); }
  catch (error) { isStatusError(error); return; }
  assert.equal(result.found, false);
  assert.equal(result.processingState, null);
});

test('the app lookup must identify exactly one app instead of selecting an ambiguous result', async () => {
  for (const apps of [[], [app(), { ...app(), id: '9876543210' }]]) {
    const mock = mockedAPI({ apps });
    await assert.rejects(status(mock), isStatusError);
    assert.equal(mock.calls.length, 1);
  }
});

test('optional beta-detail 403 or 404 does not discard verified basic build status', async () => {
  for (const betaStatus of [403, 404]) {
    const mock = mockedAPI({ betaStatus, betaBody: { errors: [{ detail: 'synthetic-private-server-message' }] } });
    const result = await status(mock);
    assert.equal(result.found, true); assert.equal(result.processingState, 'VALID');
    assert.equal(result.internalBuildState, undefined); assert.equal(result.externalBuildState, undefined);
    assert(!JSON.stringify(result).includes('synthetic-private-server-message'));
  }
});

test('API failures are sanitized and never return server bodies or bearer tokens', async () => {
  const marker = 'synthetic-private-server-body-do-not-disclose';
  const mock = mockedAPI({ failApps: response({ errors: [{ detail: marker }] }, 500) });
  await assert.rejects(status(mock), error => {
    isStatusError(error);
    const visible = String(error.message) + JSON.stringify(error);
    assert(!visible.includes(marker)); assert(!visible.includes('Bearer '));
    assert(!visible.includes(keys.privateKey));
    const auth = mock.calls[0].headers.get('authorization');
    assert(!visible.includes(auth.slice('Bearer '.length)));
    return true;
  });
});

test('transport or redirect failures become sanitized StatusError without sending writes', async () => {
  let called = false;
  const marker = 'synthetic-network-details-secret';
  const fetchImpl = async (input, options) => {
    called = true; assert.equal(new URL(input).origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(options.method ?? 'GET', 'GET'); assert.equal(options.redirect, 'error');
    throw new Error(`${marker} ${new Headers(options.headers).get('authorization')}`);
  };
  await assert.rejects(getStatus({ version: '1.0', build: '3.1', env: credentials(), fetchImpl, nowSeconds: NOW }), error => {
    isStatusError(error); assert(!String(error.message).includes(marker)); assert(!String(error.message).includes('Bearer ')); return true;
  });
  assert(called);
});
