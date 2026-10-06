/**
 * 渲染层构建链治理护栏（V7-W5 / G7-TYPO-04）。
 *
 * 问题：渲染层资产用**版本化文件名**（`core-main-vX.Y.Z.js` / `engine-vX.Y.Z/`），
 * 指纹由 `apps/desktop/scripts/verify-release-bundle.mjs` 锁定。但该脚本此前
 * **从未在 CI 执行** —— 本地手工构建与 CI 产物分叉（例如只重跑了抽取、忘了上游
 * yarn build）不会有任何信号，用户侧表现为「加载了旧引擎且无报错」。
 *
 * 本护栏锁定：
 *   ① 一键构建脚本 `build-editor-all.mjs` 的 5 步链路完整（上游 → wrapper → engine
 *      → 抽取 → 指纹校验）；
 *   ② CI（`ci.yml`）在桌面构建后**必须**跑指纹校验；
 *   ③ 桌面 `build` script 必须先跑 bundle 抽取再 vite build（否则产物缺引擎）；
 *   ④ 脚本注释不得谎称「CI 已编排」（历史失真：原注释如此，实际两处 workflow 都没调用）。
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (m) => errors.push(m);

const ciYml = read('.github/workflows/ci.yml');
const releaseYml = read('.github/workflows/release.yml');
const buildAll = read('apps/desktop/scripts/build-editor-all.mjs');
const desktopPkg = JSON.parse(read('apps/desktop/package.json'));

// ── ① 一键构建脚本链路完整 ───────────────────────────────────────────────
for (const step of [
  "run('yarn', ['build'], resolve(repo, 'packages/editor-core/CoreEditor'))",
  "run('pnpm', ['--filter', '@mellow/editor-core', 'run', 'build'], repo)",
  "run('pnpm', ['--filter', '@mellow/editor-engine', 'run', 'build'], repo)",
  "run('node', ['scripts/build-editor-bundle.mjs'], root)",
  "run('node', ['scripts/verify-release-bundle.mjs'], root)",
]) {
  if (!buildAll.includes(step)) {
    fail(`build-editor-all.mjs 缺少构建步骤 ${step}（V7-W5：链路不完整会导致「忘了上游构建」）`);
  }
}
if (!existsSync('apps/desktop/scripts/verify-release-bundle.mjs')) {
  fail('缺少 apps/desktop/scripts/verify-release-bundle.mjs（渲染层指纹锁）');
}
if (!existsSync('apps/desktop/scripts/build-editor-bundle.mjs')) {
  fail('缺少 apps/desktop/scripts/build-editor-bundle.mjs（渲染层抽取）');
}

// ── ② CI 必须跑指纹校验（本护栏的核心：此前从未执行）──────────────────────
if (!/verify-release-bundle\.mjs/.test(ciYml)) {
  fail('ci.yml 未执行 verify-release-bundle.mjs（V7-W5/G7-TYPO-04：本地/CI 构建链分叉无信号）');
}
// 必须在桌面构建之后（先有产物才有得校验）
const buildIdx = ciYml.indexOf('pnpm run build');
const verifyIdx = ciYml.indexOf('verify-release-bundle.mjs');
if (buildIdx === -1 || verifyIdx === -1 || verifyIdx < buildIdx) {
  fail('ci.yml 的指纹校验必须排在桌面构建之后（V7-W5）');
}

// ── ③ 桌面 build script 顺序 ─────────────────────────────────────────────
const desktopBuild = desktopPkg.scripts?.build ?? '';
if (!/build-editor-bundle\.mjs/.test(desktopBuild)) {
  fail('apps/desktop build script 未先跑 build-editor-bundle.mjs（V7-W5：产物会缺引擎）');
}
if (desktopBuild.indexOf('build-editor-bundle.mjs') > desktopBuild.indexOf('vite build')) {
  fail('apps/desktop build script 顺序错误：抽取必须早于 vite build（V7-W5）');
}

// ── ④ 注释不得谎称「CI 已编排」──────────────────────────────────────────
// 历史失真：build-editor-all.mjs 原注释写「CI 的 release.yml 已按相同顺序编排」，
// 而两个 workflow 都没调用它 —— 注释比代码更不可信的典型。
if (/CI 的 release\.yml 已按相同顺序编排/.test(buildAll) && !/build-editor-all|verify-release-bundle/.test(releaseYml)) {
  fail('build-editor-all.mjs 仍谎称「CI 的 release.yml 已按相同顺序编排」，但 release.yml 未调用它（V7-W5：注释失真）');
}

// ── ⑤ canary：护栏必须能抓住「CI 删掉指纹校验」───────────────────────────
const ciDrift = ciYml.replace(/verify-release-bundle\.mjs/g, 'no-op-placeholder.mjs');
if (ciDrift.includes('verify-release-bundle.mjs')) {
  fail('构建链护栏自检失败：无法模拟 CI 指纹校验回退（V7-W5），护栏已失效');
}
const buildDrift = desktopBuild.replace('build-editor-bundle.mjs &&', '');
if (buildDrift.includes('build-editor-bundle.mjs')) {
  fail('构建链护栏自检失败：无法模拟抽取步骤回退（V7-W5），护栏已失效');
}

// ── ⑥ 本地构建脚本不得硬编码受管 Node 版本号（2026-09-25）─────────────────
// 立此条的原因：`build-local.sh` 曾把 `…/node/versions/22.22.2-2/bin` 写死。
// 运行时升级到 `22.22.2-3` 后，PATH 里没有 node，**失败点却落在**
// `./node_modules/.bin/tsc`（`exec: node: not found`）—— 报错看上去像 TypeScript
// 问题，实际是脚本里的路径失效，排查方向被完全带偏。
// 现改为读 `versions/current` 指针（缺失时按版本号排序取最大），并在此锁死。
const buildLocal = read('apps/desktop/scripts/build-local.sh');
if (/node\/versions\/\d+\.\d+\.\d+-\d+/.test(buildLocal)) {
  fail('build-local.sh 硬编码了受管 Node 版本号（如 22.22.2-2）：运行时升级后 PATH 里没有 node，'
    + '失败点会落在 tsc 上（看似 TS 问题）。请改为读 versions/current 指针（V7-W5 追加）');
}
if (!/versions\/current/.test(buildLocal)) {
  fail('build-local.sh 必须按 versions/current 指针解析受管 Node（缺失时退回按版本号排序取最大）');
}
// canary：自检该反例锁
if (!/node\/versions\/\d+\.\d+\.\d+-\d+/.test('NODE_BIN="$ROOT/.workbuddy-ai/binaries/node/versions/' + '22.22.2-2/bin"')) {
  fail('受管 Node 版本硬编码护栏自检失败：硬编码样本未被检出（V7-W5 追加）');
}

// ── ⑥b 旧 dist 的移开落点必须在同卷（2026-10-01）──────────────────────────
// 立此条的原因：仓库在 /Volumes/My-Data（disk8s1），而 ${TMPDIR} 在
// /System/Volumes/Data（disk3s5）—— 跨卷 `mv` 退化为「复制 + 递归删除」，
// 删除那一步会撞上 safe-delete 守卫，失败点看起来像构建错误（与代码无关）。
// node_modules/.cache 与仓库同卷 → rename(2)，瞬时且不触发守卫。
// 只看代码行：注释里也会提到 ${TMPDIR}（说明为什么不能用它），
// 直接扫全文会误报 —— 「护栏匹配到散文」是静态护栏的经典失效模式。
const buildLocalCode = buildLocal.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
if (/\$\{TMPDIR/.test(buildLocalCode)) {
  fail('build-local.sh 把旧 dist 移到 ${TMPDIR}（跨卷 → mv 退化为复制+删除 → 撞 safe-delete 守卫，'
    + '报错看起来像构建失败）。落点请用同卷的 node_modules/.cache（2026-10-01）');
}
if (!/node_modules\/\.cache/.test(buildLocalCode)) {
  fail('build-local.sh 的旧 dist 落点必须是与仓库同卷的 node_modules/.cache（2026-10-01）');
}
// canary：反例样本（代码行）必须被上面第一条命中
if (!/\$\{TMPDIR/.test('STALE_DIR="${TMPDIR:-/tmp}/mellow-dist-stale-$(date +%s)"')) {
  fail('同卷落点护栏自检失败：跨卷样本未被检出（2026-10-01）');
}
// canary：纯注释里的 ${TMPDIR} 不得被误判
if (/\$\{TMPDIR/.test('# 不能用 ${TMPDIR}：跨卷'.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n'))) {
  fail('同卷落点护栏自检失败：注释被误判为代码（2026-10-01）');
}

// ── ⑦ 包 dist 新鲜度闸门（2026-10-01）──────────────────────────────────────
// 立此条的原因（实测事故，代价 6 天）：`packages/<pkg>/dist/` 是 gitignore 的 tsc
// 产物，只有各包的 `pnpm --filter <pkg> run build` 会生成；而 `apps/desktop` 的
// `build` script 只跑 bundle 抽取 + tsc --noEmit + vite build，**不构建这些 dist**。
// 于是「本地只跑 desktop build + tauri build」会把旧引擎打进交付包：
// `editor-engine/src/inputLatency.ts`（W-PERF-1 埋点，09-30 新增）从未编译 →
// 埋点不在任何交付产物里、应用内延迟读数恒为 null，而屏幕上看不出原因、CI 也不会红
// （CI 与 release.yml 都先跑各包构建，只有本地临时路径会漏）。
// 故在三条构建路径的公共入口 `build-editor-bundle.mjs` 装确定性闸门，并在此锁死。
const bundleScript = read('apps/desktop/scripts/build-editor-bundle.mjs');
if (!/function assertPkgDistFresh\s*\(/.test(bundleScript)) {
  fail('build-editor-bundle.mjs 缺少 assertPkgDistFresh 新鲜度闸门（2026-10-01：dist 陈旧会静默进包）');
}
for (const pkg of ['@mellow/editor-engine', '@mellow/editor-core']) {
  if (!bundleScript.includes(`assertPkgDistFresh('${pkg}'`)) {
    fail(`build-editor-bundle.mjs 未对 ${pkg} 做新鲜度闸门（该包 dist 陈旧会静默进包）`);
  }
}
if (!/throw new Error\(\s*\n?\s*`\$\{name\} dist 陈旧/.test(bundleScript)) {
  fail('build-editor-bundle.mjs 的新鲜度闸门未在「源模块缺失」时硬失败（只警告 = 静默丢失新模块）');
}
// 产物级复核：verify-release-bundle.mjs 必须比对「交付包引擎模块集合 == 源码模块集合」
const releaseVerify = read('apps/desktop/scripts/verify-release-bundle.mjs');
if (!/notShipped/.test(releaseVerify) || !/deadCode/.test(releaseVerify)) {
  fail('verify-release-bundle.mjs 未比对交付包与源码的引擎模块集合'
    + '（固定文件名清单只能证明产物非空，证明不了产物是这一版源码）');
}
// CoreEditor 上游产物（同为 gitignore 的构建前置，是本脚本第 24 行的读取来源）
if (!/function assertCoreEditorFresh\s*\(/.test(bundleScript)) {
  fail('build-editor-bundle.mjs 缺少 assertCoreEditorFresh —— CoreEditor/dist 陈旧会让'
    + '交付包里的渲染层不是这一版源码（改了 CoreEditor/src 却「没有任何效果」，且无报错）');
}
if (!/assertCoreEditorFresh\(\);/.test(bundleScript)) {
  fail('build-editor-bundle.mjs 定义了 assertCoreEditorFresh 但**没有调用**（空开关）');
}
if (!/CoreEditor\/dist 陈旧/.test(bundleScript) || !/CoreEditor\/dist\/index\.html 缺失/.test(bundleScript)) {
  fail('CoreEditor 新鲜度闸门必须同时覆盖「缺失」与「陈旧」两种情形，并给出可执行的修法');
}
// canary：闸门被删掉 / 不再被调用时必须能翻红
if (/function assertCoreEditorFresh\s*\(/.test(bundleScript.replace(/function assertCoreEditorFresh\s*\(/, 'function removedCore('))) {
  fail('CoreEditor 新鲜度闸门护栏自检失败：无法模拟闸门被删除（2026-10-01），护栏已失效');
}
if (/assertCoreEditorFresh\(\);/.test(bundleScript.replace(/assertCoreEditorFresh\(\);/, 'noopCore();'))) {
  fail('CoreEditor 新鲜度闸门护栏自检失败：无法模拟调用被删除（空开关），护栏已失效');
}

// canary：闸门被删掉时，上面的断言必须能翻红
const gateRemoved = bundleScript.replace(/function assertPkgDistFresh\s*\(/, 'function removedGate(');
if (/function assertPkgDistFresh\s*\(/.test(gateRemoved)) {
  fail('dist 新鲜度闸门护栏自检失败：无法模拟闸门被删除（2026-10-01），护栏已失效');
}
const pairRemoved = bundleScript.replace("assertPkgDistFresh('@mellow/editor-core'", 'noopGate(');
if (pairRemoved.includes("assertPkgDistFresh('@mellow/editor-core'")) {
  fail('dist 新鲜度闸门护栏自检失败：无法模拟 editor-core 分支被删除，护栏已失效');
}
const softFail = bundleScript.replace(/throw new Error\(\s*\n?\s*`\$\{name\} dist 陈旧/, 'console.warn(`');
if (/throw new Error\(\s*\n?\s*`\$\{name\} dist 陈旧/.test(softFail)) {
  fail('dist 新鲜度闸门护栏自检失败：无法模拟「硬失败退化为警告」，护栏已失效');
}
const verifySoftened = releaseVerify.replace(/notShipped/g, 'noopA').replace(/deadCode/g, 'noopB');
if (/notShipped|deadCode/.test(verifySoftened)) {
  fail('产物模块集合护栏自检失败：无法模拟比对被删除，护栏已失效');
}

// ── ⑧ macOS 平台增强单测必须有 CI job（2026-10-01）─────────────────────────
// 立此条的原因：`spellcheck.rs` 的 `#[cfg(target_os = "macos")]` 单测**只在本地跑** ——
// ci.yml 的 rust-check 在 ubuntu（macOS-only 测试被 cfg 掉），runtime-qualification
// 只跑定向的 `file_safety_corpus` 用例。于是「真实系统词典（NSSpellChecker）是否真的给建议」
// **没有任何机器在守**；代价是那条测试长期是 `let _ = suggest("recieve");` 的**恒真空壳**
// 而无人发现。判据：**不变量只存在于「本地才会跑」的测试里 = 没守护**。
{
  const macJob = /\n  rust-check-macos:([\s\S]*?)(?=\n  \S|\s*$)/.exec(ciYml);
  if (macJob === null) {
    fail('ci.yml 缺少 rust-check-macos job —— #[cfg(target_os = "macos")] 的平台增强单测'
      + '在 CI 中不执行（本地才跑 = 没守护；实测代价：拼写建议测试曾是恒真空壳）');
  } else {
    if (!/runs-on:\s*macos-latest/.test(macJob[1])) {
      fail('rust-check-macos job 必须跑在 macos-latest（否则 macOS-only 测试仍不会执行）');
    }
    if (!/cargo test/.test(macJob[1])) {
      fail('rust-check-macos job 必须执行 cargo test（否则该 job 不覆盖平台增强单测）');
    }
  }
  // canary：把 macos job 从样本里删掉，上面的判定必须翻红
  const noMac = ciYml.replace(/\n  rust-check-macos:[\s\S]*$/, '');
  if (/\n  rust-check-macos:/.test(noMac)) {
    fail('macOS job 护栏自检失败：无法模拟该 job 被删除（2026-10-01），护栏已失效');
  }
}

// ── ⑨ 视觉 Golden 步骤必须是**真门禁**（2026-10-01）─────────────────────────
// 立此条的原因（实测）：`runtime-qualification.yml` 的视觉步骤原带 `continue-on-error: true`，
// 于是 **`scenes-golden` 失败而 job 报 success** —— v1.5.16 的 Linux 与 Windows **都是如此**
// （日志原文 `VISUAL_GOLDEN scenes-golden: FAILED (exit 1)`，漂移
// `table-toolbar.bar.w: 436 → 478`）：一个**真实可见的排版回归**随版本发布，而门禁看不见。
// 该步骤自己的注释写「基线提交后即进入比对模式」，而三平台基线**都已入库** →
// 「采集模式」的理由已失效，故按注释自身的条件恢复为严格比对。
{
  const rqRaw = read('.github/workflows/runtime-qualification.yml');
  // ⚠️ **先剥 YAML 注释再断言**：上面的说明注释里就写着 `continue-on-error: true`
  // （「移除了它」这句话本身包含该串）→ 不剥注释会**首跑即误报**。
  // 这是本会话第四次踩「护栏匹配到散文」。
  const rq = rqRaw.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  if (/continue-on-error:\s*true/.test(rq)) {
    fail('runtime-qualification 的视觉 Golden 步骤不得是 continue-on-error —— 那会把「golden 失败」'
      + '降级成 job 成功（实测 v1.5.16 就这样放过了表格工具栏 436→478 的排版回归）');
  }
  // canary：两个方向
  const BAD = '      - name: x\n        continue-on-error: true';
  if (!/continue-on-error:\s*true/.test(BAD)) {
    errors.push('视觉门禁护栏 canary 失效：违规样本未被检出');
  }
  const COMMENT_ONLY = '# 我们移除了 continue-on-error: true';
  const stripped = COMMENT_ONLY.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  if (/continue-on-error:\s*true/.test(stripped)) {
    errors.push('视觉门禁护栏 canary 失效：纯注释样本被误判为违规');
  }
}

// ── ⑩ 所有测试/工具脚本必须能 `node --check`（2026-10-06，审计 §4.117）──────────
// 立此条的原因（实测）：给 `tests/parity/tools/audit-typora-orphan-strings.mjs` 改文件头时，
// 在**块注释里写出了 glob**（星号紧跟斜杠）⇒ **提前闭合注释** ⇒ 语法错误。
// 而该文件是**手工工具、不进 CI** ⇒ `npm run parity` **全绿**，坏掉的脚本会一直躺在仓库里，
// **直到有人真去用它**。（同型：`tests/e2e/**` 的 31 个脚本也不进 CI。）
// ⇒ 判据：`tests/**` 与 `tools/**` 下的每个 `.mjs` 都必须通过 `node --check`。
{
  const SCRIPT_ROOTS = ['tests', 'tools'];
  const SKIP_DIR = new Set(['node_modules', 'dist', 'target', '.git', '.workbuddy-ai', 'public']);
  const walkScripts = (dir, out = []) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (SKIP_DIR.has(e.name)) continue;
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walkScripts(p, out); else out.push(p);
    }
    return out;
  };
  const scripts = [];
  for (const r of SCRIPT_ROOTS) {
    for (const f of walkScripts(resolve(root, r))) if (f.endsWith('.mjs')) scripts.push(f);
  }
  if (scripts.length < 30) {
    fail(`只解析出 ${scripts.length} 个 .mjs（下限 30）—— 扫描面漂移会让本判据空转`);
  }
  const broken = [];
  for (const f of scripts) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) {
      const msg = String(e.stderr ?? '').split('\n').find((l) => /Error|error/.test(l)) ?? '(未知)';
      broken.push(`${relative(root, f).split('\\').join('/')} :: ${msg.trim()}`);
    }
  }
  if (broken.length > 0) {
    fail(`以下脚本**语法不通**（不进 CI ⇒ 坏了也没人知道，直到有人真去用它）：\n    ${broken.join('\n    ')}`);
  }
  // canary：临时写一个**语法坏掉**的样本，检查器必须报出来（证明这条判据真的在看语法）
  const canaryDir = resolve(root, 'node_modules/.cache');
  const canary = resolve(canaryDir, 'syntax-canary.tmp.mjs');
  try {
    mkdirSync(canaryDir, { recursive: true });
    writeFileSync(canary, 'const broken = ;\n');
    let detected = false;
    try { execFileSync(process.execPath, ['--check', canary], { stdio: 'pipe' }); } catch { detected = true; }
    if (!detected) errors.push('脚本语法护栏 canary 失效：语法坏掉的样本未被检出（判据没在看语法）');
  } finally {
    try { rmSync(canary, { force: true }); } catch { /* noop */ }
  }
}

