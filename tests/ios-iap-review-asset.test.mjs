import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { APP_ID, BUNDLE, AssetsError } from '../scripts/ios-app-store-assets.mjs';
import { IAP_ID, PRODUCT_ID, inspectReviewPNG, createReviewClient, assertReviewRequest,
  compileReviewPlan, applyReviewPlan } from '../scripts/ios-iap-review-asset.mjs';

// Generated pixels, mock credentials, mock API only. Never read private or production assets.
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(name, data = Buffer.alloc(0)) {
  const value = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
  for (const b of value) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, value, checksum]);
}
function png(width, height, colorType = 2) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = colorType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(height * (width * (colorType === 6 ? 4 : 3) + 1)))), chunk('IEND')]);
}
const bytes = png(1179, 2556);
const image = () => inspectReviewPNG(bytes, '/synthetic/review.png');
const epoch = () => Math.floor(Date.now() / 1000);
function session(now = epoch()) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { appId: APP_ID, expiresAt: now + 300, sourceCommit: 'a'.repeat(40), purpose: 'synthetic IAP image test',
    token: `${encode({ alg: 'ES256' })}.${encode({ aud: 'appstoreconnect-v1', iat: now, exp: now + 300 })}.synthetic-signature` };
}
const relationship = (type, id) => ({ data: { type, id } });
const resourceType = 'inAppPurchaseAppStoreReviewScreenshots';
function shot(file = image(), overrides = {}) {
  return { type: resourceType, id: 'existing-review', attributes: { fileName: file.fileName, fileSize: file.fileSize,
    sourceFileChecksum: file.md5, assetDeliveryState: { state: 'COMPLETE' }, ...overrides },
    relationships: { inAppPurchaseV2: relationship('inAppPurchases', IAP_ID) } };
}
const operation = (size, overrides = {}) => ({ method: 'PUT', url: 'https://store-030.blobstore.apple.com/review?signature=private-upload-token',
  offset: 0, length: size, requestHeaders: [{ name: 'Content-Type', value: 'image/png' }], ...overrides });

