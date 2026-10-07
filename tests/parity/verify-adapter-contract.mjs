/**
 * Adapter contract 护栏（V4 计划 P7 Exit Gate 的自动化部分）
 *
 * ① 核心包无平台分支：packages/**（除 vendored editor-core/CoreEditor 与构建产物）
 *    源码零运行时 Tauri 标识（AGENTS.md：平台代码只允许在 apps/desktop，ADR-0007 Host Adapter）。
 * ② 核心包零平台 API：process.platform / navigator.platform / userAgentData 不出现在核心包。
 * ③ Adapter contract 三方锚点：editor-core 契约（__MELLOW_BRIDGE__）→ desktop 构建期
 *    Tauri 适配器（build-editor-bundle.mjs）→ Rust System Core（bridge_call）链路锚点在位。
 * ④ 三平台打包矩阵：tauri.conf.json bundle targets 覆盖 macOS dmg / Windows msi+nsis /
 *    Linux appimage+deb+rpm，且含 .md File Association（P7 Windows 行）。
 * ⑤ drift canary：扫描器必须能检出合成违规（防「永远绿」假护栏）。
 *
 * 真机/CI 项（不在本护栏范围）：安装/卸载/更新矩阵、IME 真实交互矩阵、签名公证。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

// ── ① + ② 核心包平台边界扫描 ────────────────────────────────────────────
const PACKAGES_DIR = resolve(root, 'packages');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'CoreEditor']); // CoreEditor 是 vendored 上游（UPSTREAM.md 只读），由 editor-core neutral.test.ts 单独管辖
const SKIP_FILE = /(\.test\.ts|\.test\.tsx|\.d\.ts)$/; // 测试内断言字符串与类型声明不构成运行时平台分支
// 运行时 Tauri 标识（import/全局读取形式；注释性提及不算分支）
const TAURI_TOKENS = [/__TAURI_INTERNALS__/, /window\.__TAURI__/, /from ['"]@tauri-apps/, /require\(['"]@tauri-apps/, /tauri-plugin/];
const PLATFORM_API_TOKENS = [/process\.platform/, /navigator\.platform/, /navigator\.userAgentData/];

function* walkSources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walkSources(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !SKIP_FILE.test(entry)) {
      yield full;
    }
  }
}

function scanSources(baseDir, tokens) {
  const violations = [];
  for (const file of walkSources(baseDir)) {
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const token of tokens) {
      if (token.test(text)) violations.push(`${relative(root, file)} ↔ ${token}`);
    }
  }
  return violations;
}

const tauriViolations = scanSources(PACKAGES_DIR, TAURI_TOKENS);
if (tauriViolations.length > 0) {
  fail(`核心包出现运行时 Tauri 标识（平台代码只允许在 apps/desktop，ADR-0007/AGENTS.md 架构细则）:\n  ${tauriViolations.join('\n  ')}`);
}
const platformViolations = scanSources(PACKAGES_DIR, PLATFORM_API_TOKENS);
if (platformViolations.length > 0) {
  fail(`核心包出现平台判定 API（三平台共用产品语义，平台差异只能在 Adapter）:\n  ${platformViolations.join('\n  ')}`);
}

// ── ③ Adapter contract 三方锚点 ─────────────────────────────────────────
const bridgeInjection = readFileSync(resolve(root, 'packages/editor-core/src/bridge-injection.ts'), 'utf8').replace(/\r\n/g, '\n');
if (!bridgeInjection.includes('__MELLOW_BRIDGE__')) {
  fail('editor-core bridge-injection.ts 缺少 __MELLOW_BRIDGE__ 契约定义（ADR-0007）');
}
const bundleScript = readFileSync(resolve(root, 'apps/desktop/scripts/build-editor-bundle.mjs'), 'utf8').replace(/\r\n/g, '\n');
if (!bundleScript.includes('__MELLOW_BRIDGE__') || !bundleScript.includes('__TAURI__')) {
  fail('build-editor-bundle.mjs 缺少 __MELLOW_BRIDGE__ → __TAURI__ 适配器接线（desktop 专属 Tauri Bridge Adapter）');
}
const bridgeRust = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/bridge.rs'), 'utf8').replace(/\r\n/g, '\n');
if (!bridgeRust.includes('bridge_call')) {
  fail('Rust System Core bridge.rs 缺少 bridge_call 命令（桥契约 Rust 侧实现）');
}

// ── ④ 三平台打包矩阵（P7 任务表的构建级锚点）────────────────────────────
const tauriConf = readFileSync(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8').replace(/\r\n/g, '\n');
for (const target of ['"dmg"', '"nsis"', '"msi"', '"appimage"', '"deb"', '"rpm"']) {
  if (!tauriConf.includes(target)) {
    fail(`tauri.conf.json bundle targets 缺少 ${target}（P7 三平台安装矩阵的构建级前提）`);
  }
}
if (!/"fileAssociations"/.test(tauriConf) || !/"md"/.test(tauriConf)) {
  fail('tauri.conf.json 缺少 .md File Association（P7 Windows「File Association / Open With」前提）');
}
if (!/"createUpdaterArtifacts": true/.test(tauriConf)) {
  fail('tauri.conf.json 未开启 createUpdaterArtifacts（P7 Exit Gate「更新矩阵」的构建级前提）');
}

// ── ③-b Windows JumpList（2026-09-03 用户裁决纳入实施；PRD §134 P1 Recent integration）──
//    三方锚点：前端 recordRecentFile（用户打开文档语义）→ Rust 命令 → Shell API 模块。
// ── 宪法侧：PRD §134 必须仍把 Windows JumpList 列为 P1（2026-10-06，审计 §4.82）──
// 立此条的原因：上面那行**在注释里引用 §134**，但**从未读 PRD**（同 §4.79/§4.80/§4.81 的
// 「引用宪法 ≠ 读宪法」）。若 §134 的 P1 清单里删掉 Windows JumpList，
// 下面这几条断言就变成**没有宪法依据的要求**，且不会有任何信号。
{
  const prdPath = resolve(root, 'docs/product/Mellow-PRD-V1.2-FINAL.md');
  const prdSrc = existsSync(prdPath) ? readFileSync(prdPath, 'utf8').replace(/\r\n/g, '\n') : '';
  // ⚠️ 判据是**同一个函数对象**（断言与 canary 共用），否则「放宽谓词」抓不到。
  const hasJumpListP1 = (sec) => /^\s*-\s*Windows JumpList[；;]\s*$/m.test(sec);
  const at134 = prdSrc.indexOf('# 134.');
  if (at134 < 0) {
    fail('PRD 缺少 §134 P1（Windows JumpList 的宪法依据）');
  } else {
    const next134 = prdSrc.indexOf('\n# ', at134 + 1);
    if (!hasJumpListP1(prdSrc.slice(at134, next134 < 0 ? prdSrc.length : next134))) {
      fail('PRD §134 的 P1 清单里找不到「Windows JumpList」—— 宪法改动必须同步本护栏与实现');
    }
  }
  // canary：**双向**（正样本必须命中 + 相邻项 / 已删项必须不命中）
  if (!hasJumpListP1('- Windows JumpList；')) {
    fail('§134 宪法侧护栏 canary 失效：合法样本未被识别');
  }
  if (hasJumpListP1('- macOS Quick Look；')) {
    fail('§134 宪法侧护栏 canary 失效：相邻的 Quick Look 项被误判为 JumpList');
  }
  if (hasJumpListP1('- Windows JumpList（暂缓）')) {
    fail('§134 宪法侧护栏 canary 失效：带后缀的样本被误判为独立条目');
  }
}
const jumplistRust = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/jumplist.rs'), 'utf8').replace(/\r\n/g, '\n');
// 词边界正则（\b）：add_recent_renamed 之类超集子串不得假绿（canary 实证过 includes 缺陷）
if (!/\bpub fn add_recent\b/.test(jumplistRust) || !jumplistRust.includes('SHAddToRecentDocs')) {
  fail('src-tauri jumplist.rs 缺少 add_recent/SHAddToRecentDocs（Windows JumpList Rust 侧实现）');
}
const libRust = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/lib.rs'), 'utf8').replace(/\r\n/g, '\n');
if (!libRust.includes('jump_list_add_recent')) {
  fail('src-tauri lib.rs 未注册 jump_list_add_recent 命令（JumpList 前端入口）');
}
const appTsSource = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8').replace(/\r\n/g, '\n');
if (!appTsSource.includes("invoke('jump_list_add_recent'")) {
  fail('App.tsx recordRecentFile 未调用 jump_list_add_recent（JumpList 系统最近文档挂点）');
}
if (!readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8').replace(/\r\n/g, '\n').includes('windows-sys')) {
  fail('src-tauri Cargo.toml 缺少 windows-sys（cfg(windows) target 依赖，JumpList Shell API）');
}

// ── ⑤ drift canary：扫描器自检（防「永远绿」假护栏）──────────────────────
const canaryViolations = [];
const canaryText = "import { invoke } from '@tauri-apps/api/core';\nwindow.__TAURI_INTERNALS__.invoke('x');";
for (const token of TAURI_TOKENS) {
  if (token.test(canaryText)) canaryViolations.push(String(token));
}
if (canaryViolations.length < 2) {
  fail('Adapter contract 护栏自检失败：扫描器无法检出合成 Tauri 违规，护栏已失效');
}
const canaryClean = "const x = { tauri: '注释性提及不构成分支' };";
if (TAURI_TOKENS.some((token) => token.test(canaryClean))) {
  fail('Adapter contract 护栏误报：注释性/普通对象提及被当作运行时平台分支');
}

// ── ③ 宿主 ↔ 引擎 桥的**完整性**：每个 `__MELLOW_*` 全局必须「有声明处 + 有读取处」（2026-10-01）──
// 立此条的原因：本会话抓到两处「宿主上下文到不了引擎」（locale §4.52 / 非 md 主题变量 §4.53），
// 共同形态是「**桥逐项加**，没加的那部分静默失效」。故把全部桥列全，并锁住**两侧都在**：
//   · 只有声明、没人读 → **死桥**（装了开关没人用 —— §4.1「≠ 有消费方」）；
//   · 只有人读、没人声明 → **断桥**（宿主调了一个不存在的全局 → 静默失效）。
// ⚠️ 判定必须看全局名**之后**的文本：首版看的是**之前** → 把声明全判成读取，
//    产出 **20 个假的「断桥」候选**（工具伪影，不是代码问题）。
// ⚠️ 扫描面必须含 `apps/desktop/scripts/`：Tauri 适配器在那里注入 `__MELLOW_ASSET_RESOLVER__` 等；
//    漏了它会把该桥误判成「只在引擎侧出现（死桥）」。
{
  const BRIDGE_DIRS = [
    'packages/editor-engine/src', 'packages/editor-core/src',
    'apps/desktop/src', 'apps/desktop/scripts',
  ];
  const SKIP_DIR = new Set(['node_modules', 'dist']);
  const walkAll = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIR.has(e.name) ? [] : walkAll(resolve(dir, e.name));
    return /\.(ts|tsx|mjs|js)$/.test(e.name) ? [resolve(dir, e.name)] : [];
  });
  const stripJsComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  /**
   * 判定某次出现是「声明」还是「读取」——**声明** = 全局名之后紧跟 `=`（且不是 `==`）。
   * ⚠️ 抽成具名函数的原因（实测自伤）：首版在扫描处写成 `after.startsWith('=')`（**漏了前导空格**，
   * ` = {` 不以 `=` 开头）→ 36 个桥**全被判成断桥**；而 canary 用的是另一份**正确的**正则
   * → **canary 测的是副本，没覆盖真实代码路径**，故没抓到。
   * 现在扫描与 canary 共用本函数，canary 才能真正守住它。
   */
  const isDeclAt = (line, index, len) => /^\s*=(?!=)/.test(line.slice(index + len));
  // 例外：**扩展点** —— 由用户 / 主题 / 外部脚本注入，仓库内**本就没有声明处**（属设计，不是断桥）。
  // 实测：`__MELLOW_MERMAID_LOADER__` —— 引擎注释写「Inject window.mermaid or __MELLOW_MERMAID_LOADER__」。
  const BRIDGE_EXTENSION_POINTS = new Set(['__MELLOW_MERMAID_LOADER__']);
  // 形态二：**常量间接**（实测覆盖 2/3 误报）——
  //   `const GLOBAL_KEY = '__MELLOW_ENGINE_API__' as const;` 之后 `win[GLOBAL_KEY] = api;`
  //   首版只认「全局名之后紧跟 `=`」→ 把这种声明判成读取 → 报假断桥。
  // ⚠️ 桥名正则**必须与语言标识符同宽**（2026-10-06，审计 §4.112）：
  // 原为 `[A-Z_]+` —— 比 JS 标识符规则**窄**，与本节自述「**把全部桥列全**」矛盾，
  // 且将来若出现小写桥名（如 `__MELLOW_shortcutApi__`）会被**静默跳过**（不报死桥/断桥）。
  // 实测：当前 37 个桥名**全部**是大写形态 ⇒ 补宽**今日零行为变化**（零风险）；
  // canary 增一条「小写桥名必须被识别」，防将来静默漏检。
  const BRIDGE_NAME_RE = /__MELLOW_([A-Za-z0-9_]+)__/g;
  const KEY_CONST_RE = /const\s+(\w+)\s*=\s*'(__MELLOW_[A-Za-z0-9_]+__)'/g;
  const bridges = new Map(); // name → { decl:Set, read:Set }
  for (const dir of BRIDGE_DIRS) {
    for (const file of walkAll(resolve(root, dir))) {
      const src = stripJsComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
      const keyConsts = [...src.matchAll(KEY_CONST_RE)].map((m) => [m[1], m[2]]);
      const rel = relative(root, file);
      const mark = (name, isDecl) => {
        const rec = bridges.get(name) ?? { decl: new Set(), read: new Set() };
        (isDecl ? rec.decl : rec.read).add(rel);
        bridges.set(name, rec);
      };
      for (const line of src.split('\n')) {
        for (const m of line.matchAll(BRIDGE_NAME_RE)) {
          mark(`__MELLOW_${m[1]}__`, isDeclAt(line, m.index, m[0].length));
        }
        for (const [constName, globalName] of keyConsts) {
          const idx = line.indexOf(`[${constName}]`);
          if (idx === -1) continue;
          mark(globalName, isDeclAt(line, idx, `[${constName}]`.length));
        }
      }
    }
  }
  if (bridges.size < 15) {
    fail(`桥扫描面异常：只找到 ${bridges.size} 个 __MELLOW_* 全局（基线 18）—— 解析可能失效，护栏需同步`);
  }
  const dead = [];
  const broken = [];
  for (const [name, rec] of bridges) {
    if (BRIDGE_EXTENSION_POINTS.has(name)) continue; // 扩展点：仓库内无声明处属设计
    if (rec.decl.size === 0) broken.push(name);
    if (rec.read.size === 0) dead.push(name);
  }
  if (dead.length > 0) {
    fail(`**死桥**（有声明但没人读）：${dead.join(', ')} —— 装了开关没人用，属「≠ 有消费方」母题`);
  }
  if (broken.length > 0) {
    fail(`**断桥**（有人读但没人声明）：${broken.join(', ')} —— 调用了一个不存在的全局，运行时静默失效`);
  }
  // canary：**用同一个 isDeclAt** 验两个方向（首版 canary 用的是另一份副本 → 没覆盖真实路径）
  const declSample = 'window.__MELLOW_X__ = { set: () => {} };';
  const readSample = 'window.__MELLOW_X__?.set?.(1);';
  const declIdx = declSample.indexOf('__MELLOW_X__');
  const readIdx = readSample.indexOf('__MELLOW_X__');
  if (!isDeclAt(declSample, declIdx, '__MELLOW_X__'.length)) {
    errors.push('桥完整性护栏 canary 失效：声明样本未被判为声明');
  }
  if (isDeclAt(readSample, readIdx, '__MELLOW_X__'.length)) {
    errors.push('桥完整性护栏 canary 失效：读取样本被误判为声明');
  }
  // canary：**常量间接**路径（`const K = '__MELLOW_X__'` → `win[K] = …`）必须被识别为声明
  const INDIRECT = "const K = '__MELLOW_Y__' as const;\nwin[K] = { ok: true };";
  const indirectConst = [...INDIRECT.matchAll(KEY_CONST_RE)].map((m) => [m[1], m[2]]);
  const indirectDecl = indirectConst.some(([constName, globalName]) =>
    INDIRECT.split('\n').some((line) => {
      const idx = line.indexOf(`[${constName}]`);
      return idx !== -1 && globalName === '__MELLOW_Y__' && isDeclAt(line, idx, `[${constName}]`.length);
    }));
  if (!indirectDecl) {
    errors.push('桥完整性护栏 canary 失效：常量间接的声明未被识别（会报假断桥）');
  }
  // canary：**小写桥名必须被识别**（防「正则比标识符窄 ⇒ 静默漏检」；见上方 BRIDGE_NAME_RE 的注释）
  if (![...'window.__MELLOW_shortcutApi__ = {};'.matchAll(BRIDGE_NAME_RE)].length) {
    errors.push('桥完整性护栏 canary 失效：小写桥名未被识别（正则比语言标识符窄 ⇒ 会静默漏检）');
  }
  if (![..."const K = '__MELLOW_mixedCase__';".matchAll(KEY_CONST_RE)].length) {
    errors.push('桥完整性护栏 canary 失效：常量间接路径下的小写桥名未被识别');
  }
}

