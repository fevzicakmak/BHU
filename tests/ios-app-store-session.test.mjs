import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { APP_ID, PRIVATE_ROOT, PURPOSE, TTL_SECONDS, SessionError, assertPrivatePath, openSession, openSessionFile, prepareRecipient, sealSession } from '../scripts/ios-app-store-session.mjs';

const NOW = 1795796000, SOURCE = 'a'.repeat(40);
const recipient = generateKeyPairSync('rsa', { modulusLength: 4096, publicKeyEncoding: { format: 'pem', type: 'spki' }, privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
const api = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
const apiEnv = { APP_STORE_CONNECT_KEY_ID: 'ABCDEF1234', APP_STORE_CONNECT_ISSUER_ID: '12345678-1234-1234-1234-123456789abc', APP_STORE_CONNECT_PRIVATE_KEY: api.privateKey };
const NONCE = randomBytes(32).toString('base64url');
const seal = patch => sealSession({ recipientPublicKey: recipient.publicKey, requestNonce: NONCE, sourceCommit: SOURCE, env: apiEnv, nowSeconds: NOW, ...patch });
const open = (envelope, patch) => openSession({ envelope, privateKey: recipient.privateKey, expectedNonce: NONCE, nowSeconds: NOW + 20, ...patch });

function privateTestDirectory() {
  mkdirSync(PRIVATE_ROOT, { recursive: true, mode: 0o700 });
  return mkdtempSync(join(PRIVATE_ROOT, 'session-safety-test-'));
}

test('encrypted handoff round-trips only the intended five-minute BHU API session', () => {
  const envelope = seal(), session = open(envelope);
  assert.equal(session.appId, APP_ID); assert.equal(session.purpose, PURPOSE);
  assert.equal(session.sourceCommit, SOURCE); assert.equal(session.expiresAt, NOW + TTL_SECONDS);
  const token = session.token.split('.');
  assert.equal(JSON.parse(Buffer.from(token[0], 'base64url')).alg, 'ES256');
  const claims = JSON.parse(Buffer.from(token[1], 'base64url'));
  assert.equal(claims.aud, 'appstoreconnect-v1'); assert.equal(claims.exp - claims.iat, 300);
  const output = JSON.stringify(envelope);
  for (const secret of [session.token, api.privateKey, recipient.privateKey, 'BEGIN PRIVATE KEY', 'Authorization', 'Bearer ']) assert(!output.includes(secret));
});

test('randomized content encryption produces a different envelope for the same authorized request', () => {
  const a = seal(), b = seal();
  assert.notEqual(a.iv, b.iv); assert.notEqual(a.ciphertext, b.ciphertext); assert.notEqual(a.wrappedKey, b.wrappedKey);
  assert.equal(open(a).appId, APP_ID); assert.equal(open(b).appId, APP_ID);
});

test('tampering with content, wrapped key, authentication tag or bound source is rejected', () => {
  const envelope = seal();
  for (const field of ['ciphertext', 'wrappedKey', 'tag']) {
    const bytes = Buffer.from(envelope[field], 'base64url'); bytes[0] ^= 1;
    assert.throws(() => open({ ...envelope, [field]: bytes.toString('base64url') }), SessionError);
  }
  assert.throws(() => open({ ...envelope, sourceCommit: 'b'.repeat(40) }), SessionError);
});

test('expired, mismatched nonce, wrong application/purpose and extra-field envelopes are rejected before use', () => {
  const envelope = seal();
  assert.throws(() => open(envelope, { nowSeconds: NOW + 300 }), /expired|lifetime/);
  assert.throws(() => open(envelope, { nowSeconds: NOW - 31 }), /expired|lifetime/);
  assert.throws(() => open(envelope, { expectedNonce: randomBytes(32).toString('base64url') }), /nonce/);
  assert.throws(() => open({ ...envelope, expiresAt: NOW + 301 }), /expired|lifetime/);
  assert.throws(() => open({ ...envelope, appId: 'other' }), /purpose or application/);
  assert.throws(() => open({ ...envelope, purpose: 'other' }), /purpose or application/);
  assert.throws(() => open({ ...envelope, token: 'unexpected-plaintext' }), /envelope/);
});

test('recipient validation rejects private, weak, non-RSA and trailing-content keys', () => {
  const weak = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { format: 'pem', type: 'spki' } });
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { format: 'pem', type: 'spki' } });
  for (const key of [recipient.privateKey, weak.publicKey, ec.publicKey, recipient.publicKey + '\nPRIVATE', 'not-a-public-key']) {
    assert.throws(() => seal({ recipientPublicKey: key }), /RSA-4096 public key/);
  }
  assert.throws(() => seal({ requestNonce: 'invalid' }), /encoding/);
  assert.throws(() => seal({ sourceCommit: 'main' }), /source commit/);
});

test('a different recipient private key cannot open the encrypted session', () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 4096, privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
  assert.throws(() => open(seal(), { privateKey: other.privateKey }), /authenticate or open/);
});

