import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/runtime-qualification.yml'), 'utf8');
const cargoManifest = readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
const releaseBuilds = [...workflow.matchAll(/run:\s*cargo build --release([^\n]*)/g)];

if (releaseBuilds.length !== 3) {
  throw new Error(`Expected exactly 3 Runtime Qualification release builds, found ${releaseBuilds.length}`);
}

for (const build of releaseBuilds) {
  if (!/--features\s+custom-protocol\b/.test(build[0])) {
    throw new Error(`Runtime Qualification release build must embed frontendDist: ${build[0]}`);
  }
}

if (!/^custom-protocol\s*=\s*\["tauri\/custom-protocol"\]$/m.test(cargoManifest)) {
  throw new Error('Desktop Cargo manifest must forward custom-protocol to Tauri');
}

if (!/ime-matrix-linux\.mjs --im=fcitx5 --driver=xdotool/.test(workflow)) {
  throw new Error('Linux IME matrix must use the XTEST driver that reaches WebKitGTK and fcitx5');
}
if (/apt-get install[^\n]*\bydotool\b|\bydotoold\b|--driver=ydotool/.test(workflow)) {
  throw new Error('Linux IME workflow must not use raw ydotool injection under Xvfb');
}

console.log('Runtime Qualification release builds embed frontendDist on Linux, Windows, and macOS');
