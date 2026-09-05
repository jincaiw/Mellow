/**
 * V6-P0 一键完整构建 editor 渲染层（消灭「只跑抽取忘了上游构建」时序坑）：
 *   1. CoreEditor（vendored MarkEdit）yarn build → dist/index.html（含 core-main）
 *   2. editor-core wrapper build（bundle.js / buildBundleHtml）
 *   3. editor-engine build（dist/*.js，含 wysiwygBlocks/mdTokens 最新真值）
 *   4. build-editor-bundle.mjs 抽取 + 版本指纹
 *   5. verify-release-bundle.mjs 自检
 *
 * 用法：node apps/desktop/scripts/build-editor-all.mjs
 * （CI 的 release.yml 已按相同顺序编排；本脚本供本地手工构建/排查）
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
