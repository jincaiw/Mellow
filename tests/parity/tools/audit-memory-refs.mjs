#!/usr/bin/env node
/**
 * 本机工具（**不进 CI**，**不依赖 Typora**）：核对**记忆文件 / skill** 的交叉引用与编号完整性。
 *
 * 【为什么需要它】（2026-10-09，审计 §4.232）
 *   `MEMORY.md` / `PITFALLS.md` 在 `.workbuddy-ai/` 下、skill 在用户目录下 —— **都不在仓库内**
 *   ⇒ **CI 守不了它们**（本仓的 23 个护栏只扫仓库）。于是「**范围端点**」与「交叉引用」
 *   全靠**手工维护**，实测已漂：`MEMORY.md` 写着「`PITFALLS §4.290`–`PITFALLS §4.342`」，
 *   而 PITFALLS 已到 **`PITFALLS §4.349`**（端点每加一节就漂一次，**没有任何人守**）。
 *
 * ⚠️ **输出是候选，不是判定结果**：
 *   · **硬**问题（悬空引用 / 编号重复 / 缺号）⇒ 退出码 1；
 *   · **软**问题（范围端点 ≠ 当前最大节号）⇒ 只**报出**，不改退出码 —— 作者可能**故意**固定到某节。
 * ⚠️ 记忆文件 / skill **不存在**时**如实报告并正常退出**（干净检出里没有它们）。
 *
 * 用法：`node tests/parity/tools/audit-memory-refs.mjs`
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(import.meta.dirname, '../../..');
const AUDIT = 'docs/qualification/release-blocker-audit-2026-09-25.md';

const SOURCES = [
  { name: 'PITFALLS', path: resolve(root, '.workbuddy-ai/memory/PITFALLS.md'), re: /^## 4\.(\d+)[ \t]/gm, label: '§4.' },
  { name: 'MEMORY', path: resolve(root, '.workbuddy-ai/memory/MEMORY.md'), re: /^### 4\.(\d+)[ \t]/gm, label: '§4.' },
  { name: '审计文档', path: resolve(root, AUDIT), re: /^## 4\.(\d+)[ \t]/gm, label: '§4.' },
  { name: 'skill', path: resolve(homedir(), '.workbuddy-ai/skills/static-contract-guard-hygiene/SKILL.md'), re: /^## (\d+)\./gm, label: '§' },
];

const hard = [];
const soft = [];
const sections = new Map();   // name -> { nums:Set, max, count }

for (const s of SOURCES) {
  if (!existsSync(s.path)) {
    console.log(`ℹ️ ${s.name}：**不存在**（${s.path}）—— 跳过（干净检出里没有它）`);
    sections.set(s.name, null);
    continue;
  }
  const lines = readFileSync(s.path, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const seen = new Map();
  const dup = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = s.re.exec(lines[i]);
    s.re.lastIndex = 0;
    if (m === null) continue;
    const n = Number(m[1]);
    if (seen.has(n)) dup.push(`${s.label}${n}（L${seen.get(n)} / L${i + 1}）`);
    else seen.set(n, i + 1);
  }
  const nums = [...seen.keys()].sort((a, b) => a - b);
  const gaps = [];
  for (let i = nums[0]; i <= nums[nums.length - 1]; i += 1) if (!seen.has(i)) gaps.push(i);
  const max = nums[nums.length - 1];
  sections.set(s.name, { nums: new Set(nums), max, count: nums.length });
  const head = `${s.name}：编号 ${nums.length} 个 · 范围 ${s.label}${nums[0]}–${s.label}${max}`;
  if (dup.length > 0) hard.push(`${s.name} 编号**重复**：${dup.join('、')}`);
  if (gaps.length > 0) {
    hard.push(`${s.name} 编号**缺号** ${gaps.length} 个：${gaps.slice(0, 20).map((g) => s.label + g).join('、')}`
      + `${gaps.length > 20 ? ' …' : ''}（若是有意跳过，请在该节位置留一行说明）`);
  }
  console.log(`${head} · 重复 ${dup.length ? dup.length + ' 处' : '(无)'} · 缺号 ${gaps.length ? gaps.length + ' 个' : '(无)'}`);
}

// ── MEMORY 的交叉引用（只查 MEMORY：它是「跨会话入口」，指针失效代价最大）──
const mem = sections.get('MEMORY');
const memPath = resolve(root, '.workbuddy-ai/memory/MEMORY.md');
if (mem !== null && existsSync(memPath)) {
  const src = readFileSync(memPath, 'utf8').replace(/\r\n/g, '\n');
  const REFS = [
    { re: /PITFALLS[^\n]{0,12}?§4\.(\d+)/g, target: 'PITFALLS', what: 'PITFALLS §4.N' },
    { re: /审计\s*§4\.(\d+)/g, target: '审计文档', what: '审计 §4.N' },
    { re: /skill[^\n]{0,10}?§(\d+)/g, target: 'skill', what: 'skill §N' },
  ];
  let refCount = 0;
  for (const { re, target, what } of REFS) {
    const t = sections.get(target);
    if (t === null || t === undefined) continue;
    for (const m of src.matchAll(re)) {
      refCount += 1;
      if (!t.nums.has(Number(m[1]))) {
        hard.push(`MEMORY 引用了**不存在**的 ${what}：§${m[1]}（${target} 当前最大 §${t.max}）`);
      }
    }
  }
  console.log(`MEMORY 交叉引用：${refCount} 处（PITFALLS / 审计 / skill）`);
  // ── 范围端点（**软**：作者可能故意固定到某节）──
  for (const m of src.matchAll(/(PITFALLS(?:\.md)?|审计文档?)\s*§4\.(\d+)\s*[–—]\s*§4\.(\d+)/g)) {
    const target = m[1].startsWith('PITFALLS') ? 'PITFALLS' : '审计文档';
    const t = sections.get(target);
    if (t === null || t === undefined) continue;
    if (Number(m[3]) !== t.max) {
      soft.push(`MEMORY 的「${m[1]} §4.${m[2]}–§4.${m[3]}」**端点可疑**：${target} 当前最大是 §${t.max}`
        + ' —— 若本意是「该系列到最新」，请改为**不写端点**的形态（如「`PITFALLS §4.290` **起**」）');
    }
  }
  if (soft.length === 0) console.log('MEMORY 范围端点：未发现可疑项');
}

// ── **仓库里**的 `PITFALLS §4.N` 引用（2026-10-10，审计 §4.258）──────────────────────
// 【为什么补】上面那段**只查 MEMORY 的交叉引用**（旧注释里明写了这个范围）。但**仓库里**还有
//   **296 处** `PITFALLS §4.N` **数字引用**（按数字计、含 `–` 范围两端；审计文档 215 / 护栏注释 34 /
//   master-plan 3 / README 2 / 本工具 4 …）—— 而 `PITFALLS.md` **不在仓库内** ⇒ **CI 永远查不了它们**，
//   只能靠本工具。⚠️ 悬空的代价与 MEMORY 相同：读者按编号**找不到依据**；护栏注释里的那 34 处尤其如此
//   —— 它们是「**为什么立这条判据**」的唯一线索（判据本体的注释只写「见 PITFALLS §4.N」）。
//   ⚠️ 计数口径要写清：**匹配数**（正则命中次数）是 **256**，**数字数**（范围两端各算一个）是 **296**
//     —— 两个都对，差别在口径（同族：本仓「报数必须同时报口径」）。
// 【判据】仓库（`git ls-files --cached --others --exclude-standard`，按文本扩展名过滤）里
//   `PITFALLS §4.N`（含 `–` 范围写法）指向的节必须**存在** ⇒ 否则**硬**（退出码 1）。
//   ⚠️ 例外：`PITFALLS_REF_SENTINELS` —— 护栏 canary 用的**哨兵编号**（刻意不存在），逐条给理由。
//   ⚠️ 谓词要求 `§4.` 后**紧跟数字** ⇒ 正则字面量（`§4\.(\d+)`）与 `PITFALLS §4.N`（占位符）都不会命中。
{
  // 哨兵编号：**刻意不存在**，且**必须仍被引用**（否则例外表自己过期）
  const PITFALLS_REF_SENTINELS = new Map([
    [9999, '护栏 canary 的哨兵编号：`verify-doc-code-refs.mjs` 用它验证「限定词必须紧邻」这条谓词'
      + '（`PITFALLS §4.9999` 不得被当成**裸** `§4.N`）'],
  ]);
  const TEXT_EXT = /\.(md|mjs|cjs|js|ts|tsx|rs|json|yml|yaml|css)$/;
  let repoFiles = [];
  try {
    repoFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).filter((f) => TEXT_EXT.test(f));
  } catch {
    console.log('ℹ️ 仓库引用核对：`git ls-files` 不可用 ⇒ 跳过（本工具要求在有 git 的检出里运行）');
  }
  const pit = sections.get('PITFALLS');
  if (repoFiles.length > 0 && pit !== null && pit !== undefined) {
    // 判定与 canary **共用**本 RE 与例外表
    const RE = /PITFALLS(?:\.md)?[^\n§]{0,14}?§4\.(\d+)(?:\s*[–—~]\s*§?4?\.?(\d+))?/g;
    const numsOf = (s) => [...s.matchAll(RE)]
      .flatMap((m) => [Number(m[1]), m[2] ? Number(m[2]) : null]).filter((n) => n !== null);
    let refs = 0;
    let sentinelSeen = 0;
    const dangling = [];
    for (const f of repoFiles) {
      let src; try { src = readFileSync(resolve(root, f), 'utf8'); } catch { continue; }
      src.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
        for (const n of numsOf(line)) {
          refs += 1;
          if (PITFALLS_REF_SENTINELS.has(n)) { sentinelSeen += 1; continue; }
          if (!pit.nums.has(n)) {
            dangling.push(`${f}:${i + 1} → \`PITFALLS §4.${n}\``);
          }
        }
      });
    }
    for (const d of dangling) {
      hard.push(`仓库里引用了**不存在**的 PITFALLS 节：${d}（PITFALLS 当前最大 §4.${pit.max}）`
        + ' —— 读者按编号找不到依据；请改为存在的节号，或补写该节');
    }
    // 防空转：扫描面 / 谓词漂移会让本检查**空转**（立此判据时基线 296 个数字引用，下限 200）
    if (refs < 200) {
      hard.push(`仓库里只找到 ${refs} 处 \`PITFALLS §4.N\` 数字引用（下限 200 = 立此判据时的基线 296 − 余量）`
        + ' —— 扫描面或谓词漂移会让本检查**空转**');
    }
    // 例外表**双向**：哨兵编号必须仍被引用（否则是过期例外 ⇒ 应删）
    if (sentinelSeen === 0) {
      hard.push('`PITFALLS_REF_SENTINELS` 里的哨兵编号**已不再被引用** —— 请删除该例外条目');
    }
    if (pit.nums.has(9999)) {
      hard.push('哨兵编号竟成了**真实节号** —— 例外表已失去意义，请删掉该条目');
    }
    // canary：四向（构造样本；**编号运行时拼接**，避免本工具命中自己）
    const P = 'PITFALLS §4.';
    const SENT = String(9) + String(9) + String(9) + String(9);
    if (numsOf(`${P}1`).join(',') !== '1') hard.push('仓库引用核对 canary 失效：单节引用未被解析');
    if (numsOf(`${P}1–§4.3`).join(',') !== '1,3') hard.push('仓库引用核对 canary 失效：范围端点未被解析');
    if (numsOf(`${P}N`).length !== 0) hard.push('仓库引用核对**过宽**：占位符 `§4.N`（非数字）被当成引用');
    if (numsOf(`${P}${SENT}`).join(',') !== SENT) {
      hard.push('仓库引用核对 canary 失效：哨兵样本未被解析 ⇒ 例外表失去意义');
    }
    console.log(`仓库 PITFALLS 引用：${refs} 处（悬空 ${dangling.length} · 哨兵 ${sentinelSeen} 处，`
      + `例外表 ${PITFALLS_REF_SENTINELS.size} 个）`);
  }
}

console.log('\n=== 硬问题（悬空引用 / 重复 / 缺号）===');if (hard.length === 0) console.log('（无）');
for (const h of hard) console.log(`- ${h}`);
console.log('=== 软问题（候选，需人工判断）===');
if (soft.length === 0) console.log('（无）');
for (const s of soft) console.log(`- ${s}`);

process.exit(hard.length > 0 ? 1 : 0);
