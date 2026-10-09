#!/usr/bin/env node
/**
 * 本机工具（**不进 CI**，**不依赖 Typora**）：核对**记忆文件 / skill** 的交叉引用与编号完整性。
 *
 * 【为什么需要它】（2026-10-09，审计 §4.232）
 *   `MEMORY.md` / `PITFALLS.md` 在 `.workbuddy-ai/` 下、skill 在用户目录下 —— **都不在仓库内**
 *   ⇒ **CI 守不了它们**（本仓的 23 个护栏只扫仓库）。于是「**范围端点**」与「交叉引用」
 *   全靠**手工维护**，实测已漂：`MEMORY.md` 写着「`PITFALLS.md §4.290–§4.342`」，
 *   而 PITFALLS 已到 **§4.349**（端点每加一节就漂一次，**没有任何人守**）。
 *
 * ⚠️ **输出是候选，不是判定结果**：
 *   · **硬**问题（悬空引用 / 编号重复 / 缺号）⇒ 退出码 1；
 *   · **软**问题（范围端点 ≠ 当前最大节号）⇒ 只**报出**，不改退出码 —— 作者可能**故意**固定到某节。
 * ⚠️ 记忆文件 / skill **不存在**时**如实报告并正常退出**（干净检出里没有它们）。
 *
 * 用法：`node tests/parity/tools/audit-memory-refs.mjs`
 */
import { readFileSync, existsSync } from 'node:fs';
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
        + ' —— 若本意是「该系列到最新」，请改为**不写端点**的形态（如「§4.290 **起**」）');
    }
  }
  if (soft.length === 0) console.log('MEMORY 范围端点：未发现可疑项');
}

console.log('\n=== 硬问题（悬空引用 / 重复 / 缺号）===');
if (hard.length === 0) console.log('（无）');
for (const h of hard) console.log(`- ${h}`);
console.log('=== 软问题（候选，需人工判断）===');
if (soft.length === 0) console.log('（无）');
for (const s of soft) console.log(`- ${s}`);

process.exit(hard.length > 0 ? 1 : 0);