// ── ⑥ 宿主→引擎的**启动状态下发**必须完整（2026-10-01，审计 §4.60）────────────
// 立此条的原因（两次实测）：
//   · **主题这一族**（编辑器主题 / md 排版 token / 编辑器字体）只在「主题变化」的 effect 里下发，
//     而该 effect **早于引擎就绪** → 冷启动即暗色时三次调用**静默 no-op**：编辑器用**默认（亮）主题**
//     渲染、`--mellow-md-*` **全空**；
//   · **`appearance.toolbar`**（格式工具栏开关）**只在菜单/设置回调里**下发 → 用户关掉后**重启又出现**。
// 共同形态：**「把持久化设置应用到运行时」是按「族」发生的**；补了一族 ≠ 补了全部。
// **为什么长期没发现**：已有的 e2e 与视觉 Golden **都在默认值下采样** ——
// 「默认能跑」被当成了「能跑」。
//
// 判据：宿主→引擎的**每个**状态 `set*` 都必须出现在 App.tsx 的
// `STARTUP_STATE_APPLY_BEGIN/END` 区间内（该区间位于「引擎就绪」回调里）。
// 新增一个 set* 却忘了在就绪时下发 → 本护栏失败。
{
  const APP = 'apps/desktop/src/App.tsx';
  const BEGIN = '>>> STARTUP_STATE_APPLY_BEGIN';
  const END = '<<< STARTUP_STATE_APPLY_END';
  // 宿主→引擎的**状态类** set*（editor-core 契约；不含按文档/按交互驱动的 setDocumentPath / setLargeFileMode）
  const STARTUP_STATE_SETTERS = [
    'setFontSize', 'setFontFace', 'setLineHeight', 'setShowLineNumbers', 'setLineWrapping',
    'setContentMaxWidth', 'setAutoPair', 'setMarkdownSyntaxPairs', 'setDefaultCodeLang',
    'setCodeIndentSize', 'setTabKeyBehavior', 'setFirstLineIndent', 'setAllowMagnification',
    'setSpellcheckEnabled', 'setSmartPunctuationEnabled', 'setSmartPunctuationOnRenderEnabled', 'setCodeLineNumbersEnabled',
    'setTypewriterMode', 'setFocusMode', 'setSelectionToolbarEnabled',
    'setTheme', 'setMdTokens', 'setEngineLocale',
  ];
  const app = readFileSync(resolve(root, APP), 'utf8');
  const b = app.indexOf(BEGIN);
  const e = app.indexOf(END);
  if (b < 0 || e < 0 || e < b) {
    fail(`${APP} 缺少 STARTUP_STATE_APPLY 区间标记（${BEGIN} / ${END}）—— `
      + '本护栏靠它切片；标记被删/改名会让判据静默失效');
  } else {
    const slice = app.slice(b, e);
    // ⚠️ 判据必须落在**调用形态**上，不能只查「名字出现过」—— 实测：抽掉
    // `host.setSelectionToolbarEnabled(on)` 后，**同名的状态 setter** `setSelectionToolbarEnabledState(on)`
    // 仍让子串匹配成立 → 护栏没翻转（「判据被相似标识符满足」，skill §7 的形态）。
    // 两种合法形态：`host.<name>(`（直接方法）或 `'<name>'`（setEditorConfig 的子方法名字面量）。
    const calledInStartup = (m) => slice.includes(`host.${m}(`) || slice.includes(`'${m}'`);
    const missing = STARTUP_STATE_SETTERS.filter((m) => !calledInStartup(m));
    if (missing.length > 0) {
      fail(`宿主→引擎的启动状态下发不完整 —— 以下 set* **不在**「引擎就绪」区间内：${missing.join(' / ')}`
        + '（冷启动时会用**默认值**，用户改过设置后才会暴露；见审计 §4.60）');
    }
    // canary：逐方向 —— ① 合规样本通过；② 抽掉一个**直接方法**必须被检出；
    // ③ 只剩同名 setter（无 host. 前缀）必须被检出为**缺失**。
    const synthMissing = (src) => STARTUP_STATE_SETTERS.filter((m) => !(src.includes(`host.${m}(`) || src.includes(`'${m}'`)));
    const allOk = STARTUP_STATE_SETTERS.map((m) => `host.${m}();`).join('\n');
    if (synthMissing(allOk).length !== 0) {
      errors.push('启动状态下发护栏 canary 失效：全部 set* 都在的样本被判为缺失');
    }
    const dropped = STARTUP_STATE_SETTERS.filter((m) => m !== 'setSelectionToolbarEnabled').map((m) => `host.${m}();`).join('\n');
    if (synthMissing(dropped).length !== 1 || synthMissing(dropped)[0] !== 'setSelectionToolbarEnabled') {
      errors.push('启动状态下发护栏 canary 失效：抽掉一个 set* 未被检出');
    }
    // 反例锁：**只有同名状态 setter**（无 host. 前缀、无字面量）不得算作已下发
    if (synthMissing('setSelectionToolbarEnabledState(true);').length !== STARTUP_STATE_SETTERS.length) {
      errors.push('启动状态下发护栏 canary 失效：同名状态 setter 被误判为「已下发」');
    }
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Adapter contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Adapter contract: core packages platform-neutral (0 runtime Tauri tokens, 0 platform APIs); bridge chain anchored (editor-core contract → desktop adapter → Rust bridge_call); 3-platform bundle matrix + .md file association + updater artifacts; every __MELLOW_* bridge has both a declaration site and a reader (no dead/broken bridge); drift canary armed');
