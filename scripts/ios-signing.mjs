#!/usr/bin/env node
/** Manual certificate-based iOS distribution. Never creates Apple signing assets. */
import { createHash, createPrivateKey, randomBytes, X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, chmodSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const TEAM_ID = 'T4F4D367KQ';
export const BUNDLE_ID = 'com.fevzicakmak.bhu';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');
const SECRET_NAMES = ['APPLE_DISTRIBUTION_P12_BASE64', 'APPLE_DISTRIBUTION_P12_PASSWORD', 'APPLE_PROVISIONING_PROFILE_BASE64', 'APP_STORE_CONNECT_KEY_ID', 'APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_PRIVATE_KEY'];
class SigningError extends Error {}
const checked = (condition, message) => { if (!condition) throw new SigningError(message); };
const unquote = value => typeof value === 'string' && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();

/** Interpret structured altool evidence without returning raw messages or paths. */
export function parseAltoolResponse(stdout, stderr, operation) {
  const diagnostics = new Set();
  const streams = [stdout, stderr].map(value => typeof value === 'string' ? value.trim() : '');
  const fail = category => {
    const codes = [...diagnostics].sort().slice(0, 30);
    const error = new SigningError(`Apple ${operation === 'upload' ? 'upload' : 'validation'} response rejected (${category})${codes.length ? `: ${codes.join(', ')}` : '.'}`);
    error.category = category; error.diagnostics = codes;
    throw error;
  };
  if (!['validate', 'upload'].includes(operation)) fail('invalid-operation');
  if (streams.some(value => value.length > 8 * 1024 * 1024)) fail('response-too-large');
  for (const value of streams) for (const match of value.matchAll(/\bITMS-[0-9]{4,8}\b/g)) diagnostics.add(match[0]);
  const documents = [];
  for (const value of streams) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') fail('invalid-json');
      documents.push(parsed);
    } catch (error) {
      if (error instanceof SigningError) throw error;
      if (/^[{[]/.test(value)) fail('invalid-json');
      // Timestamp-prefixed diagnostics must not hide a second embedded error
      // object alongside an otherwise successful JSON document.
      if (/"(?:product-errors|errors|error)"\s*:/i.test(value)) fail('reported-error');
    }
  }
  let reportedError = false;
  const inspect = value => {
    if (Array.isArray(value)) { value.forEach(inspect); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
      if (normalized === 'code' || normalized === 'errorcode') {
        if (Number.isSafeInteger(item) && Math.abs(item) <= 99999999) diagnostics.add(String(item));
        else if (typeof item === 'string' && /^(?:-?[0-9]{1,8}|ITMS-[0-9]{4,8})$/.test(item)) diagnostics.add(item);
      }
      if (['producterrors', 'errors', 'error', 'errorcode'].includes(normalized)
        && item !== null && item !== false && item !== 0 && item !== '' && !(Array.isArray(item) && item.length === 0)) reportedError = true;
      if (normalized === 'status' && typeof item === 'string' && /^(?:error|failed|failure|invalid|rejected)$/i.test(item)) reportedError = true;
      if (['status', 'statuscode'].includes(normalized) && Number.isInteger(item) && item >= 400 && item <= 599) {
        diagnostics.add(`HTTP-${item}`); reportedError = true;
      }
      if (['success', 'accepted'].includes(normalized) && item === false) reportedError = true;
      inspect(item);
    }
  };
  documents.forEach(inspect);
  if (reportedError || streams.some(value => /(?:\*\*\*\s*Error\b|\bERROR(?:\s*:|\s+ITMS-))/i.test(value))) fail('reported-error');
  if (!documents.length) fail('missing-json');
  const verb = operation === 'validate' ? 'validating' : 'uploading';
  const success = new RegExp(`^No errors ${verb} (?:archive at )?'[^'\\r\\n]+'\\.?$`, 'i');
  const accepted = documents.filter(value => typeof value['success-message'] === 'string' && success.test(value['success-message'].trim()));
  if (accepted.length !== 1) fail('missing-explicit-success');
  const result = { operation, accepted: true, diagnostics: [...diagnostics].sort().slice(0, 30) };
  const uploadId = accepted[0]['upload-id'] ?? accepted[0].details?.['delivery-uuid'];
  if (operation === 'upload' && typeof uploadId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) result.uploadId = uploadId;
  return result;
}

export function buildNumber(value, env = process.env) {
  const input = value?.trim() || `${env.GITHUB_RUN_NUMBER || ''}.${env.GITHUB_RUN_ATTEMPT || ''}`;
  checked(/^[0-9]{1,4}(?:\.[0-9]{1,2}){0,2}$/.test(input) && Number(input.split('.')[0]) > 0,
    'Build number must contain 1–3 numeric components: first 1–9999, remaining 0–99. Set build_number explicitly if needed.');
  return input.split('.').map(component => String(Number(component))).join('.');
}
export function requiredSecrets(upload) { return SECRET_NAMES.slice(0, upload ? 6 : 3); }
export function decodeBase64(value, label, maximumBytes) {
  const encoded = value.replace(/\s/g, '');
  checked(encoded.length > 0 && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded), `${label} must be valid base64.`);
  const bytes = Buffer.from(encoded, 'base64');
  checked(bytes.length > 0 && bytes.length <= maximumBytes && bytes.toString('base64') === encoded, `${label} is empty, oversized or invalid base64.`);
  return bytes;
}
export function credentials(env = process.env) {
  checked(['true', 'false', undefined, ''].includes(env.BHU_UPLOAD_TO_TESTFLIGHT), 'Upload mode must be true or false.');
  const upload = env.BHU_UPLOAD_TO_TESTFLIGHT === 'true';
  const missing = requiredSecrets(upload).filter(name => typeof env[name] !== 'string' || env[name].length === 0);
  checked(missing.length === 0, `Missing required GitHub Actions secrets: ${missing.join(', ')}.`);
  const value = {
    upload, build: buildNumber(env.BHU_BUILD_NUMBER, env),
    p12: decodeBase64(env.APPLE_DISTRIBUTION_P12_BASE64, 'Distribution P12', 1024 * 1024),
    password: env.APPLE_DISTRIBUTION_P12_PASSWORD,
    profile: decodeBase64(env.APPLE_PROVISIONING_PROFILE_BASE64, 'Provisioning profile', 10 * 1024 * 1024)
  };
  if (upload) {
    value.keyId = env.APP_STORE_CONNECT_KEY_ID.trim(); value.issuerId = env.APP_STORE_CONNECT_ISSUER_ID.trim(); value.privateKey = env.APP_STORE_CONNECT_PRIVATE_KEY.trim() + '\n';
    checked(/^[A-Z0-9]{10}$/.test(value.keyId), 'App Store Connect Key ID must contain 10 uppercase letters/digits.');
    checked(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.issuerId), 'App Store Connect Issuer ID must be a UUID.');
    let key;
    try { key = createPrivateKey({ key: value.privateKey, format: 'pem', type: 'pkcs8' }); }
    catch (_) { throw new SigningError('App Store Connect private key is not a valid raw .p8 PEM key.'); }
    checked(value.privateKey.startsWith('-----BEGIN PRIVATE KEY-----') && key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1',
      'App Store Connect private key must be the Apple-issued P-256 .p8 key.');
  }
  return value;
}
export function inspectCertificate(pem, now = new Date()) {
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  checked(certificates.length === 1, 'P12 must contain exactly one distribution signing certificate.');
  let certificate;
  try { certificate = new X509Certificate(certificates[0]); }
  catch (_) { throw new SigningError('P12 contains an invalid distribution certificate.'); }
  const subject = Object.fromEntries(certificate.subject.split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  checked(subject.OU === TEAM_ID && /^(?:Apple Distribution|iPhone Distribution):/.test(subject.CN || ''), 'P12 certificate is not an Apple Distribution identity for the configured Team ID.');
  checked(Date.parse(certificate.validFrom) <= now.getTime() && Date.parse(certificate.validTo) > now.getTime(), 'Distribution certificate is expired or not yet valid.');
  return { sha1: certificate.fingerprint.replaceAll(':', '').toUpperCase(), sha256: sha256(certificate.raw) };
}
export function validateProfile(profile, certificateSHA256, now = new Date()) {
  const entitlements = profile?.Entitlements;
  checked(profile && typeof profile === 'object' && Array.isArray(profile.Platform) && profile.Platform.includes('iOS'), 'Provisioning profile must be for iOS.');
  checked(Array.isArray(profile.TeamIdentifier) && profile.TeamIdentifier.length === 1 && profile.TeamIdentifier[0] === TEAM_ID
    && entitlements?.['com.apple.developer.team-identifier'] === TEAM_ID, 'Provisioning profile Team ID does not match BHU.');
  const appId = entitlements?.['application-identifier'];
  const prefix = typeof appId === 'string' ? appId.slice(0, appId.indexOf('.')) : '';
  checked(typeof appId === 'string' && Array.isArray(profile.ApplicationIdentifierPrefix) && profile.ApplicationIdentifierPrefix.includes(prefix)
    && appId === `${prefix}.${BUNDLE_ID}`, 'Provisioning profile must target the exact BHU bundle ID; wildcards are not accepted.');
  checked(entitlements['get-task-allow'] === false && !Object.hasOwn(profile, 'ProvisionedDevices') && profile.ProvisionsAllDevices !== true,
    'An App Store distribution profile is required; development, ad-hoc and enterprise profiles are not accepted.');
  const expiry = new Date(profile.ExpirationDate), created = new Date(profile.CreationDate);
  checked(Number.isFinite(expiry.getTime()) && Number.isFinite(created.getTime()) && expiry > now && created <= now, 'Provisioning profile is expired, not yet valid or has invalid dates.');
  checked(typeof profile.UUID === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.UUID), 'Provisioning profile has no valid UUID.');
  checked(Array.isArray(profile.DeveloperCertificates) && profile.DeveloperCertificates.some(data => (Buffer.isBuffer(data) || data instanceof Uint8Array) && sha256(data) === certificateSHA256),
    'The provisioning profile does not authorize the imported P12 signing certificate.');
  return { uuid: profile.UUID, expiry: expiry.toISOString() };
}
export function patchAppSigning(source, { profileUUID, identitySHA1, build }) {
  checked(/^[A-F0-9]{40}$/.test(identitySHA1) && /^[A-Fa-f0-9-]{36}$/.test(profileUUID), 'Signing identifiers are invalid.');
  const xcode = require('xcode');
  const project = xcode.project(PROJECT);
  // xcode exposes its parser separately; parse the supplied source, never a second file.
  const parser = require('xcode/lib/parser/pbxproj');
  project.hash = parser.parse(source);
  const targets = project.pbxNativeTargetSection();
  const entries = Object.entries(targets).filter(([id, target]) => !id.endsWith('_comment') && target.isa === 'PBXNativeTarget'
    && unquote(target.name) === 'App' && unquote(target.productType) === 'com.apple.product-type.application');
  checked(entries.length === 1, 'Expected one App application target before applying scoped signing.');
  const target = entries[0][1], list = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const configurations = project.pbxXCBuildConfigurationSection();
  const release = list.buildConfigurations.map(reference => configurations[reference.value]).filter(config => unquote(config.name) === 'Release');
  checked(release.length === 1, 'Expected exactly one App Release configuration.');
  const settings = release[0].buildSettings;
  for (const name of Object.keys(settings)) if (/^(?:CODE_SIGN_STYLE|DEVELOPMENT_TEAM|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER|PROVISIONING_PROFILE)(?:\[.*\])?$/.test(unquote(name))) delete settings[name];
  Object.assign(settings, { CODE_SIGN_STYLE: 'Manual', DEVELOPMENT_TEAM: TEAM_ID, CODE_SIGN_IDENTITY: identitySHA1,
    PROVISIONING_PROFILE_SPECIFIER: profileUUID, CURRENT_PROJECT_VERSION: buildNumber(build) });
  return project.writeSync();
}

