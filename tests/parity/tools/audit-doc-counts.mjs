#!/usr/bin/env node
/**
 * 本机工具（**不进 CI**）：普查「**活文档里多处复述的计数**」—— 供人工逐处判定「这处有判据吗」。
 *
 * 为什么需要它（2026-10-09，审计 §4.170–§4.189，同族 **19 次**）：
 *   本仓最高频的缺陷形态是「**只锁了一半**」—— 一个真值被**多处复述**，而判据只覆盖其中**一处**。
 *   实测（2026-10-09 的 13 轮审计）：升版 4 处（3 处副本）· 30 个核心任务（4 处）· 观测规模 120
 *   （模板 3 处）· UX Score 权重/门槛（人工侧 + 机器侧）· 上游文件数 199（2 处）……
 *   ⇒ 教训早已写过多次，**只有落成可执行的手段才算真的学到**（同 §4.167 的纪律）。
 *
 * 用法：`node tests/parity/tools/audit-doc-counts.mjs [--min N]`
 *   默认 `--min 3`（出现在 ≥3 个文件里才报，避免噪声）。
 *
 * ⚠️ **输出是「候选」，不是「缺陷」** —— 同一短语出现在多处**未必**是问题：
 *   · 历史记录（带日期 / release-notes / 审计日志 / 归档）**本来就该保留原值**；
 *   · 「30 个核心 Typora 任务」这类**宪法级**数字，多处复述**是设计**（只是需要判据守住）。
 *   ⇒ **必须人工逐处读**：问「**这处有判据吗**」，而不是「这个数字对不对」。
 *
 * 排除面（**按职责**，不是按文件名碰巧）：归档 / 带日期的记录 / 发布说明 / 审计日志。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const minIdx = args.indexOf('--min');
const MIN = minIdx === -1 ? 3 : Number(args[minIdx + 1]);

const root = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 })
  .toString().split('\0').filter((f) => f.endsWith('.md'))
  .filter((f) => !f.startsWith('docs/plans/archive/') && !f.startsWith('archive/')
    && !/release-blocker-audit/.test(f) && !/release-notes/.test(f)
    && !/20\d\d-\d\d-\d\d/.test(f));

// 短语 = 「数字 + 量词 + 名词」（剥掉加粗，否则 `**9 项**` 与 `9 项` 会被当成两种写法）
const PHRASE = /(\d+)\s*(个|项|条|处|类|份|种|行|次|例|键)\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z-]{1,8})/g;
const byPhrase = new Map();
for (const f of files) {
  const src = readFileSync(`${root}/${f}`, 'utf8').replace(/\*\*/g, '');
  for (const m of src.matchAll(PHRASE)) {
    if (Number(m[1]) < 3) continue; // 1/2 多为序数，噪声大
    const key = `${m[1]} ${m[2]}${m[3]}`;
    if (!byPhrase.has(key)) byPhrase.set(key, new Set());
    byPhrase.get(key).add(f);
  }
}
const multi = [...byPhrase].filter(([, s]) => s.size >= MIN).sort((a, b) => b[1].size - a[1].size);

console.log(`活文档 ${files.length} 份；出现于 ≥${MIN} 个文件的计数短语 = ${multi.length} 条\n`);
for (const [k, s] of multi) {
  console.log(`${k}   [${s.size} 处]`);
  for (const f of [...s].slice(0, 6)) console.log(`    · ${f}`);
  if (s.size > 6) console.log(`    · …（另 ${s.size - 6} 处）`);
}
console.log('\n⚠️ 这是**候选**不是缺陷：请逐处问「这处有判据吗」（审计 §4.183 的三步法）。');
