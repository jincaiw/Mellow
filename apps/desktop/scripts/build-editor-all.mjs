/**
 * V6-P0 一键完整构建 editor 渲染层（消灭「只跑抽取忘了上游构建」时序坑）：
 *   1. CoreEditor（vendored MarkEdit）yarn build → dist/index.html（含 core-main）
 *   2. editor-core wrapper build（bundle.js / buildBundleHtml）
 *   3. editor-engine build（dist/*.js，含 wysiwygBlocks/mdTokens 最新真值）
 *   4. build-editor-bundle.mjs 抽取 + 版本指纹
 *   5. verify-release-bundle.mjs 自检
 *
 * 用法：node apps/desktop/scripts/build-editor-all.mjs
 *
 * V7-W5（G7-TYPO-04）：原注释写「CI 的 release.yml 已按相同顺序编排」是**假的** ——
 * `ci.yml` 与 `release.yml` 都从未调用本脚本，也从未执行 `verify-release-bundle.mjs`
 * （渲染层指纹锁形同虚设 → 本地/CI 构建链分叉无人发现）。现由 `ci.yml` 的
 * `desktop-frontend` job 在 `pnpm run build` 之后显式跑指纹校验，
 * 并由 `tests/parity/verify-build-pipeline.mjs` 护栏锁定该步骤不得被删。
 * 本脚本仍供本地一键构建/排查使用。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');

const run = (cmd, args, cwd) => {
  console.log(`\n▶ ${cmd} ${args.join(' ')}  (cwd=${cwd})`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`✗ step failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
};

run('yarn', ['build'], resolve(repo, 'packages/editor-core/CoreEditor'));
run('pnpm', ['--filter', '@mellow/editor-core', 'run', 'build'], repo);
run('pnpm', ['--filter', '@mellow/editor-engine', 'run', 'build'], repo);
run('node', ['scripts/build-editor-bundle.mjs'], root);
run('node', ['scripts/verify-release-bundle.mjs'], root);
console.log('\n✓ editor bundle 全链路构建完成（CoreEditor → engine → bundle → verify）');
