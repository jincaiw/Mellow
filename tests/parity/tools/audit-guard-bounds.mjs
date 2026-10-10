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
 * ⚠️ **锁文件的落点必须在仓库内**（2026-10-10，审计 §4.273）：
 *   锁文件是「被 kill -9 后仍能自愈」的唯一依靠（`finally` 与信号处理器都救不了 SIGKILL）。
 *   它**曾经**落在 `os.tmpdir()` —— 在 macOS 上是 `/var/folders/…/T/`，
 *   **随重启 / 系统定期清理而消失**（且换机、改 `TMPDIR` 也会丢）。
 *   ⇒ 锁一丢，残留突变**再也无人还原**；而「工作区必须干净」的前置检查会让本工具
 *     **拒绝运行** ⇒ **自愈机制失效**（正是本文件上方注释警告过的那个失败模式，从另一条路径复现）。
 *   ✅ **实测复现**：手工造一处残留突变 + 删掉 `/tmp` 锁 ⇒ 本工具报「拒绝运行：工作区不干净」，
 *     残留**永久留下**；而残留的突变是「阈值抬 1」，**护栏照样全绿** ⇒ 可能被**直接提交**。
 *   ⇒ 现落在 **`<git-dir>/mellow-audit-guard-bounds.lock`**：不进版本库、不被系统清理、随仓库存在。
 *   ⚠️ 仍保留对**旧 `/tmp` 锁**的兼容清理（老会话留下的残留仍能被还原一次）。
 *
 * 用法：`node tests/parity/tools/audit-guard-bounds.mjs`
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const PARITY = resolve(root, 'tests/parity');
const TIMEOUT = Number(process.env.BOUND_AUDIT_TIMEOUT_MS ?? 180000);

const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts });

// 锁的落点：**仓库的 git 目录内**（不进版本库、不被系统清理）。
// ⚠️ **不保留对旧 `/tmp` 锁的兼容清理** —— 那需要 `os.tmpdir()`，而判据
//   `verify-release-gate.mjs` ⑭ 正是以「源码里不得出现 `tmpdir(`」来守「锁不得在仓库外」。
//   旧锁只在「本修复落地前被 kill」这一极小窗口里存在 ⇒ 由拒绝运行时的提示引导手工还原即可。
const LOCK_NAME = 'mellow-audit-guard-bounds.lock';
const GIT_DIR = git(['rev-parse', '--absolute-git-dir']).trim();
const LOCK = join(GIT_DIR, LOCK_NAME);

// ── 前提 ⓪：**先清理上次中断留下的突变**（必须在「工作区干净」检查**之前**）─────────────
// ⚠️ 顺序很重要（2026-10-09，审计 §4.190 实测）：若把清理放在干净检查**之后**，
//    残留突变会让检查失败 ⇒ 工具**拒绝运行** ⇒ **永远清理不了**（自愈机制失效）。
if (existsSync(LOCK)) {
  const stale = readFileSync(LOCK, 'utf8').trim();
  if (stale !== '') {
    git(['checkout', '--', stale], { stdio: 'ignore' });
    console.error(`⚠️ 清理上次中断留下的突变：${stale}（已 \`git checkout --\` 还原；锁=${LOCK}）`);
  }
  unlinkSync(LOCK);
}


// ── 前提 ①：工作区必须干净 ────────────────────────────────────────────────
const dirty = git(['status', '--porcelain']);
if (dirty !== '') {
  console.error('拒绝运行：工作区不干净 —— 本工具会就地突变源码文件，必须能用 `git checkout --` 兜底还原。');
  console.error('请先提交或 stash 改动。当前改动：\n' + dirty);
  // ⚠️ 若你**没改过**这些文件，很可能是上一次被 kill 留下的**残留突变**（锁文件丢了 ⇒ 自愈失效）
  //    ⇒ 手工 `git checkout -- <该文件>` 即可（残留突变是「阈值抬 1」，护栏照样全绿 ⇒ 别直接提交）。
  console.error(`⚠️ 若上面列出的文件你**没改过**，那是**上次中断留下的残留突变**`
    + `（自愈锁：${LOCK}）⇒ 手工 \`git checkout -- <文件>\` 还原，**不要**提交它。`);
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
// ⚠️ **信号处理器不够**（2026-10-09，审计 §4.190 实测）：`execFileSync` **阻塞**期间收到的
//    SIGTERM 会被**吞掉**（同步调用返回后 handler **不跑**）。独立小实验复现：
//    `start` → kill → 阻塞 6s 结束 → 打印 `after-sync` 而 **handler 未执行**。
//    ⇒ 另加**锁文件**兜底：突变前把目标文件写进 `/tmp` 的锁文件，**下次启动时先清理**
//    （`git checkout --` 幂等 ⇒ 重复清理无害）。这样即使被 `kill -9` 也能**自愈**。
let mutatedRel = null;
/** 还原 + **校验**：`git checkout --` 是幂等的，但「还原了却没生效」必须**说出来**而不是静默继续。 */
const restoreFile = (rel) => {
  git(['checkout', '--', rel], { stdio: 'ignore' });
  mutatedRel = null;
  if (existsSync(LOCK)) unlinkSync(LOCK);
  if (git(['status', '--porcelain', '--', rel]).trim() !== '') {
    console.error(`⚠️ 还原后 ${rel} **仍有未提交差异** —— 请手工 \`git checkout -- ${rel}\` 检查`);
  }
};
const restoreNow = () => { if (mutatedRel !== null) restoreFile(mutatedRel); };
process.on('SIGTERM', () => { restoreNow(); process.exit(143); });
process.on('SIGINT', () => { restoreNow(); process.exit(130); });
const withMutation = (abs, text, fn) => {
  const rel = abs.slice(root.length + 1);
  mutatedRel = rel;
  writeFileSync(LOCK, rel); // **先落锁**：即使本进程随后被 kill -9，下次启动也能自愈
  try {
    writeFileSync(abs, text);
    return fn();
  } finally {
    restoreFile(rel);
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
