#!/usr/bin/env node
/**
 * 本机工具（**不进 CI**）：普查 parity 护栏里的「防空转下限」是否**过松**。
 *
 * 为什么需要它（2026-10-08，审计 §4.167）：
 *   本仓对「覆盖型下限」的纪律是「**下限 == 当前基线**」（skill §2，先例：
 *   `verify-parity-ledger.mjs` 的 `45 → 50`）。但**这条纪律只被手工应用过一次**，
 *   于是同型缺陷复发：`verify-release-gate.mjs` 的护栏数量下限写 `18` 而实际已是 `23`
 *   —— 它自己声明的意图「防某人悄悄删掉一条」**连删 5 条都不会红**。
 *   ⇒ 教训「已记录」不等于「不会再犯」；**只有落成可执行的手段才算真的学到**。
 *
 * 原理（**机械**）：把某处下限的阈值抬 1 再跑该护栏 —— 对 `<` / `<=` / `>=` / `>` **都是同一方向**
 * （抬 1 = 更严）：
 *   · **仍绿** ⇒ 实际值比阈值更松 ⇒ 该下限**过松**（留了 ≥1 个空位）
 *   · 转红     ⇒ 实际值 == 阈值 ⇒ 该下限**贴着基线**
 *
 * ⚠️ **本工具的输出是「候选」，不是「缺陷」** —— 下限有两类，取法不同：
 *   · **覆盖型**（防「成员悄悄消失」，集合是**人工维护的枚举**）⇒ **必须 == 当前基线**；
 *   · **健康度型**（防「解析器 / 扫描面失效」，集合由**内容**产生）⇒ **必须留余量**
 *     （否则每加一个文案键就红）。
 *   ⚠️ **工具只做「机械」的那一半**（「抬 1 仍绿」= 客观事实）。它**附带**按关键词把附近
 *   文本分成三桶，那**只是提示、不可靠** —— 同一段注释里往往两类措辞都有。实测反例：
 *   `zh.size < 700` 的注释写的是「低于下限说明解析器漏了一大类」= **健康度型**，
 *   却被关键词误分到「覆盖型」桶。⇒ **必须人工读原文判定**，**不要**照桶机械收紧。
 *
 * ⚠️ **安全前提（两条，缺一不可）**：
 *   ① **工作区必须干净** —— 本工具**就地突变**源码文件，靠 `git checkout --` 兜底还原；
 *   ② 还原用 **`git checkout --`**（而不是内存里的副本）—— 否则**进程被 SIGTERM 时
 *      会把突变**留在盘上**，污染后续所有结论（2026-10-08 实测踩到：一个残留的阈值
 *      让我把「实际值」判错）。
 *
 * 用法：`node tests/parity/tools/audit-guard-bounds.mjs`
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const PARITY = resolve(root, 'tests/parity');
const TIMEOUT = Number(process.env.BOUND_AUDIT_TIMEOUT_MS ?? 180000);

const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts });

// ── 前提 ①：工作区必须干净 ────────────────────────────────────────────────
const dirty = git(['status', '--porcelain']);
if (dirty !== '') {
  console.error('拒绝运行：工作区不干净 —— 本工具会就地突变源码文件，必须能用 `git checkout --` 兜底还原。');
  console.error('请先提交或 stash 改动。当前改动：\n' + dirty);
  process.exit(2);
}

const runGuard = (rel) => {
  try {
    execFileSync(process.execPath, [rel], { cwd: root, stdio: 'pipe', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 });
    return true;
  } catch { return false; }
};

// 只认「下限」形态：`X.length < N` 与 `X.size >= N`（两种写法都要认 ——
// ⚠️ 2026-10-09 实测：首版**只认 `< N`**，于是台账里两处用 `>= N` 写的覆盖型下限
//    （`ids.size >= 50` / `scanned >= 74`）**被漏检** ⇒ 「38 处」是**低估**。
const BOUND = /([A-Za-z_$][\w$.]*(?:\(\))?)\.(length|size)\s*(<=|<|>=|>)\s*(\d+)/g;
// 自述意图的抽取（供人判断该下限属哪一类）
const INTENT_COVERAGE = /悄悄|消失|删掉|删条目|成员|萎缩|不该缩小|不得被删空|不得缩小/;
const INTENT_HEALTH = /解析|扫描面|漂移|空转|失效|过窄|漏成员/;

/** 就地突变 → 跑 → **用 git 兜底还原**（不依赖内存副本：进程被杀时内存副本救不了盘） */
// ⚠️ **被 SIGTERM 时 `finally` 不会跑**（2026-10-09，审计 §4.190 实测：本工具被 kill 后
//    在 `verify-release-gate.mjs` 留下一处突变 `< 9` → `< 10`，直到下次跑门禁才暴露 ——
//    因为 `okSample` 的 canary 当场判「合法样本被判为不一致」）
//    ⇒ 另注册信号处理器**主动还原**（`git checkout --` 幂等，重复执行无害）。
let mutatedRel = null;
const restoreNow = () => {
  if (mutatedRel === null) return;
  git(['checkout', '--', mutatedRel], { stdio: 'ignore' });
  mutatedRel = null;
};
process.on('SIGTERM', () => { restoreNow(); process.exit(143); });
process.on('SIGINT', () => { restoreNow(); process.exit(130); });
const withMutation = (abs, text, fn) => {
  const rel = abs.slice(root.length + 1);
  mutatedRel = rel;
  try {
    writeFileSync(abs, text);
    return fn();
  } finally {
    git(['checkout', '--', rel], { stdio: 'ignore' });
    mutatedRel = null;
  }
};

