import { readFile, writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { resolve, dirname, extname, basename } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(resolve(destination, 'vendor'), { recursive: true });
const pages = (await readdir(root)).filter(name => name.endsWith('.html'));
const files = new Set(pages);
const allowed = new Set(['.js', '.css', '.svg', '.png', '.jpg', '.webp', '.ico', '.json']);
for (const page of pages) {
  const source = await readFile(resolve(root, page), 'utf8');
  for (const [, raw] of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const asset = raw.split(/[?#]/)[0];
    if (!asset || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(asset)) continue;
    if (asset.includes('..') || asset.startsWith('/') || asset !== basename(asset)) throw new Error(`Non-local asset in ${page}: ${asset}`);
    if (allowed.has(extname(asset))) files.add(asset);
  }
}
for (const file of files) {
  let contents = await readFile(resolve(root, file));
  if (file === 'index.html') {
    const html = contents.toString('utf8');
    if (!html.includes('</head>')) throw new Error('index.html must contain a head.');
    // Only the iOS build receives the native bridge SDK; the public web app is unchanged.
    contents = Buffer.from(html.replace(/(<script\b)/, '<script src="vendor/capacitor.js" defer></script>\n  $1'));
  }
  await mkdir(dirname(resolve(destination, file)), { recursive: true });
  await writeFile(resolve(destination, file), contents);
}
await copyFile(resolve(root, 'node_modules/@capacitor/core/dist/capacitor.js'), resolve(destination, 'vendor/capacitor.js'));
console.log(`Built ${files.size} offline app assets into dist/ (plus the local native bridge).`);
