/**
 * 生成 `packages/editor-core/upstream-manifest.json` —— 钉住 commit 的上游 CoreEditor 树哈希清单。
 *
 * 用途：让 `packages/editor-core/UPSTREAM.md` 的「Mellow 的 CoreEditor 改动」清单
 * **离线可校验**。为什么必须机器可校验：该清单是 re-vendor（`cp -R` 覆盖）之后
 * **唯一能重放 Mellow 改动**的依据，而 re-vendor 静默丢掉这些改动**不会让任何测试变红**
 * （审计 §4.36 / §4.45 的同一母题：清单写在散文里 = 没有守护）。
 *
 * 真值源：**`UPSTREAM.md` 的 `Commit:` 行**（不在本脚本里再写一遍 commit，避免两处漂移）。
 *
 * 用法：
 *   node tools/gen-upstream-manifest.mjs                      # 按 UPSTREAM.md 的 commit 联网取上游
 *   node tools/gen-upstream-manifest.mjs --tarball /path.tgz  # 用本地已下载的 tarball（离线）
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM_MD = resolve(root, 'packages/editor-core/UPSTREAM.md');
const OUT = resolve(root, 'packages/editor-core/upstream-manifest.json');

// 与 UPSTREAM.md「生成 / 校验清单」一节的 diff 命令保持一致的排除面
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.yarn']);
const EXCLUDE_FILE = (n) => n.endsWith('.tsbuildinfo') || n === 'yarn.lock';

const argv = process.argv.slice(2);
const argVal = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};

const md = readFileSync(UPSTREAM_MD, 'utf8');
const commit = md.match(/^- Commit:\s*([0-9a-f]{40})\s*$/m)?.[1];
if (commit === undefined) {
  console.error('✗ 无法从 UPSTREAM.md 解析 `- Commit: <40 位 hash>` —— 请先修正该文件');
  process.exit(1);
}
const repoUrl = md.match(/^- Repository:\s*(\S+)\s*$/m)?.[1] ?? '';

function walk(dir, rel = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      out.push(...walk(join(dir, entry.name), `${rel}${entry.name}/`));
      continue;
    }
    if (EXCLUDE_FILE(entry.name)) continue;
    out.push(`${rel}${entry.name}`);
  }
  return out;
}

// ── 取上游源码（本地 tarball 优先，否则按钉住 commit 下载）──────────────────
let tarball = argVal('--tarball', null);
const work = join(tmpdir(), `mellow-upstream-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

if (tarball === null) {
  tarball = join(work, 'markedit.tar.gz');
  const url = `${repoUrl.replace(/\/$/, '')}/archive/${commit}.tar.gz`;
  console.log(`取上游源码：${url}`);
  execFileSync('curl', ['-sL', '--max-time', '300', '-o', tarball, url], { stdio: 'inherit' });
}
if (!existsSync(tarball)) {
  console.error(`✗ tarball 不存在：${tarball}`);
  process.exit(1);
}
execFileSync('tar', ['-xzf', tarball, '-C', work], { stdio: 'inherit' });

const top = readdirSync(work, { withFileTypes: true }).find((e) => e.isDirectory());
if (top === undefined) {
  console.error('✗ tarball 解压后没有顶层目录');
  process.exit(1);
}
const upstreamCore = join(work, top.name, 'CoreEditor');
if (!existsSync(upstreamCore)) {
  console.error(`✗ 上游 tarball 里没有 CoreEditor/：${upstreamCore}`);
  process.exit(1);
}

// ── 哈希（sha256 前 16 位十六进制；足够防「静默改动」，且清单可读）──────────
const hashOf = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
const files = {};
for (const f of walk(upstreamCore).sort()) files[f] = hashOf(join(upstreamCore, f));

writeFileSync(OUT, `${JSON.stringify({
  _comment: '由 tools/gen-upstream-manifest.mjs 生成，勿手改。钉住 commit 的上游 CoreEditor 树哈希（sha256 前 16 位）。护栏 tests/parity/verify-upstream-manifest.mjs 用它离线校验 UPSTREAM.md 的改动清单。',
  repository: repoUrl,
  commit,
  algorithm: 'sha256-16',
  fileCount: Object.keys(files).length,
  files,
}, null, 2)}\n`, 'utf8');

rmSync(work, { recursive: true, force: true });
console.log(`✓ 已写 ${OUT}`);
console.log(`  commit=${commit}  上游 CoreEditor 文件数=${Object.keys(files).length}`);
