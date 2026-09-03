/**
 * Adapter contract 护栏（V4 计划 P7 Exit Gate 的自动化部分）
 *
 * ① 核心包无平台分支：packages/**（除 vendored editor-core/CoreEditor 与构建产物）
 *    源码零运行时 Tauri 标识（AGENTS.md：平台代码只允许在 apps/desktop，ADR-0007 Host Adapter）。
 * ② 核心包零平台 API：process.platform / navigator.platform / userAgentData 不出现在核心包。
 * ③ Adapter contract 三方锚点：editor-core 契约（__MELLOW_BRIDGE__）→ desktop 构建期
 *    Tauri 适配器（build-editor-bundle.mjs）→ Rust System Core（bridge_call）链路锚点在位。
 * ④ 三平台打包矩阵：tauri.conf.json bundle targets 覆盖 macOS dmg / Windows msi+nsis /
 *    Linux appimage+deb+rpm，且含 .md File Association（P7 Windows 行）。
 * ⑤ drift canary：扫描器必须能检出合成违规（防「永远绿」假护栏）。
 *
 * 真机/CI 项（不在本护栏范围）：安装/卸载/更新矩阵、IME 真实交互矩阵、签名公证。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

// ── ① + ② 核心包平台边界扫描 ────────────────────────────────────────────
const PACKAGES_DIR = resolve(root, 'packages');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'CoreEditor']); // CoreEditor 是 vendored 上游（UPSTREAM.md 只读），由 editor-core neutral.test.ts 单独管辖
const SKIP_FILE = /(\.test\.ts|\.test\.tsx|\.d\.ts)$/; // 测试内断言字符串与类型声明不构成运行时平台分支
// 运行时 Tauri 标识（import/全局读取形式；注释性提及不算分支）
const TAURI_TOKENS = [/__TAURI_INTERNALS__/, /window\.__TAURI__/, /from ['"]@tauri-apps/, /require\(['"]@tauri-apps/, /tauri-plugin/];
const PLATFORM_API_TOKENS = [/process\.platform/, /navigator\.platform/, /navigator\.userAgentData/];

function* walkSources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walkSources(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !SKIP_FILE.test(entry)) {
      yield full;
    }
  }
}

function scanSources(baseDir, tokens) {
  const violations = [];
  for (const file of walkSources(baseDir)) {
    const text = readFileSync(file, 'utf8');
    for (const token of tokens) {
      if (token.test(text)) violations.push(`${relative(root, file)} ↔ ${token}`);
    }
  }
  return violations;
}

const tauriViolations = scanSources(PACKAGES_DIR, TAURI_TOKENS);
if (tauriViolations.length > 0) {
  fail(`核心包出现运行时 Tauri 标识（平台代码只允许在 apps/desktop，ADR-0007/AGENTS.md 架构细则）:\n  ${tauriViolations.join('\n  ')}`);
}
const platformViolations = scanSources(PACKAGES_DIR, PLATFORM_API_TOKENS);
if (platformViolations.length > 0) {
  fail(`核心包出现平台判定 API（三平台共用产品语义，平台差异只能在 Adapter）:\n  ${platformViolations.join('\n  ')}`);
}

// ── ③ Adapter contract 三方锚点 ─────────────────────────────────────────
const bridgeInjection = readFileSync(resolve(root, 'packages/editor-core/src/bridge-injection.ts'), 'utf8');
if (!bridgeInjection.includes('__MELLOW_BRIDGE__')) {
  fail('editor-core bridge-injection.ts 缺少 __MELLOW_BRIDGE__ 契约定义（ADR-0007）');
}
const bundleScript = readFileSync(resolve(root, 'apps/desktop/scripts/build-editor-bundle.mjs'), 'utf8');
if (!bundleScript.includes('__MELLOW_BRIDGE__') || !bundleScript.includes('__TAURI__')) {
  fail('build-editor-bundle.mjs 缺少 __MELLOW_BRIDGE__ → __TAURI__ 适配器接线（desktop 专属 Tauri Bridge Adapter）');
}
const bridgeRust = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/bridge.rs'), 'utf8');
if (!bridgeRust.includes('bridge_call')) {
  fail('Rust System Core bridge.rs 缺少 bridge_call 命令（桥契约 Rust 侧实现）');
}

// ── ④ 三平台打包矩阵（P7 任务表的构建级锚点）────────────────────────────
const tauriConf = readFileSync(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8');
for (const target of ['"dmg"', '"nsis"', '"msi"', '"appimage"', '"deb"', '"rpm"']) {
  if (!tauriConf.includes(target)) {
    fail(`tauri.conf.json bundle targets 缺少 ${target}（P7 三平台安装矩阵的构建级前提）`);
  }
}
if (!/"fileAssociations"/.test(tauriConf) || !/"md"/.test(tauriConf)) {
  fail('tauri.conf.json 缺少 .md File Association（P7 Windows「File Association / Open With」前提）');
}
if (!/"createUpdaterArtifacts": true/.test(tauriConf)) {
  fail('tauri.conf.json 未开启 createUpdaterArtifacts（P7 Exit Gate「更新矩阵」的构建级前提）');
}

// ── ③-b Windows JumpList（2026-09-03 用户裁决纳入实施；PRD §134 P1 Recent integration）──
//    三方锚点：前端 recordRecentFile（用户打开文档语义）→ Rust 命令 → Shell API 模块。
const jumplistRust = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/jumplist.rs'), 'utf8');
// 词边界正则（\b）：add_recent_renamed 之类超集子串不得假绿（canary 实证过 includes 缺陷）
if (!/\bpub fn add_recent\b/.test(jumplistRust) || !jumplistRust.includes('SHAddToRecentDocs')) {
  fail('src-tauri jumplist.rs 缺少 add_recent/SHAddToRecentDocs（Windows JumpList Rust 侧实现）');
}
const libRust = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/lib.rs'), 'utf8');
if (!libRust.includes('jump_list_add_recent')) {
  fail('src-tauri lib.rs 未注册 jump_list_add_recent 命令（JumpList 前端入口）');
}
const appTsSource = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8');
if (!appTsSource.includes("invoke('jump_list_add_recent'")) {
  fail('App.tsx recordRecentFile 未调用 jump_list_add_recent（JumpList 系统最近文档挂点）');
}
if (!readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8').includes('windows-sys')) {
  fail('src-tauri Cargo.toml 缺少 windows-sys（cfg(windows) target 依赖，JumpList Shell API）');
}

// ── ⑤ drift canary：扫描器自检（防「永远绿」假护栏）──────────────────────
const canaryViolations = [];
const canaryText = "import { invoke } from '@tauri-apps/api/core';\nwindow.__TAURI_INTERNALS__.invoke('x');";
for (const token of TAURI_TOKENS) {
  if (token.test(canaryText)) canaryViolations.push(String(token));
}
if (canaryViolations.length < 2) {
  fail('Adapter contract 护栏自检失败：扫描器无法检出合成 Tauri 违规，护栏已失效');
}
const canaryClean = "const x = { tauri: '注释性提及不构成分支' };";
if (TAURI_TOKENS.some((token) => token.test(canaryClean))) {
  fail('Adapter contract 护栏误报：注释性/普通对象提及被当作运行时平台分支');
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Adapter contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Adapter contract: core packages platform-neutral (0 runtime Tauri tokens, 0 platform APIs); bridge chain anchored (editor-core contract → desktop adapter → Rust bridge_call); 3-platform bundle matrix + .md file association + updater artifacts; drift canary armed');
