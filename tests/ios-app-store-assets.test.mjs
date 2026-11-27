import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { APP_ID, BUNDLE, AssetsError, inspectPNG, validateSession, assertRequest, createClient,
  validateUploadOperations, compilePlan, applyPlan } from '../scripts/ios-app-store-assets.mjs';

// Synthetic solid RGB fixtures only. These tests never read sessions or real screenshots.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(name, bytes = Buffer.alloc(0)) {
  const value = Buffer.concat([Buffer.from(name), bytes]); let crc = 0xffffffff;
  for (const b of value) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(bytes.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, value, tail]);
}
function png(width, height, { colorType = 2, extra = [] } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = colorType;
  const channels = colorType === 6 ? 4 : 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    ...extra, chunk('IDAT', deflateSync(Buffer.alloc(height * (width * channels + 1)))), chunk('IEND')]);
}
const phoneBytes = png(1179, 2556), padBytes = png(2064, 2752);
const images = () => ({ iPhone: inspectPNG(phoneBytes, 'iPhone', '/synthetic/phone.png'),
  iPad: inspectPNG(padBytes, 'iPad', '/synthetic/ipad.png') });
const epoch = () => Math.floor(Date.now() / 1000);
function session(now = epoch()) {
  const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  return { token: `${encode({ alg: 'ES256' })}.${encode({ aud: 'appstoreconnect-v1', iat: now, exp: now + 300 })}.synthetic-signature`,
    appId: APP_ID, expiresAt: now + 300, sourceCommit: 'a'.repeat(40), purpose: 'synthetic screenshot test' };
}
const relationship = (type, id) => ({ data: { type, id } });
const operation = (size, changes = {}) => ({ method: 'PUT', url: 'https://store-030.blobstore.apple.com/synthetic?signature=private-upload-token',
  offset: 0, length: size, requestHeaders: [{ name: 'Content-Type', value: 'image/png' }], ...changes });

function mockApple(options = {}) {
  const lease = session(), calls = [], sets = new Map(), screenshots = new Map(); let nextSet = 0, nextShot = 0, uploads = 0;
  for (const set of options.sets ?? []) sets.set(set.id, structuredClone(set));
  for (const shot of options.screenshots ?? []) screenshots.set(shot.id, structuredClone(shot));
  const json = data => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (input, init) => {
    const url = new URL(input); calls.push({ url: input, method: init.method, body: init.body, headers: init.headers });
    assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    if (url.origin !== 'https://api.appstoreconnect.apple.com') {
      uploads++; assert.equal(init.method, 'PUT'); assert.ok(Buffer.isBuffer(init.body));
      assert.equal(Object.keys(init.headers).some(x => x.toLowerCase() === 'authorization'), false);
      assert.ok(!JSON.stringify(init.headers).includes(lease.token));
      if (options.uploadFailAt === uploads) return new Response('private-upload-token', { status: 503 });
      return new Response(null, { status: 200 });
    }
    assert.equal(init.headers.Authorization, `Bearer ${lease.token}`);
    const path = url.pathname, payload = init.body ? JSON.parse(init.body).data : null;
    if (init.method === 'GET' && path === '/v1/apps') {
      assert.equal(url.searchParams.get('filter[bundleId]'), BUNDLE);
      return json([{ type: 'apps', id: options.appId ?? APP_ID, attributes: { bundleId: BUNDLE, primaryLocale: 'tr' } }]);
    }
    if (init.method === 'GET' && path === `/v1/apps/${APP_ID}/appStoreVersions`) return json([{ type: 'appStoreVersions', id: 'version-1',
      attributes: { versionString: '1.0', platform: 'IOS', appVersionState: options.draftState ?? 'PREPARE_FOR_SUBMISSION' }, relationships: { app: relationship('apps', APP_ID) } }]);
    if (init.method === 'GET' && path === '/v1/appStoreVersions/version-1/appStoreVersionLocalizations') return json([{ type: 'appStoreVersionLocalizations', id: 'locale-tr', attributes: { locale: 'tr' } }]);
    if (init.method === 'GET' && path === '/v1/appStoreVersionLocalizations/locale-tr/appScreenshotSets') return json([...sets.values()]);
    const setMatch = path.match(/^\/v1\/appScreenshotSets\/([^/]+)\/appScreenshots$/);
    if (init.method === 'GET' && setMatch) return json([...screenshots.values()].filter(s => s.relationships.appScreenshotSet.data.id === setMatch[1]));
    if (init.method === 'POST' && path === '/v1/appScreenshotSets') {
      const set = { ...payload, id: `set-${++nextSet}` }; sets.set(set.id, set); return json(set);
    }
    if (init.method === 'POST' && path === '/v1/appScreenshots') {
      const size = payload.attributes.fileSize, first = Math.floor(size / 2);
      const shot = { ...payload, id: `shot-${++nextShot}`, attributes: { ...payload.attributes, assetDeliveryState: { state: 'AWAITING_UPLOAD' },
        uploadOperations: [operation(size, { offset: first, length: size - first }), operation(size, { length: first })] } };
      screenshots.set(shot.id, shot); return json(shot);
    }
    const shotMatch = path.match(/^\/v1\/appScreenshots\/([^/]+)$/);
    if (init.method === 'PATCH' && shotMatch) {
      const shot = screenshots.get(shotMatch[1]); assert.ok(shot); assert.equal(payload.id, shot.id);
      assert.equal(payload.attributes.uploaded, true); assert.match(payload.attributes.sourceFileChecksum, /^[a-f0-9]{32}$/);
      shot.attributes.sourceFileChecksum = payload.attributes.sourceFileChecksum;
      shot.attributes.assetDeliveryState = { state: options.commitComplete ? 'COMPLETE' : 'UPLOAD_COMPLETE' };
      return json(shot);
    }
    if (init.method === 'GET' && shotMatch) {
      const shot = screenshots.get(shotMatch[1]); assert.ok(shot);
      shot.attributes.assetDeliveryState = { state: options.failedPoll ? 'FAILED' : options.pending ? 'UPLOAD_COMPLETE' : 'COMPLETE' };
      if (options.changedChecksum) shot.attributes.sourceFileChecksum = '0'.repeat(32);
      return json(shot);
    }
    assert.fail(`Unexpected mock request ${init.method} ${path}`);
  };
  return { client: createClient(lease, { fetchImpl }), lease, calls, sets, screenshots };
}
const planWith = async (mock, files = images()) => ({ plan: await compilePlan({ request: mock.client.request, images: files }), files });
const writes = mock => mock.calls.filter(x => x.method !== 'GET');
function existingSet(id, displayType) { return { type: 'appScreenshotSets', id, attributes: { screenshotDisplayType: displayType },
  relationships: { appStoreVersionLocalization: relationship('appStoreVersionLocalizations', 'locale-tr') } }; }
