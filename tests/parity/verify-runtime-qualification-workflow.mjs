import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/runtime-qualification.yml'), 'utf8');
const cargoManifest = readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
const releaseBuilds = [...workflow.matchAll(/run:\s*cargo build --release([^\n]*)/g)];

if (!/workflow_dispatch:\s*\n\s+inputs:\s*\n\s+target:/.test(workflow)
  || !/macos-windows/.test(workflow)
  || !/inputs\.target == 'all' \|\| inputs\.target == 'macos-windows'/.test(workflow)) {
  throw new Error('Runtime Qualification must support a macOS/Windows-only dispatch while Linux is deferred');
}

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
if (!/locale-gen\s+zh_CN\.UTF-8/.test(workflow)
  || !/export LANG=zh_CN\.UTF-8 LC_CTYPE=zh_CN\.UTF-8/.test(workflow)) {
  throw new Error('Linux XIM-based IME matrix must generate and export zh_CN.UTF-8');
}

if (!/MELLOW_WINDOWS_RUNTIME_SENTINEL_20260831/.test(workflow)
  || !/Windows runtime smoke did not persist the editor input marker/.test(workflow)
  || !/\$content -notmatch \[regex\]::Escape\(\$marker\)/.test(workflow)) {
  throw new Error('Windows Runtime Qualification must assert that typed Markdown is saved back to disk');
}

console.log('Runtime Qualification embeds frontendDist on all platforms and gates Windows source persistence');
