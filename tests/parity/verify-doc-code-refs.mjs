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
import { basename, join, relative, resolve } from 'node:path';

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
  const ARCH_DIR = 'docs/architecture';
  const EXT = '(?:ts|tsx|js|mjs|cjs|rs|css|json|yml|yaml|md|sh|toml)';
  const TOK = new RegExp('`([\\w./-]+\\.' + EXT + ')`', 'g');
  const LOOKS_LIKE_QUOTE = /原写|原文|更正|漂移|已改为|也写/;
  /** 去掉围栏代码块（```…```）—— 那里的路径是示意，基址不明。判定与 canary 共用。 */
  const stripFences = (src) => src.replace(/```[\s\S]*?```/g, '');
  /** 归一化分隔符后判存在。判定与 canary 共用。 */
  const exists = (p) => existsSync(resolve(root, p.replace(/\\/g, '/')));
  let checked = 0;
  let bare = 0;
  for (const file of readdirSync(resolve(root, ARCH_DIR)).filter((f) => f.endsWith('.md'))) {
    const rel = `${ARCH_DIR}/${file}`;
    stripFences(readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n'))
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
  if (checked < 20) {
    fail(`docs/architecture 只解析出 ${checked} 个含 \`/\` 的路径（下限 20 = 立此判据时的基线）`
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
const PACKAGING_DOC = 'docs/plans/packaging-release.md';
// 允许出现的**非当前版本**字面量：登记 → 理由（双向：不再出现即报错，防化石）
const PACKAGING_VERSION_ALLOW = new Map([
  ['0.1.0', '**更正块引用的旧值**（原文曾写「当前版本 0.1.0」）—— 更正惯例是引用错误原文，故必须保留'],
  ['v1.5.2', '**历史起点**（「v1.5.2 起替换占位域名」），不是当前版本'],
]);
{
  const docPath = resolve(root, PACKAGING_DOC);
  const confPath = resolve(root, 'apps/desktop/src-tauri/tauri.conf.json');
  if (!existsSync(docPath) || !existsSync(confPath)) {
    fail(`缺少 ${PACKAGING_DOC} 或 tauri.conf.json`);
  } else {
    const doc = readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n');
    const current = JSON.parse(readFileSync(confPath, 'utf8')).version;
    const VERSION_TOKEN = /\bv?(\d+\.\d+\.\d+)\b/g;
    const seen = new Set();
    const offenders = [];
    for (const line of doc.split('\n')) {
      for (const m of line.matchAll(VERSION_TOKEN)) {
        const raw = m[0];
        const num = m[1];
        seen.add(raw);
        seen.add(num);
        if (num === current) continue; // 与真值源一致 ⇒ 放行
        if (PACKAGING_VERSION_ALLOW.has(raw) || PACKAGING_VERSION_ALLOW.has(num)) continue;
        offenders.push(`${raw}（…${line.trim().slice(0, 60)}…）`);
      }
    }
    if (offenders.length > 0) fail(
      `${PACKAGING_DOC} 出现**既不是当前版本（${current}）也未登记理由**的版本字面量：`
      + `${offenders.join(' / ')} —— 发版手册里的版本号会被按「当前」读；`
      + '首选**不要写死**（改为指向真值源或 `v<版本>` 占位符），确需出现则登记进 PACKAGING_VERSION_ALLOW（带理由）');
    // 例外表**双向**：登记了但已不再出现 ⇒ 报错（化石例外会掩盖未来回归）
    for (const [tok, reason] of PACKAGING_VERSION_ALLOW) {
      if (!seen.has(tok)) {
        fail(`PACKAGING_VERSION_ALLOW 登记了 ${tok}，但它已不再出现在 ${PACKAGING_DOC} —— 请删除该例外条目`);
      }
      if (typeof reason !== 'string' || reason.trim() === '') {
        fail(`PACKAGING_VERSION_ALLOW 的 ${tok} 缺理由（例外必须带可复核的理由）`);
      }
    }
    // canary：谓词是**同一个对象**，双向（当前版本必须放行；未登记的异值必须被抓到）
    const scanVersions = (text, cur) => [...text.matchAll(VERSION_TOKEN)]
      .map((m) => m[0])
      .filter((t) => t.replace(/^v/, '') !== cur && !PACKAGING_VERSION_ALLOW.has(t) && !PACKAGING_VERSION_ALLOW.has(t.replace(/^v/, '')));
    if (scanVersions(`当前 ${current}`, current).length !== 0) {
      errors.push('发版手册版本字面量护栏 canary 失效：当前版本样本被误判为违规');
    }
    if (scanVersions('tag v9.9.9', current).join(',') !== 'v9.9.9') {
      errors.push('发版手册版本字面量护栏 canary 失效：未登记的异值样本未被识别');
    }
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
