#!/usr/bin/env node
/** Owner-authorized, five-minute App Store API session handoff. P8 keys never leave CI. */
import { constants, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { constants as FS, closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToken } from './ios-testflight-status.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PRIVATE_ROOT = resolve(ROOT, '.ios-signing');
export const APP_ID = '6835483226';
export const PURPOSE = 'BHU App Store draft preparation';
export const TTL_SECONDS = 300;
const MAX_INPUT = 32768;
const ENVELOPE_KEYS = ['schemaVersion', 'purpose', 'appId', 'sourceCommit', 'issuedAt', 'expiresAt', 'requestNonce', 'wrapAlgorithm', 'contentAlgorithm', 'wrappedKey', 'iv', 'tag', 'ciphertext'];
export class SessionError extends Error {}
const check = (condition, message) => { if (!condition) throw new SessionError(message); };
const seconds = () => Math.floor(Date.now() / 1000);

function base64url(value, bytes, maximum = bytes) {
  check(typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value), 'Invalid session encoding.');
  const decoded = Buffer.from(value, 'base64url');
  check(decoded.toString('base64url') === value && decoded.length >= bytes && decoded.length <= maximum, 'Invalid session encoding.');
  return decoded;
}

function nonce(value) {
  base64url(value, 32);
  return value;
}

function recipientKey(pem) {
  check(typeof pem === 'string' && pem.length <= 8192 && /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\r\n]+\n-----END PUBLIC KEY-----\s*$/.test(pem.trim()), 'Recipient must be an RSA-4096 public key.');
  try {
    const key = createPublicKey(pem);
    check(key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails?.modulusLength === 4096, 'Recipient must be an RSA-4096 public key.');
    return key;
  } catch (_) { throw new SessionError('Recipient must be an RSA-4096 public key.'); }
}

function privateRecipientKey(pem) {
  check(typeof pem === 'string' && pem.length <= 16384 && pem.trim().startsWith('-----BEGIN PRIVATE KEY-----'), 'Invalid private recipient key.');
  try {
    const key = createPrivateKey(pem);
    check(key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails?.modulusLength === 4096, 'Invalid private recipient key.');
    return key;
  } catch (_) { throw new SessionError('Invalid private recipient key.'); }
}

function metadata(envelope) {
  return Object.fromEntries(ENVELOPE_KEYS.slice(0, 9).map(key => [key, envelope[key]]));
}

function validateMetadata(envelope, expectedNonce, nowSeconds) {
  check(envelope && typeof envelope === 'object' && !Array.isArray(envelope)
    && Object.keys(envelope).length === ENVELOPE_KEYS.length
    && ENVELOPE_KEYS.every(key => Object.hasOwn(envelope, key)), 'Invalid session envelope.');
  check(envelope.schemaVersion === 1 && envelope.purpose === PURPOSE && envelope.appId === APP_ID
    && envelope.wrapAlgorithm === 'RSA-OAEP-256' && envelope.contentAlgorithm === 'A256GCM', 'Session purpose or application does not match.');
  check(typeof envelope.sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(envelope.sourceCommit), 'Invalid session source commit.');
  check(nonce(envelope.requestNonce) === nonce(expectedNonce), 'Session request nonce does not match.');
  check(Number.isSafeInteger(nowSeconds) && nowSeconds > 0 && Number.isSafeInteger(envelope.issuedAt) && Number.isSafeInteger(envelope.expiresAt)
    && envelope.expiresAt - envelope.issuedAt === TTL_SECONDS && envelope.issuedAt <= nowSeconds + 30
    && envelope.expiresAt > nowSeconds && envelope.issuedAt >= nowSeconds - TTL_SECONDS, 'Session is expired or has an invalid lifetime.');
}

function validateToken(token, envelope) {
  check(typeof token === 'string' && token.length <= 4096, 'Invalid decrypted API session.');
  try {
    const parts = token.split('.');
    check(parts.length === 3, 'Invalid decrypted API session.');
    const header = JSON.parse(base64url(parts[0], 1, 1024).toString('utf8'));
    const claims = JSON.parse(base64url(parts[1], 1, 2048).toString('utf8'));
    base64url(parts[2], 64);
    check(header.alg === 'ES256' && header.typ === 'JWT' && /^[A-Z0-9]{10}$/.test(header.kid || '')
      && claims.aud === 'appstoreconnect-v1' && claims.iat === envelope.issuedAt && claims.exp === envelope.expiresAt
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.iss || '')
      && claims.sub === undefined, 'Invalid decrypted API session.');
  } catch (_) { throw new SessionError('Invalid decrypted API session.'); }
}

