/**
 * vendored CoreEditor 的本地门禁检查（lint + jest）。
 *
 * ── 为什么需要它（2026-09-15 的真实事故）──────────────────────────────────
 * CI 的 `editor-core` job 跑的是：
 *   `yarn install --immutable && yarn build`（= eslint + codegen + vite build）`&& yarn test`（jest）
 * 而根 `parity` / `test` **都不包含**这两步 —— 于是「改了渲染层只跑 tsc」能一路绿灯，
 * 结果 **连续 6 次推送到 main 的 CI 全是 failure**，失败点全部在
 * `Vendored CoreEditor (yarn)` 这一步，根因是 3 个 ESLint 错误（unused import /
 * 未使用的变量 / nullable boolean 条件）。
 *
 * 本脚本把 CI 那一步的**可本地复现部分**（lint + jest）接进 `npm run parity`，
 * 使「改渲染层却漏跑 lint/test」不再可能悄悄通过。
 *
 * ── 跳过条件（有意为之，且必须响亮）─────────────────────────────────────
 * CI 的两个 parity job（`parity-guard` / `windows-parity-guard`）**刻意不装依赖**
 * （见 ci.yml 注释「不需要 pnpm install」），因此那里没有 CoreEditor 的 node_modules。
 * 此时本脚本打印 SKIP 并 **exit 0**（不算失败）—— 因为该场景下 CI 的 `editor-core` job
 * 已经跑过同一套 lint + jest，覆盖没有丢失。
 * 本机（有 node_modules）则真实执行，失败即非零退出。
 *
 * 运行：node tools/check-vendored-editor.mjs
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const coreEditorDir = resolve(root, 'packages/editor-core/CoreEditor');
const binSuffix = process.platform === 'win32' ? '.cmd' : '';
const eslint = resolve(coreEditorDir, `node_modules/.bin/eslint${binSuffix}`);
const jest = resolve(coreEditorDir, `node_modules/.bin/jest${binSuffix}`);

const missing = [
  ['eslint', eslint],
  ['jest', jest],
].filter(([, path]) => !existsSync(path)).map(([name]) => name);

if (missing.length > 0) {
  console.log(
    `SKIP vendored CoreEditor lint+jest：缺少 ${missing.join(' / ')}`
    + `（packages/editor-core/CoreEditor/node_modules/.bin）\n`
    + '  · CI 的 parity job 刻意不装依赖（见 ci.yml），该场景下由 CI 的 editor-core job\n'
    + '    执行同一套 yarn lint + yarn test，覆盖不丢失；\n'
    + '  · 若本机出现此行，说明 CoreEditor 依赖没装全 —— 请先在其目录执行 yarn install，\n'
    + '    否则「改了渲染层却没跑 lint/test」会再次静默通过。',
  );
  process.exit(0);
}

const steps = [
  { name: 'eslint .（CI: yarn build 的第一步）', bin: eslint, args: ['.'] },
  { name: 'jest（CI: yarn test）', bin: jest, args: [] },
];

for (const step of steps) {
  console.log(`==> vendored CoreEditor ${step.name}`);
  const result = spawnSync(step.bin, step.args, { cwd: coreEditorDir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(
      `\nvendored CoreEditor 检查失败：${step.name}\n`
      + '  CI 的 editor-core job 会执行同一步，此处失败即 CI 必红。请在提交前修复。',
    );
    process.exit(result.status ?? 1);
  }
}

console.log('vendored CoreEditor：lint + jest 通过');
