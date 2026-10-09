/**
 * 文档代码引用护栏（2026-09-30）。
 *
 * 问题：权威文档（施工计划 / ADR / spec）里用「**`符号`（`文件:行号`）**」的形式
 * 指向代码，作为结论的依据。**行号会随重构漂移**，而「行号还在文件范围内」这件事
 * **掩盖了**漂移 —— 读者按图索骥会看到**无关代码**，进而可能得出「该结论无据」的错误判断。
 *
 * 实测三处（均在本轮修正）：
 *   - `insertLocalImage`（`App.tsx:1530-1536`）→ 该行现在是 `setCommandPaletteRecent(...)`，
 *     函数实际在 1721；
 *   - `image.uploadAll/downloadRemote/moveAll/copyAll`（`menuSchema.ts:328-333`）→ 实际在 365-370；
 *   - 非 macOS 页面设置的 `platformMac` 守卫（`window.rs:108-128`）→ 实际在 `App.tsx:4880-4883`
 *     （Rust 侧只有 `window.rs:134-153` 返回 `Err`）。
 *
 * 本护栏只认**紧邻形态**（符号紧跟括号内的路径:行号），避免把周围散文里的
 * 反引号符号误当成被引符号；并要求**符号出现在被引行范围（±2 行）内**。
 *
 * 为什么不做成「行号越界检查」：越界检查查不出这三处 —— 行号都还在范围内。
 * **行号有效 ≠ 引用有效。**
 *
 * ⚠️ **本护栏的范围限制（如实声明，不要当成「文档引用已全部核对」）**：
 * 只覆盖**紧邻形态**「`符号`（`文件:行号`）」；文档里其它写法
 * （如「见 `文件:行号` 的 `符号`」、散文里提到行号、表格里的裸行号）**不在覆盖内**。
 * 实测 41 份权威文档中仅 3 处属该形态 —— 覆盖率低是**形态罕见**，不是文档干净。
 *
 * **路径解析（2026-10-01 增补）**：文档里大量把路径写成 `settings/src/index.ts`
 * （**省掉 `packages/` 前缀**），此时 `basename` 往往不唯一（`index.ts` 有 20 个）
 * ⇒ 旧实现把它归入「未判定」**静默跳过** —— 实测 `settings/src/index.ts:182-193`
 * 就是这样一处**已漂移**的引用（该处现为 `markdown.html` 等引擎开关），
 * 它**在护栏眼里根本不存在**（审计 §4.67）。
 * 现改为：`basename` 不唯一时，按**路径后缀**再匹配一次，**唯一命中才判定**
 * （仍不唯一 ⇒ 继续计入「未判定」，**不静默通过**）。
 * 全仓实测：该增补只新暴露 **1 处**失败（即上面那处，已修）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy-ai', 'archive', 'dist', 'target', 'CoreEditor']);
const CODE_EXTS = ['ts', 'tsx', 'mjs', 'cjs', 'rs', 'css', 'json', 'yml', 'yaml'];
const CODE_EXT = `(?:${CODE_EXTS.join('|')})`;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ⚠️ 扩展名过滤必须显式列举，**不要**从正则字符串上 slice ——
// 实测踩到：`CODE_EXT.slice(4, -1)` 把 `(?:ts|…` 切成 `s|tsx|…`，
// 于是 **`.ts` 整类被静默漏掉**（`menuSchema.ts` 因此从未被判定，
// 而护栏输出看起来「全绿」）。这正是「解析器漏成员必须响亮失败」那条。
const codeFiles = walk(root).filter((f) => CODE_EXTS.includes(f.split('.').pop()));
const byBase = new Map();
for (const f of codeFiles) {
  const b = basename(f);
  byBase.set(b, byBase.has(b) ? null : f); // null = 同名不唯一，无法判定
}
/** 路径后缀唯一匹配（2026-10-01）：文档常省掉 `packages/` 前缀，`basename` 因此不唯一。
 * 唯一命中才返回该文件；0 个或多个命中都返回 null（后者**不计入判定**，仍是「未判定」）。
 * ⚠️ 路径分隔符要归一化 —— Windows 上 `join` 产出 `\`，直接 `endsWith('/'+file)` 会**恒不命中**
 * （那会让本分支在 Windows 上静默退化成「永远未判定」，属「护栏看不见我」）。 */
const normPath = (p) => p.replace(/\\/g, '/');
function byPathSuffix(file) {
  const hits = codeFiles.filter((f) => normPath(f).endsWith(`/${file}`));
  return hits.length === 1 ? hits[0] : null;
}

function resolveTarget(file) {
  const direct = resolve(root, file);
  if (existsSync(direct)) return { path: direct };
  const byName = byBase.get(basename(file));
  if (byName === undefined) return { notFound: true };
  if (byName === null) {
    const bySuffix = byPathSuffix(file);
    return bySuffix === null ? { ambiguous: true } : { path: bySuffix, viaSuffix: true };
  }
  return { path: byName };
}

/** 权威文档：施工计划 / ADR / specs —— 这里的引用会直接驱动施工与裁决 */
const DOC_GLOBS = ['docs/plans', 'docs/adr', 'docs/specs'];
const docs = DOC_GLOBS.flatMap((d) => walk(resolve(root, d)))
  .filter((f) => f.endsWith('.md'))
  .sort();

const PAIR = new RegExp(
  '`?([A-Za-z_$][\\w$]*(?:[./][\\w$]+)*)`?\\s*[（(]\\s*`?([\\w./@-]+\\.' + CODE_EXT + ')[:：](\\d+)(?:\\s*[-–]\\s*(\\d+))?`?\\s*[）)]',
  'g',
);

let judged = 0;
let ambiguous = 0;
for (const doc of docs) {
  const rel = relative(root, doc);
  const src = readFileSync(doc, 'utf8').replace(/\r\n/g, '\n');
  for (const m of src.matchAll(PAIR)) {
    const [, rawSymbol, file, fromStr, toStr] = m;
    // 反引号里可能是 `a/b/c` 这类并列写法 —— 拆开，任一命中即算对得上
    const tokens = rawSymbol.split(/[./]/).filter((t) => t.length >= 3);
    if (tokens.length === 0) continue; // 单/双字母噪声太大，不判定
    const target = resolveTarget(file);
    if (target.notFound) {
      fail(`${rel}：引用「${rawSymbol}」指向的文件在仓库内找不到：${file}`
        + '（文档写错，或护栏的扩展名/路径解析需更新 —— 不要静默跳过）');
      continue;
    }
    if (target.ambiguous) { ambiguous += 1; continue; } // 同名不唯一，无法判定（在汇总里可见）
    const lines = readFileSync(target.path, 'utf8').split('\n');
    const from = Number(fromStr);
    const to = toStr ? Number(toStr) : from;
    if (from > lines.length) {
      fail(`${rel}：引用 ${file}:${from} 越界（该文件共 ${lines.length} 行）`);
      continue;
    }
    const lo = Math.max(1, from - 2);
    const hi = Math.min(lines.length, to + 2);
    const windowText = lines.slice(lo - 1, hi).join('\n');
    judged += 1;
    const hit = tokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(windowText));
    if (!hit) {
      // 提示（**不改判定强度**）：本仓库的更正惯例是「只追加更正块」，而更正块**必然要引用
      // 旧的错误引用**（如「原写 `App.tsx:1721-1739`」）—— 那**看起来**正是本护栏要抓的形态。
      // 2026-09-30 实测：我自己的变更记录就是这么把 CI 打红的。此时正确的处置**不是改行号**，
      // 而是把符号与 `文件:行号` 改成**非紧邻**写法（中间加字），使它不匹配本护栏的形态。
      const docLineNo = src.slice(0, m.index).split('\n').length;
      const docLine = src.split('\n')[docLineNo - 1] ?? '';
      const looksLikeQuote = /原写|原文|更正|漂移|引用有误|写成|已改为|改为\*\*符号引用\*\*/.test(docLine);
      fail(
        `${rel}：引用「${rawSymbol}」（${file}:${from}${to !== from ? `-${to}` : ''}）`
        + ` 在被引行范围内找不到该符号（该行现为：${(lines[from - 1] ?? '').trim().slice(0, 60)}）`
        + ' —— 行号有效 ≠ 引用有效，请更正行号或符号名'
        + (looksLikeQuote
          ? '\n    ⚠️ 该行含「原写 / 更正 / 漂移」等标记 → 像是**在描述一次修正**（引用旧引用）。'
            + '此时请把「`符号`（`文件:行号`）」改成**非紧邻**写法（例：原写 `文件:行号`，中间加字），'
            + '使它不匹配本护栏的紧邻形态 —— **不要**去改行号（那个行号本来就该是错的）。'
          : ''),
      );
    }
  }
}

// ── canary：自检判据（样本拼接构造，避免护栏检出自己）──────────────────────
{
  const GOOD = '`insertLocalImage`（`App.tsx:1721-1739`）';
  const BAD = '`insertLocalImage`（`App.tsx:1530-1536`）';
  const parse = (s) => [...s.matchAll(PAIR)].map((x) => ({ sym: x[1], file: x[2], from: Number(x[3]) }));
  const good = parse(GOOD);
  const bad = parse(BAD);
  if (good.length !== 1 || good[0].sym !== 'insertLocalImage' || good[0].from !== 1721) {
    fail('文档代码引用护栏 canary 失效：正样本未被正确解析');
  }
  if (bad.length !== 1 || bad[0].from !== 1530) {
    fail('文档代码引用护栏 canary 失效：负样本未被正确解析');
  }
  // 判据本身必须能区分正/负（用真实文件内容验证一次）
  const appTarget = resolveTarget('apps/desktop/src/App.tsx');
  const appPath = appTarget.path ?? null;
  if (appPath === null) {
    fail('文档代码引用护栏 canary 失效：找不到 apps/desktop/src/App.tsx');
  } else {
    const appLines = readFileSync(appPath, 'utf8').split('\n');
    const inRange = (a, b) => appLines.slice(a - 1, b).join('\n').includes('insertLocalImage');
    // ⚠️ **不要在这里硬编码行号**：2026-09-30 实测 —— App.tsx 的一次正常改动把该符号
    // 从 1721 挪到 1743，本 canary 立刻**误报「判据失效」**（而判据其实好好的）。
    // 这恰是本护栏要防的那种脆弱性，不该出现在它自己的 canary 里。
    // 改为**从文件现算**：正样本 = 符号所在行附近；负样本 = 文件第 1 行（`/**`，恒不含该符号）。
    const symLine = appLines.findIndex((l) => l.includes('insertLocalImage')) + 1;
    if (symLine <= 0) {
      fail('文档代码引用护栏 canary 失效：真实文件中找不到 insertLocalImage（判据无从校验）');
    } else if (!inRange(symLine, symLine + 18) || inRange(1, 1)) {
      fail('文档代码引用护栏 canary 失效：正/负样本在真实文件中未呈现预期差异');
    }
  }
  // 后缀匹配分支必须真的能用 —— 否则它是一条**空开关**：本次修掉的那处引用已改成符号引用，
  // 于是这条新分支**没有任何真实用例走它**，只能靠 canary 自证（用真实文件树，确定性）。
  const suffixHit = byPathSuffix('settings/src/index.ts');
  if (suffixHit === null
    || normPath(suffixHit) !== normPath(resolve(root, 'packages/settings/src/index.ts'))) {
    fail('文档代码引用护栏 canary 失效：路径后缀唯一匹配未能解析 `settings/src/index.ts`'
      + `（得到 ${suffixHit ?? 'null'}）`);
  }
  if (byPathSuffix('src/index.ts') !== null) {
    fail('文档代码引用护栏 canary 过宽：后缀仍不唯一时不应判定（应继续计入「未判定」，不得静默通过）');
  }
  if (byPathSuffix('no/such/file.ts') !== null) {
    fail('文档代码引用护栏 canary 过宽：后缀无命中时不应判定');
  }
}

// ── 文档里声明的 `MELLOW_*` / `TYPORA_*` 开关必须在代码里真的存在（2026-10-05，审计 §4.73）──
// 立此条的原因（实测）：`performance-benchmark-spec` §2 与 `tests/benchmark/README.md` 都写着
// 「版本经 **`TYPORA_APP`** 环境变量可覆盖」—— 而**全仓没有任何代码读它**：
// 实际的覆盖方式是 CLI 参数 `--typora <path>`（默认 /Applications/Typora.app/…）。
// 与 §4.54（多处副本漏 docs）同族：**文档声称的开关，代码里不存在**。
//
// ⚠️ **谓词必须收窄到「命名族」且必须是「被读取」而不是「被提及」**（三条实测教训）：
//   ① 所有反引号 UPPER_SNAKE：91 个 token 里 4 个「不在代码中」，其中 **3 个是噪声**
//      （`PITFALLS` 是文档名；`ACTION_DEFS` / `ENGINE_I18N_REGISTERED` 是审计内部标签）；
//   ② 「同一行提到『环境变量』」：修完**变成 0 个** ⇒ **判据空转**；
//   ③ **命名族 `(MELLOW|TYPORA)_*`：4 个 token、零误报，修完仍有 3 个可查 ⇒ 非空转**。← 采用
//   ⚠️ 且判据必须是「**代码里有人读它**」（`process.env.X` / `env::var("X")` / `$X` / yml 的 `X:`），
//      **不是「代码里出现过这个字符串」** —— 后者会被**本护栏自己的注释与报错文案**满足
//      （首版就踩了：护栏里写了 `TYPORA_APP` 字样 ⇒ 主判据被自己打死，恒不报错）。
//   ⚠️ 名字后**必须加边界** `(?![A-Za-z0-9_])` —— 否则 `process.env.TYPORA_APP` 会**前缀匹配**
//      `process.env.TYPORA_APPSRC`（实测踩到，差点得出「TYPORA_APP 有人读」的假结论）。
// ⚠️ **更正说明必然引用旧名** ⇒ 与上文 PAIR 的处理同源，对「原写 / 更正 / 也写 / 漂移」类行**豁免**。
{
  const FAMILY = /`((?:MELLOW|TYPORA)_[A-Z0-9_]+)`/g;
  const LOOKS_LIKE_QUOTE = /原写|原文|更正|漂移|已改为|也写/;
  // 路径归一化：**判定与 canary 共用**（见下方跨平台 canary）。
  const isReadme = (p) => basename(p.replace(/\\/g, '/')) === 'README.md';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** 「代码里有人**读**这个开关」的判据（判定与 canary 共用）。 */
  const readPattern = (name) => {
    const N = `${esc(name)}(?![A-Za-z0-9_])`;
    return new RegExp(
      `process\\.env\\.${N}`
      + `|process\\.env\\[\\s*["']${esc(name)}["']`
      + `|env::var\\(\\s*"${esc(name)}"`
      + `|getenv\\(\\s*"${esc(name)}"`
      + `|\\$\\{?${N}`
      + `|^\\s*${esc(name)}\\s*:`,
      'm',
    );
  };
  // ⚠️ **必须把本护栏自身排除出扫描面**：它内部含**合成样本**（如 canary 里的
  // `process.env.TYPORA_APP`），不排除 ⇒ 主判据被自己的样本满足 ⇒ **恒不报错**。
  // （首版踩了两次：先是注释里的 `TYPORA_APP` 字样，再是 canary 里的 `process.env.TYPORA_APP`。）
  const SELF = import.meta.filename ?? resolve(import.meta.dirname, 'verify-doc-code-refs.mjs');
  const scanFiles = [...codeFiles, ...walk(root).filter((f) => f.endsWith('.sh'))]
    .filter((f) => resolve(f) !== resolve(SELF));
  if (scanFiles.some((f) => resolve(f) === resolve(SELF))) {
    errors.push('文档开关护栏自检失败：本护栏自身的源码未被排除 —— 它含合成样本，会让判据恒真');
  }
  const readSources = scanFiles.map((f) => ({ f, text: readFileSync(f, 'utf8') }));
  const isRead = (name) => {
    const re = readPattern(name);
    return readSources.some(({ text }) => re.test(text));
  };
  const allDocs = [
    // 权威文档（与上方 PAIR 同一范围：docs/plans | docs/adr | docs/specs）——
    // 这里是**声明**开关的地方。
    ...docs,
    // 操作型 README（实测：`tests/benchmark/README.md` 也声明过 `TYPORA_APP`，必须纳入）。
    // ⚠️ **必须与路径分隔符无关，不要写 `/(^|\/)README\.md$/`** ——
    // Windows 上 `walk()` 产出的是 `\` 分隔符 ⇒ 那种写法会**静默漏掉**全部 README，
    // 于是 `checked` 掉到下限以下、**CI 在 Windows 上红而本地绿**（2026-10-05 实测踩到）。
    ...walk(root).filter(isReadme),
  ];
  // ⚠️ **故意不含 `docs/qualification`**：审计 / 验收记录的职责就是**引用旧值**
  // （「原写 `TYPORA_APP`」「该开关不存在」），纳入会把**如实记录**误判成**声明错误**
  // —— 实测：本轮审计 §4.73 的正文立刻被本判据命中 4 行，全部是「在描述旧值」而非「在声明」。
  // 这是**如实声明的范围限制**，不是「漏了」。
  let checked = 0;
  for (const doc of allDocs) {
    const rel = relative(root, doc);
    const text = readFileSync(doc, 'utf8').replace(/\r\n/g, '\n');
    text.split('\n').forEach((line, i) => {
      if (LOOKS_LIKE_QUOTE.test(line)) return;   // 更正说明会引用旧名，豁免
      for (const m of line.matchAll(FAMILY)) {
        checked += 1;
        if (!isRead(m[1])) {
          fail(`${rel}:${i + 1} 声明了 \`${m[1]}\`，但**代码里没有任何地方读它**`
            + ' —— 文档声称的开关必须真的存在（实测：`TYPORA_APP` 就是这么一条）');
        }
      }
    });
  }
  if (checked < 3) {
    fail(`文档里只解析出 ${checked} 个 \`MELLOW_*\`/\`TYPORA_*\` token（下限 3 = 立此判据时的基线）`
      + ' —— 谓词或文档集漂移会让本判据**空转**；若确实删过，请同步下调下限并说明');
  }
  // canary：三个方向（判定与 canary 共用 readPattern / isRead）
  // ⚠️ 样本必须**拼接构造**，否则本护栏自己的字面量会混进扫描面（首跑即被自己的 canary 抓出）。
  const NOPE = 'MELLOW' + '_NOPE_XYZ';
  // **跨平台 canary**：文档集过滤必须与分隔符无关 ——
  // 「本地（`/`）绿、Windows（`\`）红」是 2026-10-05 实测踩到的形态（本判据首版就是这么红的）。
  if (!isReadme('tests/benchmark/README.md') || !isReadme('tests\\benchmark\\README.md')
    || isReadme('tests/benchmark/README.txt')) {
    errors.push('文档开关护栏 canary 失效：README 过滤对路径分隔符敏感（Windows 会静默漏掉全部 README）');
  }
  if (!isRead('MELLOW_INPUT_LATENCY_DUMP')) {
    errors.push('文档开关护栏 canary 失效：真实被读取的环境变量未被识别');
  }
  if (isRead(NOPE)) {
    errors.push('文档开关护栏 canary 过宽：不存在的 token 被判为「有人读」');
  }
  // **结构性 canary**：只被「提及」（注释/文档文案）不算「被读取」—— 这是本条判据的立身之本。
  if (readPattern(NOPE).test(`// 环境变量 \`${NOPE}\` 可覆盖`)) {
    errors.push('文档开关护栏 canary 失效：**仅被提及**的 token 被误判为「有人读」（判据会被自己的文案满足）');
  }
  // 边界 canary：`TYPORA_APP` 不得前缀匹配 `TYPORA_APPSRC`（实测踩过的假结论）。
  if (readPattern('TYPORA_APP').test('const b = process.env.TYPORA_APPSRC ?? "/Applications";')) {
    errors.push('文档开关护栏 canary 失效：名字缺少边界 ⇒ `TYPORA_APP` 前缀匹配了 `TYPORA_APPSRC`');
  }
  if (!readPattern('TYPORA_APP').test('const b = process.env.TYPORA_APP ?? "/Applications";')) {
    errors.push('文档开关护栏 canary 失效：真实读取写法未被识别');
  }
}