function mockApple(options = {}) {
  const lease = session(), calls = []; let asset = options.asset ? structuredClone(options.asset) : null, uploads = 0;
  const state = { ...options };
  const json = data => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (input, init) => {
    const url = new URL(input); calls.push({ url: input, method: init.method, body: init.body, headers: init.headers });
    assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    if (url.origin !== 'https://api.appstoreconnect.apple.com') {
      uploads++; assert.equal(init.method, 'PUT'); assert.ok(Buffer.isBuffer(init.body));
      assert.ok(!Object.keys(init.headers).some(key => key.toLowerCase() === 'authorization'));
      assert.ok(!JSON.stringify(init.headers).includes(lease.token));
      if (state.uploadFailAt === uploads) return new Response('private-upload-token', { status: 503 });
      return new Response(null, { status: 200 });
    }
    assert.equal(init.headers.Authorization, `Bearer ${lease.token}`);
    const path = url.pathname, payload = init.body ? JSON.parse(init.body).data : null;
    if (init.method === 'GET' && path === '/v1/apps') {
      assert.equal(url.searchParams.get('filter[bundleId]'), BUNDLE);
      return json([{ type: 'apps', id: state.appId ?? APP_ID, attributes: { bundleId: BUNDLE, primaryLocale: 'tr' } }]);
    }
    if (init.method === 'GET' && path === `/v1/apps/${APP_ID}/appStoreVersions`) return json([{ type: 'appStoreVersions', id: 'version-1',
      attributes: { versionString: '1.0', platform: 'IOS', appVersionState: state.draftState ?? 'PREPARE_FOR_SUBMISSION' },
      relationships: { app: relationship('apps', APP_ID) } }]);
    if (init.method === 'GET' && path === `/v1/apps/${APP_ID}/inAppPurchasesV2`) {
      assert.equal(url.searchParams.get('filter[productId]'), PRODUCT_ID);
      const product = { type: 'inAppPurchases', id: state.iapId ?? IAP_ID,
        attributes: { productId: state.productId ?? PRODUCT_ID, inAppPurchaseType: state.productType ?? 'NON_CONSUMABLE', state: state.productState ?? 'MISSING_METADATA' },
        relationships: { appStoreReviewScreenshot: { data: asset ? { type: resourceType, id: asset.id } : null } } };
      if (state.missingRelationship) delete product.relationships.appStoreReviewScreenshot;
      return json([product]);
    }
    if (init.method === 'POST' && path === '/v1/inAppPurchaseAppStoreReviewScreenshots') {
      assert.equal(payload.type, resourceType); assert.deepEqual(payload.relationships.inAppPurchaseV2, relationship('inAppPurchases', IAP_ID));
      const size = payload.attributes.fileSize, first = Math.floor(size / 2);
      asset = { ...payload, id: 'new-review', attributes: { ...payload.attributes, assetDeliveryState: { state: 'AWAITING_UPLOAD' }, uploadOperations: state.operations ?? [
        operation(size, { offset: first, length: size - first }), operation(size, { length: first })] } };
      if (state.reservationFileName) asset.attributes.fileName = state.reservationFileName;
      return json(asset);
    }
    const match = path.match(/^\/v1\/inAppPurchaseAppStoreReviewScreenshots\/([^/]+)$/);
    if (init.method === 'PATCH' && match) {
      assert.ok(asset); assert.equal(payload.id, asset.id); assert.equal(payload.attributes.uploaded, true);
      assert.match(payload.attributes.sourceFileChecksum, /^[a-f0-9]{32}$/);
      asset.attributes.sourceFileChecksum = payload.attributes.sourceFileChecksum;
      asset.attributes.assetDeliveryState = { state: state.commitComplete ? 'COMPLETE' : 'UPLOAD_COMPLETE' };
      return json(asset);
    }
    if (init.method === 'GET' && match) {
      assert.ok(asset); assert.equal(match[1], asset.id);
      if (asset.id === 'new-review') {
        asset.attributes.assetDeliveryState = { state: state.failedPoll ? 'FAILED' : state.pending ? 'UPLOAD_COMPLETE' : 'COMPLETE' };
        if (state.changedChecksum) asset.attributes.sourceFileChecksum = '0'.repeat(32);
        if (state.processedFileName) asset.attributes.fileName = state.processedFileName;
        if (state.changedFileSize) asset.attributes.fileSize++;
        if (state.foreignProcessedParent) asset.relationships.inAppPurchaseV2 = relationship('inAppPurchases', 'other-product');
      }
      return json(asset);
    }
    assert.fail(`Unexpected mock request ${init.method} ${path}`);
  };
  return { client: createReviewClient(lease, { fetchImpl }), lease, calls, state, get asset() { return asset; } };
}
const writes = mock => mock.calls.filter(call => call.method !== 'GET');
async function planWith(mock, file = image()) {
  const reviewedSha256 = file.sha256;
  return { plan: await compileReviewPlan({ request: mock.client.request, image: file, reviewedSha256 }), file, reviewedSha256 };
}
const applyWith = (mock, prepared, extra = {}) => applyReviewPlan({ client: mock.client, plan: prepared.plan, image: prepared.file,
  reviewedSha256: prepared.reviewedSha256, wait: async () => {}, ...extra });

test('review image requires a native opaque phone or iPad RGB PNG and the review-specific filename', () => {
  const file = image(); assert.equal(file.fileName, 'bhu-coklu-hesap-review.png'); assert.equal(file.width, 1179);
  assert.equal(inspectReviewPNG(png(1206, 2622)).height, 2622);
  const pad = inspectReviewPNG(png(2064, 2752)); assert.equal(pad.family, 'iPad'); assert.equal(pad.width, 2064); assert.equal(pad.height, 2752);
  assert.equal(inspectReviewPNG(png(2048, 2732)).family, 'iPad');
  assert.throws(() => inspectReviewPNG(png(2000, 2700)), /dimensions/);
  assert.throws(() => inspectReviewPNG(png(1179, 2556, 6)), /opaque/);
  const corrupted = Buffer.from(bytes); corrupted[50] ^= 1;
  assert.throws(() => inspectReviewPNG(corrupted), /checksum/);
});