/** Offline encryption. Only the public envelope is eligible for a CI artifact. */
export function sealSession({ recipientPublicKey, requestNonce, sourceCommit, env = process.env, nowSeconds = seconds() }) {
  const recipient = recipientKey(recipientPublicKey);
  nonce(requestNonce);
  check(typeof sourceCommit === 'string' && /^[0-9a-f]{40}$/.test(sourceCommit), 'Invalid session source commit.');
  check(Number.isSafeInteger(nowSeconds) && nowSeconds > 0, 'Invalid session timestamp.');
  const token = createToken(env, nowSeconds, 'team');
  const envelope = { schemaVersion: 1, purpose: PURPOSE, appId: APP_ID, sourceCommit, issuedAt: nowSeconds,
    expiresAt: nowSeconds + TTL_SECONDS, requestNonce, wrapAlgorithm: 'RSA-OAEP-256', contentAlgorithm: 'A256GCM' };
  validateToken(token, envelope);
  const key = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(metadata(envelope))));
    const plaintext = Buffer.from(JSON.stringify({ token }));
    let ciphertext;
    try { ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]); }
    finally { plaintext.fill(0); }
    return { ...envelope,
      wrappedKey: publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64url'),
      iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
  } catch (_) { throw new SessionError('Could not seal the API session.'); }
  finally { key.fill(0); }
}

/** Root verifies the trusted workflow source/artifact digest before calling this. */
export function openSession({ envelope, privateKey, expectedNonce, nowSeconds = seconds() }) {
  validateMetadata(envelope, expectedNonce, nowSeconds);
  const recipient = privateRecipientKey(privateKey);
  const wrapped = base64url(envelope.wrappedKey, 512), iv = base64url(envelope.iv, 12), tag = base64url(envelope.tag, 16);
  const ciphertext = base64url(envelope.ciphertext, 1, 8192);
  let key, plaintext;
  try {
    key = privateDecrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
    check(key.length === 32, 'Invalid decrypted API session.');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(JSON.stringify(metadata(envelope)))); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const value = JSON.parse(plaintext.toString('utf8'));
    check(value && Object.keys(value).length === 1 && Object.hasOwn(value, 'token'), 'Invalid decrypted API session.');
    validateToken(value.token, envelope);
    return { token: value.token, appId: APP_ID, issuedAt: envelope.issuedAt, expiresAt: envelope.expiresAt,
      sourceCommit: envelope.sourceCommit, purpose: PURPOSE };
  } catch (_) { throw new SessionError('Could not authenticate or open the API session.'); }
  finally { key?.fill(0); plaintext?.fill(0); }
}

function exists(path) {
  try { return lstatSync(path); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw new SessionError('Private file operation failed.'); }
}

function noSymlinks(path, stop) {
  let current = resolve(stop);
  const pieces = relative(current, resolve(path)).split(sep).filter(Boolean);
  const root = exists(current);
  check(!root?.isSymbolicLink() && (!root || root.isDirectory()), 'Symbolic links are not permitted for session files.');
  for (const piece of pieces) {
    current = resolve(current, piece);
    const entry = exists(current);
    check(!entry?.isSymbolicLink(), 'Symbolic links are not permitted for session files.');
  }
}

export function assertPrivatePath(path) {
  check(typeof path === 'string' && path.length > 0 && !path.includes('\0'), 'Invalid private session path.');
  const absolute = resolve(path), part = relative(PRIVATE_ROOT, absolute);
  check(part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part), 'Session files must remain under .ios-signing.');
  noSymlinks(absolute, ROOT);
  return absolute;
}

function privateDirectories(directory) {
  const target = resolve(directory);
  const part = relative(PRIVATE_ROOT, target);
  check(target === PRIVATE_ROOT || (part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)), 'Session files must remain under .ios-signing.');
  noSymlinks(target, ROOT);
  let current = ROOT;
  for (const piece of relative(ROOT, target).split(sep)) {
    current = resolve(current, piece);
    const entry = exists(current);
    if (!entry) mkdirSync(current, { mode: 0o700 });
    else check(entry.isDirectory() && (entry.mode & 0o077) === 0, 'Session directories must be private.');
  }
}

