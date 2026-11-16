import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { TEAM_ID, BUNDLE_ID, buildNumber, credentials, decodeBase64, requiredSecrets, inspectCertificate, validateProfile, patchAppSigning } from '../scripts/ios-signing.mjs';
const require = createRequire(import.meta.url);
const parser = require('xcode/lib/parser/pbxproj');
const certificateBytes = Buffer.from('Synthetic certificate bytes, never an Apple identity');
const certificateHash = createHash('sha256').update(certificateBytes).digest('hex').toUpperCase();
const now = new Date('2026-06-01T12:00:00Z');
const profile = () => ({
  Platform: ['iOS'], TeamIdentifier: [TEAM_ID], ApplicationIdentifierPrefix: [TEAM_ID],
  UUID: '12345678-1234-1234-1234-123456789ABC',
  CreationDate: new Date('2026-01-01T00:00:00Z'), ExpirationDate: new Date('2027-01-01T00:00:00Z'),
  DeveloperCertificates: [Buffer.from(certificateBytes)],
  Entitlements: { 'application-identifier': `${TEAM_ID}.${BUNDLE_ID}`, 'com.apple.developer.team-identifier': TEAM_ID, 'get-task-allow': false, 'beta-reports-active': true }
});
const inputs = () => ({
  APPLE_DISTRIBUTION_P12_BASE64: Buffer.from('synthetic-p12').toString('base64'),
  APPLE_DISTRIBUTION_P12_PASSWORD: 'synthetic-password-never-real',
  APPLE_PROVISIONING_PROFILE_BASE64: Buffer.from('synthetic-profile').toString('base64'),
  BHU_UPLOAD_TO_TESTFLIGHT: 'false', GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ATTEMPT: '2'
});

test('build numbers follow Apple numeric limits and deterministic run/attempt fallback', () => {
  assert.equal(buildNumber('', { GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ATTEMPT: '2' }), '42.2');
  assert.equal(buildNumber(' 0001.02.03 '), '1.2.3');
  for (const value of ['0', '0.2', '10000', '1.100', '1.2.3.4', '1-beta', '1..2', '-1', '1/2', '1\n2']) assert.throws(() => buildNumber(value), /Build number/);
  assert.throws(() => buildNumber('', {}), /Build number/);
});