test('planning requires the exact SHA-256 independently marked reviewed', async () => {
  const mock = mockApple(), file = image();
  for (const reviewedSha256 of [undefined, '', '0'.repeat(64), file.sha256.toUpperCase()]) {
    await assert.rejects(compileReviewPlan({ request: mock.client.request, image: file, reviewedSha256 }), AssetsError);
  }
  assert.equal(writes(mock).length, 0);
  const { plan } = await planWith(mock, file); assert.equal(plan.reviewedSha256, file.sha256);
  const text = JSON.stringify(plan); assert.ok(!text.includes(mock.lease.token)); assert.ok(!text.includes('https://')); assert.ok(!text.includes('private-upload-token'));
});

test('only the exact BHU draft and editable non-consumable product can be planned', async () => {
  for (const option of [{ appId: 'other-app' }, { draftState: 'WAITING_FOR_REVIEW' }, { iapId: 'other-iap' },
    { productId: 'other.product' }, { productType: 'CONSUMABLE' }, { productState: 'IN_REVIEW' },
    { productState: 'APPROVED' }, { missingRelationship: true }]) {
    const mock = mockApple(option); await assert.rejects(planWith(mock), AssetsError); assert.equal(writes(mock).length, 0);
  }
  const ready = mockApple({ productState: 'READY_TO_SUBMIT' }); await planWith(ready); assert.equal(writes(ready).length, 0);
});

test('existing review images are preserved unless the exact original file is already COMPLETE', async () => {
  for (const changes of [{ fileName: 'user-screenshot.png' }, { sourceFileChecksum: '0'.repeat(32) }, { fileSize: image().fileSize + 1 }, { assetDeliveryState: { state: 'AWAITING_UPLOAD' } }]) {
    const mock = mockApple({ asset: shot(image(), changes) }); await assert.rejects(planWith(mock), /preserv/i); assert.equal(writes(mock).length, 0);
  }
  const foreign = shot(); foreign.relationships.inAppPurchaseV2 = relationship('inAppPurchases', 'other-product');
  const bad = mockApple({ asset: foreign }); await assert.rejects(planWith(bad), AssetsError); assert.equal(writes(bad).length, 0);
  const exact = mockApple({ asset: shot() }), prepared = await planWith(exact), receipt = await applyWith(exact, prepared);
  assert.ok(receipt.completed); assert.equal(receipt.asset.id, 'existing-review'); assert.equal(receipt.asset.created, false); assert.equal(writes(exact).length, 0);
});

test('Apple canonical SOURCE filename reuses only the exact completed reviewed iPad asset without upload', async () => {
  const file = inspectReviewPNG(png(2064, 2752), '/synthetic/native-ipad-review.png');
  const mock = mockApple({ asset: shot(file, { fileName: 'SOURCE' }), productState: 'READY_TO_SUBMIT' });
  const prepared = await planWith(mock, file); assert.equal(prepared.plan.action, 'reuse');
  const receipt = await applyWith(mock, prepared);
  assert.equal(receipt.completed, true); assert.equal(receipt.asset.id, 'existing-review');
  assert.equal(receipt.asset.fileName, file.fileName); assert.equal(receipt.asset.storedFileName, 'SOURCE');
  assert.equal(receipt.asset.state, 'COMPLETE'); assert.equal(receipt.asset.created, false);
  assert.equal(writes(mock).length, 0);
  for (const changes of [{ fileSize: file.fileSize + 1 }, { sourceFileChecksum: '0'.repeat(32) }, { assetDeliveryState: { state: 'UPLOAD_COMPLETE' } }, { fileName: 'source' }]) {
    const wrong = mockApple({ asset: shot(file, { fileName: 'SOURCE', ...changes }) });
    await assert.rejects(planWith(wrong, file), /preserv/i); assert.equal(writes(wrong).length, 0);
  }
  const foreign = shot(file, { fileName: 'SOURCE' }); foreign.relationships.inAppPurchaseV2 = relationship('inAppPurchases', 'other-product');
  const wrong = mockApple({ asset: foreign }); await assert.rejects(planWith(wrong, file), /another product/); assert.equal(writes(wrong).length, 0);
});