function existingShot(id, setId, image, state = 'COMPLETE') { return { type: 'appScreenshots', id, attributes: {
  fileName: image.fileName, fileSize: image.fileSize, sourceFileChecksum: image.md5, assetDeliveryState: { state } },
  relationships: { appScreenshotSet: relationship('appScreenshotSets', setId) } }; }

test('native opaque RGB dimensions, PNG structure and actual bytes are validated', () => {
  const files = images(); assert.equal(files.iPhone.width, 1179); assert.equal(files.iPad.height, 2752);
  assert.equal(inspectPNG(png(1206, 2622), 'iPhone').width, 1206);
  assert.equal(inspectPNG(png(2048, 2732), 'iPad').width, 2048);
  assert.throws(() => inspectPNG(phoneBytes, 'iPad'), /dimensions/);
  assert.throws(() => inspectPNG(png(1179, 2556, { colorType: 6 }), 'iPhone'), /opaque/);
  assert.throws(() => inspectPNG(png(1179, 2556, { extra: [chunk('tRNS', Buffer.alloc(6))] }), 'iPhone'), /transparency/);
  const broken = Buffer.from(phoneBytes); broken[50] ^= 1;
  assert.throws(() => inspectPNG(broken, 'iPhone'), /checksum/);
  assert.throws(() => inspectPNG(Buffer.alloc(10 * 1024 * 1024 + 1), 'iPhone'), /input/);
});

test('wrong app, overlong or expired session and forbidden write routes are rejected', () => {
  const now = epoch(), lease = session(now); validateSession(lease, now);
  assert.throws(() => validateSession({ ...lease, appId: 'other' }, now), /session/);
  assert.throws(() => validateSession(lease, now + 291), /expired/);
  const overlong = session(now - 10); overlong.expiresAt = now + 400;
  assert.throws(() => validateSession(overlong, now), /expired/);
  for (const [method, path] of [['DELETE', '/v1/appScreenshots/shot-1'], ['POST', '/v1/appStoreVersionSubmissions'],
    ['GET', '/v1/apps/other/appStoreVersions'], ['PATCH', '/v1/apps/6835483226'], ['GET', '//evil.apple.com/path']]) {
    assert.throws(() => assertRequest(method, path), AssetsError);
  }
});

