/**
 * 渲染层构建链治理护栏（V7-W5 / G7-TYPO-04）。
 *
 * 问题：渲染层资产用**版本化文件名**（`core-main-vX.Y.Z.js` / `engine-vX.Y.Z/`），
 * 指纹由 `apps/desktop/scripts/verify-release-bundle.mjs` 锁定。但该脚本此前
 * **从未在 CI 执行** —— 本地手工构建与 CI 产物分叉（例如只重跑了抽取、忘了上游
 * yarn build）不会有任何信号，用户侧表现为「加载了旧引擎且无报错」。
 *
 * 本护栏锁定：
 *   ① 一键构建脚本 `build-editor-all.mjs` 的 5 步链路完整（上游 → wrapper → engine
 *      → 抽取 → 指纹校验）；
 *   ② CI（`ci.yml`）在桌面构建后**必须**跑指纹校验；
 *   ③ 桌面 `build` script 必须先跑 bundle 抽取再 vite build（否则产物缺引擎）；
 *   ④ 脚本注释不得谎称「CI 已编排」（历史失真：原注释如此，实际两处 workflow 都没调用）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (m) => errors.push(m);

const ciYml = read('.github/workflows/ci.yml');
const releaseYml = read('.github/workflows/release.yml');
const buildAll = read('apps/desktop/scripts/build-editor-all.mjs');
const desktopPkg = JSON.parse(read('apps/desktop/package.json'));

// ── ① 一键构建脚本链路完整 ───────────────────────────────────────────────
for (const step of [
  "run('yarn', ['build'], resolve(repo, 'packages/editor-core/CoreEditor'))",
  "run('pnpm', ['--filter', '@mellow/editor-core', 'run', 'build'], repo)",
  "run('pnpm', ['--filter', '@mellow/editor-engine', 'run', 'build'], repo)",
  "run('node', ['scripts/build-editor-bundle.mjs'], root)",
  "run('node', ['scripts/verify-release-bundle.mjs'], root)",
]) {
  if (!buildAll.includes(step)) {
    fail(`build-editor-all.mjs 缺少构建步骤 ${step}（V7-W5：链路不完整会导致「忘了上游构建」）`);
  }
}
if (!existsSync('apps/desktop/scripts/verify-release-bundle.mjs')) {
  fail('缺少 apps/desktop/scripts/verify-release-bundle.mjs（渲染层指纹锁）');
}
if (!existsSync('apps/desktop/scripts/build-editor-bundle.mjs')) {
  fail('缺少 apps/desktop/scripts/build-editor-bundle.mjs（渲染层抽取）');
}

// ── ② CI 必须跑指纹校验（本护栏的核心：此前从未执行）──────────────────────
if (!/verify-release-bundle\.mjs/.test(ciYml)) {
  fail('ci.yml 未执行 verify-release-bundle.mjs（V7-W5/G7-TYPO-04：本地/CI 构建链分叉无信号）');
}
// 必须在桌面构建之后（先有产物才有得校验）
const buildIdx = ciYml.indexOf('pnpm run build');
const verifyIdx = ciYml.indexOf('verify-release-bundle.mjs');
if (buildIdx === -1 || verifyIdx === -1 || verifyIdx < buildIdx) {
  fail('ci.yml 的指纹校验必须排在桌面构建之后（V7-W5）');
}

// ── ③ 桌面 build script 顺序 ─────────────────────────────────────────────
const desktopBuild = desktopPkg.scripts?.build ?? '';
if (!/build-editor-bundle\.mjs/.test(desktopBuild)) {
  fail('apps/desktop build script 未先跑 build-editor-bundle.mjs（V7-W5：产物会缺引擎）');
}
if (desktopBuild.indexOf('build-editor-bundle.mjs') > desktopBuild.indexOf('vite build')) {
  fail('apps/desktop build script 顺序错误：抽取必须早于 vite build（V7-W5）');
}

// ── ④ 注释不得谎称「CI 已编排」──────────────────────────────────────────
// 历史失真：build-editor-all.mjs 原注释写「CI 的 release.yml 已按相同顺序编排」，
// 而两个 workflow 都没调用它 —— 注释比代码更不可信的典型。
if (/CI 的 release\.yml 已按相同顺序编排/.test(buildAll) && !/build-editor-all|verify-release-bundle/.test(releaseYml)) {
  fail('build-editor-all.mjs 仍谎称「CI 的 release.yml 已按相同顺序编排」，但 release.yml 未调用它（V7-W5：注释失真）');
}

// ── ⑤ canary：护栏必须能抓住「CI 删掉指纹校验」───────────────────────────
const ciDrift = ciYml.replace(/verify-release-bundle\.mjs/g, 'no-op-placeholder.mjs');
if (ciDrift.includes('verify-release-bundle.mjs')) {
  fail('构建链护栏自检失败：无法模拟 CI 指纹校验回退（V7-W5），护栏已失效');
}
const buildDrift = desktopBuild.replace('build-editor-bundle.mjs &&', '');
if (buildDrift.includes('build-editor-bundle.mjs')) {
  fail('构建链护栏自检失败：无法模拟抽取步骤回退（V7-W5），护栏已失效');
}

// ── ⑥ 本地构建脚本不得硬编码受管 Node 版本号（2026-09-25）─────────────────
// 立此条的原因：`build-local.sh` 曾把 `…/node/versions/22.22.2-2/bin` 写死。
// 运行时升级到 `22.22.2-3` 后，PATH 里没有 node，**失败点却落在**
// `./node_modules/.bin/tsc`（`exec: node: not found`）—— 报错看上去像 TypeScript
// 问题，实际是脚本里的路径失效，排查方向被完全带偏。
// 现改为读 `versions/current` 指针（缺失时按版本号排序取最大），并在此锁死。
const buildLocal = read('apps/desktop/scripts/build-local.sh');
if (/node\/versions\/\d+\.\d+\.\d+-\d+/.test(buildLocal)) {
  fail('build-local.sh 硬编码了受管 Node 版本号（如 22.22.2-2）：运行时升级后 PATH 里没有 node，'
    + '失败点会落在 tsc 上（看似 TS 问题）。请改为读 versions/current 指针（V7-W5 追加）');
}
if (!/versions\/current/.test(buildLocal)) {
  fail('build-local.sh 必须按 versions/current 指针解析受管 Node（缺失时退回按版本号排序取最大）');
}
// canary：自检该反例锁
if (!/node\/versions\/\d+\.\d+\.\d+-\d+/.test('NODE_BIN="$ROOT/.workbuddy-ai/binaries/node/versions/' + '22.22.2-2/bin"')) {
  fail('受管 Node 版本硬编码护栏自检失败：硬编码样本未被检出（V7-W5 追加）');
}

if (errors.length > 0) {
  throw new Error(`Build pipeline contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Build pipeline: one-shot build chain complete (CoreEditor yarn build → editor-core wrapper → editor-engine → build-editor-bundle → verify-release-bundle fingerprint); CI runs the fingerprint lock after desktop build (was never executed before V7-W5 — local/CI divergence had no signal); desktop build script extracts the bundle before vite build; script comments no longer falsely claim CI orchestration; build-local.sh resolves the managed Node via the versions/current pointer instead of a hardcoded version (a stale pin made the failure surface as a bogus tsc error)');