test('SOURCE is accepted after commit with exact bytes but never as a reservation filename', async () => {
  const mock = mockApple({ processedFileName: 'SOURCE' }), prepared = await planWith(mock), receipt = await applyWith(mock, prepared);
  assert.equal(receipt.completed, true); assert.equal(receipt.asset.storedFileName, 'SOURCE');
  assert.equal(mock.calls.filter(x => x.method === 'POST').length, 1); assert.equal(mock.calls.filter(x => x.method === 'PUT').length, 2);
  const early = mockApple({ reservationFileName: 'SOURCE' }), fresh = await planWith(early);
  await assert.rejects(applyWith(early, fresh), error => {
    assert.match(error.message, /Reserved review screenshot/); assert.equal(error.receipt.asset.created, true); return true;
  });
  assert.equal(early.calls.filter(x => x.method === 'PUT' || x.method === 'PATCH').length, 0);
});

test('stale product state, changed image or tampered plan stops before any POST', async () => {
  const stale = mockApple(), prepared = await planWith(stale); stale.state.productState = 'READY_TO_SUBMIT';
  await assert.rejects(applyWith(stale, prepared), /stale/i); assert.equal(writes(stale).length, 0);
  const mock = mockApple(), current = await planWith(mock), modified = structuredClone(current.plan);
  modified.reviewedSha256 = '0'.repeat(64);
  await assert.rejects(applyWith(mock, { ...current, plan: modified }), AssetsError);
  const changed = { ...current.file, data: Buffer.from(bytes) }; changed.data[50] ^= 1;
  await assert.rejects(applyWith(mock, { ...current, file: changed }), AssetsError); assert.equal(writes(mock).length, 0);
  await assert.rejects(applyWith(mock, current, { reviewedSha256: '0'.repeat(64) }), AssetsError); assert.equal(writes(mock).length, 0);
});

test('successful reserve/PUT/MD5 commit verifies COMPLETE even when commit already says COMPLETE', async () => {
  const mock = mockApple({ commitComplete: true }), prepared = await planWith(mock), receipt = await applyWith(mock, prepared);
  assert.ok(receipt.completed); assert.equal(receipt.asset.id, 'new-review'); assert.equal(receipt.asset.state, 'COMPLETE'); assert.equal(receipt.asset.created, true);
  const reserve = mock.calls.filter(call => call.method === 'POST'); assert.equal(reserve.length, 1);
  const payload = JSON.parse(reserve[0].body).data;
  assert.deepEqual(payload.attributes, { fileName: prepared.file.fileName, fileSize: prepared.file.fileSize });
  const puts = mock.calls.filter(call => call.method === 'PUT'); assert.equal(puts.length, 2); assert.deepEqual(Buffer.concat(puts.map(call => call.body)), prepared.file.data);
  const commits = mock.calls.filter(call => call.method === 'PATCH'); assert.equal(commits.length, 1);
  assert.deepEqual(JSON.parse(commits[0].body).data.attributes, { uploaded: true, sourceFileChecksum: prepared.file.md5 });
  assert.equal(mock.calls.filter(call => call.method === 'GET' && new URL(call.url).pathname === '/v1/inAppPurchaseAppStoreReviewScreenshots/new-review').length, 1);
  const safe = JSON.stringify(receipt); assert.ok(!safe.includes('https://')); assert.ok(!safe.includes(mock.lease.token)); assert.ok(!safe.includes('private-upload-token')); assert.ok(!safe.includes('/synthetic/'));
});

test('reviewed native iPad screenshot is uploaded without conversion and read back COMPLETE', async () => {
  const file = inspectReviewPNG(png(2064, 2752), '/synthetic/native-ipad-review.png');
  const mock = mockApple(), prepared = await planWith(mock, file), receipt = await applyWith(mock, prepared);
  assert.ok(receipt.completed); assert.equal(receipt.asset.family, 'iPad');
  assert.equal(prepared.plan.image.width, 2064); assert.equal(prepared.plan.image.height, 2752);
  assert.equal(prepared.plan.reviewedSha256, file.sha256);
  assert.deepEqual(Buffer.concat(mock.calls.filter(call => call.method === 'PUT').map(call => call.body)), file.data);
  const committed = JSON.parse(mock.calls.find(call => call.method === 'PATCH').body);
  assert.equal(committed.data.attributes.sourceFileChecksum, file.md5);
});