// ── ⑪ shell `grep` 不得依赖 BRE 的 `\|` 交替（2026-10-06，审计 §4.118）──────────
// 立此条的原因（**实测，最小 A/B 复现**）：本机 PATH 上的 `grep` 是 WorkBuddy 的垫片
// （`grep --version` → `toybox 0.8.13 (is not GNU grep 9.0)`），它**不支持 BRE 的 `\|` 交替**
// 且**不报错**。同一目录、同一意图，三种写法实测：
//     grep -rn "A\|B"  dir  → 0 命中   ← **静默**（就是这一条）
//     grep -rn -e A -e B dir → 8 命中  ✓
//     grep -rnE "A|B"  dir  → 8 命中   ✓
// ⇒ 凡把 `grep "a\|b"` 写进**脚本或 CI 步骤**的检索，在 CI（GNU/BSD grep）**会通过**，
//   而在本机**静默返回 0** ⇒ 用它支撑的「**命中 0 / 全仓无 / 无人引用**」类结论**是假的**。
// 本轮就差点据此写出「20 MB CJK 字体无任何引用」的假结论 —— 实际 PDF 导出正在用它们
// （`packages/export/src/index.ts` 的 `fetch(.../fonts/NotoSansSC-*.ttf)`）。
//
// ⚠️ **本判据是预防性的**：立此条时仓库内**违规 0 处**。它防的是**将来**加入的写法 ——
//    「CI 绿而本机静默错」是本仓反复踩的一类（同 ⑩ 的「不进 CI 的脚本坏了没人知道」）。
// ⚠️ **范围限制（如实声明）**：
//   ① 只扫 **`.sh` 文件** 与 **`.github/workflows/*.yml`** —— 即「CI / 脚本会执行」的两种载体；
//   ② **不扫 `.mjs`**：那里 `\|` 常是 **JS 正则字面量**里的转义交替（合法且大量存在，实测数十处），
//      机械扫描会制造成片**假阳性** ⇒ 与其做一个会误报的判据，不如明确不做；
//   ③ 明确**放行** `-E`（ERE，`|` 无需转义）与 `-F`（固定串）—— 两种情况下 `\|` 都是**字面竖线**，
//      行为确定，不属本判据要防的「静默 0 命中」；
//   ④ `egrep` / `fgrep` 未纳入（本仓 0 处）；行首为 `#` 的**注释行**跳过。
{
  const SKIP = new Set(['node_modules', 'dist', 'target', '.git', '.workbuddy-ai', 'public', '.next', 'build']);
  const walkByExt = (dir, ext, out = []) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walkByExt(p, ext, out);
      else if (e.name.endsWith(ext)) out.push(p);
    }
    return out;
  };
  const shFiles = walkByExt(root, '.sh');
  const wfDir = resolve(root, '.github/workflows');
  const wfFiles = existsSync(wfDir) ? walkByExt(wfDir, '.yml') : [];
  if (shFiles.length < 6 || wfFiles.length < 3) {
    fail(`shell 检索卫生判据的扫描面只有 ${shFiles.length} 个 .sh / ${wfFiles.length} 个 workflow`
      + '（下限 6 / 3）—— 扫描面漂移会让本判据**空转**');
  }
  // 谓词抽成**纯函数**，canary 复用同一份（避免「canary 测的是副本」）
  const quotedSegments = (line) => {
    const out = [];
    for (const m of line.matchAll(/"([^"]*)"|'([^']*)'/g)) out.push(m[1] ?? m[2]);
    return out;
  };
  const grepUsesBreAlternation = (line) => {
    if (!/\bgrep\b/.test(line)) return false;
    if (/^\s*#/.test(line)) return false;                      // 注释行
    if (/\bgrep\b[^\n]*\s-[A-Za-z]*[EF][A-Za-z]*(\s|$)/.test(line)) return false; // -E / -F
    return quotedSegments(line).some((q) => q.includes('\\|'));
  };
  const offenders = [];
  for (const f of [...shFiles, ...wfFiles]) {
    const rel = relative(root, f).split('\\').join('/');
    for (const [i, line] of readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').entries()) {
      if (grepUsesBreAlternation(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
  }
  if (offenders.length > 0) {
    fail(`以下位置用 shell \`grep\` 做 **BRE 的 \`\\|\` 交替**（在本机 toybox grep 下**静默返回 0 命中**，`
      + '而 CI 上能过 ⇒ 用它支撑的「命中 0 / 全仓无」结论是假的）：\n    '
      + offenders.join('\n    ')
      + '\n    改用 `grep -E "a|b"` 或 `grep -e a -e b`（两者实测都能正确匹配）');
  }
  // canary：三个方向（正 / 负-E / 负-无交替），共用上面的谓词
  {
    const A = grepUsesBreAlternation;
    if (!A('  X=$(grep -rn "foo\\|bar" src || true)')) {
      errors.push('shell 检索卫生护栏 canary 失效：`grep "a\\|b"` 未被检出');
    }
    if (!A("grep -c 'alpha\\|beta' file.txt")) {
      errors.push('shell 检索卫生护栏 canary 失效：单引号形态未被检出');
    }
    if (A('grep -rnE "foo|bar" src')) {
      errors.push('shell 检索卫生护栏 canary 过宽：`-E` 的 ERE 交替被误判');
    }
    if (A('grep -rn -e foo -e bar src')) {
      errors.push('shell 检索卫生护栏 canary 过宽：`-e -e` 形态被误判');
    }
    if (A('# grep "foo\\|bar" 是历史写法，勿照抄')) {
      errors.push('shell 检索卫生护栏 canary 过宽：注释行被当成违规');
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Build pipeline contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Build pipeline: one-shot build chain complete (CoreEditor yarn build → editor-core wrapper → editor-engine → build-editor-bundle → verify-release-bundle fingerprint); CI runs the fingerprint lock after desktop build (was never executed before V7-W5 — local/CI divergence had no signal); desktop build script extracts the bundle before vite build; script comments no longer falsely claim CI orchestration; build-local.sh resolves the managed Node via the versions/current pointer instead of a hardcoded version (a stale pin made the failure surface as a bogus tsc error); package dist freshness is gated at the common build entry point (a stale editor-engine dist silently shipped an unbuilt inputLatency.ts for 6 days — the app-side latency probe was absent from every artifact with no error anywhere) and verify-release-bundle compares the shipped engine module set against the source module set');