test('IPA-only requires only signing credentials; upload additionally requires all API credentials', () => {
  assert.equal(requiredSecrets(false).length, 3); assert.equal(requiredSecrets(true).length, 6);
  assert.equal(credentials(inputs()).build, '42.2');
  const missing = { ...inputs(), APPLE_DISTRIBUTION_P12_BASE64: '' };
  assert.throws(() => credentials(missing), /APPLE_DISTRIBUTION_P12_BASE64/);
  assert.throws(() => credentials({ ...inputs(), BHU_UPLOAD_TO_TESTFLIGHT: 'true' }), /APP_STORE_CONNECT_KEY_ID/);
  assert.throws(() => credentials({ ...inputs(), BHU_UPLOAD_TO_TESTFLIGHT: 'yes' }), /Upload mode/);
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
  const upload = { ...inputs(), BHU_UPLOAD_TO_TESTFLIGHT: 'true', APP_STORE_CONNECT_KEY_ID: 'ABCDEF1234', APP_STORE_CONNECT_ISSUER_ID: '12345678-1234-1234-1234-123456789ABC', APP_STORE_CONNECT_PRIVATE_KEY: key.privateKey };
  assert.equal(credentials(upload).upload, true);
  assert.throws(() => credentials({ ...upload, APP_STORE_CONNECT_PRIVATE_KEY: 'not a private key' }), /valid raw .p8/);
  const wrongKey = generateKeyPairSync('ed25519', { privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
  assert.throws(() => credentials({ ...upload, APP_STORE_CONNECT_PRIVATE_KEY: wrongKey.privateKey }), /P-256/);
});

test('secret base64 decoding rejects malformed, oversized or ambiguous payloads', () => {
  assert.deepEqual(decodeBase64('YQ==\n', 'Test', 1), Buffer.from('a'));
  for (const value of ['', 'YQ', 'YQ==x', '====', 'YQ===', 'YR==', '💥']) assert.throws(() => decodeBase64(value, 'Test', 2), /base64/);
  assert.throws(() => decodeBase64('YWJj', 'Test', 2), /oversized/);
});

test('App Store profile binds the exact bundle, team, validity and imported certificate', () => {
  assert.equal(validateProfile(profile(), certificateHash, now).uuid, profile().UUID);
  const legacy = profile(); legacy.ApplicationIdentifierPrefix = ['LEGACY1234']; legacy.Entitlements['application-identifier'] = `LEGACY1234.${BUNDLE_ID}`;
  assert.equal(validateProfile(legacy, certificateHash, now).uuid, legacy.UUID);
  const cases = [
    p => { p.Platform = ['macOS']; },
    p => { p.TeamIdentifier = ['OTHER12345']; },
    p => { p.Entitlements['com.apple.developer.team-identifier'] = 'OTHER12345'; },
    p => { p.Entitlements['application-identifier'] = `${TEAM_ID}.*`; },
    p => { p.ApplicationIdentifierPrefix = ['OTHER12345']; },
    p => { p.Entitlements['application-identifier'] = `${TEAM_ID}.another.app`; },
    p => { p.Entitlements['get-task-allow'] = true; },
    p => { p.ProvisionedDevices = ['synthetic-UDID']; },
    p => { p.ProvisionedDevices = []; },
    p => { p.ProvisionsAllDevices = true; },
    p => { p.ExpirationDate = new Date('2026-05-01'); },
    p => { p.CreationDate = new Date('2026-07-01'); },
    p => { p.UUID = '../../unexpected'; },
    p => { p.DeveloperCertificates = [Buffer.from('different certificate')]; }
  ];
  for (const change of cases) { const candidate = profile(); change(candidate); assert.throws(() => validateProfile(candidate, certificateHash, now)); }
  assert.throws(() => validateProfile(undefined, certificateHash, now));
});

test('certificate checks enforce team, distribution type, count and expiry with synthetic identities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bhu-synthetic-certificate-'));
  try {
    const key = join(directory, 'synthetic.key'), pem = join(directory, 'synthetic.pem');
    const run = spawnSync('openssl', ['req', '-new', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', pem, '-subj', `/CN=Apple Distribution: Synthetic Test/OU=${TEAM_ID}`], { encoding: 'utf8' });
    assert.equal(run.status, 0, 'Synthetic OpenSSL certificate generation succeeds');
    const contents = readFileSync(pem, 'utf8'), x509 = new X509Certificate(contents);
    const valid = inspectCertificate(contents);
    assert.equal(valid.sha1, x509.fingerprint.replaceAll(':', ''));
    assert.equal(valid.sha256, createHash('sha256').update(x509.raw).digest('hex').toUpperCase());
    assert.throws(() => inspectCertificate(contents, new Date('2099-01-01')), /expired/);
    assert.throws(() => inspectCertificate(contents + contents), /exactly one/);
    assert.throws(() => inspectCertificate('-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----'), /invalid distribution/);
    const other = spawnSync('openssl', ['req', '-new', '-x509', '-key', key, '-days', '1', '-out', pem, '-subj', '/CN=Apple Distribution: Wrong Team/OU=OTHER12345'], { encoding: 'utf8' });
    assert.equal(other.status, 0);
    assert.throws(() => inspectCertificate(readFileSync(pem, 'utf8')), /Team ID/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('manual signing patch changes only App Release and preserves every other parsed project value', () => {
  const source = readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  const original = parser.parse(source);
  const patched = parser.parse(patchAppSigning(source, { profileUUID: profile().UUID, identitySHA1: 'A'.repeat(40), build: '42.2' }));
  const targets = original.project.objects.PBXNativeTarget;
  const app = Object.entries(targets).find(([id, target]) => !id.endsWith('_comment') && target.name === 'App')[1];
  const list = original.project.objects.XCConfigurationList[app.buildConfigurationList];
  const configs = original.project.objects.XCBuildConfiguration;
  const releaseId = list.buildConfigurations.find(reference => configs[reference.value].name === 'Release').value;
  const settings = patched.project.objects.XCBuildConfiguration[releaseId].buildSettings;
  assert.equal(settings.CODE_SIGN_STYLE, 'Manual'); assert.equal(settings.DEVELOPMENT_TEAM, TEAM_ID);
  assert.equal(settings.CODE_SIGN_IDENTITY, 'A'.repeat(40)); assert.equal(settings.PROVISIONING_PROFILE_SPECIFIER, profile().UUID);
  assert.equal(String(settings.CURRENT_PROJECT_VERSION), '42.2');
  patched.project.objects.XCBuildConfiguration[releaseId].buildSettings = configs[releaseId].buildSettings;
  assert.deepEqual(patched, original, 'No project/framework/Debug configuration receives a signing override');
  assert.equal(readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8'), source, 'Pure patch does not mutate the source project');
});

test('CLI preflight fails closed without echoing supplied secret values or stack traces', () => {
  const sentinel = 'SYNTHETIC_PRIVATE_VALUE_DO_NOT_PRINT';
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !requiredSecrets(true).includes(name)));
  const result = spawnSync(process.execPath, ['scripts/ios-signing.mjs', 'preflight'], { cwd: new URL('..', import.meta.url), env: { ...cleanEnv, ...inputs(), APPLE_DISTRIBUTION_P12_BASE64: sentinel }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /base64/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(sentinel)); assert.ok(!result.stderr.includes(' at '));
});

test('macOS imports a modern synthetic PKCS12 private identity into a disposable keychain', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'bhu-synthetic-p12-')); chmodSync(directory, 0o700);
  const keychain = join(directory, 'synthetic.keychain-db');
  const password = randomBytes(32).toString('base64url');
  let previous = null, cleanupFailed = false;
  const run = (stage, executable, args, env = {}) => {
    const result = spawnSync(executable, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 60000 });
    assert.equal(result.status, 0, `${stage} succeeds; sensitive subprocess output is withheld`);
    return result.stdout;
  };
  try {
    previous = [...run('Read original keychains', 'security', ['list-keychains', '-d', 'user']).matchAll(/"([^"\n]+)"/g)].map(match => match[1]);
    assert.ok(previous.length > 0, 'Original keychain search list can be preserved');
    const key = join(directory, 'synthetic.key'), pem = join(directory, 'synthetic.pem'), p12 = join(directory, 'synthetic.p12');
    run('Generate ephemeral self-signed certificate', 'openssl', ['req', '-new', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', pem, '-subj', '/CN=BHU Synthetic PKCS12 Interop']);
    run('Export modern PKCS12', 'openssl', ['pkcs12', '-export', '-inkey', key, '-in', pem, '-out', p12, '-keypbe', 'AES-256-CBC', '-certpbe', 'AES-256-CBC', '-macalg', 'sha256', '-passout', 'env:BHU_SYNTHETIC_P12_PASSWORD'], { BHU_SYNTHETIC_P12_PASSWORD: password });
    chmodSync(key, 0o600); chmodSync(p12, 0o600);
    run('Read modern PKCS12 using the distribution inspection command', 'openssl', ['pkcs12', '-in', p12, '-clcerts', '-nokeys', '-passin', 'env:BHU_SYNTHETIC_P12_PASSWORD'], { BHU_SYNTHETIC_P12_PASSWORD: password });
    run('Create disposable keychain', 'security', ['create-keychain', '-p', password, keychain]);
    run('Unlock disposable keychain', 'security', ['unlock-keychain', '-p', password, keychain]);
    run('Import modern PKCS12', 'security', ['import', p12, '-k', keychain, '-P', password, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security']);
    // No trust override: a self-signed identity remains untrusted, yet must include its private key.
    const identities = run('Find imported private identity', 'security', ['find-identity', '-p', 'basic', keychain]);
    const fingerprint = new X509Certificate(readFileSync(pem)).fingerprint.replaceAll(':', '');
    assert.ok(identities.includes(fingerprint), 'Imported synthetic certificate has a matching private identity');
  } finally {
    if (previous?.length) cleanupFailed ||= spawnSync('security', ['list-keychains', '-d', 'user', '-s', ...previous], { stdio: 'ignore' }).status !== 0;
    if (existsSync(keychain)) {
      const deletionFailed = spawnSync('security', ['delete-keychain', keychain], { stdio: 'ignore' }).status !== 0;
      cleanupFailed ||= deletionFailed;
    }
    rmSync(directory, { recursive: true, force: true });
    assert.equal(cleanupFailed, false, 'Original keychains restored and synthetic private materials removed');
  }
});