function writeNew(path, content, mode = 0o600) {
  let fd;
  try {
    fd = openSync(path, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, mode);
    fchmodSync(fd, mode); writeFileSync(fd, content);
  } catch (_) { throw new SessionError('Could not create a new session file safely.'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

function privateRead(path, maximum) {
  const absolute = assertPrivatePath(path), entry = exists(absolute);
  check(entry?.isFile() && (entry.mode & 0o077) === 0 && entry.size <= maximum, 'Private session input is missing, public, or too large.');
  let fd;
  try {
    fd = openSync(absolute, FS.O_RDONLY | FS.O_NOFOLLOW);
    return readFileSync(fd, 'utf8');
  } catch (_) { throw new SessionError('Could not read the private session input.'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function prepareRecipient(directory) {
  const folder = assertPrivatePath(directory);
  check(!exists(folder), 'Recipient folder already exists; use a fresh session folder.');
  privateDirectories(dirname(folder)); mkdirSync(folder, { mode: 0o700 });
  const pair = generateKeyPairSync('rsa', { modulusLength: 4096,
    publicKeyEncoding: { format: 'pem', type: 'spki' }, privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
  const requestNonce = randomBytes(32).toString('base64url');
  const privateKeyPath = resolve(folder, 'recipient-private.pem'), publicKeyPath = resolve(folder, 'recipient-public.pem'), noncePath = resolve(folder, 'request-nonce.txt');
  writeNew(privateKeyPath, pair.privateKey); writeNew(publicKeyPath, pair.publicKey, 0o644); writeNew(noncePath, requestNonce + '\n');
  return { recipientPublicKey: pair.publicKey, requestNonce, privateKeyPath, publicKeyPath, noncePath };
}

export function openSessionFile({ envelopePath, privateKeyPath, noncePath, outputPath, nowSeconds = seconds() }) {
  const output = assertPrivatePath(outputPath);
  check(!exists(output), 'Session output already exists; use a fresh private output file.');
  const entry = exists(resolve(envelopePath));
  check(entry?.isFile() && !entry.isSymbolicLink() && entry.size <= MAX_INPUT, 'Invalid encrypted session file.');
  let envelope;
  try { envelope = JSON.parse(readFileSync(resolve(envelopePath), 'utf8')); }
  catch (_) { throw new SessionError('Invalid encrypted session file.'); }
  const value = openSession({ envelope, privateKey: privateRead(privateKeyPath, 16384), expectedNonce: privateRead(noncePath, 256).trim(), nowSeconds });
  privateDirectories(dirname(output));
  writeNew(output, JSON.stringify(value) + '\n');
  return { opened: true, appId: APP_ID, expiresAt: value.expiresAt, outputPath: output };
}

function ciGuard(env) {
  check(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_REPOSITORY === 'fevzicakmak/BHU' && env.GITHUB_ACTOR === 'fevzicakmak' && env.GITHUB_TRIGGERING_ACTOR === 'fevzicakmak',
  'Session sealing requires the owner-authorized manual workflow on BHU main.');
}

async function main(argv) {
  if (argv.length === 2 && argv[0] === '--prepare') {
    console.log(JSON.stringify(prepareRecipient(argv[1]))); return;
  }
  if (argv.length === 3 && argv[0] === '--seal' && argv[1] === '--output') {
    ciGuard(process.env);
    const output = resolve(argv[2]), allowed = resolve(ROOT, 'test-artifacts', 'authorized-store-session');
    check(output === resolve(allowed, 'envelope.json'), 'Encrypted session output path is not permitted.');
    noSymlinks(output, ROOT); mkdirSync(allowed, { recursive: true, mode: 0o700 });
    const envelope = sealSession({ recipientPublicKey: process.env.BHU_RECIPIENT_PUBLIC_KEY, requestNonce: process.env.BHU_REQUEST_NONCE,
      sourceCommit: process.env.GITHUB_SHA, env: process.env });
    writeNew(output, JSON.stringify(envelope, null, 2) + '\n');
    console.log('Encrypted five-minute BHU API session prepared. No plaintext credential was exported.'); return;
  }
  if (argv.length === 8 && argv[0] === '--open' && argv[2] === '--key' && argv[4] === '--nonce' && argv[6] === '--output') {
    console.log(JSON.stringify(openSessionFile({ envelopePath: argv[1], privateKeyPath: argv[3], noncePath: argv[5], outputPath: argv[7] }))); return;
  }
  throw new SessionError('Usage: --prepare PRIVATE_FOLDER; --seal --output ENVELOPE.json; --open ENVELOPE.json --key PRIVATE.pem --nonce NONCE.txt --output PRIVATE_SESSION.json');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof SessionError ? error.message : 'Session operation failed without exporting credentials.'); process.exitCode = 1;
});