// All subprocess output stays private; even exec exceptions can contain passwords.
function command(stage, executable, args, { cwd = ROOT, env = {}, timeout = 10 * 60 * 1000 } = {}) {
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !SECRET_NAMES.includes(name)));
  const result = spawnSync(executable, args, { cwd, env: { ...childEnv, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout });
  if (result.error || result.status !== 0) throw new SigningError(`${stage} failed${Number.isInteger(result.status) ? ` (exit ${result.status})` : ''}. Sensitive command output was not printed.`);
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}
function privateWrite(path, contents) { writeFileSync(path, contents, { mode: 0o600 }); chmodSync(path, 0o600); }
function parsePlist(xml) { return require('plist').parse(xml); }
function decodeProfile(path) { return parsePlist(command('Decode provisioning profile', 'security', ['cms', '-D', '-i', path]).stdout); }
function signedEntitlements(app) { return parsePlist(command('Read app entitlements', 'codesign', ['-d', '--entitlements', ':-', app]).stdout); }

export function readSigningCertificate(app, directory) {
  const prefix = join(directory, 'exported-cert-');
  // codesign takes an optional argument here; a separate token becomes another input path.
  command('Read exported signing certificate', 'codesign', ['-d', `--extract-certificates=${prefix}`, app]);
  return readFileSync(`${prefix}0`);
}

