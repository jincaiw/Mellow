// 版本号同步 —— 单一事实源：src-tauri/tauri.conf.json 的 "version"。
// 同步到 package.json 与 src-tauri/Cargo.toml（三平台 bundle 元数据版本一致）。
//
// 用法（apps/desktop 下）：node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CONF = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(readFileSync(CONF, 'utf8'));
const version = conf.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`invalid version in ${CONF}: ${version}`);
  process.exit(1);
}

// package.json
const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml';
let cargo = readFileSync(cargoPath, 'utf8');
if (!cargo.match(new RegExp(`^version = "${version}"$`, 'm'))) {
  cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
  writeFileSync(cargoPath, cargo);
}

console.log(`version synced: ${version} (tauri.conf.json / package.json / Cargo.toml)`);
