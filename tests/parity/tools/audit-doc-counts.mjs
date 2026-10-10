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
 * ✅ **2026-10-10 增补（审计 §4.262）：把「逐处三步法」的**第一步**机械化** ——
 *   每处候选现在带一条**分类提示**，把人从「先判它是声称还是引用」里解放出来：
 *     · `ADR（只追加 ⇒ 多为引用）` —— ADR 是**决策记录**，复述门槛数字通常是**引用原文**
 *       ⇒ **改了反而错**（本仓明文规则「ADR 只追加、不改写」）。
 *       ⚠️ **例外**：**被判据现读**的 ADR（如 `ADR-0020` 的 V1.0 门槛 —— 判据 ⑨c 两侧现读）
 *       ⇒ 提示仍标 ADR，**但那一处必须跟**（判据会红）。
 *     · `声称当前（⑨b 覆盖）` —— 该文件里这条短语**与「当前状态真值源」标记同文件出现**
 *       ⇒ 它**声称的是当前**，必须 == 门禁现算（已由 ⑨b 守）。
 *     · 无提示 ⇒ **人工读**（既非 ADR 也无标记）。
 *   ⚠️ **提示只是提示**：实测（§4.262）本轮 5 条候选里 **4 条是引用/历史、1 条已被判据覆盖** ⇒
 *     **0 缺陷** —— 这正是「候选 ≠ 缺陷」的实证。
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

/** 该文件里「该短语」的出现是否与「当前状态真值源」标记同处一行 —— 判定与 canary **共用**。 */
const claimsCurrent = (srcLines, phrase) => srcLines.some((l) => l.includes(phrase) && l.includes('当前状态真值源'));
/** 分类提示（**只是提示**，不代替人工判定）。判定与 canary **共用**。 */
const hintOf = (file, srcLines, phrase) => {
  const parts = [];
  if (file.startsWith('docs/adr/')) parts.push('ADR（只追加 ⇒ 多为**引用**；⚠️ 若该处被判据现读则必须跟）');
  if (claimsCurrent(srcLines, phrase)) parts.push('**声称当前**（⑨b 覆盖）');
  return parts.length === 0 ? '' : ` —— ${parts.join(' · ')}`;
};

// canary：三向（构造样本；与判定**共用** claimsCurrent / hintOf）
const failCanary = (msg) => { console.error(`\n⚠️ ${msg}\n`); process.exitCode = 1; };
{
  const lines = ['> 当前状态真值源 = 门禁输出（`PASS-E = 0/50`、未闭环 10 项）'];
  if (!claimsCurrent(lines, '未闭环 10 项')) {
    failCanary('计数短语分类 canary 失效：与「当前状态真值源」同行的短语未被识别为「声称当前」');
  }
  if (claimsCurrent(['本行的 10 项未闭环 是 2026-08 的记录'], '10 项未闭环')) {
    failCanary('计数短语分类**过宽**：无标记的行被判为「声称当前」');
  }
  // ⚠️ 样本里的 ADR 编号**运行时拼接** —— 写字面量会被「编号引用必须存在」判据（㉒）抓
  //   （本仓已踩多次：判据自己就在扫描面里）。
  const FAKE_ADR = `docs/adr/ADR-${String(0)}${String(9)}${String(9)}-x.md`;
  if (!hintOf(FAKE_ADR, ['无标记'], '10 项未闭环').includes('ADR')) {
    failCanary('计数短语分类 canary 失效：ADR 文件未被标注');
  }
  if (hintOf('docs/plans/x.md', ['无标记'], '10 项未闭环') !== '') {
    failCanary('计数短语分类**过宽**：既非 ADR 也无标记的文件被给了提示');
  }
}

console.log(`活文档 ${files.length} 份；出现于 ≥${MIN} 个文件的计数短语 = ${multi.length} 条\n`);
for (const [k, s] of multi) {
  console.log(`${k}   [${s.size} 处]`);
  for (const f of [...s].slice(0, 6)) {
    const srcLines = readFileSync(`${root}/${f}`, 'utf8').replace(/\*\*/g, '').split('\n');
    console.log(`    · ${f}${hintOf(f, srcLines, k)}`);
  }
  if (s.size > 6) console.log(`    · …（另 ${s.size - 6} 处）`);
}
console.log('\n⚠️ 这是**候选**不是缺陷：请逐处问「这处有判据吗」（审计 §4.183 的三步法）。'
  + '\n   · 标了 `ADR` ⇒ 多为**引用**（ADR 只追加、不改写 ⇒ **改了反而错**），但**被判据现读的**那几处必须跟；'
  + '\n   · 标了 `声称当前` ⇒ 必须 == 门禁现算（⑨b 守）；'
  + '\n   · 无标记 ⇒ **人工读**（先问「这句是**声称当前**还是**引用/记录**」）。');