/** Accept modern encrypted P12 inputs, then bridge Apple's Keychain import format. */
export function normalizeP12(input, output, password) {
  const directory = mkdtempSync(join(dirname(output), 'p12-compat-')); chmodSync(directory, 0o700);
  const pem = join(directory, 'identity.pem');
  const env = { APPLE_DISTRIBUTION_P12_PASSWORD: password };
  let complete = false;
  try {
    // Create before OpenSSL opens the file, so plaintext private material is always 0600.
    privateWrite(pem, '');
    command('Decode P12 for temporary Keychain compatibility', 'openssl', ['pkcs12', '-in', input, '-nodes', '-out', pem,
      '-passin', 'env:APPLE_DISTRIBUTION_P12_PASSWORD'], { env });
    privateWrite(output, '');
    command('Prepare encrypted Keychain-compatible P12', 'openssl', ['pkcs12', '-export', '-in', pem, '-out', output,
      '-name', 'BHU Apple Distribution', '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1',
      '-passout', 'env:APPLE_DISTRIBUTION_P12_PASSWORD'], { env });
    chmodSync(output, 0o600);
    complete = true;
  } finally {
    // The plaintext private key is removed immediately, including failed conversions.
    rmSync(directory, { recursive: true, force: true });
    if (!complete) rmSync(output, { force: true });
  }
  return output;
}