const guards = readdirSync(PARITY).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort();
const candidates = [];
let tight = 0, skipped = 0;

for (const g of guards) {
  const rel = `tests/parity/${g}`;
  const abs = join(PARITY, g);
  if (!existsSync(abs)) continue;
  const orig = readFileSync(abs, 'utf8');
  const hits = [...orig.matchAll(BOUND)];
  if (hits.length === 0) continue;
  if (!runGuard(rel)) { console.error(`⚠️ ${g} 基线就红 ⇒ 跳过（先修基线）`); continue; }

  for (const m of hits) {
    const [full, lhs, prop, op, numStr] = m;
    const n = Number(numStr);
    if (n < 3) { skipped += 1; continue; }
    // 把阈值抬 1（对 `<` / `<=` / `>=` / `>` 都是**同一个方向**：抬 1 = 更严）
    const mutated = orig.slice(0, m.index) + `${lhs}.${prop} ${op} ${n + 1}` + orig.slice(m.index + full.length);
    const stillGreen = withMutation(abs, mutated, () => runGuard(rel));
    if (!stillGreen) { tight += 1; continue; }
    const ctx = orig.slice(Math.max(0, m.index - 200), m.index + 240);
    // ⚠️ 关键词分桶**只是提示**（不可靠 —— 同段注释常含两类措辞）⇒ 必须人工读原文
    const kind = INTENT_COVERAGE.test(ctx) ? '命中覆盖型关键词' : INTENT_HEALTH.test(ctx) ? '命中健康度型关键词' : '两类关键词都未命中';
    candidates.push({ g, expr: `${lhs}.${prop} ${op} ${n}`, kind });
  }
}

console.log(`贴着基线的下限：${tight} 处 · **过松（留了 ≥1 个空位）**：${candidates.length} 处 · 跳过（<3）：${skipped}`);
if (candidates.length) {
  console.log('\n候选（⚠️ 候选 ≠ 缺陷：**覆盖型**必须 == 当前基线；**健康度型**留余量是正常的）：');
  const order = ['命中覆盖型关键词', '两类关键词都未命中', '命中健康度型关键词'];
  for (const k of order) {
    const xs = candidates.filter((c) => c.kind === k);
    if (xs.length === 0) continue;
    console.log(`\n  【${k}】${xs.length} 处`);
    for (const c of xs) console.log(`    ${c.g.padEnd(42)} ${c.expr}`);
  }
}
console.log('\n⚠️ 结束前请确认工作区仍干净：`git status --porcelain`');