test('private-path guards reject public paths, traversal, symlink directories and files', () => {
  const dir = privateTestDirectory();
  try {
    assert.throws(() => assertPrivatePath('/tmp/public-token.json'), /under .ios-signing/);
    assert.throws(() => assertPrivatePath(join(PRIVATE_ROOT, '../public.json')), /under .ios-signing/);
    assert.throws(() => assertPrivatePath(PRIVATE_ROOT), /under .ios-signing/);
    symlinkSync('/tmp', join(dir, 'linked'));
    assert.throws(() => assertPrivatePath(join(dir, 'linked', 'token.json')), /Symbolic links/);
    writeFileSync(join(dir, 'value'), 'private', { mode: 0o600 });
    symlinkSync(join(dir, 'value'), join(dir, 'linked-file'));
    assert.throws(() => assertPrivatePath(join(dir, 'linked-file')), /Symbolic links/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('opening writes the token only to a new private session file and refuses an overwrite', () => {
  const dir = privateTestDirectory();
  try {
    const envelopePath = join(dir, 'envelope.json'), privateKeyPath = join(dir, 'private.pem'), noncePath = join(dir, 'nonce.txt'), outputPath = join(dir, 'session.json');
    writeFileSync(envelopePath, JSON.stringify(seal()), { mode: 0o600 });
    writeFileSync(privateKeyPath, recipient.privateKey, { mode: 0o600 }); writeFileSync(noncePath, NONCE + '\n', { mode: 0o600 });
    const result = openSessionFile({ envelopePath, privateKeyPath, noncePath, outputPath, nowSeconds: NOW + 20 });
    assert.equal(lstatSync(outputPath).mode & 0o777, 0o600);
    assert.equal(lstatSync(dir).mode & 0o777, 0o700);
    const data = JSON.parse(readFileSync(outputPath));
    assert.equal(data.appId, APP_ID); assert.equal(data.expiresAt, NOW + TTL_SECONDS);
    assert(!JSON.stringify(result).includes(data.token));
    assert.throws(() => openSessionFile({ envelopePath, privateKeyPath, noncePath, outputPath, nowSeconds: NOW + 20 }), /already exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public-readable recipient secrets and unsafe output paths cannot be used', () => {
  const dir = privateTestDirectory();
  try {
    const envelopePath = join(dir, 'envelope.json'), privateKeyPath = join(dir, 'private.pem'), noncePath = join(dir, 'nonce.txt');
    writeFileSync(envelopePath, JSON.stringify(seal()), { mode: 0o600 }); writeFileSync(privateKeyPath, recipient.privateKey, { mode: 0o600 }); writeFileSync(noncePath, NONCE, { mode: 0o600 });
    chmodSync(privateKeyPath, 0o644);
    assert.throws(() => openSessionFile({ envelopePath, privateKeyPath, noncePath, outputPath: join(dir, 'session.json'), nowSeconds: NOW + 20 }), /public/);
    assert.throws(() => openSessionFile({ envelopePath, privateKeyPath, noncePath, outputPath: '/tmp/public-session.json', nowSeconds: NOW + 20 }), /under .ios-signing/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('recipient preparation emits public request data while private key and nonce stay in mode0600 files', () => {
  const dir = privateTestDirectory(), recipientPath = join(dir, 'recipient');
  try {
    const result = prepareRecipient(recipientPath);
    assert.match(result.recipientPublicKey, /^-----BEGIN PUBLIC KEY-----/);
    assert.equal(Buffer.from(result.requestNonce, 'base64url').length, 32);
    const secret = readFileSync(result.privateKeyPath, 'utf8');
    assert(!JSON.stringify(result).includes(secret));
    assert.equal(lstatSync(result.privateKeyPath).mode & 0o777, 0o600);
    assert.equal(lstatSync(result.noncePath).mode & 0o777, 0o600);
    assert.throws(() => prepareRecipient(recipientPath), /already exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI refuses sealing outside authorized CI without echoing API secrets', () => {
  let output = '';
  try {
    execFileSync(process.execPath, ['scripts/ios-app-store-session.mjs', '--seal', '--output', 'test-artifacts/authorized-store-session/envelope.json'],
      { cwd: new URL('..', import.meta.url), env: { ...process.env, ...apiEnv, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail('Unauthorized sealing should fail');
  } catch (error) { output = String(error.stdout || '') + String(error.stderr || ''); }
  assert.match(output, /owner-authorized manual workflow/);
  assert(!output.includes(api.privateKey)); assert(!output.includes('Bearer '));
});

test('CLI denies non-owner dispatchers and rerun actors before touching session inputs or outputs', () => {
  const base = { ...process.env, ...apiEnv, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'fevzicakmak/BHU', GITHUB_ACTOR: 'fevzicakmak', GITHUB_TRIGGERING_ACTOR: 'fevzicakmak' };
  for (const patch of [{ GITHUB_ACTOR: 'collaborator' }, { GITHUB_TRIGGERING_ACTOR: 'collaborator' }, { GITHUB_ACTOR: '' }, { GITHUB_TRIGGERING_ACTOR: '' }]) {
    let output = '';
    try {
      execFileSync(process.execPath, ['scripts/ios-app-store-session.mjs', '--seal', '--output', '/tmp/bhu-owner-guard-must-not-write.json'],
        { cwd: new URL('..', import.meta.url), env: { ...base, ...patch }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      assert.fail('Non-owner sealing should fail');
    } catch (error) { output = String(error.stdout || '') + String(error.stderr || ''); }
    assert.match(output, /owner-authorized manual workflow/);
    assert(!output.includes(api.privateKey)); assert(!output.includes('Bearer '));
  }
});

test('CLI accepts the exact owner dispatcher/rerun context before applying output confinement', () => {
  let output = '';
  try {
    execFileSync(process.execPath, ['scripts/ios-app-store-session.mjs', '--seal', '--output', '/tmp/bhu-owner-guard-must-not-write.json'],
      { cwd: new URL('..', import.meta.url), env: { ...process.env, ...apiEnv, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'fevzicakmak/BHU', GITHUB_ACTOR: 'fevzicakmak', GITHUB_TRIGGERING_ACTOR: 'fevzicakmak' },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail('Public output must still be rejected');
  } catch (error) { output = String(error.stdout || '') + String(error.stderr || ''); }
  assert.match(output, /Encrypted session output path is not permitted/);
  assert.doesNotMatch(output, /owner-authorized manual workflow/);
  assert(!output.includes(api.privateKey)); assert(!output.includes('Bearer '));
});