export async function distribute() {
  const secrets = credentials(); // Fail before touching signing assets or Xcode.
  checked(process.platform === 'darwin', 'Signed distribution requires the macOS GitHub Actions runner.');
  checked(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_REF === 'refs/heads/main',
    'Distribution is allowed only by a manual workflow dispatch on main.');
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'bhu-signing-')); chmodSync(directory, 0o700);
  const keychain = join(directory, 'signing.keychain-db'), keychainPassword = randomBytes(36).toString('base64url');
  const p12 = join(directory, 'distribution.p12'), mobile = join(directory, 'app.mobileprovision');
  let previousKeychains = null, installedProfile = null, previousProfile = null, projectBackup = null, projectMode = null, complete = false;
  const finalDirectory = join(ROOT, 'ios-distribution');
  try {
    rmSync(finalDirectory, { recursive: true, force: true }); mkdirSync(finalDirectory, { mode: 0o700 });
    privateWrite(p12, secrets.p12); privateWrite(mobile, secrets.profile);
    const pem = command('Inspect P12 certificate', 'openssl', ['pkcs12', '-in', p12, '-clcerts', '-nokeys', '-passin', 'env:APPLE_DISTRIBUTION_P12_PASSWORD'], { env: { APPLE_DISTRIBUTION_P12_PASSWORD: secrets.password } }).stdout;
    const certificate = inspectCertificate(pem), profile = decodeProfile(mobile);
    const validProfile = validateProfile(profile, certificate.sha256);
    previousKeychains = [...command('Read keychain search list', 'security', ['list-keychains', '-d', 'user']).stdout.matchAll(/"([^"\n]+)"/g)].map(match => match[1]);
    checked(previousKeychains.length > 0, 'Cannot preserve the original keychain search list.');
    command('Create temporary signing keychain', 'security', ['create-keychain', '-p', keychainPassword, keychain]);
    command('Set temporary keychain lifetime', 'security', ['set-keychain-settings', '-lut', '21600', keychain]);
    command('Unlock temporary signing keychain', 'security', ['unlock-keychain', '-p', keychainPassword, keychain]);
    const compatibleP12 = normalizeP12(p12, join(directory, 'keychain-compatible.p12'), secrets.password);
    command('Import distribution identity', 'security', ['import', compatibleP12, '-k', keychain, '-P', secrets.password, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security']);
    command('Authorize Apple signing tools', 'security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', keychainPassword, keychain]);
    command('Select temporary keychain', 'security', ['list-keychains', '-d', 'user', '-s', keychain, ...previousKeychains]);
    const identities = command('Verify imported signing identity', 'security', ['find-identity', '-v', '-p', 'codesigning', keychain]).stdout.match(/[A-F0-9]{40}/g) || [];
    checked(identities.length === 1 && identities[0] === certificate.sha1, 'P12 must provide one valid, trusted signing identity with its matching private key.');
    // latest-stable Xcode (16+) discovers locally supplied profiles here.
    const profiles = join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles'); mkdirSync(profiles, { recursive: true });
    installedProfile = join(profiles, `${validProfile.uuid}.mobileprovision`);
    if (existsSync(installedProfile)) previousProfile = { bytes: readFileSync(installedProfile), mode: statSync(installedProfile).mode & 0o777 };
    privateWrite(installedProfile, secrets.profile);
    projectBackup = readFileSync(PROJECT);
    projectMode = statSync(PROJECT).mode & 0o777;
    privateWrite(PROJECT, patchAppSigning(projectBackup.toString('utf8'), { profileUUID: validProfile.uuid, identitySHA1: certificate.sha1, build: secrets.build }));
    console.log('Validated signing identity/profile binding. Building the real Release archive.');
    const archive = join(directory, 'BHU.xcarchive'), exported = join(directory, 'export');
    command('Release archive', 'xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-configuration', 'Release', '-derivedDataPath', join(directory, 'DerivedData'), '-archivePath', archive, 'archive'], { timeout: 20 * 60 * 1000 });
    command('Inspect Release archive', 'python3', ['scripts/check-ios-archive.py', archive, '--output', join(directory, 'archive-report.json')]);
    const exportOptions = join(directory, 'ExportOptions.plist');
    privateWrite(exportOptions, require('plist').build({ method: 'app-store-connect', destination: 'export', teamID: TEAM_ID, signingStyle: 'manual',
      signingCertificate: certificate.sha1, provisioningProfiles: { [BUNDLE_ID]: validProfile.uuid }, manageAppVersionAndBuildNumber: false, uploadSymbols: true }));
    command('Export App Store IPA', 'xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exported, '-exportOptionsPlist', exportOptions], { timeout: 10 * 60 * 1000 });
    const ipas = readdirSync(exported).filter(name => name.endsWith('.ipa'));
    checked(ipas.length === 1 && statSync(join(exported, ipas[0])).size > 1024, 'Xcode did not export exactly one nonempty App Store IPA.');
    const verification = join(directory, 'verify'); mkdirSync(verification);
    command('Extract exported IPA for verification', 'ditto', ['-x', '-k', join(exported, ipas[0]), verification]);
    const payload = join(verification, 'Payload');
    const apps = readdirSync(payload).filter(name => name.endsWith('.app'));
    checked(apps.length === 1, 'Exported IPA must contain one application.');
    const app = join(payload, apps[0]);
    const info = JSON.parse(command('Read exported app metadata', 'plutil', ['-convert', 'json', '-o', '-', join(app, 'Info.plist')]).stdout);
    checked(info.CFBundleIdentifier === BUNDLE_ID && info.CFBundleVersion === secrets.build && info.CFBundleSupportedPlatforms?.includes('iPhoneOS'), 'Exported IPA metadata does not match the intended BHU device build.');
    command('Verify exported application signature', 'codesign', ['--verify', '--deep', '--strict', app]);
    validateProfile(decodeProfile(join(app, 'embedded.mobileprovision')), certificate.sha256);
    const entitlements = signedEntitlements(app);
    checked(entitlements['com.apple.developer.team-identifier'] === TEAM_ID && entitlements['application-identifier']?.endsWith(`.${BUNDLE_ID}`)
      && entitlements['get-task-allow'] !== true, 'Exported IPA entitlements are not App Store distribution entitlements for BHU.');
    checked(sha256(readSigningCertificate(app, directory)) === certificate.sha256, 'Exported IPA was signed with an unexpected certificate.');
    const ipa = join(finalDirectory, 'BHU.ipa'); copyFileSync(join(exported, ipas[0]), ipa); chmodSync(ipa, 0o600);
    let appleValidation = null, appleUpload = null;
    if (secrets.upload) {
      const keys = join(directory, 'private_keys'); mkdirSync(keys, { mode: 0o700 });
      privateWrite(join(keys, `AuthKey_${secrets.keyId}.p8`), secrets.privateKey);
      const authentication = ['--apiKey', secrets.keyId, '--apiIssuer', secrets.issuerId];
      const validation = command('Apple IPA validation', 'xcrun', ['altool', '--validate-app', '--file', ipa, '--type', 'ios', '--output-format', 'json', ...authentication], { cwd: directory });
      appleValidation = parseAltoolResponse(validation.stdout, validation.stderr, 'validate');
      const upload = command('Upload to TestFlight processing', 'xcrun', ['altool', '--upload-app', '--file', ipa, '--type', 'ios', '--output-format', 'json', ...authentication], { cwd: directory });
      appleUpload = parseAltoolResponse(upload.stdout, upload.stderr, 'upload');
    }
    privateWrite(join(finalDirectory, 'distribution-summary.json'), JSON.stringify({ bundleId: BUNDLE_ID, teamId: TEAM_ID, build: secrets.build,
      signedIPA: true, appleValidationCompleted: appleValidation?.accepted === true, uploadedForTestFlightProcessing: appleUpload?.accepted === true,
      ...(appleValidation ? { appleValidation } : {}), ...(appleUpload ? { appleUpload } : {}),
      doesNotVerify: ['StoreKit purchase/restore on real devices', 'App Store review or release approval', 'TestFlight processing completion'] }, null, 2) + '\n');
    complete = true;
    console.log(secrets.upload ? 'Signed IPA verified and accepted by the upload command for Apple processing. TestFlight processing still needs to finish.' : 'Signed App Store IPA verified. No upload was requested.');
  } finally {
    let cleanupFailed = false;
    const clean = operation => { try { operation(); } catch (_) { cleanupFailed = true; } };
    if (projectBackup) clean(() => { writeFileSync(PROJECT, projectBackup); chmodSync(PROJECT, projectMode); });
    if (installedProfile) clean(() => previousProfile ? (writeFileSync(installedProfile, previousProfile.bytes), chmodSync(installedProfile, previousProfile.mode)) : rmSync(installedProfile, { force: true }));
    if (previousKeychains) clean(() => command('Restore original keychain search list', 'security', ['list-keychains', '-d', 'user', '-s', ...previousKeychains]));
    if (existsSync(keychain)) clean(() => command('Delete temporary keychain', 'security', ['delete-keychain', keychain]));
    clean(() => rmSync(directory, { recursive: true, force: true }));
    if (!complete || cleanupFailed) clean(() => rmSync(finalDirectory, { recursive: true, force: true }));
    if (cleanupFailed) throw new SigningError('Signing cleanup could not be completed. Distribution artifacts were withheld.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'preflight') { credentials(); console.log('Required signing inputs are present and structurally valid.'); }
    else if (process.argv[2] === 'distribute') await distribute();
    else throw new SigningError('Usage: node scripts/ios-signing.mjs preflight|distribute');
  } catch (error) {
    // Do not print command exceptions, certificate subjects, profiles, private keys or stack traces.
    console.error(error instanceof SigningError ? error.message : 'Signing failed. Sensitive diagnostics were not printed.');
    process.exitCode = 1;
  }
}