// ── `docs/architecture` 里以反引号给出的**仓库相对路径**必须存在（2026-10-06，审计 §4.76）──
// 立此条的原因（实测）：这个目录**从未被任何护栏覆盖**（本文件的 DOC_GLOBS 不含它），
// 而它含大量「路径 + 状态」的断言。首轮扫描 9 个反引号路径里 **6 个不存在**，其中：
//   · `apps/desktop/src/host/types.ts` —— 该文件不存在（宿主层实际是 12 个按服务拆分的文件）
//   · `apps/desktop/src/extensions/examples/hello-command.ts` —— 实际是 **`helloCommand.ts`**
//     （**大小写**不同：macOS 大小写不敏感 ⇒ 本地看着是通的，Linux/Windows 上就是断链）
//   · `src-tauri/src/bridge.rs` —— 少了 `apps/desktop/` 前缀（同表里其它行都带前缀）
//
// ⚠️ **范围与豁免（如实声明）**：
//   ① 只查**含 `/` 的路径** —— **裸文件名**（如 `CONTRACT.md`）基址不明，**跳过但计数**；
//   ② **跳过围栏代码块** —— 那里的路径常是**相对某个根的示意**（如 `src/config.ts` 相对 CoreEditor）；
//   ③ 「原写 / 更正」类行**豁免** —— 更正说明必然引用**已不存在的旧路径**；
//   ④ 路径**按 `/` 归一化**后再判（Windows 上 `walk` 产出 `\`；本项目已因此红过一次 CI）。
{
  // 2026-10-08（审计 §4.158）：扫描面从 `docs/architecture` **扩到 `docs/superpowers`** ——
  // 后者自己的快照声明写着「**不在任何护栏的扫描面内**」（`DOC_GLOBS` 只含 plans/adr/specs）
  // ⇒ 它里面的路径断言**没有机器守护**。本轮把该缺口**闭合**（实测 6 个路径 token 全部有效）。
  const ARCH_DIRS = ['docs/architecture', 'docs/superpowers'];
  const EXT = '(?:ts|tsx|js|mjs|cjs|rs|css|json|yml|yaml|md|sh|toml)';
  const TOK = new RegExp('`([\\w./-]+\\.' + EXT + ')`', 'g');
  const LOOKS_LIKE_QUOTE = /原写|原文|更正|漂移|已改为|也写/;
  /** 去掉围栏代码块（```…```）—— 那里的路径是示意，基址不明。判定与 canary 共用。 */
  const stripFences = (src) => src.replace(/```[\s\S]*?```/g, '');
  /** 归一化分隔符后判存在。判定与 canary 共用。 */
  const exists = (p) => existsSync(resolve(root, p.replace(/\\/g, '/')));
  let checked = 0;
  let bare = 0;
  for (const abs of ARCH_DIRS.flatMap((d) => walk(resolve(root, d))).filter((f) => f.endsWith('.md'))) {
    const rel = relative(root, abs);
    stripFences(readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'))
      .split('\n')
      .forEach((line, i) => {
        if (LOOKS_LIKE_QUOTE.test(line)) return;   // 更正说明会引用旧路径，豁免
        for (const m of line.matchAll(TOK)) {
          const p = m[1];
          if (!p.includes('/')) { bare += 1; continue; }   // 裸文件名：基址不明，跳过但计数
          checked += 1;
          if (!exists(p)) {
            fail(`${rel}:${i + 1} 写了路径 \`${p}\`，但**仓库里不存在**`
              + ' —— 架构文档里的路径必须可打开（实测：宿主层文件名与大小写都曾写错）');
          }
        }
      });
  }
  // 2026-10-08（审计 §4.159）：本目录 README 的「## 文档」索引必须**穷举**该目录的 `.md`。
  // ⚠️ 为什么以前没发现：上面的路径判据只查**反引号**，而这张索引用的是 **markdown 链接**
  // ⇒ **索引的完整性从来没有判据**。实测漏了 `extension-api.md`（本目录 7 个 `.md` 里只列 5）。
  {
    const INDEX = 'docs/architecture/README.md';
    const idxSrc = readFileSync(resolve(root, INDEX), 'utf8').replace(/\r\n/g, '\n');
    /** 索引里的**目录内** markdown 链接目标（排除外链与锚点）。判定与 canary **共用**。 */
    const indexTargets = (src) => [...new Set([...src.matchAll(/\]\((?!https?:|[#/])([a-z0-9-]+\.md)\)/g)]
      .map((m) => m[1]))];
    const listedIdx = indexTargets(idxSrc);
    const actualMd = readdirSync(resolve(root, 'docs/architecture')).filter((f) => f.endsWith('.md'));
    const missing = actualMd.filter((f) => f !== 'README.md' && !listedIdx.includes(f)).sort();
    const extra = listedIdx.filter((f) => !actualMd.includes(f)).sort();
    if (missing.length > 0) {
      fail(`${INDEX} 的「## 文档」索引**漏了**本目录的 .md：${missing.join('、')}`
        + ' —— 该表是目录索引，应穷举（实测：曾漏 `extension-api.md`）');
    }
    if (extra.length > 0) {
      fail(`${INDEX} 的索引列出了**不存在**的 .md：${extra.join('、')}`);
    }
    if (listedIdx.length < 5) {
      fail(`${INDEX} 的索引只解析出 ${listedIdx.length} 条（下限 5 = 立此判据时的基线）—— 判据会空转`);
    }
    // canary：三向
    if (indexTargets('[a](a.md)\n[b](b.md)').length !== 2) {
      errors.push('架构索引护栏 canary 失效：目录内链接未被解析');
    }
    if (indexTargets('[x](https://example.com/a.md)').length !== 0) {
      errors.push('架构索引护栏 canary 过宽：**外链**被当成了目录内文件');
    }
    if (indexTargets('[x](#anchor)').length !== 0) {
      errors.push('架构索引护栏 canary 过宽：**锚点**被当成了文件');
    }
  }
  if (checked < 20) {
    fail(`docs/architecture + docs/superpowers 只解析出 ${checked} 个含 \`/\` 的路径（下限 20 = 立此判据时的基线）`
      + ' —— 谓词或目录内容漂移会让本判据**空转**；若确实删过，请同步下调下限并说明');
  }
  // canary：四个方向（判定与 canary 共用 stripFences / exists）
  if (stripFences('a\n```\n`x/y.ts`\n```\n`z/w.ts`').includes('x/y.ts')) {
    errors.push('架构路径护栏 canary 失效：围栏代码块未被剥离');
  }
  if (!exists('README.md') || exists('no/such/file.ts')) {
    errors.push('架构路径护栏 canary 失效：存在性判定不能区分正/负样本');
  }
  if (!exists('apps\\desktop\\src\\host\\fileServices.ts')) {
    errors.push('架构路径护栏 canary 失效：Windows 分隔符写法未被归一化（本项目已因此红过一次 CI）');
  }
  if (bare === 0) {
    errors.push('架构路径护栏 canary 失效：裸文件名的计数为 0（谓词可能已失效）');
  }
}

// ── PRD 的标题层级必须与编号一致（2026-10-06，审计 §4.78）──
// 立此条的原因（实测）：宪法（PRD）里 **8 处子节**（`113.1`–`113.5` / `117.1`–`117.3`）被写成了
// **一级标题**（`# N.M`），而同文件里另 **20 处**子节正确用 `## N.M`。
// 后果：**生成的目录会把这 8 个子节列成与 `# 113.` 平级** —— 而全仓有大量文档按「PRD §113.4」引用，
// 读者按目录去找会定位到错误层级。（引用本身靠文本匹配，不受影响；受影响的是**结构视图**。）
// ⚠️ 注意**不要**把 `# 109.` 这类**顶级**小节判成违规 —— 本判据只抓 `# N.M`（带小数点的）。
{
  const PRD = 'docs/product/Mellow-PRD-V1.2-FINAL.md';
  const prdLines = readFileSync(resolve(root, PRD), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const isSubAsH1 = (line) => /^# \d+\.\d/.test(line);
  const misplaced = prdLines.map((l, i) => ({ l, i })).filter(({ l }) => isSubAsH1(l));
  if (misplaced.length > 0) {
    fail(`${PRD} 有 ${misplaced.length} 处**子节**写成了**一级标题**（\`# N.M\` 应为 \`## N.M\`）：`
      + misplaced.slice(0, 3).map(({ l, i }) => `L${i + 1} ${l.slice(0, 26)}`).join(' / ')
      + ' —— 生成的目录会把这些子节列成顶级，而全仓按「PRD §N.M」引用它们');
  }
  const prdTopCount = prdLines.filter((l) => /^# \d+\./.test(l)).length;
  if (prdTopCount < 100) {
    fail(`${PRD} 只解析出 ${prdTopCount} 个一级小节标题（\`# N.\`）（下限 100 = 立此判据时的基线）`
      + ' —— 结构漂移会让本判据**空转**；若确实改过结构，请同步下调下限并说明');
  }
  // canary：三个方向（判定与 canary 共用 isSubAsH1）
  if (!isSubAsH1('# 113.1 五层边界')) {
    errors.push('PRD 标题层级护栏 canary 失效：子节写成一级的违规形态未被检出');
  }
  if (isSubAsH1('## 113.1 五层边界')) {
    errors.push('PRD 标题层级护栏 canary 过宽：合规的 `## N.M` 被误判为违规');
  }
  if (isSubAsH1('# 113. 推荐技术架构')) {
    errors.push('PRD 标题层级护栏 canary 过宽：**顶级**小节（`# N.`）被误判为违规');
  }
}

// ── 护栏「引用宪法」必须真的**读宪法**（2026-10-06，审计 §4.82）──
// 立此条的原因：承重集审计（§4.79–§4.82）实测 —— 有 4 个护栏文件在注释里引用 `PRD §N`
// 作为断言的**依据**，却**从未打开 PRD** ⇒ 宪法被改动时这些断言**不会红**
// （「引用宪法 ≠ 读宪法」）。那 4 处已逐个补上宪法侧判据（§48/§129/§101/§122/§134）。
// 本判据把那次「清零」变成**可重跑的不变量** —— 否则下一轮只能靠记忆说「我记得都改过了」。
//
// 判据（可机械判定）：`tests/parity/verify-*.mjs` 里若出现 `PRD §N`，
// 则该文件必须**同时出现 PRD 文件名**（即真的打开它）。
// **例外必须显式登记并带理由**，且**双向**核对：登记了但已不再引用也报错（防化石例外）。
// ⚠️ 范围如实声明：只扫 `tests/parity/verify-*.mjs`（发布门禁自动发现的那一族），
// 不含 `tests/qualification/*`（人工记录器）与其他目录。
const PRD_CITE_EXEMPT = new Map([
  ['verify-release-gate.mjs',
    '该处只是 ADR 登记表里的一行**描述**（ADR-0026 = PRD §110 的测量口径）；'
    + '§110 的五个数值已由 verify-parity-ledger.mjs 从 PRD 原文读值（审计 §4.80），'
    + '此处再读一遍会制造**第三份副本**'],
]);
{
  const guardsDir = resolve(root, 'tests/parity');
  const guardFiles = readdirSync(guardsDir).filter((f) => /^verify-.*\.mjs$/.test(f));
  const PRD_FILE = 'Mellow-PRD-V1.2-FINAL.md';
  const CITES_PRD = /PRD\s*§\s*\d+/;
  const cited = [];
  for (const f of guardFiles) {
    const src = readFileSync(join(guardsDir, f), 'utf8').replace(/\r\n/g, '\n');
    if (!CITES_PRD.test(src)) continue;
    cited.push(f);
    if (src.includes(PRD_FILE)) continue; // 真的打开了 PRD
    if (PRD_CITE_EXEMPT.has(f)) continue; // 显式例外（带理由）
    fail(`tests/parity/${f} 在注释里引用 \`PRD §N\` 但**从未读 PRD** —— `
      + '「引用宪法 ≠ 读宪法」：宪法被改时该断言不会红。'
      + '要么补一条「从 PRD 原文读值」的判据，要么登记进 PRD_CITE_EXEMPT（带理由）');
  }
  // 例外表**双向**：登记了但已不再引用 ⇒ 报错（化石例外会掩盖未来的回归）
  for (const [f, reason] of PRD_CITE_EXEMPT) {
    if (!cited.includes(f)) {
      fail(`PRD_CITE_EXEMPT 登记了 ${f}，但它已不再引用 \`PRD §N\`（或文件已删除）—— `
        + '请删除该例外条目');
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      fail(`PRD_CITE_EXEMPT 的 ${f} 缺理由（例外必须带可复核的理由）`);
    }
  }
  // 覆盖下限：引用了 PRD 的护栏文件不应少于 2 个（否则判据可能已空转）
  if (cited.length < 2) {
    fail(`只有 ${cited.length} 个护栏文件引用 \`PRD §N\`（下限 2 = 立此判据时的基线）—— `
      + '结构漂移会让本判据**空转**；若确实改过结构，请同步下调下限并说明');
  }
  // canary：谓词**共用**（同一条 CITES_PRD）且**双向**
  if (!CITES_PRD.test('PRD §110 性能目标')) {
    errors.push('PRD 引用判据 canary 失效：合法样本未被识别');
  }
  if (CITES_PRD.test('PRD 110 性能目标')) {
    errors.push('PRD 引用判据 canary 过宽：无 `§` 的样本被误判为引用');
  }
}

// ── 发布手册里的版本字面量必须与真值源一致（2026-10-06，审计 §4.88）──
// 立此条的原因：`docs/plans/packaging-release.md` 是一份**人手跟着做的发版手册**，
// 而它原文写「当前版本：**0.1.0**（三处一致）」—— 实际已到 1.5.x，且**升版是 4 处**（漏了 Cargo.lock）。
// 这正是本仓反复出现的形态：**不带日期的数字会被按「当前」读**（§4.62），
// 而**没有人守**（§4.64）。⇒ 把「版本字面量」绑到真值源。
// 处置分两层：① **首选是不写死**（正文已改为指向真值源与 `v<版本>` 占位符）；
// ② 对**确实需要**出现的字面量（更正块引用的旧值 / 历史起点），必须**显式登记理由**，且**双向**核对。
// ⚠️ 2026-10-09（审计 §4.171）：**扫描面从 1 份文档扩到 2 份** —— 新增
//   `tests/qualification/packaging-gate.md`（三平台 Packaging Gate **记录**）：它写着
//   「版本一致性：**0.1.0**（…四处一致）」而当时已是 1.5.x。该数字**作为历史事实是准确的**
//   （文档末尾写着「推 `v0.1.0` 标签触发三平台 CI 打包」），缺陷是**缺时间上下文** ⇒
//   读者会按「当前」读（本仓 §4.62 的老形态：「不带日期的数字会被按「当前」读」）。
//   处置：① 文档顶部加**真值源指针**；② 该文档**纳入本判据的扫描面**。
// ⚠️ **例外必须按文档分表** —— 否则 A 文档的例外会**悄悄覆盖** B 文档
//   （本轮扩扫描面时实测到这一风险：`0.1.0` 在 packaging-release.md 是合法例外，
//   若不按文档分表，它会让 packaging-gate.md 里的同一个字面量**静默通过**）。
const PACKAGING_DOCS = ['docs/plans/packaging-release.md', 'tests/qualification/packaging-gate.md'];
// 允许出现的**非当前版本**字面量：**按文档**登记 → 理由（双向：不再出现即报错，防化石）
const PACKAGING_VERSION_ALLOW = new Map([
  ['docs/plans/packaging-release.md', new Map([
    ['0.1.0', '**更正块引用的旧值**（原文曾写「当前版本 0.1.0」）—— 更正惯例是引用错误原文，故必须保留'],
    ['v1.5.2', '**历史起点**（「v1.5.2 起替换占位域名」），不是当前版本'],
  ])],
  ['tests/qualification/packaging-gate.md', new Map([
    ['0.1.0', '**记录时的版本**（v0.1.0 时期的 Gate 记录）—— 文件顶部已加「当前版本以 tauri.conf.json 为准」指针，故保留为历史事实'],
    ['v1.5.2', '**历史起点**（「updater endpoints…v1.5.2 起」）—— 与 packaging-release.md 的同名例外同源，不是当前版本'],
  ])],
]);
{
  const confPath = resolve(root, 'apps/desktop/src-tauri/tauri.conf.json');
  if (!existsSync(confPath)) {
    fail('缺少 apps/desktop/src-tauri/tauri.conf.json（版本真值源）');
  } else {
    const current = JSON.parse(readFileSync(confPath, 'utf8')).version;
    const VERSION_TOKEN = /\bv?(\d+\.\d+\.\d+)\b/g;
    // 谓词**抽成一处**：判定与 canary 共用（本仓 idiom）
    const isOffender = (tok, cur, allow) => tok.replace(/^v/, '') !== cur
      && !allow.has(tok) && !allow.has(tok.replace(/^v/, ''));
    let checkedDocs = 0;
    for (const doc of PACKAGING_DOCS) {
      const docPath = resolve(root, doc);
      if (!existsSync(docPath)) { fail(`缺少 ${doc}`); continue; }
      checkedDocs += 1;
      const allow = PACKAGING_VERSION_ALLOW.get(doc) ?? new Map();
      const text = readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n');
      const seen = new Set();
      const offenders = [];
      for (const line of text.split('\n')) {
        for (const m of line.matchAll(VERSION_TOKEN)) {
          seen.add(m[0]);
          seen.add(m[1]);
          if (isOffender(m[0], current, allow)) {
            offenders.push(`${m[0]}（…${line.trim().slice(0, 60)}…）`);
          }
        }
      }
      if (offenders.length > 0) fail(
        `${doc} 出现**既不是当前版本（${current}）也未登记理由**的版本字面量：`
        + `${offenders.join(' / ')} —— 文档里的版本号会被按「当前」读；`
        + '首选**不要写死**（改为指向真值源或 `v<版本>` 占位符），确需出现则登记进 '
        + 'PACKAGING_VERSION_ALLOW（**按文档**分表、带理由）');
      // 例外表**双向**：登记了但已不再出现 ⇒ 报错（化石例外会掩盖未来回归）
      for (const [tok, reason] of allow) {
        if (!seen.has(tok)) {
          fail(`PACKAGING_VERSION_ALLOW 为 ${doc} 登记了 ${tok}，但它已不再出现在该文档 —— 请删除该例外条目`);
        }
        if (typeof reason !== 'string' || reason.trim() === '') {
          fail(`PACKAGING_VERSION_ALLOW 的 ${doc} → ${tok} 缺理由（例外必须带可复核的理由）`);
        }
      }
    }
    // ⚠️ **外层双向（2026-10-09，审计 §4.215）**：`PACKAGING_VERSION_ALLOW` 的**文档键**也必须在扫描面内 ——
    //   否则该键下的所有条目**永不参与核对**（外层漏核 ⇒ 内层的双向核对**也白做**）。
    //   ⚠️ 本仓的「嵌套例外表」不止这一处 ⇒ **核双向时两层都要核**。
    for (const doc of PACKAGING_VERSION_ALLOW.keys()) {
      if (!PACKAGING_DOCS.includes(doc)) {
        fail(`PACKAGING_VERSION_ALLOW 登记了 ${doc}，但它**不在扫描面** PACKAGING_DOCS 里 —— `
          + '该键下的条目**永不参与核对**（外层漏核）⇒ 请删掉该键，或把该文档加进扫描面');
      }
    }
    // 防空转：扫描面必须**真的**覆盖到 2 份文档（少一份 ⇒ 判据范围萎缩）
    if (checkedDocs !== PACKAGING_DOCS.length || PACKAGING_DOCS.length < 2) {
      fail(`版本字面量判据只覆盖了 ${checkedDocs}/${PACKAGING_DOCS.length} 份文档 —— 扫描面萎缩会让本判据空转`);
    }
    // canary ①：当前版本必须放行；② 未登记的异值必须被抓到（同一谓词 isOffender）
    const EMPTY_ALLOW = new Map();
    if (isOffender(current, current, EMPTY_ALLOW)) {
      errors.push('版本字面量护栏 canary 失效：当前版本样本被误判为违规');
    }
    if (!isOffender('v9.9.9', current, EMPTY_ALLOW)) {
      errors.push('版本字面量护栏 canary 失效：未登记的异值样本未被识别');
    }
    // canary ③：**按文档**分表 —— 本表的例外生效；空表下同一字面量必须被抓到
    if (isOffender('0.1.0', current, new Map([['0.1.0', 'x']]))) {
      errors.push('版本字面量护栏 canary 失效：本表内的例外未生效');
    }
    if (!isOffender('0.1.0', current, EMPTY_ALLOW)) {
      errors.push('版本字面量护栏 canary 失效：空例外表下异值未被识别（「按文档分表」的前提）');
    }
  }
}

// ── 「升版 4 处」必须彼此一致（2026-10-09，审计 §4.170）──────────────────────
// 【为什么需要】升版要同步 **4 处**：`apps/desktop/package.json` · `src-tauri/tauri.conf.json`（**真值源**）·
//   `src-tauri/Cargo.toml` · **`src-tauri/Cargo.lock`**（前 3 处有 `scripts/sync-version.mjs`，
//   **Cargo.lock 要手工改** ⇒ **最容易漏**）。而护栏此前**只**查「发版手册的字面量 ↔ `tauri.conf.json`」
//   —— **4 处代码位置之间是否一致，没有任何判据**（本文件 §「发布手册」一节的注释里
//   恰好写着「**升版是 4 处（漏了 Cargo.lock）**」，说明这形态被记录过，但**没落成判据**）。
// 【为什么值得守】版本不一致 ⇒ 制品名 / updater 元数据 / 关于面板互相矛盾，
//   而这类「同一数值多处维护」在本仓已出现 4 次（§4.40 族的 spec 硬数字、§4.161 的导出数、§4.169 的标记数）。
// 【锚点】`tauri.conf.json` 是**真值源**（memory / 发版手册均如此声明）；其余 3 处必须 == 它。
const VERSION_SOURCES = [
  { path: 'apps/desktop/src-tauri/tauri.conf.json', label: 'tauri.conf.json（**真值源**）',
    pick: (s) => JSON.parse(s).version },
  { path: 'apps/desktop/package.json', label: 'apps/desktop/package.json',
    pick: (s) => JSON.parse(s).version },
  { path: 'apps/desktop/src-tauri/Cargo.toml', label: 'src-tauri/Cargo.toml',
    pick: (s) => (s.match(/^version\s*=\s*"([^"]+)"/m) ?? [])[1] },
  { path: 'apps/desktop/src-tauri/Cargo.lock', label: 'src-tauri/Cargo.lock（**手工改，最易漏**）',
    pick: (s) => {
      // 本包的 lock 条目：`[[package]]\nname = "<crate>"\nversion = "<v>"`
      const crate = (readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8')
        .match(/^name\s*=\s*"([^"]+)"/m) ?? [])[1];
      if (crate === undefined) return undefined;
      const re = new RegExp(`\\[\\[package\\]\\]\\nname = "${crate}"\\nversion = "([^"]+)"`);
      return (s.match(re) ?? [])[1];
    } },
];
{
  const read0 = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
  const SEMVER = /^\d+\.\d+\.\d+$/;
  const got = [];
  for (const src of VERSION_SOURCES) {
    if (!existsSync(resolve(root, src.path))) { fail(`升版一致性：缺少 ${src.path}`); continue; }
    let v;
    try { v = src.pick(read0(src.path)); } catch (e) { fail(`升版一致性：解析 ${src.path} 失败（${e.message}）`); continue; }
    if (typeof v !== 'string' || !SEMVER.test(v)) {
      fail(`升版一致性：从 ${src.path} 取到的版本不是 semver（得到 ${JSON.stringify(v)}）—— 解析器漂移`);
      continue;
    }
    got.push({ ...src, v });
  }
  // 防空转：**4 处**必须都被解析到（少一处 ⇒ 判据范围萎缩）
  if (got.length !== VERSION_SOURCES.length || VERSION_SOURCES.length !== 4) {
    fail(`升版一致性只解析到 ${got.length}/${VERSION_SOURCES.length} 处（应为 4）—— 判据会空转`);
  }
  const uniq = new Set(got.map((g) => g.v));
  if (uniq.size > 1) {
    fail('升版 4 处**彼此不一致**：'
      + got.map((g) => `${g.label} = ${g.v}`).join(' · ')
      + ' —— 以 tauri.conf.json 为真值源；Cargo.lock 需**手工**同步（`scripts/sync-version.mjs` 不管它）');
  }
  // canary：① 合法样本（全一致）不报；② 负样本（一处不同）必须能检出
  const judge = (vs) => new Set(vs).size > 1;
  if (judge(['1.5.33', '1.5.33', '1.5.33', '1.5.33'])) {
    fail('升版一致性 canary 失效：全一致样本被误判为不一致');
  }
  if (!judge(['1.5.33', '1.5.33', '1.5.33', '1.5.32'])) {
    fail('升版一致性 canary 失效：一处不同未被检出（判据已退化成空真）');
  }
  // ── **手册里复述的「升版 N 处」也必须 == `VERSION_SOURCES.length`**（2026-10-09，审计 §4.182）──
  // 【为什么】`docs/plans/packaging-release.md` 的发版顺序写着「① **升版 4 处** → ② `npm run parity`…」
  //   —— 字面 **4**。若将来加第 5 个版本源（如新增一个含版本号的配置），**手册会静默漂**。
  //   ⚠️ **同族**：§4.180（`docs/architecture/*` 复述上游文件数）、§4.181（护栏输出里的字面「4 处」）
  //   —— **同一个数字在三处出现，而此前只有「代码位置之间的一致性」被守过**。
  {
    const PKG_DOC = 'docs/plans/packaging-release.md';
    const probe = (s) => { const r = /升版\s*\**\s*(\d+)\s*处/.exec(s); return r === null ? null : Number(r[1]); };
    const docSrc = readFileSync(resolve(root, PKG_DOC), 'utf8').replace(/\r\n/g, '\n');
    const declared = probe(docSrc);
    if (declared === null) {
      fail(`升版一致性：${PKG_DOC} 里读不到「升版 N 处」（发版顺序的锚点漂移）—— 判据不得静默跳过`);
    } else if (declared !== VERSION_SOURCES.length) {
      fail(`升版一致性：${PKG_DOC} 写「升版 ${declared} 处」，而代码里实际有 ${VERSION_SOURCES.length} 处`
        + ' —— 手册是**副本**，必须与代码一致（加/删版本源时同步改手册）');
    }
    // canary：谓词与判定共用（拼接构造）
    if (probe(`升版 ${4} 处`) !== 4) fail('升版一致性 canary 失效：手册形态「升版 N 处」取不到');
    if (probe('无此形态的句子') !== null) fail('升版一致性 canary 失效：无锚点的样本被误判');
  }
  if (got.length === VERSION_SOURCES.length) {
    console.log(`Doc code refs: 升版 ${VERSION_SOURCES.length} 处一致 = ${got[0].v}（真值源 ${VERSION_SOURCES[0].path}）`);
  }
}

// ── 同一文档内**标题不得重复**（2026-10-06，审计 §4.89）──
// 立此条的原因：`docs/adr/ADR-0021-platform-build-matrix-pass.md` 曾**连续两行**写着同一个
// `### 真机 Runtime 矩阵（待执行）`（复制粘贴残留）。这类**结构缺陷**：
//   · 不会被任何「内容核对」发现（两边文字都对）；
//   · 渲染出来只多一行同样的标题，**看起来像排版风格**；
//   · 但会让**按标题定位**的引用/锚点**指向第一个**，而作者可能想的是第二个。
// ⇒ 与 §4.78 的「PRD 子节被写成一级标题」同族：**宪法/spec 也会有结构缺陷，只有结构判据能发现**。
{
  const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
  const DUPLICATE_HEADING_DOCS = ['docs/adr', 'docs/specs'];
  let scanned = 0;
  for (const dir of DUPLICATE_HEADING_DOCS) {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (!name.endsWith('.md')) continue;
      scanned += 1;
      const lines = readFileSync(resolve(abs, name), 'utf8').replace(/\r\n/g, '\n').split('\n');
      const seen = new Map();
      const dups = [];
      lines.forEach((line, i) => {
        const m = HEADING_RE.exec(line.trim());
        if (m === null) return;
        const key = `${m[1]} ${m[2]}`; // 层级 + 文本一起比：不同层级同名标题是合法的
        if (seen.has(key)) dups.push(`「${key}」行 ${seen.get(key) + 1} 与 ${i + 1}`);
        else seen.set(key, i);
      });
      if (dups.length > 0) {
        fail(`${dir}/${name} 出现**重复标题**：${dups.join(' / ')} —— `
          + '复制粘贴残留；按标题定位的引用/锚点会指向**第一个**，而作者可能想的是第二个');
      }
    }
  }
  if (scanned < 20) {
    fail(`重复标题普查只扫到 ${scanned} 份文档（下限 20 = 立此判据时的基线）—— 扫描面漂移会让本判据空转`);
  }
  // canary：判据是**同一个正则**，双向
  const headingKey = (line) => { const m = HEADING_RE.exec(line.trim()); return m === null ? null : `${m[1]} ${m[2]}`; };
  if (headingKey('### 真机 Runtime 矩阵（待执行）') !== headingKey('### 真机 Runtime 矩阵（待执行）')) {
    errors.push('重复标题护栏 canary 失效：同一标题样本未被识别为相同 key');
  }
  if (headingKey('## A') === headingKey('### A')) {
    errors.push('重复标题护栏 canary 过宽：不同层级的同名标题被误判为重复');
  }
}

// ── 文档里引用的 `docs/**/*.md` 路径必须存在（2026-10-06，审计 §4.90 / §4.93）──
// 立此条的原因：`docs/qualification/` 里两份文档引用 `docs/plans/typora-deep-parity-plan.md`
// —— 该文件**不存在**（**幽灵引用**）：读者按它去找「阶段 1/阶段 0-4」会找不到。
// ⚠️ **§4.93 更正**：初版说它「**从未入库**」—— **不准确**。它**存在过**，后被
// **取代并删除、未归档**（`AGENTS.md`：2026-08-22 起由 master-plan 取代旧
// checklist / audit / review / deep-parity-plan 四文档；PRD §148 列过 `typora-parity-checklist.md`）。
// ⇒ 判据（引用必须可达）不变，但**归因要准确**：「引用了已删除的文档」≠「引用了从未存在的文档」。
// ⇒ 与 §4.76 的「架构文档反引号路径必须存在」同族，但**扫描面扩到整个 `docs/`** 且
// **不要求反引号**（幽灵引用常常是裸路径）。
// ⚠️ 例外必须**显式登记 + 双向**：更正块**必然要引用错误原名**（本仓惯例是「不改写历史、只追加更正」），
// 故幽灵名会合法地出现在「说明它不存在」的句子里。
const DOC_PATH_EXEMPT = new Map([
  ['docs/plans/typora-deep-parity-plan.md',
    '**已删除且未归档**（2026-08-22 起被 master-plan 取代）：保留在**更正块**里正是为了说明'
    + '「该文件不存在、当前施工文件是 master-plan」'],
]);
{
  const SKIP_DIRS = new Set(['archive']); // archive 是历史目录，其内部引用不要求可达
  const mdFiles = [];
  const collectMd = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) collectMd(p);
      else if (e.name.endsWith('.md')) mdFiles.push(p);
    }
  };
  collectMd(resolve(root, 'docs'));
  const DOC_PATH_RE = /docs\/[\w./-]+\.md/g;
  const missing = [];
  const seenPaths = new Set();
  for (const abs of mdFiles) {
    const rel = relative(root, abs).replace(/\\/g, '/');
    const lines = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(DOC_PATH_RE)) {
        const ref = m[0];
        seenPaths.add(ref);
        if (DOC_PATH_EXEMPT.has(ref)) continue;
        // 三种解析：仓库相对 / 相对 docs / 相对 docs/plans（历史文档常省略前缀）
        const candidates = [resolve(root, ref), resolve(root, 'docs', ref), resolve(root, 'docs/plans', ref)];
        if (candidates.some((c) => existsSync(c))) continue;
        missing.push(`${rel}:${i + 1} → ${ref}`);
      }
    });
  }
  if (missing.length > 0) {
    fail(`这些文档引用了**不存在的** \`docs/**/*.md\` 路径（**幽灵引用**）：${missing.slice(0, 5).join(' / ')}`
      + ' —— 读者按它去找会找不到；请改为指向真实文件，或登记进 DOC_PATH_EXEMPT（带理由）');
  }
  // 例外表**双向**：登记了但已不再被引用 ⇒ 报错（化石例外会掩盖未来回归）
  for (const [ref, reason] of DOC_PATH_EXEMPT) {
    if (!seenPaths.has(ref)) {
      fail(`DOC_PATH_EXEMPT 登记了 ${ref}，但已不再有文档引用它 —— 请删除该例外条目`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      fail(`DOC_PATH_EXEMPT 的 ${ref} 缺理由（例外必须带可复核的理由）`);
    }
  }
  // 覆盖下限：`docs/**` 的 md 份数不得低于立此判据时的基线
  if (mdFiles.length < 50) {
    fail(`幽灵引用普查只扫到 ${mdFiles.length} 份 md（下限 50 = 立此判据时的基线）—— 扫描面漂移会让本判据空转`);
  }
  // canary：判据是**同一个解析函数**，双向
  const resolves = (ref) => [resolve(root, ref), resolve(root, 'docs', ref), resolve(root, 'docs/plans', ref)]
    .some((c) => existsSync(c));
  if (!resolves('docs/plans/typora-parity-master-plan.md')) {
    errors.push('幽灵引用护栏 canary 失效：真实存在的样本被判为不存在');
  }
  if (resolves('docs/plans/__definitely_absent__.md')) {
    errors.push('幽灵引用护栏 canary 失效：不存在的样本被判为存在');
  }
}

// ── `docs/qualification/` 的每份记录必须带「快照声明」（2026-10-06，审计 §4.91）──
// 立此条的原因（本会话实测）：三份记录**互相矛盾**，而它们都**没有快照声明头** ——
//   · `rc-audit-2026-08-16.md`     结论「存在 FAIL → **V1.0 禁止标记**」
//   · `v1.0-release-notes.md`      称已发布 **1.0.0**
//   · `release-candidate-audit-2026-08-18.md` 称「**待**生成 V1.0 Release Notes」（日期却更晚）
// ⇒ 读者会把**当时**的裁决读成**当前**就绪度。**日期是唯一的过期信号，但只写在标题里不够** ——
// 需要一句话说清「这不是当前、当前在哪儿」。
// 判据：非豁免的 `docs/qualification/*.md` **与** `tests/qualification/*.md`，
//   其**前 14 行**必须含快照标记之一。
// ⚠️ 2026-10-09（审计 §4.197）：**扫描面从 `docs/qualification` 扩到 `tests/qualification`** ——
//   后者有 **8 份**验收记录，其中 **6 份**缺快照声明（实测），而它们**同样会被按「当前」读**
//   （如 `source-fidelity-corpus.md` 的「151 个文件 / 0 diff」是 2026-08-16 的实跑快照，
//   而它的数字来自脚本的**运行时** `find | wc -l` ⇒ **无法静态校验**）。
const QUALIFICATION_SNAPSHOT_EXEMPT = new Map([
  ['ux-score-gate-template.md', '**模板/工具**（不是记录）：定义「怎么做」，不含某次执行的结论'],
  ['release-blocker-audit-2026-09-25.md', '**现状真值源本身**：滚动审计日志（§4.NN 递增），不是某次快照'],
  ['README.md', '**索引 / 真值源指针**（`tests/qualification/`）：它说明「当前状态以哪份为准」，本身不是快照'],
]);
// ⚠️ 2026-10-09（审计 §4.198）：**扫描面再扩** —— 用「同类目录」透镜对比「实际目录 vs 被判据扫到的目录」，
//   发现 `docs/accessibility/`（审计与修复记录）与 `docs/security/`（安全评审，含「🔴 高 2」结论摘要）
//   **同样会被按「当前」读**（后者的问题清单**不代表至今仍存在**）而**不在任何扫描面**。
const QUALIFICATION_SNAPSHOT_DIRS = [
  'docs/qualification', 'tests/qualification', 'docs/accessibility', 'docs/security',
];
// ⚠️ 2026-10-09（审计 §4.206）：**单文件**也纳入 —— `docs/plans/print-verification-checklist.md`
//   兼有「流程」与「**2026-08-13 的自动化验证结果**」⇒ 同样会被按「当前」读
//   （且它「手动验证」一节**仍待真机**）。⚠️ **不整目录纳入 `docs/plans/`**（含施工文件，假阳性多）。
const QUALIFICATION_SNAPSHOT_FILES = [
  'docs/plans/print-verification-checklist.md',
  // 2026-10-09（审计 §4.207）：同为 `docs/plans/` 下的**专项验证记录**（「制定日期 2026-08-23」+
  // 「Mellow 基线 `74c454b` / Desktop **1.3.4**」）⇒ 同样会被按「当前」读。
  'docs/plans/markdown-syntax-demo-parity-validation-plan.md',
];
{
  const SNAPSHOT_MARKER = /快照声明|不是当前|已过期|历史记录|历史快照|按当时读/;
  let checked = 0;
  const allNames = new Set();
  for (const rel of QUALIFICATION_SNAPSHOT_DIRS) {
    const dir = resolve(root, rel);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
    for (const name of files) {
      allNames.add(name);
      if (QUALIFICATION_SNAPSHOT_EXEMPT.has(name)) continue;
      checked += 1;
      const head = readFileSync(resolve(dir, name), 'utf8').replace(/\r\n/g, '\n').split('\n').slice(0, 14).join('\n');
      if (!SNAPSHOT_MARKER.test(head)) {
        fail(`${rel}/${name} 的前 14 行缺少**快照声明** —— `
          + '本目录是**验收记录**，读者会把「当时」的裁决读成「当前」就绪度；'
          + '请加一句「本文是 <日期> 的历史记录，当前状态以 verify-release-gate.mjs 为准」，'
          + '或登记进 QUALIFICATION_SNAPSHOT_EXEMPT（带理由）');
      }
    }
  }
  // ⚠️ 单文件（2026-10-09，审计 §4.206）
  for (const rel of QUALIFICATION_SNAPSHOT_FILES) {
    const abs = resolve(root, rel);
    if (!existsSync(abs)) {
      fail(`QUALIFICATION_SNAPSHOT_FILES 登记了 ${rel}，但该文件不存在 —— 请删除该条目`);
      continue;
    }
    checked += 1;
    const head = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(0, 14).join('\n');
    if (!SNAPSHOT_MARKER.test(head)) {
      fail(`${rel} 的前 14 行缺少**快照声明** —— 它含「某次实跑的结果」，读者会按「当前」读`);
    }
  }
  if (checked < 8) {
    fail(`快照声明普查只检查了 ${checked} 份（下限 8 = 立此判据时的基线）—— 扫描面漂移会让本判据空转`);
  }
  // 例外表**双向**：登记了但文件不存在 / 已不再需要豁免 ⇒ 报错
  for (const [name, reason] of QUALIFICATION_SNAPSHOT_EXEMPT) {
    if (!allNames.has(name)) {
      fail(`QUALIFICATION_SNAPSHOT_EXEMPT 登记了 ${name}，但该文件不存在 —— 请删除该例外条目`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      fail(`QUALIFICATION_SNAPSHOT_EXEMPT 的 ${name} 缺理由`);
    }
  }
  // canary：判据是**同一个正则**，双向
  if (!SNAPSHOT_MARKER.test('> **⚠️ 快照声明（2026-10-06）**：本文是历史记录')) {
    errors.push('快照声明护栏 canary 失效：合法样本未被识别');
  }
  if (SNAPSHOT_MARKER.test('# 某次审计（2026-08-16）\n\n全部通过，可以发布。')) {
    errors.push('快照声明护栏 canary 过宽：无标记的样本被误判为有标记');
  }
}

// ── `AGENTS.md`（治理文件）的路径与包清单必须与实际一致（2026-10-06，审计 §4.93）──
// 立此条的原因：`AGENTS.md` 是**治理文件**（规定文档层级、目录约定、包依赖），
// 但它的**扫描面不在任何护栏里** —— `DOC_GLOBS` 只含 `docs/plans|adr|specs`，
// §4.76 的架构护栏只扫 `docs/architecture`。**实测审出 3 处失真**：
//   ① `editor-core/` 标「**只读**」—— 与其 `UPSTREAM.md`（**修改 19 / 新增 3**）冲突
//      （**同一处失真我在 §4.76 于 `docs/architecture/editor-core.md` 修过，AGENTS.md 被漏掉**
//       ⇒ 「更正没扫全文」，同 §4.91 的教训）；
//   ② `docs/architecture/` 的括号清单**列 5 个、实际 7 个**；
//   ③ `packages/` 清单**列 12 个、实际 15 个**（漏 `desktop-ui` / `export` / `settings`）。
// 本判据覆盖**可机械判定的那一半**（①「只读」是语义判断，**不在本判据范围**，已人工更正）：
//   · AGENTS.md 里以反引号给出的仓库相对路径**必须存在**；
//   · 「目录约定」里列出的 `packages/<name>` **双向**等于实际的 `packages/*`。
{
  const agentsPath = resolve(root, 'AGENTS.md');
  if (!existsSync(agentsPath)) fail('AGENTS.md 不存在');
  if (existsSync(agentsPath)) {
    const agents = readFileSync(agentsPath, 'utf8').replace(/\r\n/g, '\n');
    // ① 反引号仓库相对路径必须存在（跳过含 `*` 的 glob 与 `packages/*` 这类通配）
    const AG_PATH_RE = /`([\w.-]+\/[\w./-]*\.(?:md|json|ts|tsx|mjs|rs|yml|yaml|toml|sh))`/g;
    const missingPaths = [];
    for (const m of agents.matchAll(AG_PATH_RE)) {
      const p = m[1];
      if (p.includes('*')) continue;
      if (!existsSync(resolve(root, p))) missingPaths.push(p);
    }
    if (missingPaths.length > 0) {
      fail(`AGENTS.md 引用了**不存在**的仓库相对路径：${missingPaths.join(', ')} —— `
        + '治理文件的路径断言必须可达（它是所有任务的入口）');
    }
    // ② 「目录约定」的 `packages/` 与 `tests/` 清单 ⇄ 实际目录 **双向**
    //    2026-10-08（审计 §4.159）：原只查 `packages/`；而**同一棵树**里的 `tests/` 段**只列 2/7**
    //    （漏 `benchmark/` 等 5 个）⇒ 现**两段都查**（并声明两段都自称穷举）。
    const lines = agents.split('\n');
    /** 取「目录约定」里某个顶格段（如 `packages/`）下缩进行里出现的 `<name>/`。 */
    const sectionListed = (header) => {
      const start = lines.findIndex((l) => l.trim() === header);
      if (start < 0) return null;
      const out = new Set();
      for (let i = start + 1; i < lines.length; i += 1) {
        const l = lines[i];
        if (/^[^\s]/.test(l)) break; // 回到顶格 ⇒ 该段结束
        for (const m of l.matchAll(/(?:^|\s)([a-z][a-z0-9-]*)\//g)) out.add(m[1]);
      }
      return out;
    };
    const dirNames = (d) => readdirSync(resolve(root, d), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
    for (const [header, dir, min] of [['packages/', 'packages', 10], ['tests/', 'tests', 6]]) {
      const listed = sectionListed(header);
      if (listed === null) {
        fail(`AGENTS.md 的「目录约定」里找不到 \`${header}\` 段 —— 解析漂移会让本判据空转`);
        continue;
      }
      const actual = dirNames(dir);
      if (listed.size < min) {
        fail(`AGENTS.md 的 ${header} 清单只解析出 ${listed.size} 个（下限 ${min} = 立此判据时的基线）`
          + ' —— 解析漂移会让本判据空转');
      }
      const notListed = actual.filter((p) => !listed.has(p)).sort();
      const notExist = [...listed].filter((p) => !actual.includes(p)).sort();
      if (notListed.length > 0) {
        fail(`这些目录**实际存在但 AGENTS.md 的「目录约定」未列出**：${notListed.map((x) => `${dir}/${x}`).join(', ')} —— `
          + '该清单**自称穷举**；清单不全 = 新目录「不存在于治理文件里」（同 §4.28「护栏范围没枚举」）');
      }
      if (notExist.length > 0) {
        fail(`AGENTS.md 的「目录约定」列出了**不存在**的 ${dir}/ 子目录：${notExist.join(', ')} —— 治理文件不得指向不存在的目录`);
      }
    }
    // canary：谓词是**同一组集合运算**，双向
    const diff = (a, b) => a.filter((x) => !b.includes(x)).sort();
    if (diff(['a', 'b'], ['a', 'b']).length !== 0) errors.push('AGENTS.md 清单护栏 canary 失效：相等集合被判为有差异');
    if (diff(['a', 'c'], ['a', 'b']).join(',') !== 'c') errors.push('AGENTS.md 清单护栏 canary 失效：多出的项未被识别');
  }
}

// ── markdown **相对链接**必须可达（2026-10-06，审计 §4.94）──
// 立此条的原因：本文件已有两条「路径可达性」判据，但形态不同 ——
//   ① §4.76：`docs/architecture` 里**反引号**包住的路径；
//   ② §4.90：整个 `docs/` 里**裸** `docs/**/*.md` 路径。
// 而**最常被点的**是第三种形态：**markdown 链接** `[文字](相对路径)` —— 例如 `README.md`
// 的「文档索引」整段。本轮审 `README.md`（仓库门面）时发现它**只被部分护栏覆盖**。
//
// ⚠️ **必须跳过三种「合法的不可达」**（实测逐条踩过，否则假阳性 29 处 → 真断链 0 处）：
//   ① **围栏代码块与行内代码** —— 那里常写 `[label](src)`、`[text](URL)` 这类**示例**
//      （首版只跳行内代码，漏了围栏 ⇒ `clipboard-smart-paste-spec` 的示例被误报）；
//   ② **测试夹具**（`tests/fixtures/**`、`tests/benchmark/**/{work,fixtures}/**`）——
//      它们是**链接渲染语料**，**故意**含不存在的相对路径；
//   ③ **更正/引用块** —— 「原写 `[x](old.md)`」这类行必然引用旧路径。
{
  const MD_SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'CoreEditor', 'dist', '.workbuddy-ai', '.trae', 'archive']);
  // ⚠️ **必须豁免生成型夹具目录** —— 实测踩过：`tests/benchmark/fixtures/` 自带 `.gitignore`（`*`），
  // 是**本地生成、不入库**的夹具；其中 `1000-images.md` **一个文件就含 1000 条相对链接**。
  // 首版只豁免了 `tests/fixtures/**` 与 `benchmark/**/{work,fixtures}/`（正则漏了
  // `benchmark/fixtures/` 这一形态）⇒ **本地计数被这一个文件灌到 1037**，而 **CI 里该文件不存在
  // ⇒ 只剩 25** ⇒ 撞穿当时按污染值设的下限 500（**CI 当场变红**）。
  const FIXTURE_RE = /^tests\/(?:fixtures\/|benchmark\/fixtures\/|benchmark\/.*\/(?:work|fixtures)\/)/;
  const mdFiles = walk(root).filter((f) => f.endsWith('.md'));
  const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  // ⚠️ 过滤谓词**必须是共用函数**（主循环与 canary 同一对象）—— 否则放宽它不会被抓到。
  const isExternalLink = (t) => t === '' || /^(?:https?:|mailto:|#|[a-z][a-z0-9+.-]*:)/i.test(t);
  /** 取一条行内所有 markdown 链接的目标（含标题属性的行也只取路径） */
  const linkTargets = (line) => [...line.matchAll(LINK_RE)].map((m) => m[1].split('#')[0].trim());
  let linkCount = 0;
  const broken = [];
  for (const abs of mdFiles) {
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (FIXTURE_RE.test(rel)) continue;
    if (MD_SKIP_DIRS.has(rel.split('/').slice(0, -1).find((seg) => MD_SKIP_DIRS.has(seg)) ?? '')) continue;
    const raw = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    const noFences = raw.replace(/```[\s\S]*?```/g, '');
    const dir = resolve(abs, '..');
    noFences.split('\n').forEach((line, i) => {
      // ⚠️ 更正说明会**引用示例**（旧路径 / 已删文档）⇒ 逐行豁免。
      // ⚠️ **2026-10-09（审计 §4.213）删除了一处死豁免**：这里原还写着 `|审计 §4\.(?:90|93|94)`
      //   —— 那是 §4.94 立本判据时，为「那几节里**举例用的断链**」加的豁免。
      //   实测：**去掉它本判据仍绿**（不可达 0 处），且全仓含该字样的 **7 行**（都是「更正块」）
      //   **一条链接都没有** ⇒ **豁免已成死代码**，且它按「提到哪一节」而不是按「这行的性质」放行
      //   ⇒ 任何将来提到那几节的行都会**静默免检**（盲区）。故删除。
      if (/原写|原文|更正|不存在/.test(line)) return;
      const clean = line.replace(/`[^`]*`/g, '');
      for (const target of linkTargets(clean)) {
        if (isExternalLink(target)) continue;
        linkCount += 1;
        let decoded;
        try { decoded = decodeURIComponent(target); } catch { decoded = target; }
        if (!existsSync(resolve(dir, decoded))) broken.push(`${rel}:${i + 1} → ${target}`);
      }
    });
  }
  if (broken.length > 0) {
    fail(`这些 markdown **相对链接不可达**：${broken.slice(0, 5).join(' / ')}`
      + `（共 ${broken.length} 处）—— 读者点它会 404；请改为正确路径，或登记豁免（测试夹具已整体豁免）`);
  }
  // 把计数打出来（本地与 CI 可对照；首版没打，导致「下限按污染值校准」没被发现）
  console.log(`Doc code refs: markdown 相对链接 ${linkCount} 条（已排除生成型夹具）；不可达 ${broken.length} 处`);
  // 覆盖下限：**必须排除生成型夹具后再校准**。
  // ⚠️ 首版把下限设成 500 —— 那是拿**被本地生成夹具污染**的计数（1037，其中 1000 条来自
  // 一个 gitignored 的 `1000-images.md`）校准的 ⇒ **CI 里必然变红**（skill §39 的原始案例）。
  // ⇒ **校准基线前先问「这个计数在干净检出里还成立吗」**（判据的输入里有生成物吗？）。
  // ⚠️ 2026-10-09（审计 §4.168）：注释原写「实测真实基线 = **25**」而阈值写 15 ⇒
  //   阈值**低于**它自己声明的基线。用「抬 1 仍绿」二分实测**当前值 = 27** ⇒ 现同步为 **27**。
  // [覆盖型] 基线 27 —— 阈值必须 == 当前值（skill §2）
  if (linkCount < 27) {
    fail(`markdown 链接可达性普查只解析出 ${linkCount} 条相对链接（下限 27 = 2026-10-09 实测基线；**已排除生成型夹具**）`
      + ' —— 解析或扫描面漂移会让本判据空转；若确实删过文档，请同步下调下限并说明');
  }
  // canary：五向 —— ①相对路径必须被识别 ②绝对 URL/锚点必须被跳过
  // ③**带标题属性的链接只能取到路径**（正则放宽成 `([^)]*)` 会把 `"标题"` 并进目标 ⇒ 假阳性）
  // ④围栏代码块必须真的被剥离 ⑤（原写「四向」—— 2026-10-09 审计 §4.213 实测**实为 5 条**，同步）
  if (linkTargets('[a](docs/x.md)').join(',') !== 'docs/x.md') {
    errors.push('markdown 链接护栏 canary 失效：相对路径样本未被正确解析');
  }
  if (linkTargets('[a](https://x.com)').some((t) => !isExternalLink(t))) {
    errors.push('markdown 链接护栏 canary 过宽：绝对 URL 未被跳过');
  }
  if (linkTargets('[a](#section)').some((t) => !isExternalLink(t))) {
    errors.push('markdown 链接护栏 canary 过宽：纯锚点未被跳过');
  }
  if (linkTargets('[a](docs/x.md "标题")').join(',') !== 'docs/x.md') {
    errors.push('markdown 链接护栏 canary 失效：带标题属性的链接未只取路径（放宽正则会引入假阳性）');
  }
  if (/```[\s\S]*?```/.test('```\n[x](src)\n```'.replace(/```[\s\S]*?```/g, ''))) {
    errors.push('markdown 链接护栏 canary 失效：围栏代码块未被剥离（示例会被误报）');
  }
}

// ── 每个 `packages/*` 必须有**跨包消费者**，否则显式登记（2026-10-06，审计 §4.95）──
// 立此条的原因：本仓的跨包导入走**相对路径**（如 `../../../packages/settings/src`），
// 因此**没有任何东西保证一个包被用到** —— 实测 **4 个包零消费者**：
//   · **`document-model`** —— 317 行 src + 270 行测试，按 **ADR-0008** 实现完整文档模型
//     （id/path/revision/dirty/encoding/EOL/diskState…），**但无任何跨包导入**；
//     而 `app-core/src/documentState.ts` 有**同一套字段**且**不 import 它**
//     ⇒ **ADR-0008 的实现未被采用**（**架构性**，待裁决）。
//   · `editor-react` / `shared` / `workspace` —— 均为薄包（42/70/72 行），零消费者。
// ⇒ 判据：**无消费者 = 必须显式登记理由**，让「新死包」无法静默累积。
//
// ⚠️ **测量口径（实测踩过 4 次才定准）**：
//   ① 只认**模块说明符**（`from '…'` / `import('…')`，单双引号均可）——
//      按「文件里出现过包名」判会把**注释/局部变量/同名测试目录**都算进来（全是假阳性）；
//   ② `ownerOf` **只排除 vendored 上游**（`packages/editor-core/CoreEditor/`），
//      **不排除整个 `packages/editor-core/`** —— 否则它作为**目标**也被判 null（假阴性）；
//   ③ 解析要**试 4 种落点**（`base` / `base.ts` / `base.tsx` / `base/index.ts`）。
const PKG_NO_CONSUMER_EXEMPT = new Map([
  ['document-model',
    '⚠️ **已知缺口，待裁决**：按 **ADR-0008** 实现的完整文档模型，但**当前无任何跨包导入**；'
    + '`app-core/src/documentState.ts` 有同一套字段且不 import 它 ⇒ **ADR 的实现未被采用**。'
    + '本轮**未擅自改架构**（接线 / 删包 / 新增 ADR 三条路都需裁决）'],
  ['editor-react',
    '**预留包**：README 与 AGENTS.md 均注明「契约 re-export；组件化 UI 见**阶段 2 计划**」⇒ 有意未接线'],
  ['shared',
    '⚠️ **待裁决**：通用工具（debounce / Emitter / assert），**当前无消费者** —— 删或接线需决定'],
  ['workspace',
    '⚠️ **待裁决**：`WorkspaceModel` 等，**当前无消费者** —— 删或接线需决定'],
]);
{
  const PKG_ROOT = resolve(root, 'packages');
  const SRC_SKIP = new Set(['node_modules', '.git', 'dist', 'target', '.workbuddy-ai', '.trae']);
  const collectTs = (dir, out = []) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (SRC_SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) collectTs(p, out);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const ownerOf = (abs) => {
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (rel.startsWith('packages/editor-core/CoreEditor/')) return null; // 只排 vendored 上游
    if (rel.startsWith('packages/')) return `packages/${rel.split('/')[1]}`;
    if (rel.startsWith('apps/')) return `apps/${rel.split('/')[1]}`;
    return null;
  };
  const tsFiles = [...collectTs(PKG_ROOT), ...collectTs(resolve(root, 'apps'))];
  const consumers = new Map();
  const SPEC_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  for (const f of tsFiles) {
    const from = ownerOf(f);
    if (from === null) continue;
    const src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    for (const m of src.matchAll(SPEC_RE)) {
      if (!m[1].startsWith('.')) continue;
      const base = resolve(dirname(f), m[1]);
      for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        const to = ownerOf(cand);
        if (to !== null && to !== from) {
          if (!consumers.has(to)) consumers.set(to, new Set());
          consumers.get(to).add(from);
        }
      }
    }
  }
  const pkgs = readdirSync(PKG_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
  if (pkgs.length < 10) {
    fail(`packages 只解析出 ${pkgs.length} 个目录（下限 10）—— 扫描面漂移会让本判据空转`);
  }
  const withConsumer = new Set();
  const noConsumer = [];
  for (const p of pkgs) {
    const c = consumers.get(`packages/${p}`);
    if (c !== undefined && c.size > 0) withConsumer.add(p);
    else noConsumer.push(p);
  }
  const unregistered = noConsumer.filter((p) => !PKG_NO_CONSUMER_EXEMPT.has(p)).sort();
  if (unregistered.length > 0) {
    fail(`这些包**无任何跨包消费者**且未登记理由：${unregistered.join(', ')} —— `
      + '本仓跨包导入走相对路径，没有任何东西保证一个包被用到；'
      + '请接线（让某处 import 它）或登记进 PKG_NO_CONSUMER_EXEMPT（带理由）');
  }
  // 例外表**双向**：登记了但**已有消费者** ⇒ 报错（说明已接线，例外应删）
  for (const [p, reason] of PKG_NO_CONSUMER_EXEMPT) {
    if (!pkgs.includes(p)) {
      fail(`PKG_NO_CONSUMER_EXEMPT 登记了 ${p}，但该包不存在 —— 请删除该例外条目`);
    } else if (withConsumer.has(p)) {
      fail(`PKG_NO_CONSUMER_EXEMPT 登记了 ${p}，但它**已有跨包消费者** —— 请删除该例外条目`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      fail(`PKG_NO_CONSUMER_EXEMPT 的 ${p} 缺理由`);
    }
  }
  // canary：判据是**同一个 ownerOf / 同一组落点**，双向
  if (ownerOf(resolve(root, 'packages/editor-core/CoreEditor/src/config.ts')) !== null) {
    fail('包消费者护栏 canary 失效：vendored 上游未被排除（会把自己算成消费者）');
  }
  if (ownerOf(resolve(root, 'packages/settings/src/index.ts')) !== 'packages/settings') {
    fail('包消费者护栏 canary 失效：普通包未被识别（会把所有人算成无消费者）');
  }
}

// ── 轮次表必须指向它的**续篇**（2026-10-06，审计 §4.118）──────────────────────
// 立此条的原因（实测）：`docs/plans/typora-parity-master-plan.md` 的**轮次表**
// 在「四十一续（审计 §4.80）」处**停止逐轮登记**，而审计文档已经写到 §4.117 ——
// 也就是**本表少记了 37 轮**，且**此前没有任何指针**说明「后面记在别处」
// ⇒ 读者会把本表读成「**完整的轮次记录**」。
//
// 分工本身没问题（审计文档从 §4.81 起就是逐轮日志，且 MEMORY.md 也是这么写的）；
// 问题在**没有指针** —— 与 §4.69「同一组数值两处维护、只改了一处」同型，
// 只是这次漂移的是「**记录的完整性**」而不是数值。
//
// 判据（三条，任一不成立即失败；三条**共用同一组谓词**，canary 复用之）：
//   ① 轮次表里必须有一行**指针**，指名审计文档；
//   ② 指针声明的**起始编号**必须**紧接**表中最后一个编号（M + 1）—— 防「停止点悄悄前移」；
//   ③ 审计文档里必须**真的有** `## 4.(M+1)` 小节 —— 防指针指向一个**空承诺**。
// ⚠️ 编号只从**轮次表行**里取（`| **YYYY-MM-DD（…）** |`）——
//    不能扫全文：D 表里也写着「审计 §4.118」这类编号（D-AJ 行），会把 M 抬高到 118。
{
  const PLAN = 'docs/plans/typora-parity-master-plan.md';
  const AUDIT_REL = 'docs/qualification/release-blocker-audit-2026-09-25.md';
  const AUDIT_NAME = 'release-blocker-audit-2026-09-25.md';
  // 谓词（canary 与判据共用同一份）
  const lastRoundOf = (src) => {
    const rows = src.split('\n').filter((l) => /^\|\s*\*\*20\d\d-\d\d-\d\d（/.test(l));
    const nums = [];
    for (const l of rows) for (const m of l.matchAll(/§4\.(\d+)/g)) nums.push(Number(m[1]));
    return { rows: rows.length, nums: nums.length, last: nums.length === 0 ? null : Math.max(...nums) };
  };
  const pointerOf = (src, next) => src.split('\n')
    .find((l) => l.includes(AUDIT_NAME) && next !== null && l.includes(`§4.${next}`));
  const hasSection = (src, n) => n !== null && new RegExp(`^## 4\\.${n}[ \\t]`, 'm').test(src);

  const planSrc = readFileSync(resolve(root, PLAN), 'utf8').replace(/\r\n/g, '\n');
  const auditSrc = existsSync(resolve(root, AUDIT_REL))
    ? readFileSync(resolve(root, AUDIT_REL), 'utf8').replace(/\r\n/g, '\n')
    : '';
  const { rows, nums, last } = lastRoundOf(planSrc);
  if (rows < 40 || nums < 30) {
    fail(`master-plan 轮次表只解析出 ${rows} 行 / ${nums} 个审计编号（下限 40 / 30）—— `
      + '解析面漂移会让「轮次表必须指向续篇」退化成**空真**');
  }
  if (!existsSync(resolve(root, AUDIT_REL))) {
    fail(`审计文档 ${AUDIT_REL} 不存在 —— 轮次表的续篇无处可指`);
  }
  const next = last === null ? null : last + 1;
  if (last === null) {
    fail('master-plan 轮次表里解析不到任何「审计 §4.N」编号 —— 锚点漂移，本判据会空转');
  } else {
    const pointer = pointerOf(planSrc, next);
    if (pointer === undefined) {
      fail(`master-plan 的轮次表在 §4.${last} 处停止，但**没有任何指针**指向 `
        + `${AUDIT_NAME} 的 §4.${next} —— 读者会把本表读成「完整的轮次记录」`);
    }
    if (!hasSection(auditSrc, next)) {
      fail(`轮次表的指针声称「§4.${next} 起记在 ${AUDIT_NAME}」，但该文档里**没有** `
        + `\`## 4.${next}\` 小节 —— 指针指向一个空承诺`);
    }
  }
  // canary：三个方向（正 / 缺指针 / 指针指向空承诺），共用上面的谓词
  {
    const P_OK = '| **2026-10-06（四十一续）** | x（审计 §4.80） | y |\n'
      + `> §4.81 起只在 \`${AUDIT_NAME}\`（§4.NN 递增）。\n`;
    const P_NOPOINTER = '| **2026-10-06（四十一续）** | x（审计 §4.80） | y |\n';
    if (lastRoundOf(P_OK).last !== 80) {
      errors.push('轮次表指针护栏 canary 失效：轮次行里的编号未被解析');
    }
    if (pointerOf(P_OK, 81) === undefined || pointerOf(P_NOPOINTER, 81) !== undefined) {
      errors.push('轮次表指针护栏 canary 失效：指针的有/无两个方向不能区分');
    }
    if (pointerOf(P_OK, 82) !== undefined) {
      errors.push('轮次表指针护栏 canary 过宽：起始编号不匹配的指针也被当成指针');
    }
    if (!hasSection('## 4.81 x\n', 81) || hasSection('## 4.81 x\n', 82)) {
      errors.push('轮次表指针护栏 canary 失效：审计小节的「有/无」两个方向不能区分');
    }
    if (hasSection('## 4.8 x\n', 81)) {
      errors.push('轮次表指针护栏 canary 过宽：`## 4.8` 被当成了 `## 4.81`');
    }
  }
}

// ── 审计文档里**不可解析的裸 `§4.N`** 必须带文档限定词（2026-10-08，审计 §4.148）──────────────
// 立此条的原因（实测）：审计文档全文 **605 处 `§` 引用里 407 处不带文档限定词**，
//   其消歧靠**上下文**（表格标题 / 同段落的文档名）—— 人勉强能读，**判据读不了**。
//   其中**真正坏掉**的是「**裸 `§4.N` 解析不到本文档的 `## 4.N`**」这一类（实测 2 处）：
//   ① `§4.1` / `§4.2` —— 本文档的日志**从 `## 4.3` 起**（4.1/4.2 不存在）⇒ 解析不到；
//   ② 更危险的是**假解析**：`master-plan §4.3` 被裸写成 `§4.3` ⇒ **会跳到本文档的 `## 4.3`**。
//   ⇒ 判据**只覆盖可机械判的那一半**：不可解析的 `§4.N` **必须**带限定词。
//   ⚠️ **边界（如实声明）**：**假解析**（能解析但指错文档）**无法机械判定** —— 只能靠人读；
//      存量 407 处已登记为残量，**不做机械全改**（改 400 处而无法复核 = 制造噪声）。
{
  const AUDIT_REL = 'docs/qualification/release-blocker-audit-2026-09-25.md';
  // 限定词：出现即认为该 `§4.N` 是**跨文档引用**（与「不可解析」合取后才是违规）
  const QUALIFIER = /(PITFALLS|master[-\s]?plan|master plan|PRD|spec|ADR-?\d|台账|模板|审计|宪法|README|AGENTS|\.md|同文档|该文档)/;
  const collect = (src) => {
    const sections = new Set([...src.matchAll(/^## 4\.(\d+)[ \t]/gm)].map((m) => Number(m[1])));
    const bad = [];
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/§4\.(\d+)/g)) {
        const n = Number(m[1]);
        if (sections.has(n)) continue;                       // 解析得到 ⇒ 不是本判据的对象
        const before = line.slice(Math.max(0, m.index - 30), m.index);
        if (QUALIFIER.test(before)) continue;                // 已带限定词 ⇒ 合法（跨文档引用）
        bad.push(`L${i + 1}→§4.${n}`);
      }
    });
    return { sections, bad };
  };
  const auditSrc = existsSync(resolve(root, AUDIT_REL)) ? readFileSync(resolve(root, AUDIT_REL), 'utf8') : '';
  if (auditSrc === '') {
    errors.push(`读不到 ${AUDIT_REL} —— 「裸 §4.N 必须可解析」判据无法运行`);
  } else {
    const { sections, bad } = collect(auditSrc);
    if (sections.size < 100) {
      errors.push(`审计文档只解析出 ${sections.size} 个 \`## 4.N\` 小节（下限 100）—— 解析面漂移会让本判据空转`);
    }
    if (bad.length > 0) {
      errors.push(`审计文档里有**不可解析且无限定词**的 \`§4.N\`（${bad.length}）：${bad.join('、')}`
        + ' —— 要么指向本文档（则应能解析），要么加文档限定词（如 `master-plan §4.3` / `PITFALLS §4.143`）');
    }
    // canary：四向（可解析 ⇒ 放行 / 不可解析且无限定词 ⇒ 报 / 不可解析但有 限定词 ⇒ 放行 / 小节集合解析对）
    // （原写「三向」—— 2026-10-09 审计 §4.213 实测**实为 4 条**，同步）
    const S_OK = '## 4.9 x\n见 §4.9\n';
    const S_BAD = '## 4.9 x\n见 §4.77\n';
    const S_QUAL = '## 4.9 x\n见 PITFALLS §4.77\n';
    if (collect(S_OK).bad.length !== 0) errors.push('§4.N 可解析性 canary 失效：可解析的被报错');
    if (collect(S_BAD).bad.length !== 1) errors.push('§4.N 可解析性 canary 失效：不可解析的未被检出');
    if (collect(S_QUAL).bad.length !== 0) errors.push('§4.N 可解析性 canary 失效：带限定词的被误报');
    if (collect(S_BAD).sections.size !== 1) errors.push('§4.N 可解析性 canary 失效：小节集合解析不对');
  }
}

// ── ⑮ 活文档（人工门禁的**执行依据**）声明的夹具目录必须等于生成器的输出目录 ────────
// 立此条的原因（实测，2026-10-08 审计 §4.152）：
// `docs/qualification/phase1-runtime-qualification-manual.md` §0 写
// 「测试素材：`tests/fixtures/`（1MB.md、5MB.md、…）」，而**那些文件根本不在那里** ——
// 它们由 `tests/benchmark/generate-fixtures.mjs` 生成到 `tests/benchmark/fixtures/`
// （**生成产物、gitignore**）⇒ 照手册找素材**一个也找不到**。
//
// ⚠️ **为什么以前没人发现**：本文件其它判据**按目录**排除 `docs/qualification`
//    （理由「审计 / 验收记录的职责就是**引用旧值**」）。那条理由对**审计记录**成立，
//    但**执行手册不是审计记录** —— 它是人要照着做的**活文档**，其引用**必须**可核对。
//    ⇒ **「用目录当角色代理」把两类不同职责的文件混在了一起**。
{
  const GEN = 'tests/benchmark/generate-fixtures.mjs';
  const MANUAL = 'docs/qualification/phase1-runtime-qualification-manual.md';
  /** 单一真源：生成器实际写到哪个目录。 */
  const genFixtureDir = (src) => {
    const m = src.replace(/\r\n/g, '\n').match(/const outDir = join\(__dirname, '([^']+)'\)/);
    return m ? `tests/benchmark/${m[1]}` : null;
  };
  /** 手册里「测试素材：`<dir>/`」的声明。 */
  const declFixtureDir = (src) => {
    const m = src.replace(/\r\n/g, '\n').match(/测试素材：`?([^\s`（(]+?)\/?`?[\s（(]/);
    return m ? m[1] : null;
  };
  const actual = genFixtureDir(readFileSync(resolve(root, GEN), 'utf8'));
  const declared = declFixtureDir(readFileSync(resolve(root, MANUAL), 'utf8'));
  if (actual === null) fail(`${GEN}：解析不到夹具输出目录（\`const outDir = join(__dirname, …)\`）—— 判据会空转`);
  if (declared === null) fail(`${MANUAL}：解析不到「测试素材：」声明 —— 判据会空转`);
  if (actual !== null && declared !== null && declared !== actual) {
    fail(`${MANUAL} 声明夹具在 \`${declared}\`，而 ${GEN} 写到 \`${actual}\` —— `
      + '**人工门禁的素材位置必须以生成器为单一真源**（实测：曾写成 `tests/fixtures/`，那些文件不在那里，'
      + '而 `tests/fixtures/` 是另一个目录 —— Markdown 素材库，含 `math/` / `mermaid/` 等子目录）');
  }
  // canary：三向（一致 ⇒ 放行 / 漂移 ⇒ 报 / 解析不到 ⇒ 报「空转」）
  const SYN_OK = '测试素材：`tests/benchmark/fixtures/`（x.md）';
  const SYN_BAD = '测试素材：`tests/fixtures/`（x.md）';
  const SYN_NONE = '（本节没有素材声明）';
  if (declFixtureDir(SYN_OK) !== actual) errors.push('夹具目录判据 canary 失效：正样本被判为漂移');
  if (declFixtureDir(SYN_BAD) === actual) errors.push('夹具目录判据 canary 失效：负样本（漂移）被判为一致');
  if (declFixtureDir(SYN_NONE) !== null) errors.push('夹具目录判据 canary 失效：无声明时不应解析出目录');
  if (genFixtureDir('const outDir = join(__dirname, "nope");') !== null) {
    errors.push('夹具目录判据 canary 失效：生成器锚点应只认单引号形态（否则会静默取到别的东西）');
  }
}

// ── ⑯ benchmark runner 头部用法注释给出的 `--flag value` 必须**真的被接受** ────────
// 立此条的原因（实测，2026-10-08 审计 §4.152）：两个 runner 的头部注释（以及手册 §0.5）
// 都写**空格形式**，而解析只认 `=` ⇒ 照注释执行会**静默取默认值**：
//   - `ime-matrix-linux.mjs` 的 `--im ibus` ⇒ 静默回落 `fcitx5`（`im` 决定 `GTK_IM_MODULE`，
//     ⇒ **测的根本不是 ibus**）；`--scenario` / `--driver` 同病；
//   - `ime-matrix.mjs` 的 `--scenario paragraph,heading` ⇒ 静默**跑全部场景**。
// 同族：`generate-fixtures.mjs` 的头部曾写 `[--seed 42] [--out fixtures]`，而它**从不读
// `process.argv`** ⇒ 两个 flag **从来不存在**（同 §4.73「文档声称的接口，代码里没有」）。
// ⚠️ 该脚本本轮改为**如实声明「无参数」**，故它现在**不再贡献**被检查的 flag（0 个）。
{
  const BENCH = 'tests/benchmark';
  /** 文件头部的文档注释（shebang 之后的第一个 `/** … *​/`）。 */
  const headerOf = (src) => {
    const m = src.replace(/\r\n/g, '\n').match(/^#![\s\S]*?\n\s*\/\*\*([\s\S]*?)\*\//);
    return m ? m[1] : '';
  };
  // 「更正说明」会**引用**已废弃的写法 ⇒ 与上文 `LOOKS_LIKE_QUOTE` 同源，**逐行**豁免。
  const NOTE_LINE = /原写|原文|更正|已过期|过期|旧实现|曾写|漂移|作废|不再/;
  /** 头部注释里以 `--flag value`（空格）形式给出的 flag。 */
  const spaceFormFlags = (src) => {
    const head = headerOf(src).split('\n').filter((l) => !NOTE_LINE.test(l)).join('\n');
    return [...new Set([...head.matchAll(/--([a-z][a-z0-9-]*) (\S+)/g)].map((x) => x[1]))];
  };
  /** 「该 flag 接受空格形式」的谓词（判定与 canary **共用**）。 */
  const acceptsSpaceForm = (src, name) => new RegExp(`flagArg\\(\\s*'${name}'`).test(src)
    || new RegExp(`argVal\\(\\s*'--${name}'`).test(src)
    || new RegExp(`indexOf\\(\\s*'--${name}'`).test(src)
    || new RegExp(`includes\\(\\s*'--${name}'`).test(src);
  let checked = 0;
  for (const f of readdirSync(resolve(root, BENCH)).filter((x) => x.endsWith('.mjs'))) {
    const src = readFileSync(resolve(root, BENCH, f), 'utf8');
    for (const name of spaceFormFlags(src)) {
      checked += 1;
      if (!acceptsSpaceForm(src, name)) {
        fail(`${BENCH}/${f}：头部用法注释给出 \`--${name} <value>\`（空格形式），但解析**不接受**该形式`
          + ' —— 照注释执行会**静默取默认值**。请用 `flagArg()`（见 `golden-journeys.mjs`）'
          + `或 \`indexOf('--${name}')\``);
      }
    }
  }
  if (checked < 8) {
    fail(`benchmark runner 里只解析出 ${checked} 个「头部注释的空格形式 flag」（下限 8 = 立此判据时的基线）`
      + ' —— 谓词或文件集漂移会让本判据**空转**');
  }
  // canary：三向（接受 ⇒ 放行 / 只认 `=` ⇒ 报 / 更正说明 ⇒ 豁免）
  const SYN_OK = "#!/usr/bin/env node\n/**\n * 用法：node x.mjs --foo bar\n */\nconst a = flagArg('foo');\n";
  const SYN_BAD = "#!/usr/bin/env node\n/**\n * 用法：node x.mjs --foo bar\n */\nconst a = args.find((a) => a.startsWith('--foo='));\n";
  const SYN_NOTE = "#!/usr/bin/env node\n/**\n * 用法：node x.mjs\n * ⚠️ 原写 `--foo bar`，已作废\n */\n";
  if (!spaceFormFlags(SYN_OK).includes('foo') || !acceptsSpaceForm(SYN_OK, 'foo')) {
    errors.push('runner 参数形式 canary 失效：正样本（两种形式都接受）被判为违规');
  }
  if (!spaceFormFlags(SYN_BAD).includes('foo') || acceptsSpaceForm(SYN_BAD, 'foo')) {
    errors.push('runner 参数形式 canary 失效：负样本（只认 `=`）未被检出');
  }
  if (spaceFormFlags(SYN_NOTE).length !== 0) {
    errors.push('runner 参数形式 canary 失效：更正说明里引用的旧写法未被豁免');
  }
}

// ── ⑰ 「全仓无此**文件**」推不出「**从未产出**」—— 输出物核对必须同时看「文件名」与「章节标题」──
// 立此条的原因（实测，2026-10-08 审计 §4.154）：
// `docs/specs/runtime-qualification-plan.md` §9 有一张「输出物」表 + 一张 2026-10-01 的**逐项对账**表，
// 其中一行判定 `platform issue list` 为 **❌ 不存在 —— 全仓无此文件**，结论据此写「**1 个从未产出**」。
// **实测：`tests/qualification/README.md` 就有「Platform Issue 记录」节**
// （列名 `日期 / 平台 / 现象 / 影响 / 状态`，正是**按平台聚合的问题清单**），自 **2026-08-10**（commit `80603cc`）起就在
// ⇒ **那条判定是错的**。根因：核对用的是**文件**粒度，而产物是**章节**粒度。
// ⇒ 判据：**凡输出物表里标「不存在 / 从未产出」的行，其输出物名不得与 README 的章节标题同义。**
{
  const SPEC = 'docs/specs/runtime-qualification-plan.md';
  const QUAL_README = 'tests/qualification/README.md';
  const rd = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
  const WORDS = (s) => new Set(s.toLowerCase().replace(/[`*|]/g, ' ')
    .split(/[^0-9a-z\u4e00-\u9fff]+/).filter((w) => w.length >= 3));
  // ⚠️ **更正说明会引用原判定**（「原判定写『❌ 不存在』」）⇒ 逐行豁免（与文件头部 `LOOKS_LIKE_QUOTE` 同源）。
  //    实测：不加这一条，本判据会命中**修好之后**的那一行（第 12 次踩「自己的文字命中自己的判据」）。
  const NOTE_ROW = /更正|原判定|原写|上一版|已过期/;
  /** README 的二级章节标题 = qualification 的「输出物」登记处。 */
  const sectionTitles = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  /**
   * 返回「**判为不存在、但 README 里有同义章节**」的输出物名（判定与 canary **共用**本谓词）。
   * 同义 = 名字与某章节标题的**共同词 ≥ 2**（启发式；取 2 是为了避开 `表` / `report` 这类单词噪声）。
   */
  const falseNegatives = (specText, readmeText) => {
    const titles = sectionTitles(readmeText).map((t) => ({ t, words: WORDS(t) }));
    const out = [];
    for (const line of specText.split('\n')) {
      // ⚠️ 表格在**引用块**里（行首是 `> |`）⇒ 不能写 `^\|`（实测踩到：那样一行都取不到）。
      if (!/^\s*>?\s*\|/.test(line) || !/不存在|从未产出/.test(line) || NOTE_ROW.test(line)) continue;
      const name = (line.replace(/^\s*>?\s*\|/, '').split('|')[0] ?? '').replace(/[`*「」]/g, '').trim();
      if (!name) continue;
      const nw = WORDS(name);
      const hit = titles.find(({ words }) => [...nw].filter((w) => words.has(w)).length >= 2);
      if (hit) out.push(`${name}（README 有章节「${hit.t}」）`);
    }
    return out;
  };
  const specSrc = rd(SPEC);
  const falseNeg = falseNegatives(specSrc, rd(QUAL_README));
  if (falseNeg.length > 0) {
    fail(`${SPEC} 把**已产出**的输出物判为不存在：${falseNeg.join('、')}`
      + ' —— 「全仓无此**文件**」推不出「**从未产出**」：产物可以是**章节 / 表格 / 代码符号**'
      + '（实测：`platform issue list` 就在 `tests/qualification/README.md` 的「Platform Issue 记录」节）');
  }
  // 防空转：该表必须有可判的行，否则谓词漂移后本判据什么都不看
  const specRows = specSrc.split('\n').filter((l) => /^\s*>?\s*\|/.test(l) && /不存在|从未产出|✅|⚠️/.test(l)).length;
  if (specRows < 3) {
    fail(`${SPEC} 的输出物表只解析出 ${specRows} 行（下限 3）—— 谓词或文档漂移会让本判据**空转**`);
  }
  // canary：三向（同义且标「不存在」⇒ 报 / 同义但不标 ⇒ 放行 / 无同义关系 ⇒ 放行）
  const RM = '## Platform Issue 记录\n| 日期 | 平台 |\n';
  if (falseNegatives('| platform issue list | ❌ 不存在 —— 全仓无此文件 |\n', RM).length !== 1) {
    errors.push('输出物核对 canary 失效：同义章节存在却标「不存在」的行未被检出');
  }
  if (falseNegatives('| platform issue list | ✅ 有（README 的「Platform Issue 记录」节） |\n', RM).length !== 0) {
    errors.push('输出物核对 canary 过宽：已更正的行被判为「不存在」');
  }
  if (falseNegatives('| totally unrelated artifact | ❌ 不存在 |\n', RM).length !== 0) {
    errors.push('输出物核对 canary 过宽：与 README 章节无同义关系的行被误报');
  }
  if (falseNegatives('| platform issue list | ✅ 有 —— 原判定写「❌ 不存在 —— 全仓无此文件」 |\n', RM).length !== 0) {
    errors.push('输出物核对 canary 失效：更正说明里**引用**的原判定未被豁免');
  }
}

// ── ⑱ 根 README 的两张清单必须与**目录**一致（spec 索引双向 + ADR 范围端点现读）──────
// 立此条的原因（实测，2026-10-08 审计 §4.155）：`README.md` 是**用户第一眼看到的**那份，
// 但此前**只有状态行**被护栏锁。实测两处清单漂移：
//   ① 「### 法律（Specs）」索引列 **9** 条，而 `docs/specs/` 有 **10** 个
//      （漏 `performance-benchmark-spec.md`）—— 该表是**索引**，应穷举；
//   ② 「### 判决（ADR）」段写「~ **ADR-0031**」，而目录里已到 **ADR-0034**（**漂了 3 个版本**）。
//      ⚠️ 根因是 §4.94 那次**只修了一半**：`docs/` 目录结构段的 `adr/` 已改为「最新编号见该目录」，
//      而**索引段仍硬编码** ⇒ 之后每加一份 ADR 就漂一次。
// ⇒ 判据：**列出的必须存在 + 存在的必须被列出**（spec）；**范围端点必须从目录现读**（ADR）。
{
  const README = 'README.md';
  const readmeSrc = readFileSync(resolve(root, README), 'utf8').replace(/\r\n/g, '\n');
  // ⚠️ 更正说明会**引用旧编号** ⇒ 逐行豁免（与文件头部 `LOOKS_LIKE_QUOTE` 同源）。
  const NOTE_LINE = /原写|原文|更正|漂移|已改为|也写|实际已到|自相矛盾/;

  // ① spec 索引：README「### 法律（Specs）」段里的 `docs/specs/*.md` 链接（判定与 canary 共用）
  const specListed = (src) => {
    const sec = src.match(/### 法律（Specs）([\s\S]*?)(?=\n### |\n## |$)/)?.[1] ?? '';
    return [...new Set([...sec.matchAll(/\]\(docs\/specs\/([^)]+\.md)\)/g)].map((m) => m[1]))];
  };
  const specActual = readdirSync(resolve(root, 'docs/specs')).filter((f) => f.endsWith('.md'));
  const listed = specListed(readmeSrc);
  const notExist = listed.filter((f) => !specActual.includes(f));
  const notListed = specActual.filter((f) => !listed.includes(f));
  if (notExist.length > 0) {
    fail(`${README} 的「法律（Specs）」索引列了**不存在**的 spec：${notExist.join('、')}`);
  }
  if (notListed.length > 0) {
    fail(`${README} 的「法律（Specs）」索引**漏了** spec：${notListed.join('、')}`
      + ' —— 该表是 `docs/specs/` 的**索引**，必须穷举（实测：曾漏 `performance-benchmark-spec.md`）');
  }
  if (listed.length < 8) {
    fail(`${README} 的 spec 索引只解析出 ${listed.length} 条（下限 8）—— 谓词或文档漂移会让本判据**空转**`);
  }

  // ② ADR 范围端点：README 里「~ **ADR-NNNN**」必须 == `docs/adr/` 里的最大编号
  const adrMax = Math.max(...readdirSync(resolve(root, 'docs/adr'))
    .map((f) => Number(/^ADR-(\d{4})/.exec(f)?.[1] ?? NaN)).filter((n) => Number.isFinite(n)));
  const statedOf = (src) => src.split('\n')
    .filter((l) => !NOTE_LINE.test(l))
    .map((l) => /~ \*\*ADR-(\d{4})/.exec(l)?.[1]).filter(Boolean).map(Number);
  const stated = statedOf(readmeSrc);
  if (stated.length === 0) {
    fail(`${README} 解析不到「~ **ADR-NNNN**」范围端点 —— 判据会空转`);
  }
  for (const n of stated) {
    if (n !== adrMax) {
      fail(`${README} 声明 ADR 范围到 **ADR-${String(n).padStart(4, '0')}**，而 docs/adr/ 里最大是 `
        + `**ADR-${String(adrMax).padStart(4, '0')}** —— 范围端点必须**从目录现读**`
        + '（实测：曾硬编码 `ADR-0031` 而实际已到 `ADR-0034`，漂了 3 个版本）');
    }
  }
  // canary：四向（判定与 canary 共用 specListed / NOTE_LINE）
  if (specListed('### 法律（Specs）\n| [a](docs/specs/a.md) |\n| [b](docs/specs/b.md) |\n### x').length !== 2) {
    errors.push('README 清单护栏 canary 失效：spec 链接解析不正确');
  }
  if (specListed('### 判决（ADR）\n| [a](docs/specs/a.md) |\n### x').length !== 0) {
    errors.push('README 清单护栏 canary 过宽：其它小节的链接被当成了 spec 索引');
  }
  if (adrMax < 30) {
    errors.push('README 清单护栏 canary 失效：ADR 最大编号解析异常（docs/adr/ 应远多于 30 份）');
  }
  if (statedOf('见 [docs/adr/](docs/adr/)：ADR-0001 ~ **ADR-0034**。').join() !== '34') {
    errors.push('README 清单护栏 canary 失效：ADR 范围端点样本未被识别');
  }
  if (statedOf('> ② 段原写「~ **ADR-0031**」，实际已到 ADR-0034').length !== 0) {
    errors.push('README 清单护栏 canary 失效：更正说明里**引用**的旧端点未被豁免');
  }
  if (statedOf('见 docs/adr/：ADR-0001 ~ ADR-0034（无粗体）').length !== 0) {
    errors.push('README 清单护栏 canary 过宽：非粗体写法被当成了范围端点');
  }
}

// ── ⑲ 第三方声明必须覆盖「随产品分发」的**全部**运行时依赖 ─────────────────────────
// 立此条的原因（实测，2026-10-08 审计 §4.156）：`THIRD_PARTY_NOTICES.md` 只列 **10 行**、且多为
// **构建工具**（Vite / TypeScript / Jest），而 **28 个 npm 运行时依赖里漏了 10 个** ——
// 含 `mermaid` / `katex` / `pdfmake` / `markdown-it` / `sanitize-html` 与 **3 个 Tauri 插件**；
// Rust 侧同样只列了 `tauri` 与 `tauri-plugin-dialog`（实际 17 个直接依赖）。
// ⇒ 判据：**每个 workspace 包的 `dependencies` + `Cargo.toml` 各 `dependencies` 段的 crate
//    都必须在本文件中出现**（精确名，或本文件显式声明的 scope 通配 `@scope/*`）。
// ⚠️ **边界如实声明**：**devDependencies / `[dev-dependencies]` 不在覆盖内** —— 它们不随产品分发。
{
  const NOTICES = 'THIRD_PARTY_NOTICES.md';
  const notices = readFileSync(resolve(root, NOTICES), 'utf8').replace(/\r\n/g, '\n');
  /**
   * 只认**表格行的第一格**里声明的名字 —— ⚠️ **不能用裸子串**：
   * 本文件的**说明文字**（「重写原因」段）就会提到 `mermaid` / `katex` 等，
   * 用 `text.includes(name)` 会被**散文提及**满足 ⇒ **真构件删掉后护栏仍绿**（假阴性）。
   * 这正是 `verify-parity-ledger.mjs` 记过的同一个坑（2026-10-08 实测踩到：首版 4 个注入只红 1 个）。
   */
  const declared = (text) => {
    const names = new Set();
    const globs = new Set();
    for (const line of text.split('\n')) {
      const m = /^\|\s*`?([^`|]+?)`?\s*\|/.exec(line);
      if (!m) continue;
      const n = m[1].trim();
      if (n.endsWith('/*')) globs.add(n.slice(0, -1));   // `@codemirror/*` → `@codemirror/`
      else names.add(n);
    }
    return { names, globs };
  };
  /** 覆盖谓词：第一格**精确名**命中，或第一格声明了覆盖它的 scope 通配。判定与 canary **共用**。 */
  const covered = (name, decl) => decl.names.has(name)
    || [...decl.globs].some((g) => name.startsWith(g));
  const decl = declared(notices);

  // npm：所有 workspace 包的 `dependencies`（+ vendored CoreEditor 自带的 —— 它也会打进产物）
  const pkgFiles = ['apps/desktop/package.json'];
  for (const d of readdirSync(resolve(root, 'packages'))) {
    const p = `packages/${d}/package.json`;
    if (existsSync(resolve(root, p))) pkgFiles.push(p);
  }
  if (existsSync(resolve(root, 'packages/editor-core/CoreEditor/package.json'))) {
    pkgFiles.push('packages/editor-core/CoreEditor/package.json');
  }
  const npmDeps = new Set();
  for (const p of pkgFiles) {
    const j = JSON.parse(readFileSync(resolve(root, p), 'utf8'));
    for (const k of Object.keys(j.dependencies ?? {})) npmDeps.add(k);
  }

  // Cargo：`[dependencies]` 与各 `[target.'…'.dependencies]`（**不含** `[dev-dependencies]`）
  const cargoSrc = readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8').replace(/\r\n/g, '\n');
  const cargoDeps = new Set();
  for (const sec of cargoSrc.split(/^(?=\[)/m)) {
    const head = sec.split('\n')[0].trim();
    if (!/^\[(?:target\.[^\]]+\.)?dependencies\]$/.test(head)) continue;
    for (const d of sec.matchAll(/^([a-z0-9_-]+)\s*=/gm)) cargoDeps.add(d[1]);
  }

  const missingNpm = [...npmDeps].filter((d) => !covered(d, decl));
  const missingCargo = [...cargoDeps].filter((d) => !covered(d, decl));
  if (missingNpm.length > 0) {
    fail(`${NOTICES} 漏了 npm 运行时依赖：${missingNpm.join('、')}`
      + ' —— 「随产品分发」的依赖必须逐个列出（实测：曾漏 mermaid / katex / pdfmake / markdown-it /'
      + ' sanitize-html 与 3 个 Tauri 插件）');
  }
  if (missingCargo.length > 0) {
    fail(`${NOTICES} 漏了 Cargo 直接依赖：${missingCargo.join('、')}`
      + ' —— 实测：曾只列 tauri 与 tauri-plugin-dialog，而实际有 17 个');
  }
  // ⚠️ 下限**贴着基线取**（实测 npm 28 / cargo 17）—— 取太松会失去鉴别力：
  //    若只剩 1 个 `package.json` 被找到（≈15），松下限（10）**不会**报警。
  if (npmDeps.size < 24 || cargoDeps.size < 14) {
    fail(`${NOTICES} 判据扫描面异常（npm ${npmDeps.size} / cargo ${cargoDeps.size}，基线 28 / 17）`
      + ' —— 判据会空转；若确实删过依赖，请同步下调下限并说明');
  }
  // canary：五向（判定与 canary 共用 declared / covered）
  const SYN = '| `mermaid` | ^11 | MIT |\n| `@codemirror/*` | ^6 | MIT |\n';
  const SYN_DECL = declared(SYN);
  if (!covered('mermaid', SYN_DECL)) errors.push('第三方声明护栏 canary 失效：第一格的精确名未被识别');
  if (!covered('@codemirror/view', SYN_DECL)) errors.push('第三方声明护栏 canary 失效：scope 通配未生效');
  if (covered('not-listed-pkg', SYN_DECL)) errors.push('第三方声明护栏 canary 过宽：未列出的包被判为覆盖');
  if (covered('@tauri-apps/plugin-x', SYN_DECL)) errors.push('第三方声明护栏 canary 过宽：通配越界覆盖了别的 scope');
  // ⚠️ 最关键的一条：**散文里提到**的名字**不得**算覆盖（否则删掉表格行后护栏仍绿）
  if (covered('mermaid', declared('> 说明文字提到 mermaid / katex，但表格里没有。\n'))) {
    errors.push('第三方声明护栏 canary 失效：**散文提及**被判为已声明（真构件删掉后会假阴性）');
  }
}

// ── ⑳ `PRD §N` / `master-plan §N` 的引用必须指向**存在的节** ─────────────────────
// 立此条的原因（实测，2026-10-08 审计 §4.157）：`packages/settings` 的 **3 个文件**都写着
// 「One Settings Model，**PRD §531**」—— 而 PRD 只有 **0–150** 节，**`§531` 不存在**。
// 真实出处是 **PRD §4.7**（「Mellow 正式采用」清单里的 `One Settings Model`）。
// ⚠️ 与 §4.148 的 `§4.N` 同族（不可解析 / 假解析），但**命名空间不同**（这里是 PRD / master-plan）。
{
  // ⚠️ **必须含子节**（2026-10-09 审计 §4.208）：旧谓词 `§+\s*(\d+)` 只捕获**主号**
  //   ⇒ `master-plan §9.9`（不存在的子节）会被当成「§9 存在」⇒ **静默通过**。
  //   实测仓库内有 **124 处带点引用**（`PRD §4.7` ×74 / `master-plan §9.5` ×50）**从未被校验**。
  //   层级实测（2026-10-09）：PRD = `# N`(151) + `## N.M`(28) + `### N.M.K`(2)；
  //                            master-plan = `## N`(16) + `### N.M`(52)。
  //   ⇒ 集合键改用**点号字符串**（`'4.7'`），判定用 `has(m[1])` 而非 `has(Number(...))`。
  const secsOf = (p, re) => new Set([...readFileSync(resolve(root, p), 'utf8')
    .replace(/\r\n/g, '\n').matchAll(re)].map((m) => m[1]));
  const PRD_SECS = secsOf('docs/product/Mellow-PRD-V1.2-FINAL.md', /^#{1,3} (\d+(?:\.\d+)*)[.\s]/gm);
  const MP_SECS = secsOf('docs/plans/typora-parity-master-plan.md', /^#{2,3} (\d+(?:\.\d+)*)[.\s]/gm);
  if (PRD_SECS.size < 150 || MP_SECS.size < 60) {
    fail(`PRD/master-plan 的节号集合异常（${PRD_SECS.size} / ${MP_SECS.size}）—— 判据会空转`);
  }
  // ⚠️ 更正说明会**引用旧编号** ⇒ 逐行豁免 —— **先配好豁免再动笔写说明**（见 skill §145 / PITFALLS §4.217）。
  const NOTE = /原写|原文|更正|漂移|已改为|也写|不存在/;
  /** 返回本文件里「引用不存在的节」的清单（判定与 canary **共用**本谓词）。 */
  const badRefs = (text) => {
    const out = [];
    text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
      if (NOTE.test(line)) return;
      for (const m of line.matchAll(/PRD\s*§+\s*(\d+(?:\.\d+)*)/g)) {
        if (!PRD_SECS.has(m[1])) out.push(`L${i + 1} PRD §${m[1]}`);
      }
      for (const m of line.matchAll(/(?:master[-\s]?plan|施工计划|本计划)\s*§+\s*(\d+(?:\.\d+)*)/gi)) {
        if (!MP_SECS.has(m[1])) out.push(`L${i + 1} master-plan §${m[1]}`);
      }
    });
    return out;
  };
  const SCAN_EXTS = ['md', 'mjs', 'cjs', 'ts', 'tsx', 'rs', 'json', 'yml', 'yaml'];
  // ⚠️ **必须把本护栏自身排除出扫描面**：它含**合成样本**（canary 里的 `PRD §531` / `master-plan §99`）
  //    与**说明文字**，不排除 ⇒ 主判据被自己的样本满足 ⇒ **恒报错**。
  //    （本仓在 `MELLOW_*`/`TYPORA_*` 那节踩过同一坑；本轮实测也踩了一次。）
  const SELF = import.meta.filename ?? resolve(import.meta.dirname, 'verify-doc-code-refs.mjs');
  let prdRefs = 0; let mpRefs = 0;
  for (const f of walk(root).filter((p) => SCAN_EXTS.includes(p.split('.').pop()))) {
    if (resolve(f) === resolve(SELF)) continue;
    const text = readFileSync(f, 'utf8');
    prdRefs += [...text.matchAll(/PRD\s*§+\s*\d+/g)].length;
    mpRefs += [...text.matchAll(/(?:master[-\s]?plan|施工计划|本计划)\s*§+\s*\d+/gi)].length;
    const bad = badRefs(text);
    if (bad.length > 0) {
      fail(`${relative(root, f)} 引用了**不存在**的节：${bad.join('、')}`
        + ' —— `PRD §N` / `master-plan §N` 的 N（**含点号子节**，如 `§4.7`）必须指向该文档的**实际标题**'
        + '（实测：`packages/settings` 的 3 个文件都写 `PRD §531`，而 PRD 只有 0–150；真实出处是 §4.7。'
        + '子节层是 2026-10-09 审计 §4.208 补的：此前 `§9.9` 会被当成「§9 存在」而**静默通过**）');
    }
  }
  // 防空转：下限**贴着基线取**（实测 PRD 638 / master-plan 79）
  if (prdRefs < 500 || mpRefs < 60) {
    fail(`PRD / master-plan 的 §N 引用只解析出 ${prdRefs} / ${mpRefs}（基线 638 / 79）—— 判据会空转`);
  }
  // canary：四向（判定与 canary 共用 badRefs）
  if (badRefs('见 PRD §531。').length !== 1) errors.push('PRD 节号护栏 canary 失效：不存在的节未被检出');
  if (badRefs('见 PRD §109。').length !== 0) errors.push('PRD 节号护栏 canary 过宽：存在的节被判为不存在');
  if (badRefs('> 原写 `PRD §531`，已更正。').length !== 0) {
    errors.push('PRD 节号护栏 canary 失效：更正说明里**引用**的旧节号未被豁免');
  }
  if (badRefs('见 master-plan §99。').length !== 1) {
    errors.push('PRD 节号护栏 canary 失效：master-plan 的不存在节未被检出');
  }
  // canary ⑤–⑧：**子节**层（2026-10-09 审计 §4.208 扩展的能力）
  if (badRefs('见 master-plan §9.9。').length !== 1) {
    errors.push('PRD 节号护栏 canary 失效：master-plan 的**不存在子节**未被检出（子节层已退化成空真）');
  }
  if (badRefs('见 master-plan §9.5。').length !== 0) {
    errors.push('PRD 节号护栏 canary 过宽：master-plan 的**存在子节**被判为不存在');
  }
  if (badRefs('见 PRD §4.99。').length !== 1) {
    errors.push('PRD 节号护栏 canary 失效：PRD 的**不存在子节**未被检出（子节层已退化成空真）');
  }
  if (badRefs('见 PRD §4.7。').length !== 0) {
    errors.push('PRD 节号护栏 canary 过宽：PRD 的**存在子节**被判为不存在');
  }
}

// ── ㉒ 引用的编号（`ADR-NNNN` / 台账 `P0-*` / 任务 `T-NNNN` / `xxx-spec §N`）必须**存在**（2026-10-09，审计 §4.209–§4.212）──
// 立此条的原因（**四次「逐个扫编号族」实测**）：
//   ① `ADR-NNNN`：往 `docs/architecture/README.md` 注入 `ADR-0099`（**不存在**）后，
//      本护栏与 `verify-release-gate.mjs` **都没红** ⇒ 仓库级**没有**该判据；
//      仓库内 `ADR-NNNN` 引用共 **1036 处**（md 755 / mjs 192 / ts 38 / json 29 / yml 12 / tsx 6 / rs 4）。
//   ② 台账 `P0-*`：把 `P0-EDITOR-999`（**不存在**）注入**无关文档** ⇒ **全链 `npm run parity` 绿** ⇒ 也没有该判据；
//      仓库内 `P0-*` 引用共 **399 处**（50 个不同 id = 台账**全部** 50 项）。
//   ③ 任务 `T-NNNN`：扫描面内 **139 处**（真值源 = `codex-implementation-plan.md` 的 `### T-NNNN` 标题，**80 个**）
//      —— 全部**引用自代码注释与文档**（`Reader.tsx` / `SettingsPanel.tsx` / 各包源码）⇒ 悬空引用会让读者找不到任务。
//   ④ `xxx-spec §N`：扫描面内 **70 处**（真值源 = `docs/specs/<name>.md` 的标题编号）
//      —— 注入一个**不存在的节号**到无关文档 ⇒ **全链 `parity` 绿** ⇒ 也没有该判据。
//   ⚠️ 已有的 `resolvesRef`（门禁）/ §6 的 `resolveCarrier` 只覆盖**各自的上下文**（矩阵 disposition / §6 表），**不是全仓**。
{
  const ADR_DIR = resolve(root, 'docs/adr');
  const ADR_IDS = new Set(readdirSync(ADR_DIR)
    .filter((f) => /^ADR-\d{4}.*\.md$/.test(f)).map((f) => f.slice(0, 8)));
  if (ADR_IDS.size < 30) {
    fail(`docs/adr/ 只解析出 ${ADR_IDS.size} 份 ADR（下限 30 = 2026-10-09 实测 34）—— 判据锚点漂移`);
  }
  // 台账 id 的**真值源 = 台账 JSON 本身**
  const LEDGER = JSON.parse(readFileSync(resolve(root, 'tests/parity/typora-parity-ledger.json'), 'utf8'));
  const LEDGER_IDS = new Set((LEDGER.items ?? []).map((x) => x.id));
  if (LEDGER_IDS.size < 40) {
    fail(`台账只解析出 ${LEDGER_IDS.size} 项（下限 40 = 2026-10-09 实测 50）—— 判据锚点漂移`);
  }
  // 任务编号的**真值源 = `docs/plans/codex-implementation-plan.md` 的 `### T-NNNN` 标题**
  const TASK_IDS = new Set([...readFileSync(resolve(root, 'docs/plans/codex-implementation-plan.md'), 'utf8')
    .matchAll(/\bT-(\d{4})\b/g)].map((m) => `T-${m[1]}`));
  if (TASK_IDS.size < 60) {
    fail(`任务清单只解析出 ${TASK_IDS.size} 个 T 编号（下限 60 = 2026-10-09 实测 80）—— 判据锚点漂移`);
  }
  // `xxx-spec §N` 的**真值源 = `docs/specs/<name>.md` 的标题编号**
  const SPEC_SETS = new Map(readdirSync(resolve(root, 'docs/specs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => [f.replace(/\.md$/, ''), new Set([...readFileSync(resolve(root, 'docs/specs', f), 'utf8')
      .matchAll(/^#{1,4}\s+(\d+(?:\.\d+)*)[.\s]/gm)].map((m) => m[1]))]));
  if (SPEC_SETS.size < 8) {
    fail(`docs/specs/ 只解析出 ${SPEC_SETS.size} 份 spec（下限 8 = 2026-10-09 实测 10）—— 判据锚点漂移`);
  }
  // ⚠️ **哨兵值**：护栏自己的合成样本用 `ADR-9999` / `P0-NOPE-999`（**永不存在**）⇒ 必须登记豁免（带理由 + 双向核对）
  const ID_REF_EXEMPT = new Map([
    ['ADR-9999', '护栏的**哨兵编号**（合成样本专用，永不存在）—— `verify-release-gate.mjs` 的 canary'],
    ['P0-NOPE-999', '护栏的**哨兵编号**（合成样本专用，永不存在）—— `verify-runtime-qualification-workflow.mjs` 的 canary'],
  ]);
  // 更正说明会**引用旧编号** ⇒ 逐行豁免（与 ⑳ 同谓词）
  const NOTE = /原写|原文|更正|漂移|已改为|也写|不存在/;
  const SCAN_EXTS = ['md', 'mjs', 'cjs', 'ts', 'tsx', 'rs', 'json', 'yml', 'yaml'];
  // ⚠️ 必须排除本护栏自身：它含**合成样本**（canary 里的 `ADR-0099`）⇒ 不排除会**恒报错**
  const SELF = import.meta.filename ?? resolve(import.meta.dirname, 'verify-doc-code-refs.mjs');
  /** 返回本文件里「引用了不存在的编号」的清单（判定与 canary **共用**本谓词）。 */
  const badIdRefs = (text) => {
    const out = [];
    text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
      if (NOTE.test(line)) return;
      for (const m of line.matchAll(/\bADR-(\d{4})\b/g)) {
        const id = `ADR-${m[1]}`;
        if (ADR_IDS.has(id) || ID_REF_EXEMPT.has(id)) continue;
        out.push(`L${i + 1} ${id}`);
      }
      for (const m of line.matchAll(/\bP0-[A-Z]+-\d{3}\b/g)) {
        const id = m[0];
        if (LEDGER_IDS.has(id) || ID_REF_EXEMPT.has(id)) continue;
        out.push(`L${i + 1} ${id}`);
      }
      for (const m of line.matchAll(/\bT-\d{4}\b/g)) {
        const id = m[0];
        if (TASK_IDS.has(id) || ID_REF_EXEMPT.has(id)) continue;
        out.push(`L${i + 1} ${id}`);
      }
      // ⚠️ 文档名后面可能有**反引号**（`` `desktop-ui-design-spec` §4 ``）⇒ 必须容忍
      for (const m of line.matchAll(/\b([a-z][a-z0-9-]*-spec)`?\s*§\s*(\d+(?:\.\d+)*)/g)) {
        const set = SPEC_SETS.get(m[1]);
        if (set === undefined) { out.push(`L${i + 1} 未知 spec ${m[1]}`); continue; }
        if (!set.has(m[2])) out.push(`L${i + 1} ${m[1]} §${m[2]}`);
      }
    });
    return out;
  };
  const ID_PATTERNS = [/\bADR-\d{4}\b/g, /\bP0-[A-Z]+-\d{3}\b/g, /\bT-\d{4}\b/g,
    /\b[a-z][a-z0-9-]*-spec`?\s*§\s*\d+(?:\.\d+)*/g];
  let idRefs = 0; const seenExempt = new Set();
  for (const f of walk(root).filter((p) => SCAN_EXTS.includes(p.split('.').pop()))) {
    if (resolve(f) === resolve(SELF)) continue;
    const text = readFileSync(f, 'utf8');
    for (const re of ID_PATTERNS) {
      for (const m of text.matchAll(re)) {
        idRefs += 1;
        if (ID_REF_EXEMPT.has(m[0])) seenExempt.add(m[0]);
      }
    }
    const bad = badIdRefs(text);
    if (bad.length > 0) {
      fail(`${relative(root, f)} 引用了**不存在**的编号：${bad.join('、')}`
        + ' —— `ADR-NNNN` 必须在 `docs/adr/` 里有对应文件；台账 `P0-*` 必须在'
        + ' `tests/parity/typora-parity-ledger.json` 的 `items` 里'
        + '（实测：注入 `ADR-0099` / `P0-EDITOR-999` 时，**全链 `parity` 都不红**）');
    }
  }
  // 防空转：下限**留余量**（健康度型 —— 引用数会随新 ADR / 台账项 / 任务 / spec 节增长）
  if (idRefs < 1600) {
    fail(`编号引用只解析出 ${idRefs} 处（下限 1600；2026-10-09 实测 **1686**`
      + ' = ADR 1073 + 台账 404 + 任务 139 + spec §N 70）—— 判据会空转');
  }
  // 例外表**双向**：登记了却不再出现 ⇒ 报错（防止哨兵值被删后豁免表变成噪声）
  for (const id of ID_REF_EXEMPT.keys()) {
    if (!seenExempt.has(id)) {
      fail(`ID_REF_EXEMPT 登记了 ${id}，但扫描面里已不再出现 —— 请删除该例外条目`);
    }
  }
  // canary：五向（判定与 canary 共用 badIdRefs）
  if (badIdRefs('见 ADR-0099。').length !== 1) {
    errors.push('编号护栏 canary 失效：不存在的 ADR 编号未被检出（判据已退化成空真）');
  }
  if (badIdRefs('见 ADR-0034。').length !== 0) {
    errors.push('编号护栏 canary 过宽：存在的 ADR 编号被判为不存在');
  }
  if (badIdRefs('> 原写 `ADR-0099`，已更正。').length !== 0) {
    errors.push('编号护栏 canary 失效：更正说明里**引用**的旧编号未被豁免');
  }
  if (badIdRefs('见 `P0-EDITOR-999`。').length !== 1) {
    errors.push('编号护栏 canary 失效：不存在的**台账 id**未被检出（判据已退化成空真）');
  }
  if (badIdRefs('见 `P0-EDITOR-004`。').length !== 0) {
    errors.push('编号护栏 canary 过宽：存在的台账 id 被判为不存在');
  }
  if (badIdRefs('见 T-9999。').length !== 1) {
    errors.push('编号护栏 canary 失效：不存在的**任务编号**未被检出（判据已退化成空真）');
  }
  if (badIdRefs('见 T-0001。').length !== 0) {
    errors.push('编号护栏 canary 过宽：存在的任务编号被判为不存在');
  }
  if (badIdRefs('见 `desktop-ui-design-spec` §999。').length !== 1) {
    errors.push('编号护栏 canary 失效：不存在的 **spec 节号**未被检出（判据已退化成空真）');
  }
  if (badIdRefs('见 `desktop-ui-design-spec` §3。').length !== 0) {
    errors.push('编号护栏 canary 过宽：存在的 spec 节号被判为不存在');
  }
}

// ── ㉓ 「审计 §4.N」的引用必须在**审计文档**里解析得到（2026-10-09，审计 §4.219）──────────────
// 立此条的原因（实测）：判据 §4.148 只扫**审计文档自身**，且把「审计」也列为**限定词**
//   ⇒ 别处写「审计 §4.N」（**指向审计文档**）时**无人校验**。实测抓到 **3 处悬空**：
//   `verify-release-gate.mjs` 的 2 处「审计 §4.237」（实为 `PITFALLS §4.237`，标题逐字吻合）
//   + `verify-parity-ledger.mjs` 的 1 处「审计 §4.1」（审计文档**没有** `## 4.1`，日志从 `## 4.3` 起）。
//   ⚠️ 限定词「审计」**恰恰指向本文档** ⇒ 它**不该**被当作「跨文档豁免」（§4.148 的豁免表漏了这条）。
{
  const AUDIT_DOC = 'docs/qualification/release-blocker-audit-2026-09-25.md';
  const auditSrc = readFileSync(resolve(root, AUDIT_DOC), 'utf8').replace(/\r\n/g, '\n');
  const AUDIT_SECS = new Set([...auditSrc.matchAll(/^## 4\.(\d+)[ \t]/gm)].map((m) => Number(m[1])));
  if (AUDIT_SECS.size < 100) {
    fail(`审计文档只解析出 ${AUDIT_SECS.size} 个 \`## 4.N\` 小节（下限 100 = 2026-10-09 实测 216）—— 判据会空转`);
  }
  // 只在「审计 / 本文档」**紧邻** `§4.N` 时才算（中间只允许空白与一个左括号）
  const AUDIT_REF = /(?:审计|本文档)\s*[（(]?\s*§4\.(\d+)/g;
  /** 返回 `src` 里「指向审计文档、但该节不存在」的清单（判定与 canary **共用**本谓词）。 */
  const badAuditRefs = (src) => {
    const out = [];
    src.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(AUDIT_REF)) {
        if (!AUDIT_SECS.has(Number(m[1]))) out.push(`L${i + 1} §4.${m[1]}`);
      }
    });
    return out;
  };
  const SCAN_EXTS = ['md', 'mjs', 'cjs', 'ts', 'tsx', 'rs', 'json', 'yml', 'yaml'];
  // ⚠️ 必须排除本护栏自身：它的注释与 canary 里含**合成样本**（如 `审计 §4.9999`）⇒ 不排除会恒报错
  const SELF = import.meta.filename ?? resolve(import.meta.dirname, 'verify-doc-code-refs.mjs');
  let auditRefs = 0;
  for (const f of walk(root).filter((p) => SCAN_EXTS.includes(p.split('.').pop()))) {
    if (resolve(f) === resolve(SELF)) continue;
    const text = readFileSync(f, 'utf8');
    auditRefs += [...text.replace(/\r\n/g, '\n').matchAll(AUDIT_REF)].length;
    const bad = badAuditRefs(text);
    if (bad.length > 0) {
      fail(`${relative(root, f)} 引用了**不存在的审计小节**：${bad.join('、')}`
        + ' —— 「审计 §4.N」**指向本文档**（`docs/qualification/release-blocker-audit-…md`）'
        + '⇒ N 必须是它的 `## 4.N`；若本意是 PITFALLS，请写 `PITFALLS §4.N`（实测抓到 3 处误标）');
    }
  }
  if (auditRefs < 400) {
    fail(`「审计 §4.N」引用只解析出 ${auditRefs} 处（下限 400 = 2026-10-09 实测 601）—— 判据会空转`);
  }
  // canary：三向（判定与 canary 共用 badAuditRefs）
  if (badAuditRefs('见 审计 §4.9999。').length !== 1) {
    errors.push('审计小节护栏 canary 失效：不存在的审计小节未被检出');
  }
  if (badAuditRefs('见 审计 §4.100。').length !== 0) {
    errors.push('审计小节护栏 canary 过宽：存在的审计小节被判为不存在');
  }
  if (badAuditRefs('见 PITFALLS §4.9999。').length !== 0) {
    errors.push('审计小节护栏 canary 过宽：`PITFALLS §4.N` 被误判（限定词必须**紧邻**）');
  }
}

// ── ㉔ 「`├──` 树」里的**目录必须真实存在**（2026-10-09，审计 §4.220 / §4.221）──────────────
// 立此条的原因（实测）：这些树在**代码围栏内** ⇒ 链接判据与「反引号仓库相对路径」判据
//   **都会剥掉围栏** ⇒ **整棵树无人校验**。实测抓到两处：
//   ① `README.md` 的「目录结构」树 —— 注入一个不存在的目录 ⇒ **全链 `npm run parity` 绿**；
//   ② `docs/architecture/editor-core.md` 的「模块地图」树 —— **2 处真失真**：
//      把 `task/` `table/` 列成 `modules/` 的子目录，而它们**实际是 `styling/nodes/{task,table}.ts`**。
//   ⚠️ README 是**仓库门面**（§4.94 曾一次修 **5 处失真**）⇒ 漂了最伤读者。
// ⚠️ **只锁「存在性」，不锁「完整性」** —— 这些树是**示意**（可能只列代表项）⇒ 不要求列全。
{
  /**
   * 解析 `├──`/`└──` 树 ⇒ `[{rel, depth}]`（判定与 canary **共用**本谓词）。
   * 口径：① **首行裸根目录**（`mellow/` / `src/`）**已并入 `base`** ⇒ 跳过不解析；
   *      ② 只算**以 `/` 结尾**的 token（文件如 `README.md` 不计）；
   *      ③ 缩进 4 空格（或 `│   `）= 1 层；父链 = 各层**最后**一个目录名。
   */
  const parseTree = (text, base) => {
    const lines = text.split('\n').filter((l) => l.trim() !== '');
    const stack = []; const out = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (i === 0 && !/[├└]──/.test(line)) continue;          // 根行 ⇒ 已在 base 里
      const m = /^((?:│   |    )*)[├└]── (.*)$/.exec(line);
      if (m === null) continue;
      const depth = m[1].length / 4;
      const names = m[2].split('#')[0].split(/\s+/).filter((t) => t.endsWith('/'))
        .map((t) => t.replace(/\/+$/, ''));
      if (names.length === 0) continue;
      const parent = stack.slice(0, depth).join('/');
      for (const n of names) out.push({ rel: `${base}${parent === '' ? '' : `${parent}/`}${n}`, depth });
      stack.length = depth;
      stack[depth] = names[names.length - 1];                  // 最深那个作下一层的父
    }
    return out;
  };
  // [文档, 节标题, 树的根（含尾 `/`；空串 = 仓库根）, 目录数下限（贴实测）]
  // ⚠️ **只纳入「描述当前状态」的 `├──` 树**（2026-10-09 审计 §4.222 的**范围口径**，防下轮重判）：
  //   · ✅ 纳入：`README.md`「## 目录结构」· `docs/architecture/editor-core.md`「## 模块地图」·
  //     `packages/editor-core/README.md`（**实测 5 个目录全部存在**）。
  //   · ❌ **排除「目标 / 建议」树**：`docs/architecture/monorepo.md` 的「## 目标结构（PRD §117）」
  //     （含**未建**的 `extensions/` ⇒ 合法）· PRD「# 117. Monorepo」（同）·
  //     PRD「目录建议：`packages/i18n/{zh-CN,…}`」（**建议**，实际是单文件 `messages.ts`）。
  //   · ❌ **排除「生成 / 工作目录」树**：`docs/plans/markdown-syntax-demo-parity-validation-plan.md`
  //     （列的是 `…/fixtures` `…/diffs` `…/timings` 等**运行时生成**的目录）。
  //   · ❌ **排除非 `├──` 格式**：`AGENTS.md`（2 空格缩进 —— **已由「治理文件不得指向不存在的目录」判据守住**）·
  //     `docs/architecture/overview.md`（**ASCII 框图**，不是树）· PRD 其余 2 块 · 2 个命令/记录块。
  const TREES = [
    ['README.md', '## 目录结构', '', 25],
    ['docs/architecture/editor-core.md', '## 模块地图', 'packages/editor-core/CoreEditor/src/', 15],
    ['packages/editor-core/README.md', '## 结构', 'packages/editor-core/', 4],
  ];
  for (const [doc, head, base, floor] of TREES) {
    const src = readFileSync(resolve(root, doc), 'utf8').replace(/\r\n/g, '\n');
    const sec = src.split(new RegExp(`^${head}[ \\t]*$`, 'm'))[1];
    const fence = sec === undefined ? undefined : /```\n([\s\S]*?)```/.exec(sec)?.[1];
    if (fence === undefined) {
      fail(`${doc} 的「${head}」节里找不到代码围栏 —— 判据锚点漂移，别静默跳过`);
      continue;
    }
    const dirs = parseTree(fence, base);
    const bad = dirs.filter((d) => !existsSync(resolve(root, d.rel)));
    if (bad.length > 0) {
      fail(`${doc} 的「${head}」树里有**不存在的目录**：${bad.map((d) => `${d.rel}/`).join('、')}`
        + ' —— 该树在**代码围栏内**（链接 / 路径判据都会剥掉它）⇒ 改名 / 删目录时**无人报**；请同步更新树');
    }
    if (dirs.length < floor) {
      fail(`${doc} 的「${head}」树只解析出 ${dirs.length} 个目录（下限 ${floor}）—— 谓词或锚点漂移`);
    }
  }
  // canary：三向（判定与 canary 共用 parseTree）
  const T = 'root/\n├── docs/\n│   ├── a/\n│   │   └── deep/\n│   └── b/ c/\n├── packages/\n└── tests/\n';
  const got = parseTree(T, 'B/').map((d) => d.rel).join(',');
  if (got !== 'B/docs,B/docs/a,B/docs/a/deep,B/docs/b,B/docs/c,B/packages,B/tests') {
    errors.push(`树护栏 canary 失效：解析结果 = ${got}（**三层深度 / 多目录同行 / 根行跳过** 三向都要对）`);
  }
  if (parseTree('├── README.md\n├── x/\n', '').length !== 1) {
    errors.push('树护栏 canary 过宽：**文件**（不以 `/` 结尾）被当成了目录');
  }
}

// ── ㉕ 「已判定**无真值源**的数字」不得在活文档里复述（2026-10-09，审计 §4.223）──────────────
// 立此条的原因（实测）：`13,625 行` 曾被 §4.94 判为「**全仓无出处、口径未声明**」并**改为引用真值源**
//   —— 但**只改了两处**（`editor-core.md` / `docs/architecture/README.md`），
//   `docs/architecture/migration.md` 与 `packages/editor-core/README.md` **仍在复述它**
//   （**「修一处 ≠ 修一类」第 10 次**）。
// ⚠️ 这类数字**没有真值源可核对** ⇒ 只能**登记** + **禁止在活文档复述**
//   （同 `D_TABLE_NOT_DECLARED` 的 idiom：登记「已知坏字面量」，扫「别处复述」）。
{
  // 已判定「无真值源」的字面量 → 判定出处（登记理由）
  const UNSOURCED = new Map([
    ['13,625', '§4.94：CoreEditor 行数「全仓无出处、口径未声明」⇒ 已改为引用真值源（199 个文件）'],
  ]);
  // 更正块 / 审计记录**需要引用**它 ⇒ 逐行豁免（含「无出处 / 无真值源」两类措辞）
  const NOTE = /原写|原文|更正|漂移|已改为|也写|不存在|无出处|无真值源/;
  const AUDIT_REL = 'docs/qualification/release-blocker-audit-2026-09-25.md';
  const SCAN_EXTS = ['md', 'mjs', 'cjs', 'ts', 'tsx', 'rs', 'json', 'yml', 'yaml'];
  const SELF = import.meta.filename ?? resolve(import.meta.dirname, 'verify-doc-code-refs.mjs');
  /** 返回 `text` 里「复述了无真值源数字」的清单（判定与 canary **共用**本谓词）。 */
  const unsourcedHits = (text) => {
    const out = [];
    text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
      if (NOTE.test(line)) return;
      for (const lit of UNSOURCED.keys()) if (line.includes(lit)) out.push(`L${i + 1} ${lit}`);
    });
    return out;
  };
  for (const f of walk(root).filter((p) => SCAN_EXTS.includes(p.split('.').pop()))) {
    // ⚠️ **路径必须按 `/` 归一化后再比**（Windows 上 `relative()` 产出 `\` ⇒ 直接 `===` 会**静默失配**，
    //   本项目**已因此红过一次 CI**；2026-10-09 本轮**又踩一次**：审计文档的排除在 Windows 上失效 ⇒ CI 红）。
    const rel = relative(root, f).split('\\').join('/');
    if (rel === AUDIT_REL) continue;                       // 审计文档是**记录**，需要引用它
    if (resolve(f) === resolve(SELF)) continue;            // 本护栏自身含 canary 样本
    const bad = unsourcedHits(readFileSync(f, 'utf8'));
    if (bad.length > 0) {
      fail(`${rel} 复述了**无真值源**的数字：${bad.join('、')} —— `
        + `${[...UNSOURCED.values()].join('；')}；请改为**引用真值源**，或把该数字登记进 UNSOURCED（带理由）`);
    }
  }
  // canary：三向（判定与 canary 共用 unsourcedHits）
  if (unsourcedHits('规模：13,625 行。').length !== 1) {
    errors.push('无真值源数字护栏 canary 失效：复述未被检出');
  }
  if (unsourcedHits('> 原写「13,625 行」，已改为引用真值源。').length !== 0) {
    errors.push('无真值源数字护栏 canary 失效：更正说明里的引用未被豁免');
  }
  if (unsourcedHits('规模：199 个文件。').length !== 0) {
    errors.push('无真值源数字护栏 canary 过宽：真值源数字被误判');
  }
}

// ── ㉖ `relative()` 的结果若参与**比较**，必须先按 `/` 归一化（2026-10-09，审计 §4.223）──────────
// 立此条的原因（实测，**本项目已踩两次**）：Windows 上 `relative()` 产出 `\` ⇒ 与含 `/` 的**字面量/常量**
//   比较时**静默失配**。§4.223 本轮就因此把 CI 打红（本机全绿）：`rel === AUDIT_REL` 在 Windows 上恒 false
//   ⇒ **审计文档的排除失效** ⇒ 判据去扫了它不该扫的文件。
// ⚠️ **只锁「参与比较」的形态**（`===` / `!==` / `.includes` / `.startsWith` / `.endsWith` / `.has`）——
//   **仅用于报错消息**的 `relative()`（外观问题）**不锁**（避免无收益的 churn）。
{
  const SCAN_EXTS = ['mjs', 'cjs', 'ts', 'tsx'];
  const NORM = /\.split\(['"]\\\\['"]\)\.join\(['"]\/['"]\)|\.replace\(\/\\\\\/g,\s*['"]\/['"]\)/;
  /** 返回 `src` 里「`relative()` 的结果参与比较却没归一化」的清单（判定与 canary **共用**本谓词）。 */
  const unnormalizedCompares = (src) => {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      const m = /const\s+(\w+)\s*=\s*relative\(/.exec(line);
      if (m === null || NORM.test(line)) return;              // 已归一化 ⇒ 合法
      const v = m[1];
      const CMP = new RegExp(`(${v}\\s*[!=]==?\\s*[^\\s]|[!=]==?\\s*${v}\\b|\\.includes\\(\\s*${v}\\b|${v}\\.includes\\(|\\.startsWith\\(\\s*${v}\\b|${v}\\.startsWith\\(|\\.endsWith\\(\\s*${v}\\b|${v}\\.endsWith\\(|\\.has\\(\\s*${v}\\b)`);
      for (let j = i + 1; j < Math.min(lines.length, i + 41); j += 1) {
        if (CMP.test(lines[j])) { out.push(`L${i + 1}（${v} 在 L${j + 1} 参与比较）`); break; }
      }
    });
    return out;
  };
  const SELF = import.meta.filename ?? resolve(import.meta.dirname, 'verify-doc-code-refs.mjs');
  let checked = 0;
  for (const f of walk(root).filter((p) => SCAN_EXTS.includes(p.split('.').pop()))) {
    if (resolve(f) === resolve(SELF)) continue;               // 本护栏自身含 canary 样本
    const src = readFileSync(f, 'utf8');
    if (!src.includes('relative(')) continue;
    checked += 1;
    const bad = unnormalizedCompares(src);
    if (bad.length > 0) {
      fail(`${relative(root, f).split('\\').join('/')} 里 \`relative()\` 的结果**参与比较却没归一化**：${bad.join('、')}`
        + ' —— Windows 上 `relative()` 产出 `\\` ⇒ 与含 `/` 的字面量 / 常量比较会**静默失配**'
        + '（本项目已踩两次：本机全绿而 CI 红）⇒ 请 `.split(\'\\\').join(\'/\')` 或 `.replace(/\\\\/g, \'/\')` 后再比');
    }
  }
  if (checked < 5) {
    fail(`路径归一化普查只检查了 ${checked} 份含 \`relative(\` 的护栏（下限 5）—— 扫描面漂移`);
  }
  // canary：两向（判定与 canary 共用 unnormalizedCompares）
  if (unnormalizedCompares("const rel = relative(root, f);\nif (rel === 'a/b.md') {}\n").length !== 1) {
    errors.push('路径归一化护栏 canary 失效：未归一化却参与比较未被检出');
  }
  if (unnormalizedCompares("const rel = relative(root, f).split('\\\\').join('/');\nif (rel === 'a/b.md') {}\n").length !== 0) {
    errors.push('路径归一化护栏 canary 过宽：已归一化的被判为违规');
  }
}

// ── ㉑ 「零跨包消费者」的包，其分诊必须在**审计文档的待裁决登记表**里可发现 ───────────────
// 立此条的原因（实测，2026-10-08 审计 §4.160）：`PKG_NO_CONSUMER_EXEMPT` 有 **4** 条
// （`document-model` / **`editor-react`** / `shared` / `workspace`），而**登记表第 14 行与
// ADR-0032 Q3 都写「3 个零跨包消费者的包」并只列三个** ⇒ `editor-react` **只在豁免表里，
// 在治理文档里查不到它的分诊**（它是「有意预留」，与另三个的「待裁决」性质不同）。
{
  const AUDIT = 'docs/qualification/release-blocker-audit-2026-09-25.md';
  const auditSrc = readFileSync(resolve(root, AUDIT), 'utf8').replace(/\r\n/g, '\n');
  /** 待裁决登记表的区间（从该标题到下一个二级标题）。判定与 canary **共用**本谓词。
   *  ⚠️ 两个正则都必须带 `m` —— 否则 `^` 只在**串首**生效 ⇒ 区间解析为空（实测踩到）。 */
  const registrySection = (src) => src.split(/^### 待裁决项登记表/m)[1]?.split(/\n## /)[0] ?? '';
  const tableSec = registrySection(auditSrc);
  const missing = [...PKG_NO_CONSUMER_EXEMPT.keys()].filter((p) => !tableSec.includes(p));
  if (missing.length > 0) {
    fail(`这些包**零跨包消费者**且已在 \`PKG_NO_CONSUMER_EXEMPT\` 登记，但**没有出现在 ${AUDIT} 的`
      + `「待裁决项登记表」里**：${missing.join('、')}`
      + ' —— 零消费者包的分诊（**待裁决** / **有意预留**）必须在登记表里**可发现**'
      + '（实测：`editor-react` 曾只在豁免表里，登记表与 ADR-0032 Q3 都漏了它）');
  }
  if (PKG_NO_CONSUMER_EXEMPT.size < 3) {
    fail(`PKG_NO_CONSUMER_EXEMPT 条目异常（${PKG_NO_CONSUMER_EXEMPT.size} < 3）—— 判据会空转`);
  }
  // canary：三向（判定与 canary 共用 registrySection + 「是否出现」这一谓词）
  const inTable = (name, sec) => sec.includes(name);
  if (!inTable('editor-react', registrySection('### 待裁决项登记表\n| 1 | §4.95 | `editor-react` |\n'))) {
    errors.push('零消费者登记护栏 canary 失效：表区间内出现的包未被识别');
  }
  if (inTable('no-such-pkg', registrySection('### 待裁决项登记表\n| 1 | §4.95 | `editor-react` |\n'))) {
    errors.push('零消费者登记护栏 canary 过宽：未出现的包被判为已登记');
  }
  if (registrySection(auditSrc).length < 500) {
    errors.push('零消费者登记护栏 canary 失效：登记表区间解析过短（解析漂移 ⇒ 判据空转）');
  }
}

// ── ㉗ `docs/specs` 里以反引号给出的**含 `/` 的代码路径**必须**可直接打开**（2026-10-09，审计 §4.225）──
// 立此条的原因（实测）：同类判据（§4.76）**只覆盖 `docs/architecture` + `docs/superpowers`**；
//   `docs/specs` 虽在 `DOC_GLOBS` 里，却只受「**符号**（`文件:行号`）」这一种形态覆盖 ⇒
//   它里面**裸写路径**的地方**从未被查过**。首轮扫 32 个含 `/` 的路径，**3 个不能直接打开**，
//   且**都是「同一行内前缀不一致」**（读者按图索骥打不开）：
//     · `auto-update-spec.md` —— 同一行写 `apps/desktop/src/host/updater.ts`（带前缀）却写
//       `src-tauri/src/updater.rs`（**缺 `apps/desktop/`**）
//     · `table-editing-spec.md` —— 同一行写 `packages/editor-engine/src/table/commands.ts`（带前缀）
//       却写 `table/toolbar.ts`（缺前缀）
//     · `clipboard-smart-paste-spec.md` —— `image/input.ts`（缺 `packages/editor-engine/src/`）
// ⚠️ **为什么不扩到 `docs/plans` / `docs/adr` / `docs/qualification`（实测结论，别重做）**：
//   把 §4.76 的谓词原样扩过去得 **32 个「不存在」**，**逐条读原文后 0 个是缺陷** —— 全属
//   ① **Typora 基线路径**（`TypeMark/appsrc/main.js` / `style/themes/*.css` / `conf/conf.user.json`）
//   ② **生成物**（`dist/*.js`）③ **已删除文件**（`EditorToolbar.tsx`，原文即写「**删除**：…」）
//   ④ **更正/变更记录**（`examples/hello-command.ts`，原文写「实际是 `helloCommand.ts`」）
//   ⑤ **外部 crate**（`tauri-macros/src/command/wrapper.rs`）
//   ⇒ 那三类是**历史/叙事**文档，**合法地**引用已不存在的路径；该扩法**误报率 ≈100%** ⇒
//   **不可机械化**（同 `PITFALLS` 的「表里只进消息的列」）。**本判据只覆盖 `docs/specs`。**
// ⚠️ **范围（如实声明）**：① 只查**含 `/`** 的路径（**裸文件名**跳过但**计数**）；
//   ② 跳过**围栏代码块**；③ 「更正/取代/曾有一份」类行**豁免**；④ **外部基线前缀**豁免（`EXT_PREFIX`）；
//   ⑤ 路径按 `/` 归一化后再判（Windows 产出 `\`；本项目已因此红过一次 CI）。
{
  const SPEC_DIR = 'docs/specs';
  const EXT = '(?:ts|tsx|js|mjs|cjs|rs|css|json|yml|yaml|sh|toml)';
  const TOK = new RegExp('`([\\w./-]+\\.' + EXT + ')`', 'g');
  /** 外部/非仓库路径前缀 —— **只列实测出现的那条**（基线证据）。双向：不再出现即报错（防化石）。 */
  const EXT_PREFIX = new Map([
    ['TypeMark/', 'Typora 应用内路径（**基线证据**，不在本仓库）'],
  ]);
  const stripFencesSpec = (src) => src.replace(/```[\s\S]*?```/g, '');
  const LOOKS_LIKE_QUOTE_SPEC = /原写|原文|更正|漂移|已改为|也写|曾有一份|已被|取代/;
  const existsSpec = (p) => existsSync(resolve(root, p.replace(/\\/g, '/')));
  const isExternal = (p) => [...EXT_PREFIX.keys()].some((pre) => p.startsWith(pre));
  const specDocs = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 })
    .toString().split('\0').filter((f) => f.startsWith(SPEC_DIR + '/') && f.endsWith('.md')).sort();
  let specChecked = 0;
  let specBare = 0;
  for (const rel of specDocs) {
    stripFencesSpec(readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n'))
      .split('\n')
      .forEach((line, i) => {
        if (LOOKS_LIKE_QUOTE_SPEC.test(line)) return;
        for (const m of line.matchAll(TOK)) {
          const p = m[1];
          if (!p.includes('/')) { specBare += 1; continue; }
          if (isExternal(p)) continue;
          specChecked += 1;
          if (!existsSpec(p)) {
            fail(`${rel}:${i + 1} 写了路径 \`${p}\`，但**仓库里不存在**`
              + ' —— spec 里的路径必须可直接打开（实测：同一行里有的带前缀、有的不带）');
          }
        }
      });
  }
  // [健康度型] 集合由文档内容产生 ⇒ 留余量（基线 31，下限 25）
  if (specChecked < 25) {
    fail(`${SPEC_DIR} 只解析出 ${specChecked} 个含 \`/\` 的路径（下限 25）`
      + ' —— 谓词或目录内容漂移会让本判据**空转**；若确实删过，请同步下调下限并说明');
  }
  // canary：三向（判定与 canary **共用** stripFencesSpec / existsSpec / isExternal）
  if (stripFencesSpec('a\n```\n`x/y.ts`\n```\n`z/w.ts`').includes('x/y.ts')) {
    errors.push('spec 路径护栏 canary 失效：围栏代码块未被剥离');
  }
  if (!existsSpec('docs/specs/auto-update-spec.md') || existsSpec('no/such/file.ts')) {
    errors.push('spec 路径护栏 canary 失效：存在性判定不能区分正/负样本');
  }
  if (!existsSpec('docs\\specs\\auto-update-spec.md')) {
    errors.push('spec 路径护栏 canary 失效：Windows 分隔符写法未被归一化（本项目已因此红过一次 CI）');
  }
  if (!isExternal('TypeMark/appsrc/main.js') || isExternal('docs/specs/auto-update-spec.md')) {
    errors.push('spec 路径护栏 canary 失效：外部基线前缀豁免不能区分正/负样本');
  }
  if (specBare === 0) {
    errors.push('spec 路径护栏 canary 失效：裸文件名计数为 0（谓词可能已失效）');
  }
  // 豁免表**双向**：每条外部前缀必须在 `docs/specs` 里真的用到（不再需要就删，防化石）
  const specAll = specDocs.map((f) => readFileSync(resolve(root, f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
  const unusedPrefix = [...EXT_PREFIX.keys()].filter((pre) => !specAll.includes('`' + pre));
  if (unusedPrefix.length > 0) {
    fail(`EXT_PREFIX 里这些前缀在 ${SPEC_DIR} 中**已不再出现**：${unusedPrefix.join('、')}`
      + ' —— 豁免表要**双向**核对（不再需要就删，防化石）');
  }
}

// ── ㉘ 文档里显式写的 `npm run X`（可带 `cd <dir> &&` 前缀）必须解析到该目录 package.json 里**存在的 script**（2026-10-09，审计 §4.226）──
// 立此条的原因（新透镜「**命令引用存在性**」）：**路径**引用已有判据（§4.76 / ㉗），但**脚本名**从没被查过 ——
//   脚本一改名（如 `parity`），文档里的命令会**静默指向不存在的 script**：读者照抄得到
//   「Missing script」，而**没有任何信号**（与 §4.76 的「行号还在范围内」同类：看起来完全正常）。
// ⚠️ **谓词只认「显式 run」形态**（`(npm|pnpm|yarn) run X`）—— 实测依据（**别放宽，别重做**）：
//   不带 `run` 的简写（`pnpm test` / `yarn build`）**与名词用法同形**（`pnpm workspace` / `npm packages`）。
//   实测该形态 **22 处真引用 + 4 处名词**，且**两者都在散文里** —— 试过「只认围栏内」的判别式：
//   22 处真引用里 **20 处也在散文里** ⇒ **判别式无效** ⇒ **简写形态不可机械化，本判据不覆盖它**。
// ⚠️ **扫描面（如实声明）**：**当前状态文档** = 仓库跟踪的 `.md` **去掉记录类目录**
//   （`docs/qualification/` 是**已发生事实的记录**、`docs/plans/archive/` 是**历史方案**）。
//   依据 §4.340「存在性判据只适用于描述**当前状态**的清单」：记录里引用**当时的**脚本**不该被改**。
//   ⚠️ 这**不是**「覆盖率不足」的借口：实测被排除的 27 处里 **0 处**是悬空引用。
// ⚠️ **目标目录无 `package.json` 时跳过并计数**（如 `cd /tmp/pw && npm run …` 的临时目录）。
{
  const MD_ALL = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 })
    .toString().split('\0').filter((f) => f.endsWith('.md'));
  const RECORD_DIRS = ['docs/qualification/', 'docs/plans/archive/'];
  const MD = MD_ALL.filter((f) => !RECORD_DIRS.some((d) => f.startsWith(d)));
  const scriptCache = new Map();
  /** 该目录 package.json 的 script 名集合；**没有 package.json** ⇒ null（跳过，不判）。 */
  const scriptsOf = (dir) => {
    const key = dir.replace(/\\/g, '/');
    if (scriptCache.has(key)) return scriptCache.get(key);
    const p = resolve(root, key, 'package.json');
    const set = existsSync(p) ? new Set(Object.keys(JSON.parse(readFileSync(p, 'utf8')).scripts ?? {})) : null;
    scriptCache.set(key, set);
    return set;
  };
  /** 判定与 canary **共用**本谓词：抽出 `[cd <dir> &&] <pm> run <name>`。 */
  const RE_RUN = /(?:cd\s+([\w./-]+)\s*&&\s*)?\b(?:npm|pnpm|yarn)\s+run\s+([a-z][a-z0-9:_-]*)/g;
  const scanRun = (line) => [...line.matchAll(RE_RUN)].map((m) => ({
    dir: m[1] ? m[1].replace(/\/+$/, '').replace(/\\/g, '/') : '.',
    name: m[2],
  }));
  let cmdChecked = 0;
  let cmdSkipped = 0;
  const cmdDirs = new Set();
  for (const rel of MD) {
    readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
      for (const { dir, name } of scanRun(line)) {
        const set = scriptsOf(dir);
        if (set === null) { cmdSkipped += 1; continue; }
        cmdChecked += 1;
        cmdDirs.add(dir);
        if (!set.has(name)) {
          fail(`${rel}:${i + 1} 写了 \`npm run ${name}\`（目录 \`${dir}\`），但该目录 package.json 里**没有这个 script**`
            + ' —— 读者照抄会得到「Missing script」，而**没有任何信号**（实测：脚本改名后文档无人同步）');
        }
      }
    });
  }
  // [健康度型] 集合由文档内容产生 ⇒ 留余量（基线 36，下限 30）
  if (cmdChecked < 30) {
    fail(`只解析出 ${cmdChecked} 处 \`npm run X\`（下限 30 = 立此判据时的基线 36 − 余量）`
      + ' —— 谓词或文档内容漂移会让本判据**空转**；若确实删过，请同步下调下限并说明');
  }
  // 覆盖数**派生打印**（判据 ⑧：`console.log` 里不得有手写计数）—— 让「本判据查了多少」可见
  console.log(`Doc code refs: 文档命令引用 ${cmdChecked} 处（目录 ${[...cmdDirs].sort().join(' / ')}）`
    + `；目标目录无 package.json 跳过 ${cmdSkipped} 处`);
  // canary：四向（判定与 canary **共用** scanRun / scriptsOf）
  const c1 = scanRun('cd apps/desktop && npm run tauri dev');
  if (c1.length !== 1 || c1[0].name !== 'tauri' || c1[0].dir !== 'apps/desktop') {
    errors.push('命令引用护栏 canary 失效：`cd <dir> && npm run X` 的前缀 / 脚本名未被正确解析');
  }
  if (scanRun('工具链：根目录 pnpm workspace').length !== 0) {
    errors.push('命令引用护栏 canary 过宽：**不带 run 的简写**被当成了命令（名词用法会误报）');
  }
  const rootScripts = scriptsOf('.');
  if (rootScripts === null || !rootScripts.has('parity') || rootScripts.has('no-such-script-xyz')) {
    errors.push('命令引用护栏 canary 失效：script 存在性判定不能区分正 / 负样本');
  }
  if (!cmdDirs.has('apps/desktop')) {
    errors.push('命令引用护栏 canary 失效：`cd <dir> &&` 分支**未被真实用例触发**（前缀解析可能已死）');
  }
}

// ── ㉙ markdown **表格结构完整性**：① 数据行格数不得多于表头 ② **分隔行格数必须 == 表头**（2026-10-09，审计 §4.227 / §4.228）──
// 立此条的原因（新透镜「**表格列数一致性**」）：GFM 对「行比表头多格」的处理是**静默丢弃溢出格**
//   ⇒ 单元格内容**在渲染视图里消失**（本仓已为 **D 表**单独落过「声明行恰好 4 格」的判据，但**其它表格无人守**）。
//   首轮扫 **595 表 / 3622 数据行**，**12 处**行比表头多格，**全部**是「**单元格内未转义的 `|`**」：
//     代码里的 `||`（`path.resolve(rootUrl || docFolder, src)`、`for(; c || u<l;)`）· 联合类型（`path|null`）·
//     正则交替（`color-only|仅颜色|颜色.*唯一|color alone`）· 4 个连写的杂散 `| | | |`（产生空单元格）。
//     修法**一律是转义/删多余分隔符**（内容**保真**，只是从「不可见」变回可见）。
// ⚠️ **范围（如实声明，别当成「表格已全部核对」）**：**只锁「多于表头」这一个方向** ——
//   它是**内容消失**；反方向（**少于**表头）GFM 用**空格补齐**，文本仍在（只是落在**相邻表头**下），属**外观**问题。
//   实测反方向 **8 处**（全在 `master-plan`，均为「两列被合并成一格」）⇒ **修它要拆内容**（属**内容判断**，
//   不是格式修复）⇒ **本判据不覆盖**，已在审计 §4.227 逐条登记。
// ⚠️ **渲染语料豁免**（`tests/fixtures/**`、`tests/benchmark/**`）—— 与 §4.94 同理：
//   那是**故意**含畸形语法的夹具，判它会产生假阳性。⚠️ 围栏代码块内的表格**不判**（不是表格）。
{
  const MD = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 })
    .toString().split('\0').filter((f) => f.endsWith('.md'));
  /** 单元格数：按**未转义**的 `|` 切分（`\|` 是转义，不算分隔）。判定与 canary **共用**本谓词。 */
  const tableCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).length;
  const isTableRow = (l) => /^\s*\|/.test(l) && l.includes('|');
  const isDelimiter = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
  let tblTables = 0;
  let tblRows = 0;
  for (const rel of MD) {
    if (/^(?:tests\/fixtures\/|tests\/benchmark\/)/.test(rel)) continue;   // 渲染语料：**故意**含畸形表格
    const lines = readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n');
    let inFence = false;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) { inFence = !inFence; i += 1; continue; }
      if (inFence) { i += 1; continue; }
      if (!isTableRow(line) || !(i + 1 < lines.length) || !isDelimiter(lines[i + 1])) { i += 1; continue; }
      const head = tableCells(line);
      tblTables += 1;
      // ⚠️ **分隔行必须与表头同格数**（2026-10-09，审计 §4.228）：GFM 要求二者**相等**，
      //    否则**整个表格不被识别** ⇒ 整块**退化成普通文本**（`|` 原样显示）—— 比「丢一格」更严重。
      //    实测 1 处：`tests/qualification/evidence/2026-09-12-macos-open-scroll-vs-typora.md`
      //    表头 **9 格** / 分隔行 **8 格**（`|---|` 少一个）。
      const delimCells = tableCells(lines[i + 1]);
      if (delimCells !== head) {
        fail(`${rel}:${i + 2} 表格**分隔行**有 ${delimCells} 格，而表头有 ${head} 格 —— GFM 要求二者**相等**，`
          + '否则**整个表格不被识别**（整块退化成普通文本，`|` 原样显示；实测：表头 9 格 / 分隔行 8 格）');
      }
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isDelimiter(lines[j])) {
        tblRows += 1;
        const c = tableCells(lines[j]);
        if (c > head) {
          fail(`${rel}:${j + 1} 表格数据行有 ${c} 格 > 表头 ${head} 格 —— GFM 会**静默丢弃**溢出格 ⇒`
            + ' 单元格内容在渲染视图里**消失**（实测：单元格内未转义的 `|`，如 `a || b` / `x|y` 联合类型；修法=转义 `\\|`）');
        }
        j += 1;
      }
      i = j;
    }
  }
  // [健康度型] 集合由文档内容产生 ⇒ 留余量（基线 3622，下限 3500）
  if (tblRows < 3500) {
    fail(`只解析出 ${tblRows} 个表格数据行（下限 3500 = 立此判据时的基线 3622 − 余量）`
      + ' —— 谓词或文档内容漂移会让本判据**空转**；若确实删过，请同步下调下限并说明');
  }
  // canary：五向（判定与 canary **共用** tableCells / isTableRow / isDelimiter）
  if (tableCells('| a | b |') !== 2) {
    errors.push('表格列数护栏 canary 失效：基础行未被解析成 2 格');
  }
  if (tableCells('| a \\| b | c |') !== 2) {
    errors.push('表格列数护栏 canary 失效：**转义 `\\|`** 被当成了分隔符（会把合法行误判为多格）');
  }
  if (!(tableCells('| a | b | c |') > tableCells('| a | b |'))) {
    errors.push('表格列数护栏 canary 失效：多格行未被判为多格');
  }
  if (!isDelimiter('|---|---|')) {
    errors.push('表格列数护栏 canary 失效：分隔行未被识别（表格起点找不到 ⇒ 判据空转）');
  }
  if (isDelimiter('| a | b |')) {
    errors.push('表格列数护栏 canary 过宽：数据行被当成了分隔行');
  }
  if (tableCells('| a | b | c |') === tableCells('|---|---|')) {
    errors.push('表格列数护栏 canary 失效：**分隔行与表头**的格数不可区分（分隔行判据会空转）');
  }
  // 覆盖数**派生打印**（判据 ⑧）—— 让「本判据查了多少」可见
  console.log(`Doc code refs: 表格 ${tblTables} 个 / 数据行 ${tblRows} 行，格数**不多于**表头且**分隔行 == 表头**`);
}

// ── ㉚ **代码围栏必须闭合**（按 GFM 的**长度规则**）（2026-10-09，审计 §4.228）──
// 立此条的原因（同一透镜「**markdown 结构完整性**」）：**围栏未闭合** ⇒ GFM 把**其后全文**渲染成代码块
//   ⇒ 读者看到的是一大段代码（**静默**：CI 不会红、`git diff` 也看不出来）。
// ⚠️ **不能数 `\`\`\`` 的奇偶**：GFM 允许**更长的栅栏**包住更短的（本仓实测有 **4 个反引号**的围栏，
//   其中含 3 个反引号的行）⇒ 奇偶法会**失同步**。正确规则 = 「闭合栅栏的反引号数 **>=** 开启栅栏」
//   + 「info string **不得含反引号**」（含则那一行**不是**围栏）。
// ⚠️ **渲染语料豁免**（`tests/fixtures/**`、`tests/benchmark/**`）：语料**故意**含异形语法。
{
  const MD = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 })
    .toString().split('\0').filter((f) => f.endsWith('.md'));
  /** 返回**未闭合**的开启栅栏 `{len, line}`，无则 null。判定与 canary **共用**本谓词。 */
  const unclosedFence = (src) => {
    const lines = src.split('\n');
    let open = null;
    for (let i = 0; i < lines.length; i += 1) {
      const m = /^(\s*)(`{3,})(.*)$/.exec(lines[i]);
      if (m === null) continue;
      const len = m[2].length;
      const rest = m[3].trim();
      if (open === null) {
        if (rest.includes('`')) continue;   // GFM：info string 含反引号 ⇒ 该行不是开启栅栏
        open = { len, line: i + 1 };
      } else if (len >= open.len && rest === '') {
        open = null;                        // 合法闭合（长度 >= 开启）
      }
    }
    return open;
  };
  let fenceDocs = 0;
  for (const rel of MD) {
    if (/^(?:tests\/fixtures\/|tests\/benchmark\/)/.test(rel)) continue;   // 渲染语料：**故意**含异形语法
    fenceDocs += 1;
    const bad = unclosedFence(readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n'));
    if (bad !== null) {
      fail(`${rel}:${bad.line} 的代码围栏（${bad.len} 个反引号）**没有闭合** ——`
        + ' GFM 会把**其后全文**渲染成代码块（读者看到一大段代码；CI 与 `git diff` 都看不出来）');
    }
  }
  // [健康度型] 集合由仓库文件产生 ⇒ 留余量（基线 181，下限 150）
  if (fenceDocs < 150) {
    fail(`只扫描了 ${fenceDocs} 份非夹具文档（下限 150 = 立此判据时的基线 181 − 余量）`
      + ' —— 谓词或扫描面漂移会让本判据**空转**');
  }
  // canary：四向（判定与 canary **共用** unclosedFence）
  if (unclosedFence('```\na\n```\n') !== null) {
    errors.push('围栏护栏 canary 失效：成对的围栏被判为未闭合');
  }
  if (unclosedFence('```\na\n') === null) {
    errors.push('围栏护栏 canary 失效：**未闭合**围栏未被检出');
  }
  if (unclosedFence('````\n```\n````\n') !== null) {
    errors.push('围栏护栏 canary 失效：**长度规则**未生效（4 个反引号包 3 个反引号被判成未闭合）');
  }
  if (unclosedFence('```js `x`\na\n```\n') === null) {
    errors.push('围栏护栏 canary 过宽：info string 含反引号的行被当成了开启栅栏');
  }
  console.log(`Doc code refs: 代码围栏闭合（扫描 ${fenceDocs} 份非夹具文档）`);
}

// ── `docs/architecture/editor-core.md` 复述的「N 个主题」必须 == 上游主题目录的文件数（2026-10-09，审计 §4.196）──
// 【为什么】该文档的目录树写「`themes/`  # **16 个主题**（github-light 等）」——
//   实测 `CoreEditor/src/styling/themes/` 有 **18 个 `.ts`**，其中 `index.ts` / `colors.ts`
//   **不是主题**（入口与调色板）⇒ 主题 = **16** ✅ 当前一致，但**无判据**
//   （用 `tests/parity/tools/audit-doc-counts.mjs` 的**宽形态**扫描时发现）。
//   ⚠️ 这是「**可直接数**」类 ⇒ 应与真值比对（PITFALLS §4.306）。
// 【判据】文档的「N 个主题」必须 == 主题目录 `.ts` 数 − **显式登记**的非主题文件数。
{
  const DOC = 'docs/architecture/editor-core.md';
  const THEME_DIR = 'packages/editor-core/CoreEditor/src/styling/themes';
  // **非主题**文件（显式登记 + 理由）；双向：不再存在即报错（防化石）
  const NON_THEME = new Map([['index.ts', '入口（re-export）'], ['colors.ts', '调色板常量']]);
  const abs = resolve(root, THEME_DIR);
  if (!existsSync(abs)) throw new Error(`缺少 ${THEME_DIR} —— 判据锚点漂移`);
  const tsFiles = readdirSync(abs).filter((f) => f.endsWith('.ts'));
  for (const f of NON_THEME.keys()) {
    if (!tsFiles.includes(f)) {
      throw new Error(`${THEME_DIR} 里的非主题文件 ${f} 已不存在 —— 请更新 NON_THEME 登记（防化石）`);
    }
  }
  const actual = tsFiles.length - NON_THEME.size;
  const src = readFileSync(resolve(root, DOC), 'utf8').replace(/\r\n/g, '\n');
  const RE = /themes\/[^\n]*?(\d+)\s*个主题/;
  const m = RE.exec(src);
  if (m === null) {
    throw new Error(`${DOC} 找不到「themes/ … N 个主题」—— 判据锚点漂移，别静默跳过`);
  }
  if (Number(m[1]) !== actual) {
    throw new Error(`${DOC} 写「${m[1]} 个主题」，而 \`${THEME_DIR}\` 有 ${tsFiles.length} 个 .ts`
      + `（减 ${NON_THEME.size} 个非主题 = ${actual}）—— 主题数**可直接数** ⇒ 同步改文档`);
  }
  // canary：谓词与判定共用
  const probe = (s) => { const r = RE.exec(s); return r === null ? null : Number(r[1]); };
  if (probe('│   └── themes/            # 16 个主题（github-light 等）') !== 16) {
    throw new Error('主题数 canary 失效：目录树形态取不到');
  }
  if (probe('无此形态') !== null) {
    throw new Error('主题数 canary 过宽：无锚点的样本被误判');
  }
  console.log(`Doc code refs: editor-core.md 的「主题数」== 上游 themes/ 实际 ${actual} 个`);
}

// ── `docs/architecture/monorepo.md` 的「N 个包」必须 == `ls packages/` 目录数，且**名单**要与之相符（2026-10-09，审计 §4.203）──
// 【为什么】该文档写「实测（`ls packages/`）当前共 **15 个包**」并**列了 15 个名字** ——
//   实测 `packages/` 有 **15 个目录** ✅ 准确；但**护栏的口径是 14**（**排除 vendored `editor-core`**）
//   ⇒ 两数**都对**却**容易混**（本轮实测时先判成「漂了」）。
//   ⚠️ 属「**口径不确定**」类（PITFALLS §4.308）⇒ 数字与名单要一致，且**口径要写明**（本轮已补）。
// 【判据】文档的「N 个包」== `packages/` 目录数；且**紧随其后列出的真实包名数** == N。
{
  const DOC = 'docs/architecture/monorepo.md';
  const src = readFileSync(resolve(root, DOC), 'utf8').replace(/\r\n/g, '\n');
  const pkgDirs = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  const actual = pkgDirs.length;
  if (actual === 0) throw new Error('packages/ 解析出 0 个目录 —— 判据锚点漂移');
  const m = /当前共\s*\**(\d+)\**\s*个包/.exec(src);
  if (m === null) {
    throw new Error(`${DOC} 找不到「当前共 N 个包」—— 判据锚点漂移，别静默跳过`);
  }
  if (Number(m[1]) !== actual) {
    throw new Error(`${DOC} 写「当前共 ${m[1]} 个包」，而 \`packages/\` 有 ${actual} 个目录`
      + '（**口径 = 全部目录，含 vendored**）—— 加/删包时同步改该文档');
  }
  const after = src.slice(m.index, m.index + 900);
  // ⚠️ **必须去重**：后续说明句会**重复提到**部分包名
  //    （2026-10-09 实测：不去重时数出 24 个，去重后 15 ✅）
  const listed = [...new Set([...after.matchAll(/`([a-z][a-z0-9-]*)`/g)]
    .map((x) => x[1]).filter((n) => pkgDirs.includes(n)))];
  if (listed.length !== actual) {
    throw new Error(`${DOC} 的「${m[1]} 个包」后面只列出了 ${listed.length} 个**真实**包名`
      + `（\`packages/\` 有 ${actual} 个）—— 名单与数字必须一致`);
  }
  // canary：谓词与判定共用
  const probe = (s) => { const r = /当前共\s*\**(\d+)\**\s*个包/.exec(s); return r === null ? null : Number(r[1]); };
  if (probe('实测（`ls packages/`）当前共 **15 个包**') !== 15) {
    throw new Error('包数 canary 失效：形态取不到');
  }
  if (probe('无此形态') !== null) {
    throw new Error('包数 canary 过宽：无锚点的样本被误判');
  }
  console.log(`Doc code refs: monorepo.md 的「${actual} 个包」== \`packages/\` 目录数（名单 ${listed.length} 个一致）`);
}

if (errors.length > 0) {
  console.error('Doc code-reference guard failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(
  `Doc code refs: ${judged} 处「符号（文件:行号）」引用全部仍指向该符号`
  + `（扫描 ${docs.length} 份权威文档；另有 ${ambiguous} 处因同名文件不唯一且后缀仍不唯一而未判定；`
  + '行号越界会单独报错）',
);
