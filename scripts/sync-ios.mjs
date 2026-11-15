import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const [command, args] of [['node', ['scripts/build-web.mjs']], ['npx', ['--no-install', 'cap', 'sync', 'ios']]]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Capacitor generates this local Swift package on every sync. Native Swift files
// are automatically discovered; include its privacy resource without editing the Xcode project.
const path = resolve(root, 'ios/App/CapApp-SPM/Package.swift');
let source = await readFile(path, 'utf8');
if (!source.includes('resources: [.process("Resources")]')) {
  const ending = /            \]\n        \)/g;
  if ([...source.matchAll(ending)].length !== 1) throw new Error('Unexpected Capacitor SPM template; review privacy-resource integration.');
  source = source.replace(ending, '            ],\n            resources: [.process("Resources")]\n        )');
  await writeFile(path, source);
}
console.log('Native plugins and privacy resources are ready for Xcode.');