test('upload chunks must exactly partition the file and approved HTTPS hosts', () => {
  const image = images().iPhone, size = image.fileSize;
  const invalid = [
    [operation(size, { offset: -1 })], [operation(size, { length: size + 1 })], [operation(size, { length: size - 1 })],
    [operation(size), operation(size)], [operation(size, { method: 'POST' })],
    ...['http://store.apple.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://apple.com.evil.example/x',
      'https://evil.example/x', 'https://api.appstoreconnect.apple.com/x', 'https://store.apple.com:444/x', 'https://user:pass@store.apple.com/x']
      .map(url => [operation(size, { url })]),
    [operation(size, { requestHeaders: [{ name: 'Authorization', value: 'Bearer secret' }] })],
    [operation(size, { requestHeaders: [{ name: 'x-amz-foo', value: 'Bearer secret' }] })],
    [operation(size, { requestHeaders: [{ name: 'Content-Type', value: 'image/png\r\nauthorization: bad' }] })],
    [operation(size, { requestHeaders: [{ name: 'Content-Length', value: String(size - 1) }] })],
  ];
  for (const ops of invalid) assert.throws(() => validateUploadOperations(ops, image, 'secret'), AssetsError);
  assert.throws(() => validateUploadOperations([operation(size, { url: 'https://store.apple.com/x?credential=secret' })], image, 'secret'), /credential/);
  const approved = validateUploadOperations([operation(size)], image); assert.ok(Object.isFrozen(approved[0])); assert.ok(Object.isFrozen(approved[0].headers));
});

