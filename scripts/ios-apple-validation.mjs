#!/usr/bin/env node
/** Validate the existing signed IPA; never uploads a new build. */
import { createHash, createPrivateKey } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseAltoolResponse } from './ios-signing.mjs';

const root = resolve(import.meta.dirname, '..');
const reportPath = join(root, 'test-artifacts/apple-validation/report.json');
const report = { bundleId: 'com.fevzicakmak.bhu', version: '1.0', build: '3.1', operation: 'validate', accepted: false };
let directory;

try {
  if (process.platform !== 'darwin') throw new Error('MACOS_REQUIRED');
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('TRUSTED_MANUAL_RUN_REQUIRED');
  const kid = process.env.APP_STORE_CONNECT_KEY_ID?.trim();
  const issuer = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  const pem = process.env.APP_STORE_CONNECT_PRIVATE_KEY?.trim();
  if (!/^[A-Z0-9]{10}$/.test(kid || '') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuer || '')) throw new Error('INVALID_API_IDENTIFIERS');
  let key;
  try { key = createPrivateKey(pem); } catch (_) { throw new Error('INVALID_API_KEY'); }
  if (!pem.startsWith('-----BEGIN PRIVATE KEY-----') || key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('INVALID_API_KEY');
  const ipa = join(root, 'signed-input/BHU.ipa');
  const bytes = readFileSync(ipa);
  if (createHash('sha256').update(bytes).digest('hex') !== 'fbf2c23eaef47427f2e6f6de450a0ce5f142f60654d2a25cea6166b26e426ff1') throw new Error('EXISTING_IPA_DIGEST_MISMATCH');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('APP_STORE_CONNECT_') && !name.startsWith('APPLE_DISTRIBUTION_') && name !== 'APPLE_PROVISIONING_PROFILE_BASE64'));
  const version = spawnSync('xcrun', ['altool', '--version'], { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  const help = spawnSync('xcrun', ['altool', '--help'], { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  const helpText = `${help.stdout || ''}\n${help.stderr || ''}`;
  const legacyWrapper = /--use-old-altool\b/.test(helpText);
  report.tool = {
    version: `${version.stdout || ''}\n${version.stderr || ''}`.match(/\b[0-9]+\.[0-9]+(?:\.[0-9]+)*\b/)?.[0] || null,
    legacyWrapperAvailable: legacyWrapper,
    modernApiFlags: /--api-key\b/.test(helpText),
    legacyApiFlags: /--apiKey\b/.test(helpText),
    selectedMode: legacyWrapper ? 'explicit-legacy-wrapper' : 'legacy-interface',
  };
  if (report.tool.modernApiFlags && !report.tool.legacyApiFlags && !legacyWrapper) throw new Error('UNSUPPORTED_TOOL_INTERFACE');
  directory = mkdtempSync(join(process.env.RUNNER_TEMP || '/tmp', 'bhu-apple-validate-')); chmodSync(directory, 0o700);
  const keys = join(directory, 'private_keys'); mkdirSync(keys, { mode: 0o700 });
  const keyFile = join(keys, `AuthKey_${kid}.p8`);
  writeFileSync(keyFile, pem + '\n', { mode: 0o600 }); chmodSync(keyFile, 0o600);
  const result = spawnSync('xcrun', ['altool', ...(legacyWrapper ? ['--use-old-altool'] : []), '--validate-app', '--file', ipa, '--type', 'ios', '--apiKey', kid, '--apiIssuer', issuer, '--output-format', 'json'], { cwd: directory, env, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
  report.exitCode = Number.isInteger(result.status) ? result.status : null;
  report.stdoutBytes = Buffer.byteLength(result.stdout || '');
  report.stderrBytes = Buffer.byteLength(result.stderr || '');
  let parsed;
  try { parsed = parseAltoolResponse(result.stdout || '', result.stderr || '', 'validate'); }
  catch (error) {
    const categories = ['invalid-operation', 'response-too-large', 'invalid-json', 'reported-error', 'missing-json', 'missing-explicit-success'];
    report.category = categories.includes(error.category) ? error.category.toUpperCase().replaceAll('-', '_') : 'VALIDATION_RESPONSE_REJECTED';
    report.diagnostics = Array.isArray(error.diagnostics) ? error.diagnostics.filter(value => /^(?:ITMS-[0-9]{4,8}|HTTP-[0-9]{3}|-?[0-9]{1,10})$/.test(String(value))).map(String) : [];
    const text = `${result.stdout || ''}\n${result.stderr || ''}`;
    report.appleErrorClass = /no suitable application records|application record.{0,50}(?:not found|missing)/i.test(text) ? 'APP_RECORD_NOT_FOUND'
      : /authenticat|unauthori[sz]ed|\bJWT\b|invalid.{0,30}(?:token|credentials|API key)/i.test(text) ? 'AUTHENTICATION_FAILED'
      : /forbidden|insufficient permissions|access denied|not permitted/i.test(text) ? 'FORBIDDEN_ROLE'
      : /ITMS-[0-9]|invalid.{0,30}(?:bundle|provision|signature)/i.test(text) ? 'BINARY_VALIDATION'
      : /timed out|network|connection|could not resolve|DNS/i.test(text) ? 'NETWORK_ERROR'
      : /usage:|unrecognized (?:option|argument)|unknown (?:option|command)/i.test(text) ? 'UNSUPPORTED_COMMAND'
      : 'UNCLASSIFIED_ERROR';
    throw new Error('VALIDATION_RESPONSE_REJECTED');
  }
  if (result.error || result.status !== 0) throw new Error('VALIDATION_PROCESS_FAILED');
  report.accepted = parsed.accepted === true;
  report.diagnostics = parsed.diagnostics;
  if (!report.accepted) throw new Error('VALIDATION_NOT_ACCEPTED');
  console.log('Apple explicitly confirmed validation of existing BHU 1.0 (3.1).');
} catch (error) {
  const allowed = ['MACOS_REQUIRED', 'TRUSTED_MANUAL_RUN_REQUIRED', 'INVALID_API_IDENTIFIERS', 'INVALID_API_KEY', 'EXISTING_IPA_DIGEST_MISMATCH', 'UNSUPPORTED_TOOL_INTERFACE', 'VALIDATION_RESPONSE_REJECTED', 'VALIDATION_PROCESS_FAILED', 'VALIDATION_NOT_ACCEPTED'];
  report.failure = allowed.includes(error.message) ? error.message : 'VALIDATION_DIAGNOSTICS_FAILED';
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (directory) {
    try { rmSync(directory, { recursive: true, force: true }); }
    catch (_) { report.accepted = false; report.failure = 'TEMPORARY_KEY_CLEANUP_FAILED'; process.exitCode = 1; }
  }
  mkdirSync(join(root, 'test-artifacts/apple-validation'), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
