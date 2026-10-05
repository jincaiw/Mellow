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