test('unsafe upload operations stop with a safe reserved resource receipt and no byte upload', async () => {
  const file = image();
  for (const operations of [[operation(file.fileSize, { url: 'https://evil.example/upload' })],
    [operation(file.fileSize, { length: file.fileSize - 1 })],
    [operation(file.fileSize, { requestHeaders: [{ name: 'Authorization', value: 'Bearer confidential' }] })]]) {
    const mock = mockApple({ operations }), prepared = await planWith(mock, file);
    await assert.rejects(applyWith(mock, prepared), error => {
      assert.equal(error.receipt.asset.id, 'new-review'); assert.equal(error.receipt.asset.created, true);
      assert.equal(error.receipt.failure.inspectCreatedResourcesBeforeRetry, true); assert.ok(!JSON.stringify(error.receipt).includes('confidential')); return true;
    });
    assert.equal(mock.calls.filter(call => call.method === 'PUT').length, 0); assert.equal(mock.calls.filter(call => call.method === 'PATCH').length, 0);
  }
});

test('partial upload failure retains reserved ID, never retries POST and protects the pending asset', async () => {
  const mock = mockApple({ uploadFailAt: 2 }), prepared = await planWith(mock);
  await assert.rejects(applyWith(mock, prepared), error => {
    assert.equal(error.receipt.completed, false); assert.equal(error.receipt.asset.id, 'new-review'); assert.equal(error.receipt.asset.created, true);
    assert.equal(error.receipt.failure.inspectCreatedResourcesBeforeRetry, true); assert.ok(!JSON.stringify(error.receipt).includes('private-upload-token')); return true;
  });
  assert.equal(mock.calls.filter(call => call.method === 'POST').length, 1); assert.equal(mock.calls.filter(call => call.method === 'PUT').length, 2);
  assert.equal(mock.calls.filter(call => call.method === 'PATCH').length, 0);
  const before = writes(mock).length; await assert.rejects(planWith(mock), /preserv/i); assert.equal(writes(mock).length, before);
});

test('failed, pending, changed-checksum or foreign processed asset cannot report success', async () => {
  for (const option of [{ failedPoll: true }, { pending: true }, { commitComplete: true, changedChecksum: true }, { foreignProcessedParent: true },
    { processedFileName: 'SOURCE', changedChecksum: true }, { processedFileName: 'SOURCE', changedFileSize: true },
    { processedFileName: 'SOURCE', foreignProcessedParent: true }, { processedFileName: 'other.png' }]) {
    const mock = mockApple(option), prepared = await planWith(mock);
    await assert.rejects(applyWith(mock, prepared, { pollAttempts: 2 }), error => {
      assert.equal(error.receipt.completed, false); assert.equal(error.receipt.asset.id, 'new-review'); return true;
    });
    assert.equal(mock.calls.filter(call => call.method === 'POST').length, 1);
  }
});

test('route allowlist excludes deletion, pricing, submission and unrelated app routes', () => {
  for (const [method, path] of [['DELETE', '/v1/inAppPurchaseAppStoreReviewScreenshots/review-1'],
    ['PATCH', `/v2/inAppPurchases/${IAP_ID}`], ['POST', '/v1/inAppPurchaseSubmissions'], ['POST', '/v1/inAppPurchasePrices'],
    ['GET', '/v1/apps/other/inAppPurchasesV2'], ['GET', '//evil.apple.com/x'], ['POST', '/v1/appScreenshots']]) {
    assert.throws(() => assertReviewRequest(method, path), AssetsError);
  }
});

test('client never exposes bearer and requires immutable one-use upload operations before expiry', async () => {
  const now = epoch(), lease = session(now), file = image(); let time = now, requests = 0;
  const client = createReviewClient(lease, { now: () => time, fetchImpl: async () => { requests++; return new Response(null, { status: 200 }); } });
  assert.equal(Object.hasOwn(client, 'sessionToken'), false);
  await assert.rejects(client.upload(operation(file.fileSize), file), AssetsError); assert.equal(requests, 0);
  const [approved] = client.validateOperations([operation(file.fileSize)], file);
  assert.ok(Object.isFrozen(approved)); assert.throws(() => { approved.url = 'https://evil.example/x'; }, TypeError);
  await client.upload(approved, file); assert.equal(requests, 1);
  await assert.rejects(client.upload(approved, file), AssetsError); assert.equal(requests, 1);
  time = now + 291; await assert.rejects(client.request('GET', '/v1/apps'), AssetsError); assert.equal(requests, 1);
});