test('read-only plans bind exact BHU editable draft and contain no signed URLs or JWT', async () => {
  for (const options of [{ appId: 'wrong' }, { draftState: 'WAITING_FOR_REVIEW' }]) {
    const mock = mockApple(options); await assert.rejects(planWith(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
  const mock = mockApple(), { plan } = await planWith(mock);
  assert.equal(writes(mock).length, 0); assert.equal(plan.actions.length, 2);
  assert.equal(plan.appId, APP_ID); assert.equal(plan.locale, 'tr');
  const text = JSON.stringify(plan); assert.ok(!text.includes(mock.lease.token)); assert.ok(!text.includes('private-upload-token')); assert.ok(!text.includes('https://'));
});

test('existing user screenshot conflicts stop before mutation; other display sets are preserved', async () => {
  const file = images().iPhone, set = existingSet('user-set', file.displayType), shot = existingShot('user-shot', set.id, file);
  shot.attributes.fileName = 'my-personal-screenshot.png';
  const conflicting = mockApple({ sets: [set], screenshots: [shot] });
  await assert.rejects(planWith(conflicting), /preserved/); assert.equal(writes(conflicting).length, 0);
  const other = existingSet('different-display', 'APP_IPHONE_65'), mock = mockApple({ sets: [other] });
  const { plan, files } = await planWith(mock);
  const receipt = await applyPlan({ client: mock.client, plan, images: files, wait: async () => {} });
  assert.ok(receipt.completed); assert.deepEqual(mock.sets.get(other.id), other);
  assert.ok(!mock.calls.some(x => x.method === 'DELETE'));
});

test('stale baseline, tampered plan and changed screenshot bytes stop before writes', async () => {
  const mock = mockApple(), { plan, files } = await planWith(mock);
  mock.sets.set('new-user-set', existingSet('new-user-set', files.iPhone.displayType));
  await assert.rejects(applyPlan({ client: mock.client, plan, images: files }), /stale/); assert.equal(writes(mock).length, 0);
  const clean = mockApple(), current = await planWith(clean), tampered = structuredClone(current.plan);
  tampered.actions[0].displayType = 'APP_IPHONE_65';
  await assert.rejects(applyPlan({ client: clean.client, plan: tampered, images: current.files }), /stale/);
  const changed = { ...current.files, iPhone: { ...current.files.iPhone, data: Buffer.from(phoneBytes) } }; changed.iPhone.data[50] ^= 1;
  await assert.rejects(applyPlan({ client: clean.client, plan: current.plan, images: changed }), /bytes/); assert.equal(writes(clean).length, 0);
});

test('upload protocol uses exact chunk bytes, whole-file MD5 and verified COMPLETE read-back', async () => {
  const mock = mockApple({ commitComplete: true }), { plan, files } = await planWith(mock);
  const receipt = await applyPlan({ client: mock.client, plan, images: files, wait: async () => {} });
  assert.ok(receipt.completed); assert.ok(receipt.assets.every(x => x.state === 'COMPLETE' && x.setCreated && x.screenshotCreated));
  assert.equal(mock.calls.filter(x => x.method === 'POST' && new URL(x.url).pathname === '/v1/appScreenshotSets').length, 2);
  assert.equal(mock.calls.filter(x => x.method === 'POST' && new URL(x.url).pathname === '/v1/appScreenshots').length, 2);
  const puts = mock.calls.filter(x => x.method === 'PUT'); assert.equal(puts.length, 4);
  assert.deepEqual(Buffer.concat(puts.slice(0, 2).map(x => x.body)), files.iPhone.data);
  assert.deepEqual(Buffer.concat(puts.slice(2).map(x => x.body)), files.iPad.data);
  const commits = mock.calls.filter(x => x.method === 'PATCH').map(x => JSON.parse(x.body));
  assert.equal(commits[0].data.attributes.sourceFileChecksum, files.iPhone.md5); assert.equal(commits[1].data.attributes.sourceFileChecksum, files.iPad.md5);
  assert.equal(mock.calls.filter(x => x.method === 'GET' && /^\/v1\/appScreenshots\//.test(new URL(x.url).pathname)).length, 2);
  const safe = JSON.stringify(receipt); assert.ok(!safe.includes('https://')); assert.ok(!safe.includes(mock.lease.token)); assert.ok(!safe.includes('private-upload-token')); assert.ok(!safe.includes('/synthetic/'));
});

test('exact completed existing screenshots are reused without creating assets', async () => {
  const files = images(), sets = [existingSet('phone-set', files.iPhone.displayType), existingSet('pad-set', files.iPad.displayType)],
    shots = [existingShot('phone-shot', sets[0].id, files.iPhone), existingShot('pad-shot', sets[1].id, files.iPad)];
  const mock = mockApple({ sets, screenshots: shots }), { plan } = await planWith(mock, files);
  const receipt = await applyPlan({ client: mock.client, plan, images: files });
  assert.ok(receipt.completed); assert.equal(writes(mock).length, 0); assert.ok(receipt.assets.every(x => !x.screenshotCreated));
});

test('partial upload failure records resource IDs and never commits or retries the failed resource', async () => {
  const mock = mockApple({ uploadFailAt: 3 }), { plan, files } = await planWith(mock);
  await assert.rejects(applyPlan({ client: mock.client, plan, images: files, wait: async () => {} }), error => {
    assert.equal(error.receipt.completed, false); assert.equal(error.receipt.assets[0].state, 'COMPLETE');
    assert.equal(error.receipt.assets[1].screenshotId, 'shot-2'); assert.equal(error.receipt.assets[1].setId, 'set-2');
    assert.equal(error.receipt.failure.inspectCreatedResourcesBeforeRetry, true);
    assert.ok(!JSON.stringify(error.receipt).includes('private-upload-token')); return true;
  });
  assert.equal(mock.calls.filter(x => x.method === 'PUT').length, 3); assert.equal(mock.calls.filter(x => x.method === 'PATCH').length, 1);
  const before = writes(mock).length; await assert.rejects(planWith(mock, files), /preserved/); assert.equal(writes(mock).length, before);
});

test('failed, incomplete or mismatched processed assets stop before the next family', async () => {
  for (const options of [{ failedPoll: true }, { pending: true }, { commitComplete: true, changedChecksum: true }]) {
    const mock = mockApple(options), { plan, files } = await planWith(mock);
    await assert.rejects(applyPlan({ client: mock.client, plan, images: files, wait: async () => {}, pollAttempts: 2 }), error => {
      assert.equal(error.receipt.assets[0].screenshotId, 'shot-1'); assert.equal(error.receipt.assets[1].state, 'NOT_STARTED'); return true;
    });
    assert.equal(mock.calls.filter(x => x.method === 'POST' && new URL(x.url).pathname === '/v1/appScreenshots').length, 1);
  }
});

test('asset upload requires an immutable validated one-use operation and stops on lease expiry', async () => {
  const image = images().iPhone, now = epoch(), lease = session(now); let time = now, requests = 0;
  const client = createClient(lease, { now: () => time, fetchImpl: async () => { requests++; return new Response(null, { status: 200 }); } });
  assert.equal(Object.hasOwn(client, 'sessionToken'), false);
  await assert.rejects(client.upload(operation(image.fileSize), image), /authorized/); assert.equal(requests, 0);
  const [op] = client.validateOperations([operation(image.fileSize)], image);
  assert.throws(() => { op.url = 'https://evil.example/x'; }, TypeError);
  await client.upload(op, image); assert.equal(requests, 1);
  await assert.rejects(client.upload(op, image), /authorized/); assert.equal(requests, 1);
  time = now + 291; await assert.rejects(client.request('GET', '/v1/apps'), /expired/); assert.equal(requests, 1);
});
