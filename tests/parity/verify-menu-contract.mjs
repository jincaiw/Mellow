/**
 * 菜单契约护栏（P1-1.10，P1-1.3 单一真源改造后为 schema 侧校验）
 *
 * 目标：把 V3/V4 审计里反复出现的菜单类缺陷（顺序漂移、separator 丢失、
 * 快捷键双真源、checkState 缺失、文案漏译、主题列表硬编码、Rust 越权）变成
 * 机器可判定的 schema diff，而不是人工 review。
 *
 * 单一真源架构（V4.0 §7.4 硬规则）：
 *   packages/commands/src/menuSchema.ts（MENU_SCHEMA 声明表 + 三平台 shortcut）
 *     → SCHEMA_SHORTCUTS 注入 App.tsx CommandRegistry（键盘与菜单同键位）
 *     → toNativeMenuSpec（locale 文案 / recent files / BUILTIN_THEMES / checkState）
 *     → Rust menu.rs 只做 materialization（无文案、无主题列表、无状态）
 *
 * 规范依据：
 * - docs/plans/typora-parity-master-plan.md §7.7（菜单与快捷键合同）
 * - docs/plans/typora-parity-master-plan.md §8.W1（Command 单一真源硬规则）
 * - 历史论证见 docs/plans/archive/typora-parity-final-plan-v4.md §7.2 / §7.4
 * - packages/commands/src/menuContract.ts（顶层菜单产品合同）
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const schemaSource = readFileSync(resolve(root, 'packages/commands/src/menuSchema.ts'), 'utf8').replace(/\r\n/g, '\n');
const appSource = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8').replace(/\r\n/g, '\n');
const nativeMenuSource = readFileSync(resolve(root, 'apps/desktop/src/nativeMenu.ts'), 'utf8').replace(/\r\n/g, '\n');
const menuRsSource = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/menu.rs'), 'utf8').replace(/\r\n/g, '\n');
const messagesSource = readFileSync(resolve(root, 'packages/i18n/src/messages.ts'), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

/**
 * 剥离注释后的源码。用于「反残留」类断言：解释性注释会合法提及已退役的键名 /
 * 类名（例如说明「此前存在 mellow.editor.toolbarVisible」），若直接对原文做
 * `includes` 会误报。剥块注释（含 JSX {/* *\/}）后再剥行注释。
 */
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');
const appCode = stripComments(appSource);

// ── MENU_SCHEMA 解析（按缩进重建菜单树；schema 为单行条目的声明表）──────────
function parseMenuSchema(src) {
  const start = src.indexOf('export const MENU_SCHEMA');
  if (start === -1) throw new Error('menuSchema.ts 缺少 MENU_SCHEMA');
  const roots = [];
  // stack: { indent, list }，list 为该层的 entries 数组
  const stack = [];
  let current = null; // 当前层 entries
  for (const line of src.slice(start).split('\n').slice(1)) {
    if (/^];/.test(line)) break;
    const indentMatch = line.match(/^(\s*)\{\s*(.*)$/);
    if (!indentMatch) continue;
    const indent = indentMatch[1].length;
    const body = indentMatch[2];
    // 弹栈到正确层级
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    current = stack.length === 0 ? roots : stack[stack.length - 1].list;
    const id = /(?:^|[,{\s])id: '([^']+)'/.exec(body)?.[1];
    const labelKey = /labelKey: '([^']+)'/.exec(body)?.[1];
    const isRoot = /^id: '/.test(body) && /entries: \[\s*$/.test(body);
    if (isRoot) {
      const node = { id, labelKey, macOnly: /macOnly: true/.test(body), entries: [] };
      current.push({ kind: 'root', ...node });
      stack.push({ indent, list: node.entries });
      continue;
    }
    if (/kind: 'separator'/.test(body)) {
      current.push({ kind: 'separator' });
      continue;
    }
    if (/kind: 'dynamic'/.test(body)) {
      current.push({ kind: 'dynamic', dynamic: /dynamic: '([^']+)'/.exec(body)[1] });
      continue;
    }
    if (/kind: 'submenu'/.test(body)) {
      const node = { kind: 'submenu', id, labelKey, entries: [] };
      current.push(node);
      stack.push({ indent, list: node.entries });
      continue;
    }
    if (/kind: 'predefined'/.test(body)) {
      current.push({ kind: 'predefined', predefined: /predefined: '([^']+)'/.exec(body)?.[1], labelKey });
      continue;
    }
    if (/kind: 'command'/.test(body)) {
      const shortcutBody = /shortcut: \{([^}]*)\}/.exec(body);
      const entry = { kind: 'command', id, labelKey };
      if (shortcutBody) {
        entry.shortcut = {};
        const mac = /mac: '([^']+)'/.exec(shortcutBody[1]);
        const win = /winLinux: '([^']+)'/.exec(shortcutBody[1]);
        if (mac) entry.shortcut.mac = mac[1];
        if (win) entry.shortcut.winLinux = win[1];
      }
      const checkedFrom = /checkedFrom: '([^']+)'/.exec(body);
      if (checkedFrom) entry.checkedFrom = checkedFrom[1];
      if (/macOnly: true/.test(body)) entry.macOnly = true;
      if (/debugOnly: true/.test(body)) entry.debugOnly = true;
      current.push(entry);
    }
  }
  return roots;
}

function* walkEntries(entries) {
  for (const entry of entries) {
    yield entry;
    if (entry.kind === 'submenu') yield* walkEntries(entry.entries);
  }
}

const MENU_SCHEMA = parseMenuSchema(schemaSource);
const allEntries = () => MENU_SCHEMA.flatMap((rootEntry) => [...walkEntries(rootEntry.entries)]);
const schemaCommandIds = new Set(allEntries().filter((e) => e.kind === 'command').map((e) => e.id));
const schemaShortcuts = new Map(
  allEntries().filter((e) => e.kind === 'command' && e.shortcut).map((e) => [e.id, e.shortcut]),
);

// ── 1. 顶层菜单顺序（产品合同：app(mac) → File → … → Help）────────────────
const TYPOGRAPHIC_MENU_ORDER = ['file', 'edit', 'paragraph', 'format', 'view', 'theme', 'window', 'help'];
const rootIds = MENU_SCHEMA.map((r) => r.id);
if (JSON.stringify(rootIds) !== JSON.stringify(['app', ...TYPOGRAPHIC_MENU_ORDER])) {
  fail(`顶层菜单顺序违反产品合同：${rootIds.join(' → ')}`);
}
// B3（第四轮）：window 顶层菜单仅 macOS（Typora Windows/Linux 无「窗口」菜单，
// 最小化/还原由系统标题栏承担）。平台差异在 spec 侧（macOnly）完成，Rust 零分支。
const macOnlyRoots = MENU_SCHEMA.filter((r) => r.macOnly).map((r) => r.id);
if (JSON.stringify(macOnlyRoots) !== JSON.stringify(['app', 'window'])) {
  fail(`macOnly 顶层菜单集合漂移：应为 [app, window]，实际 ${macOnlyRoots.join(', ')}`);
}
if (!MENU_SCHEMA[0].macOnly) fail('应用菜单必须声明 macOnly（Windows/Linux 不得出现应用菜单）');

// ── 1b. 跨入口菜单合同（packages/commands/src/menuContract.ts）必须与 schema 一致 ──
// 立此节的原因（2026-09-30）：**本文件头声称覆盖 `menuContract.ts`，但实际从未读取它** ——
// 上面第 1 节把顶层顺序**自己硬编码**了一份（`const TYPOGRAPHIC_MENU_ORDER = [...]`），
// 只与 schema 比对。于是出现**三份**顶层顺序副本，其中 `menuContract.ts` 那份**无人核对**：
// 它是从包入口 `export *` 出去的公开合同，且 `MENU_COMMAND_CONTRACT` 还额外声明了
// 15 条高频命令的归属 —— 把 schema 里 `format.link` 挪到 paragraph，本护栏（只比顺序）照样通过。
// 这是「声称的覆盖 ≠ 实际的覆盖」的又一实例（与「菜单护栏谎称读了本机 Typora」同类）。
{
  const contractPath = resolve(root, 'packages/commands/src/menuContract.ts');
  if (!existsSync(contractPath)) {
    fail('packages/commands/src/menuContract.ts 不存在（跨入口菜单合同缺失，本护栏头部声称覆盖它）');
  } else {
    const contractRaw = readFileSync(contractPath, 'utf8').replace(/\r\n/g, '\n');
    // ⚠️ **先剥注释再解析**：本文件（以及 contract 自身）的注释里会**引用**条目文本
    // （例如「已移除 `{ id: 'settings.open', menu: 'help' }`」），
    // 不剥注释就会把注释当成真条目 —— 实测踩到：注释里的旧条目被解析出来并报成违规。
    const stripComments = (code) => code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const contractSrc = stripComments(contractRaw);
    const orderBlock = /TYPOGRAPHIC_MENU_ORDER\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(contractSrc)?.[1] ?? '';
    const contractOrder = [...orderBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (contractOrder.length === 0) {
      fail('无法从 menuContract.ts 解析 TYPOGRAPHIC_MENU_ORDER（护栏需同步更新，不要静默漏检）');
    } else if (JSON.stringify(contractOrder) !== JSON.stringify(TYPOGRAPHIC_MENU_ORDER)) {
      fail(`menuContract.ts 的 TYPOGRAPHIC_MENU_ORDER 与产品合同不一致：`
        + `${contractOrder.join(' → ')}（应为 ${TYPOGRAPHIC_MENU_ORDER.join(' → ')}）`);
    }
    // 命令归属：contract 声明的 menu 必须等于它在 schema 里的**实际**顶层菜单。
    // 动态派生 id（schema 只声明占位、id 运行时展开）**不盲目豁免** ——
    // 改为校验它归属「**声明该动态占位的那一级**」，即 `theme.apply.*` 必须落在
    // 含 `dynamic: 'themes'` 的那一级。前缀与所属级都**从 schema 派生**，不硬编码：
    // 新增一种动态类型而护栏不认识时**响亮失败**（而不是把新形态静默放过）。
    const DYNAMIC_PREFIX = { 'recent-files': 'recent.file::', themes: 'theme.apply.' };
    const declaredDynamic = new Set(
      [...schemaSource.matchAll(/kind:\s*'dynamic',\s*dynamic:\s*'([^']+)'/g)].map((m) => m[1]),
    );
    const unknownDynamic = [...declaredDynamic].filter((k) => !(k in DYNAMIC_PREFIX));
    if (unknownDynamic.length > 0) {
      fail(`schema 声明了护栏不认识的动态菜单类型：${unknownDynamic.join(', ')}`
        + '（请在 DYNAMIC_PREFIX 中登记其 id 前缀与所属级，不要静默放过）');
    }
    // 动态类型 → 声明它的顶层菜单 id
    const dynamicRootOf = new Map();
    for (const rootEntry of MENU_SCHEMA) {
      for (const e of rootEntry.entries) {
        if (e.kind === 'dynamic' && e.dynamic) dynamicRootOf.set(e.dynamic, rootEntry.id);
      }
    }
    const dynamicMatch = (id) => [...declaredDynamic]
      .find((k) => DYNAMIC_PREFIX[k] && id.startsWith(DYNAMIC_PREFIX[k])) ?? null;

    const rootOfCommand = new Map();
    for (const rootEntry of MENU_SCHEMA) {
      for (const e of walkEntries(rootEntry.entries)) {
        if (e.kind === 'command') rootOfCommand.set(e.id, rootEntry.id);
      }
    }
    // OS 预定义角色 ↔ 合同里的命令 id：`{ kind: 'predefined', predefined: 'undo' }`
    // 没有 command id，但合同用 `edit.undo` 指代它（该 id 在 CommandRegistry 里存在，
    // 菜单侧则由 OS 角色物化）。这是**少数几条显式映射**，登记在此并配 canary。
    const PREDEFINED_ROLE_ID = { undo: 'edit.undo', redo: 'edit.redo' };
    for (const rootEntry of MENU_SCHEMA) {
      for (const e of walkEntries(rootEntry.entries)) {
        if (e.kind === 'predefined' && e.predefined && PREDEFINED_ROLE_ID[e.predefined]) {
          rootOfCommand.set(PREDEFINED_ROLE_ID[e.predefined], rootEntry.id);
        }
      }
    }
    const contractPairs = [...contractSrc.matchAll(/\{\s*id:\s*'([^']+)',\s*menu:\s*'([^']+)'\s*\}/g)]
      .map((m) => ({ id: m[1], menu: m[2] }));
    if (contractPairs.length === 0) {
      fail('无法从 menuContract.ts 解析 MENU_COMMAND_CONTRACT（护栏需同步更新，不要静默漏检）');
    }
    for (const { id, menu } of contractPairs) {
      const dynKind = dynamicMatch(id);
      if (dynKind !== null) {
        const expectedRoot = dynamicRootOf.get(dynKind);
        if (expectedRoot === undefined) {
          fail(`menuContract.ts 的动态 id ${id} 找不到对应的 dynamic 占位（${dynKind}）`);
        } else if (expectedRoot !== menu) {
          fail(`menuContract.ts 的动态 id 归属不一致：${id} 合同写 ${menu}，`
            + `但声明 ${dynKind} 占位的是 ${expectedRoot}`);
        }
        continue;
      }
      const actual = rootOfCommand.get(id);
      if (actual === undefined) {
        fail(`menuContract.ts 声明了 schema 中不存在的命令：${id}（合同与真值源脱节）`);
      } else if (actual !== menu) {
        fail(`menuContract.ts 与 schema 的命令归属不一致：${id} 合同写 ${menu}，schema 实际在 ${actual}`);
      }
    }
    // canary：自检这两条交叉锁（样本拼接构造，避免护栏检出自己）
    const CONTRACT_SAMPLE = "export const TYPOGRAPHIC_MENU_ORDER = ['file', 'edit']" + " as const;";
    const sampleOrder = [...(/TYPOGRAPHIC_MENU_ORDER\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(CONTRACT_SAMPLE)?.[1] ?? '')
      .matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (JSON.stringify(sampleOrder) !== JSON.stringify(['file', 'edit'])) {
      errors.push('menuContract 顺序锁 canary 失效：样本顺序未被解析');
    }
    const PAIR_SAMPLE = "{ id: 'file.new', menu: 'file' }";
    const samplePairs = [...PAIR_SAMPLE.matchAll(/\{\s*id:\s*'([^']+)',\s*menu:\s*'([^']+)'\s*\}/g)];
    if (samplePairs.length !== 1 || samplePairs[0][1] !== 'file.new') {
      errors.push('menuContract 归属锁 canary 失效：样本命令未被解析');
    }
    // canary：动态前缀豁免必须只放行动态 id
    const DYN_SAMPLE = 'theme.apply.' + 'mellow-light';
    if (dynamicMatch(DYN_SAMPLE) !== 'themes') {
      errors.push('menuContract 动态归属 canary 失效：动态样本未被识别为 themes');
    }
    if (dynamicMatch('file.save') !== null) {
      errors.push('menuContract 动态归属 canary 失效：静态命令被误判为动态');
    }
  }
}

// ── 2. 命令覆盖：schema 命令 id 必须能被前端 CommandRegistry 处理 ───────────
const desktopCommandIds = new Set([...appSource.matchAll(/\{\s*\n?\s*id: '([^']+)'/g)].map((m) => m[1]));
const unhandled = [...schemaCommandIds].filter((id) => !desktopCommandIds.has(id));
if (unhandled.length > 0) fail(`schema 命令缺少 CommandRegistry 注册: ${unhandled.join(', ')}`);

// ── 3. 主题菜单从 Theme Registry 派生（§7.4 硬规则 4）─────────────────────
const themeRoot = MENU_SCHEMA.find((r) => r.id === 'theme');
const themeEntries = themeRoot?.entries ?? [];
if (!themeEntries.some((e) => e.kind === 'dynamic' && e.dynamic === 'themes')) {
  fail('主题菜单必须包含 dynamic: themes 占位（从 Theme Registry 派生）');
}
if (allEntries().some((e) => e.kind === 'command' && /^theme\.apply\./.test(e.id))) {
  fail('主题命令 id 不得静态声明（theme.apply.* 必须由 dynamic: themes 生成）');
}
if (/mellow-light/.test(menuRsSource)) fail('Rust menu.rs 不得硬编码主题列表（P1-1.5：主题从 Theme Registry 派生）');
if (!nativeMenuSource.includes('BUILTIN_THEMES')) fail('nativeMenu.ts 必须从 BUILTIN_THEMES 派生主题菜单');
if (!appSource.includes("invoke('set_menu_spec'")) fail('App.tsx 必须经 set_menu_spec 下发 NativeMenuSpec');

// ── 4. Rust menu.rs 降级为 materialization Adapter（§7.4 硬规则 6）─────────
const menuRsCode = menuRsSource.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
if (/MENU_LABELS/.test(menuRsCode)) fail('Rust menu.rs 不得再持有 MENU_LABELS（文案真源已迁 i18n menu.*）');
for (const legacy of ['set_menu_locale', 'set_recent_files', 'set_theme_selection', 'set_spellcheck_state', 'set_smart_punct_state']) {
  if (menuRsCode.includes(legacy)) fail(`Rust menu.rs 不得再保留旧状态同步命令: ${legacy}`);
}
if (!menuRsSource.includes('serde::Deserialize') || !menuRsSource.includes('pub fn set_menu_spec')) {
  fail('Rust menu.rs 必须实现 set_menu_spec + serde::Deserialize materialization');
}
if (/#\[cfg\(target_os/.test(menuRsSource)) {
  fail('Rust menu.rs 菜单结构不得使用 #[cfg(target_os)] 分支（平台差异在 spec 侧完成）');
}

// ── 4b. 勾选态必须「任一入口改动后都重建菜单」+ 前端不得调用已移除的 legacy 命令 ──
// 缺陷族（2026-09-30 实测）：`checkedFrom` 的勾选值来源分两类 ——
//   · React state（statusbar / toolbar / themeMode / activeThemeId）→ 在 effect 依赖数组里，天然重建；
//   · **localStorage**（spellcheck / smartPunct / firstLineIndent）→ 依赖 `menuCheckTick` 自增。
// 实测：**菜单入口**的三条命令都自增了 tick ✓，但**设置面板入口**（`applySetting` 的对应分支）
// **漏了 tick** → 「在设置里改了，Edit 菜单的勾选态不变」（反方向则正常）。
// 同时，旧机制 `invoke('set_spellcheck_state')` 仍在设置路径里被调用 —— 该命令已被架构移除
// （菜单改为整体 `set_menu_spec` 重建）且**上一节明令禁止 Rust 侧复活**，调用点还用
// `.catch(() => undefined)` 吞掉失败 → 看着像在同步，其实没有。
// 故本节把「两端」同时锁上：**Rust 不得复活旧命令**（§4）＋ **前端不得调用旧命令**（本节）。
{
  const LS_CHECKED_SETTINGS = [
    // [设置项 id, applySetting 里的定位标记, 菜单命令 id, 标记类型]
    // ⚠️ 切窗**不能**用固定长度：case 内可能有大段中文注释（实测 ~350 字符），
    // 固定窗口会够不到断言目标 → 误报「未自增」（护栏首跑即踩到）。
    // 故：case 型切到该 case 的 `break;`；单行分支型只切该行。
    ['editor.spellcheck', "case 'settings.spellcheck':", 'edit.spellcheck.toggle', 'case'],
    ['editor.smartPunctuation', "case 'settings.smartPunctuation':", 'edit.smartPunctuation.toggle', 'case'],
    ['editor.firstLineIndent', "def.id === 'editor.firstLineIndent'", 'edit.firstLineIndent.toggle', 'line'],
  ];
  const applyStart = appSource.indexOf('const applySetting = useCallback');
  const applyEnd = applyStart < 0 ? -1 : appSource.indexOf('\n  }, [', applyStart);
  const applyBody = (applyStart < 0 || applyEnd < 0) ? '' : appSource.slice(applyStart, applyEnd);
  if (applyBody === '') {
    fail('无法定位 App.tsx 的 applySetting（切片失败）→ 请同步更新本护栏，不要让它静默漏检');
  } else {
    for (const [settingId, caseMarker, commandId, scope] of LS_CHECKED_SETTINGS) {
      // ① 设置面板入口：applySetting 的对应分支必须自增 tick
      const idx = applyBody.indexOf(caseMarker);
      if (idx < 0) {
        fail(`applySetting 找不到 ${settingId} 的分支（标记 ${caseMarker}）→ 护栏需同步更新`);
        continue;
      }
      const slice = scope === 'case'
        ? (() => {
          const brk = applyBody.indexOf('break;', idx);
          return applyBody.slice(idx, brk < 0 ? idx + 1200 : brk);
        })()
        : applyBody.slice(idx, applyBody.indexOf('\n', idx) < 0 ? idx + 300 : applyBody.indexOf('\n', idx));
      if (!/setMenuCheckTick\(/.test(slice)) {
        fail(
          `${settingId} 的**设置面板入口**未自增 menuCheckTick → `
          + '「在设置里改了，Edit 菜单的勾选态不变」（菜单入口正常，故屏幕上看不出问题出在设置侧）',
        );
      }
      // ② 菜单入口：命令体也必须自增 tick（两条入口同进同退）
      const cmdIdx = appSource.indexOf(`id: '${commandId}'`);
      if (cmdIdx < 0) {
        fail(`App.tsx 找不到命令 ${commandId}（菜单勾选态入口）→ 护栏需同步更新`);
        continue;
      }
      if (!/setMenuCheckTick\(/.test(appSource.slice(cmdIdx, cmdIdx + 500))) {
        fail(`${commandId} 的菜单入口未自增 menuCheckTick → 勾选态不跟随`);
      }
    }
  }
  // 前端不得调用已移除的 legacy 状态同步命令（与 §4 的 Rust 侧禁令互补）
  const legacyCalls = ['set_menu_locale', 'set_recent_files', 'set_theme_selection', 'set_spellcheck_state', 'set_smart_punct_state'];
  const appCode = appSource.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  for (const legacy of legacyCalls) {
    if (new RegExp(`invoke(?:\\(|<[^>]*>\\()\\s*'${legacy}'`).test(appCode)) {
      fail(`App.tsx 仍在调用已移除的状态同步命令 ${legacy}（架构已改为整体 set_menu_spec；该调用必然失败且被 catch 吞掉）`);
    }
  }
  // canary：① 去掉 tick 必须被检出；② legacy 调用必须被检出
  const tickDrift = applyBody.replace(/setMenuCheckTick\(/g, 'noopCheckTick(');
  if (tickDrift === applyBody || /setMenuCheckTick\(/.test(tickDrift)) {
    fail('勾选态重建 canary 失效：无法模拟「去掉 tick」的漂移');
  }
  const legacySample = "invoke('set_spellcheck_state', { checked: true })";
  if (!/invoke(?:\(|<[^>]*>\()\s*'set_spellcheck_state'/.test(legacySample)) {
    fail('legacy 调用 canary 失效：样本未被检出');
  }
  if (/invoke(?:\(|<[^>]*>\()\s*'set_spellcheck_state'/.test("invoke('set_something_else')")) {
    fail('legacy 调用 canary 失效：无关命令被误判为 legacy');
  }
}

// ── 5. 文件菜单条目顺序（§7.2，separator 一并纳入 diff）────────────────────
const SEP = { kind: 'separator' };
const FILE_MENU_CONTRACT = [
  { kind: 'command', id: 'file.new' },
  { kind: 'command', id: 'file.newWindow' },
  SEP,
  { kind: 'command', id: 'file.open' },
  { kind: 'submenu', id: 'file.recent' },
  { kind: 'command', id: 'file.reopenClosed' }, // V7-W1.1：Typora「重新打开关闭的文件」
  { kind: 'command', id: 'quickOpen.open' },
  { kind: 'command', id: 'workspace.openFolder' },
  SEP,
  { kind: 'command', id: 'file.info' },
  { kind: 'command', id: 'file.revealInFileList' },
  { kind: 'command', id: 'file.revealInFileTree' },
  { kind: 'command', id: 'file.revealInFinder' },
  SEP,
  { kind: 'command', id: 'file.moveTo' },
  { kind: 'command', id: 'file.trash' },
  SEP,
  { kind: 'command', id: 'file.closeWindow' }, // B1：⌘W 关闭窗口（mac performClose: 真值）
  { kind: 'command', id: 'file.closeAll' },
  SEP,
  { kind: 'command', id: 'file.save' },
  { kind: 'command', id: 'file.saveAs' },
  { kind: 'command', id: 'file.saveAll' },
  { kind: 'command', id: 'file.reloadFromDisk' },
  SEP,
  { kind: 'command', id: 'file.import' },
  { kind: 'submenu', id: 'file.export' },
  { kind: 'command', id: 'file.pageSetup' },
  { kind: 'command', id: 'file.print' },
  SEP,
  { kind: 'command', id: 'file.openSnapshotsFolder' }, // §7.2：快照不得插入高频组
];
const renderSeq = (items) => items.map((it) => (it.kind === 'separator' ? '──' : it.kind === 'submenu' ? `[${it.id}]` : it.id)).join(' | ');
const fileRoot = MENU_SCHEMA.find((r) => r.id === 'file');
const fileItems = fileRoot?.entries ?? [];
if (fileItems.length !== FILE_MENU_CONTRACT.length || fileItems.some((it, i) => {
  const want = FILE_MENU_CONTRACT[i];
  return it.kind !== want.kind || (want.kind !== 'separator' && it.id !== want.id);
})) {
  fail(`File menu order violates plan §7.2\n    expected: ${renderSeq(FILE_MENU_CONTRACT)}\n    actual:   ${renderSeq(fileItems)}`);
}

// ── 6. 双语完整：schema 用到的每个 labelKey 都必须在 i18n menu.* 有中英文 ──
/**
 * 解析某个 locale 块的 key → value。
 * @param name 块名（zhCN / enUS）
 * @param prefix 只保留该前缀的键；传 '' 表示不过滤（§12 文案合同需要取 contextmenu.* 键）
 */
function parseLocaleBlock(name, prefix = 'menu.') {
  // 声明形式兼容类型注解：const zhCN = { / const enUS: Record<keyof typeof zhCN, string> = {
  const decl = new RegExp(`const ${name}[^=\\n]*= \\{`).exec(messagesSource);
  const startIdx = decl?.index ?? -1;
  if (startIdx === -1) throw new Error(`messages.ts 缺少 locale 块 ${name}`);
  // 定界 = 起始之后第一个行首 `}`。注意：zhCN 以 `} as const;` 结束，早期实现用
  // indexOf('\n};') 会跨过它一直找到 enUS 结尾，使 zh-CN 文案从未被真正校验
  // （en 值覆盖 zh 值，缺译检查恒绿）—— 此处修正为行首 `}` 定界。
  const rest = messagesSource.slice(startIdx);
  const endRel = rest.search(/^}/m);
  const block = endRel === -1 ? rest : rest.slice(0, endRel);
  const map = new Map();
  for (const [, key, value] of block.matchAll(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',/gm)) {
    if (prefix === '' || key.startsWith(prefix)) map.set(key, value);
  }
  return map;
}
const zhMenu = parseLocaleBlock('zhCN');
const enMenu = parseLocaleBlock('enUS');
// 动态项（如「打开最近文件」空态占位）不走 `labelKey:` 声明，而是直接
// `input.translate('menu.*')` —— 不把这部分计入引用集合，它们会被误判为孤儿文案。
const translateKeys = [...schemaSource.matchAll(/input\.translate\('([^']+)'\)/g)].map((m) => m[1]);
const usedLabelKeys = new Set([
  ...MENU_SCHEMA.map((r) => r.labelKey),
  ...allEntries().flatMap((e) => (e.labelKey ? [e.labelKey] : [])),
  ...translateKeys,
]);
for (const key of usedLabelKeys) {
  if (!zhMenu.has(key)) fail(`菜单 labelKey 缺少 zh-CN 文案: ${key}`);
  else if (zhMenu.get(key).trim() === '') fail(`菜单 zh-CN 文案为空: ${key}`);
  if (!enMenu.has(key)) fail(`菜单 labelKey 缺少 en-US 文案: ${key}`);
  else if (enMenu.get(key).trim() === '') fail(`菜单 en-US 文案为空: ${key}`);
}
// 孤儿 key 检测：i18n 中 menu.* 必须被 schema 引用或登记白名单
// ⚠️ **字面登记的条目**单独列出 —— 只有它们需要「双向核对」（`menu.theme.*` 是**派生**的 ⇒ 无需核对）
const ORPHAN_ALLOWED_LITERAL = new Set([
  'menu.top.insert', // 预留：插入类顶层菜单（当前归入段落/格式，暂未装配）
]);
const ORPHAN_ALLOWED = new Set([
  ...ORPHAN_ALLOWED_LITERAL,
  ...[...zhMenu.keys()].filter((k) => k.startsWith('menu.theme.')),
]);
for (const key of zhMenu.keys()) {
  if (!usedLabelKeys.has(key) && !ORPHAN_ALLOWED.has(key)) fail(`i18n 孤儿菜单文案（schema 未引用）: ${key}`);
}
// ⚠️ **双向核对（2026-10-09，审计 §4.214）**：登记的「孤儿豁免」必须**仍是孤儿** ——
//   否则是**过期条目**：留着会让该 key 将来真变孤儿时**静默免检**
//   （同 §4.213 的死豁免盲区：**豁免按「对象」核，不按「曾经是孤儿」核**）。
for (const key of ORPHAN_ALLOWED_LITERAL) {
  if (!zhMenu.has(key)) {
    fail(`孤儿菜单豁免 ${key} 已过期：i18n 里已无此 key —— 请删除该例外条目`);
  } else if (usedLabelKeys.has(key)) {
    fail(`孤儿菜单豁免 ${key} 已过期：schema 已引用它（**不再是孤儿**）—— 请删除该例外条目`);
  }
}

// ── 7. 快捷键单一真源（§7.4 硬规则 2）────────────────────────────────────
// schema 是唯一声明处；App.tsx 仅允许 SCHEMA_SHORTCUTS 注入 + 平台互补白名单。
const INLINE_SHORTCUT_ALLOWED = new Set([
  'settings.open', // schema 仅 mac（app 菜单），内联补充 Win/Linux Ctrl+,（键盘）
  // ⚠️ **2026-10-09（审计 §4.214）删除了 `export.repeat`** —— 原注「schema 仅 Win/Linux，
  //   内联补充 mac Ctrl+E」，但**实测 `menuSchema.ts:150` 已不再声明它的 shortcut**
  //   ⇒ 上面的 `!schemaShortcuts.has(id)` 已经跳过它 ⇒ **该条目什么都不做**（死条目）。
  //   （**双向核对**当场报出：「已不再声明它的快捷键」—— 这正是它存在的意义。）
]);
const commandBlocks = [];
{
  const starts = [...appSource.matchAll(/\{\s*\n?\s*id: '/g)].map((m) => m.index);
  for (let i = 0; i < starts.length; i += 1) {
    const block = appSource.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined);
    const id = /\{\s*\n?\s*id: '([^']+)'/.exec(block)?.[1];
    if (id) commandBlocks.push({ id, block });
  }
}
for (const { id, block } of commandBlocks) {
  if (!schemaShortcuts.has(id) || INLINE_SHORTCUT_ALLOWED.has(id)) continue;
  if (/shortcut:\s*(\{[^}]*\}|COMMAND_PALETTE_SHORTCUT)/.test(block)) {
    fail(`快捷键双真源：${id} 的 shortcut 已在 menuSchema.ts 声明，App.tsx 不得内联重复（由 SCHEMA_SHORTCUTS 注入）`);
  }
}
if (!appSource.includes('SCHEMA_SHORTCUTS.get(command.id)')) {
  fail('App.tsx 缺少 SCHEMA_SHORTCUTS 快捷键注入（§7.4 硬规则 2）');
}
// ⚠️ **双向核对（2026-10-09，审计 §4.214）**：登记的「内联快捷键豁免」必须**仍在使用** ——
//   该 id 必须**仍被 schema 声明快捷键**、**且** App.tsx **仍内联**它；否则例外什么都不做（过期条目）
//   ⇒ 留着会让「**双真源**」在将来**静默免检**（同 §4.213 的死豁免盲区）。
const inlineShortcutIds = new Set(commandBlocks
  .filter(({ block }) => /shortcut:\s*(\{[^}]*\}|COMMAND_PALETTE_SHORTCUT)/.test(block))
  .map(({ id }) => id));
for (const id of INLINE_SHORTCUT_ALLOWED) {
  if (!schemaShortcuts.has(id)) {
    fail(`内联快捷键豁免 ${id} 已过期：menuSchema.ts 已不再声明它的快捷键 —— 请删除该例外条目`);
  } else if (!inlineShortcutIds.has(id)) {
    fail(`内联快捷键豁免 ${id} 已过期：App.tsx 已不再内联它的快捷键 —— 请删除该例外条目`);
  }
}

// D1 决议：Win/Linux 9 处官方键位契约（对照 Typora 官方 Shortcut Keys，防回归漂移）
const D1_OFFICIAL_KEYS = [
  ['file.new', 'Ctrl+N'],
  ['file.newWindow', 'Ctrl+Shift+N'],
  ['insert.image', 'Ctrl+Shift+I'],
  ['format.quote', 'Ctrl+Shift+Q'],
  ['format.orderedList', 'Ctrl+Shift+['],
  ['format.list', 'Ctrl+Shift+]'],
  ['format.strike', 'Alt+Shift+5'],
  ['format.code', 'Ctrl+Shift+`'],
  ['format.codeBlock', 'Ctrl+Shift+K'],
  ['format.mathBlock', 'Ctrl+Shift+M'],
];
for (const [id, key] of D1_OFFICIAL_KEYS) {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  if (!entry?.shortcut) fail(`D1 官方键位缺失：${id} 未在 schema 声明 shortcut`);
  else if (entry.shortcut.winLinux !== key) fail(`D1 官方键位漂移：${id} 应为 ${key}，实际 ${entry.shortcut.winLinux}`);
}

// drift canary：护栏必须能抓住 schema 侧键位漂移（防「永远绿」假护栏）
const DRIFT_CANARY_ID = 'insert.image';
const driftShortcut = schemaShortcuts.get(DRIFT_CANARY_ID);
if (!driftShortcut || driftShortcut.winLinux !== 'Ctrl+Shift+I') {
  fail(`快捷键护栏自检夹具失效：menuSchema.ts 中 ${DRIFT_CANARY_ID} 键位已变化，请更新 canary`);
} else {
  const drifted = schemaSource.replace("winLinux: 'Ctrl+Shift+I'", "winLinux: 'Ctrl+Alt+I'");
  const reParsed = parseMenuSchema(drifted);
  const reEntries = [...reParsed.flatMap((r) => [...walkEntries(r.entries)])].find((e) => e.kind === 'command' && e.id === DRIFT_CANARY_ID);
  if (reEntries?.shortcut?.winLinux !== 'Ctrl+Alt+I') {
    fail('快捷键护栏自检失败：schema 解析器未能检出注入的键位漂移，护栏已失效');
  }
}

// ── 8. checkState 契约（§7.4 硬规则 5：勾选态与 Settings 同一真源）────────
// 随 P1-1.3 单一真源落地：拼写/智能标点/主题/跟随系统已在 schema checkedFrom 声明。
const CHECK_STATE_CONTRACT = [
  { id: 'edit.spellcheck.toggle', checkedFrom: 'spellcheck' },
  { id: 'edit.smartPunctuation.toggle', checkedFrom: 'smartPunct' },
  { id: 'theme.mode.system', checkedFrom: 'themeModeSystem' },
  // V7-W1.6：状态栏可见性（Typora Win/Linux 显示菜单「状态栏」开关）
  { id: 'view.statusbar.toggle', checkedFrom: 'statusbar' },
  // V7-W2.4：浮动编辑器工具栏启用态（Typora 1.14 View → Toolbar）
  { id: 'view.toolbar.toggle', checkedFrom: 'toolbar' },
  // V7-W6（G7-EDIT-15）：Typora `Edit → 空格与换行 → 首行缩进`
  { id: 'edit.firstLineIndent.toggle', checkedFrom: 'firstLineIndent' },
];
const VIEW_GROUP_EXCEPTIONS = new Set([
  'view.source.toggle', 'view.focus.cycle', 'view.typewriter.cycle',
  'view.wordCount', 'window.fullscreen', 'window.alwaysOnTop',
]);
for (const { id, checkedFrom } of CHECK_STATE_CONTRACT) {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  if (!entry) fail(`checkState 契约条目缺失: ${id}`);
  else if (entry.checkedFrom !== checkedFrom) fail(`${id} checkedFrom 应为 ${checkedFrom}，实际 ${entry.checkedFrom ?? '（无）'}`);
}
const spellcheckSync = /spellcheck: \(\(\) => \{ const def = settingById\('editor\.spellcheck'\); return def \? readSetting\(def\) !== false : true; \}\)\(\)/.test(appSource);
const smartPunctSync = /smartPunct: \(\) => \{ const def = settingById\('editor\.smartPunctuation'\);/.test(appSource) || /smartPunct: \(\(\) => \{/.test(appSource);
if (!spellcheckSync || !smartPunctSync) fail('syncNativeMenu 必须从 Settings Store 读取 spellcheck/smartPunct 勾选态（单一真源）');
// V7-W1.6：状态栏勾选态同样必须来自单一状态源（不得硬编码）
if (!/statusbar: statusbarVisible/.test(appSource)) {
  fail('syncNativeMenu 必须从状态栏可见性状态读取 statusbar 勾选态（单一真源）');
}
// V7-W2.4：浮动编辑器工具栏勾选态同源（View → Toolbar 与设置 → 外观同一 storageKey）
if (!/toolbar: selectionToolbarEnabled/.test(appSource)) {
  fail('syncNativeMenu 必须从 selectionToolbarEnabled 状态读取 toolbar 勾选态（V7-W2.4 单一真源）');
}
if (!/execute: \(\) => toggleSelectionToolbar\(\) \}/.test(appSource)) {
  fail('view.toolbar.toggle 必须切换浮动编辑器工具栏（V7-W2.4 D-B = ①：Typora 只有浮动工具栏）');
}
if (/mellow\.editor\.toolbarVisible/.test(appCode)) {
  fail('App.tsx 不得残留 mellow.editor.toolbarVisible（V7-W2.4：常驻横条已退役，开关与浮动工具栏同源）');
}
// V7-W6（G7-EDIT-15）：Typora `Edit → 空格与换行` 子菜单 —— 首行缩进勾选态必须来自单一真值。
// 该菜单项与设置面板是**同一真值**（`editor.firstLineIndent`），两处入口必须走同一条写入路径，
// 否则会出现「菜单勾上了、设置里没变」（或反之），而屏幕上看不出哪个是对的。
if (!/firstLineIndent: \(\(\) => \{ const def = settingById\('editor\.firstLineIndent'\); return def \? readSetting\(def\) === true : false; \}\)\(\)/.test(appSource)) {
  fail('syncNativeMenu 必须从 Settings Store 读取 firstLineIndent 勾选态（单一真源）');
}
const firstLineCmd = /id: 'edit\.firstLineIndent\.toggle'[\s\S]{0,700}?setStatusText/.exec(appSource)?.[0] ?? '';
if (firstLineCmd === '') {
  fail('App.tsx 缺少 edit.firstLineIndent.toggle 命令');
} else {
  if (!/writeSetting\(def, next\)/.test(firstLineCmd)) {
    fail('edit.firstLineIndent.toggle 必须写回 Settings Store（否则菜单勾上了、设置里没变）');
  }
  if (!/setEditorConfig\('setFirstLineIndent', \{ enabled: next \}\)/.test(firstLineCmd)) {
    fail('edit.firstLineIndent.toggle 必须即时下发到编辑器（否则要重启才生效）');
  }
  if (!/setMenuCheckTick/.test(firstLineCmd)) {
    fail('edit.firstLineIndent.toggle 缺少 setMenuCheckTick（勾选态不会重建原生菜单）');
  }
}
// ⚠️ 通用不变量：menuSchema 里出现的每个 `checkedFrom` 都必须在 resolveChecked 有**显式分支**。
// 末尾的 `return false` 是静默兜底 —— 来源名写错只会让菜单项**永远显示未勾选**（屏幕看不出异常），
// 而用户点一次后显示与真实状态就不符了。这条不变量覆盖未来新增的所有勾选项。
const declaredCheckedFrom = [...schemaSource.matchAll(/checkedFrom: '([^']+)'/g)].map((m) => m[1]);
const collectUnhandled = (source) => [...new Set([...source.matchAll(/checkedFrom: '([^']+)'/g)].map((m) => m[1]))]
  .filter((name) => !name.startsWith('activeTheme:') && !source.includes("checkedFrom === '" + name + "'"));
const unhandledCheckedFrom = collectUnhandled(schemaSource);
if (unhandledCheckedFrom.length > 0) {
  fail(`resolveChecked 未处理这些 checkedFrom 来源（会静默显示未勾选）：${unhandledCheckedFrom.join(', ')}`);
}
// canary：注入一个错拼的来源名，必须被同一条不变量检出
const checkedDrift = schemaSource.replace("checkedFrom: 'firstLineIndent'", "checkedFrom: 'firstLineIndnet'");
if (checkedDrift === schemaSource) {
  fail('checkedFrom 不变量 canary 未武装：注入点未命中');
} else if (collectUnhandled(checkedDrift).length === 0) {
  fail('checkedFrom 不变量 canary 失效：注入的错名未被检出');
}
if (declaredCheckedFrom.length === 0) fail('未从 menuSchema 解析到任何 checkedFrom（解析逻辑失效）');

// 例外过期检测：View 组一旦声明 checkedFrom 即从例外表移除
const staleExceptions = [...VIEW_GROUP_EXCEPTIONS].filter((id) => {
  const entry = allEntries().find((e) => e.kind === 'command' && e.id === id);
  return entry?.checkedFrom !== undefined;
});
if (staleExceptions.length > 0) fail(`VIEW_GROUP_EXCEPTIONS 已过期，请从例外表移除：${staleExceptions.join(', ')}`);

// ── 9. Cheatsheet 快捷键派生（P1-1.6：无静态键位串）───────────────────────
const cheatsheetSource = readFileSync(resolve(root, 'apps/desktop/src/Cheatsheet.tsx'), 'utf8').replace(/\r\n/g, '\n');
if (/[^a-zA-Z]shortcut: '/.test(cheatsheetSource)) {
  fail('Cheatsheet.tsx 出现静态键位串（shortcut:），必须改用 commandId 从 registry 派生（P1-1.6）');
}
const cheatsheetCommandIds = [...cheatsheetSource.matchAll(/commandId: '([^']+)'/g)].map((m) => m[1]);
const cheatsheetUnknown = cheatsheetCommandIds.filter((id) => !desktopCommandIds.has(id));
if (cheatsheetUnknown.length > 0) fail(`Cheatsheet commandId 未在 CommandRegistry 注册: ${cheatsheetUnknown.join(', ')}`);

// ── 10. Typora menu dump Golden（P1-1.12：真机 EXTRACTED 真值必须入库且有效）──
const dumpPath = resolve(root, 'tests/benchmark/fixtures/typora-menu-dump.txt');
let dumpSource = '';
try {
  dumpSource = readFileSync(dumpPath, 'utf8').replace(/\r\n/g, '\n');
} catch {
  fail('typora-menu-dump.txt 不存在：Typora 1.14.9 Golden 真值必须入库（P1-1.12），运行 tests/benchmark/generate-typora-menu-dump.mjs 在真机生成');
}
if (dumpSource) {
  const status = /^STATUS: (\w+)$/m.exec(dumpSource)?.[1];
  const build = /^SOURCE_BUILD: (\S+)$/m.exec(dumpSource)?.[1];
  if (status !== 'EXTRACTED') fail(`typora-menu-dump.txt 状态为 ${status ?? '（无）'}，入库前必须为 EXTRACTED（真机 AX 提取）`);
  if (build !== '7785') fail(`typora-menu-dump.txt 基线版本漂移：SOURCE_BUILD=${build ?? '（无）'}，验收基线为 1.14.9 (7785)`);
}

// ── 10b. dump 生成器：既不得制造幻影 diff，也不得静默跳过真实变更（2026-09-30）──
// 本 dump 是**入库证据**（§10 刚校验 STATUS / SOURCE_BUILD），而它每次运行都会生成新的
// GENERATED_AT。原实现**无条件重写** → 有 Typora 的机器上每跑一次 `npm run pretest`
// 就留下一处「只差时间戳」的幻影 diff，把真正的改动淹掉（噪声地板）。
// 但反向的修法更危险：若「跳过写入」写成无条件，**基线会静默过期**，
// 而本文件 §10 仍会对那份过期 dump 一路放行 —— 那才是真正的失真。
// 故两侧同时锁：① 必须做「归一化时间戳后比较」；② 内容真的变了必须写。
{
  const genPath = resolve(root, 'tests/benchmark/generate-typora-menu-dump.mjs');
  let genSource = '';
  try {
    genSource = readFileSync(genPath, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    fail('generate-typora-menu-dump.mjs 不存在（dump 证据的生成器缺失）');
  }
  if (genSource) {
    // ① 时间戳归一化：只允许抹掉 GENERATED_AT 一行，不得顺手抹掉别的行
    const normMatch = /const stripStamp = \(s\) => s\.replace\((\/.*?\/[a-z]*),\s*'([^']*)'\)/.exec(genSource);
    if (!normMatch) {
      fail('dump 生成器必须实现 stripStamp（归一化 GENERATED_AT 后再比较），否则每跑一次测试都会产生幻影 diff');
    } else {
      const pattern = normMatch[1];
      if (!pattern.includes('GENERATED_AT')) {
        fail(`stripStamp 的归一化模式必须只针对 GENERATED_AT 行，实测为 ${pattern}`
          + '（过度归一化会把真实变更也抹平 → 基线静默过期）');
      }
      if (!/m\s*$|\/m/.test(pattern)) {
        fail(`stripStamp 的模式必须为多行模式（/m），否则匹配不到整行：${pattern}`);
      }
    }
    // ② 真实变更必须落盘：writeFileSync 必须在，且与「内容一致则跳过」分支并存
    if (!/writeFileSync\(OUT, next\)/.test(genSource)) {
      fail('dump 生成器内容有变时必须 writeFileSync(OUT, next)（否则基线会静默过期，而 §10 仍会对过期 dump 放行）');
    }
    if (!/stripStamp\(existingRaw\)\s*===\s*stripStamp\(next\)/.test(genSource)) {
      fail('dump 生成器必须以「归一化后比较」判定是否重写（内容一致 → 保留基线时间戳）');
    }
  }
}

// ── 11. 官方快捷键表真值合同 ─────────────────────────────────────────────
// 规范依据：Typora 官方 Shortcut Keys 页（support.typora.io/Shortcut-Keys，
// 页面最后更新 2026-09-06，规范基线 1.14.9 / build 7785）。
//
// 立节原因（第五类失真的回归防线）：G7-KEY-01 / G7-KEY-04 / G7-KEY-05 三项都是
// 「Mellow 自研键位 ≠ 官方表」，且全部长期未被发现 —— 因为纠偏只落在 e2e 断言里，
// 而 e2e 不进 CI、且随实现改写后不会回头验证真值。本轮 e2e 复跑再次抓到同型问题：
// `sidebar-verify` 仍断言「⌃⌘2 未绑定」（W1.5 已按官方表恢复 Articles）、
// `block-shortcuts-verify` 仍断言「⌃` 行内代码」（W1.9 已改为 ⌘⇧`）。
// 二者均为断言过期而非实现回归，但暴露出「改键位无回归防线」的结构性缺口，故立本节。
//
// 归一化说明：官方表用 `Command` / `Control` / `Option` / `↑`，schema 用
// `Cmd` / `Ctrl` / `Alt` / `ArrowUp`，且修饰键书写顺序不固定（如 `Shift+Cmd+D`）。
// 比较前统一别名并排序，避免「等价写法被判为漂移」。
const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Cmd'];
const MOD_ALIAS = {
  Cmd: 'Cmd', Command: 'Cmd', Meta: 'Cmd',
  Ctrl: 'Ctrl', Control: 'Ctrl',
  Alt: 'Alt', Option: 'Alt',
  Shift: 'Shift',
};
const KEY_ALIAS = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right',
};
const normalizeCombo = (combo) => {
  const parts = String(combo).split('+');
  // 解析器按正则从源文本取值，读到的是转义形式（`'Cmd+\\'` → `Cmd+\\`），先还原。
  const key = parts.pop().replace(/\\\\/g, '\\');
  const mods = parts
    .map((m) => MOD_ALIAS[m])
    .filter(Boolean)
    .sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...mods, KEY_ALIAS[key] ?? key].join('+');
};

/** [commandId, 官方 macOS 键位, 官方 Win/Linux 键位（null = 本节不校验）] */
const OFFICIAL_SHORTCUTS = [
  // ── File ──
  ['file.new', 'Cmd+N', 'Ctrl+N'],
  ['file.newWindow', 'Cmd+Shift+N', 'Ctrl+Shift+N'],
  ['file.open', 'Cmd+O', 'Ctrl+O'],
  ['quickOpen.open', 'Cmd+Shift+O', 'Ctrl+P'],
  ['file.reopenClosed', 'Cmd+Shift+T', 'Ctrl+Shift+T'],
  ['file.save', 'Cmd+S', 'Ctrl+S'],
  ['file.saveAs', 'Cmd+Shift+S', 'Ctrl+Shift+S'],
  // settings.open 只存在于 macOS 应用菜单（macOnly），Win/Linux 键位由 App.tsx
  // CommandRegistry 以「平台互补补充键位」提供，故此处不校验 winLinux（见下方专项断言）。
  ['settings.open', 'Cmd+,', null],
  ['file.closeWindow', 'Cmd+W', 'Ctrl+W'],
  // ── Edit ──
  ['edit.copyMarkdown', 'Cmd+Shift+C', 'Ctrl+Shift+C'],
  ['edit.pastePlain', 'Cmd+Shift+V', 'Ctrl+Shift+V'],
  ['edit.selectLine', 'Cmd+L', 'Ctrl+L'],
  ['edit.deleteLine', 'Cmd+Shift+Backspace', 'Ctrl+Shift+Backspace'],
  ['edit.selectFormatSpan', 'Cmd+E', 'Ctrl+E'],
  ['edit.selectWord', 'Cmd+D', 'Ctrl+D'],
  ['edit.deleteWord', 'Cmd+Shift+D', 'Ctrl+Shift+D'],
  ['edit.gotoDocStart', 'Cmd+Up', 'Ctrl+Home'],
  ['edit.gotoSelection', 'Cmd+J', 'Ctrl+J'],
  ['edit.gotoDocEnd', 'Cmd+Down', 'Ctrl+End'],
  ['search.find', 'Cmd+F', 'Ctrl+F'],
  // Win/Linux 官方为 F3 / Enter，走别名（G7-KEY-07 仍为开项，此处只锁主键 Cmd+G）
  ['search.findNext', 'Cmd+G', null],
  ['search.findPrevious', 'Cmd+Shift+G', null],
  // ── Paragraph ──
  ['paragraph.h1', 'Cmd+1', 'Ctrl+1'],
  ['paragraph.h2', 'Cmd+2', 'Ctrl+2'],
  ['paragraph.h3', 'Cmd+3', 'Ctrl+3'],
  ['paragraph.h4', 'Cmd+4', 'Ctrl+4'],
  ['paragraph.h5', 'Cmd+5', 'Ctrl+5'],
  ['paragraph.h6', 'Cmd+6', 'Ctrl+6'],
  ['paragraph.normal', 'Cmd+0', 'Ctrl+0'],
  ['paragraph.headingUp', 'Cmd+=', 'Ctrl+='],
  ['paragraph.headingDown', 'Cmd+-', 'Ctrl+-'],
  ['insert.table', 'Cmd+Alt+T', 'Ctrl+T'],
  ['format.codeBlock', 'Cmd+Alt+C', 'Ctrl+Shift+K'],
  ['format.mathBlock', 'Cmd+Alt+B', 'Ctrl+Shift+M'],
  ['format.quote', 'Cmd+Alt+Q', 'Ctrl+Shift+Q'],
  ['format.orderedList', 'Cmd+Alt+O', 'Ctrl+Shift+['],
  ['format.list', 'Cmd+Alt+U', 'Ctrl+Shift+]'],
  ['paragraph.indentMore', 'Cmd+[', 'Ctrl+['],
  ['paragraph.indentLess', 'Cmd+]', 'Ctrl+]'],
  // ── Format ──
  ['format.bold', 'Cmd+B', 'Ctrl+B'],
  ['format.italic', 'Cmd+I', 'Ctrl+I'],
  ['format.underline', 'Cmd+U', 'Ctrl+U'],
  ['format.code', 'Cmd+Shift+`', 'Ctrl+Shift+`'],
  ['format.strike', 'Ctrl+Shift+`', 'Alt+Shift+5'],
  ['format.link', 'Cmd+K', 'Ctrl+K'],
  ['insert.image', 'Cmd+Ctrl+I', 'Ctrl+Shift+I'],
  ['format.clear', 'Cmd+\\', 'Ctrl+\\'],
  // ── View ──
  ['view.sidebar.toggle', 'Cmd+Shift+L', 'Ctrl+Shift+L'],
  ['view.sidebar.outline', 'Ctrl+Cmd+1', 'Ctrl+Shift+1'],
  ['view.sidebar.fileList', 'Ctrl+Cmd+2', 'Ctrl+Shift+2'],
  ['view.sidebar.fileTree', 'Ctrl+Cmd+3', 'Ctrl+Shift+3'],
  ['view.source.toggle', 'Cmd+/', 'Ctrl+/'],
  ['view.focus.cycle', 'F8', 'F8'],
  ['view.typewriter.cycle', 'F9', 'F9'],
  ['window.fullscreen', 'Cmd+Alt+F', 'F11'],
];

/** 已登记的有意差异（§12 D 表）。键必须仍存在于 schema，否则为过期例外。 */
const OFFICIAL_SHORTCUT_EXCEPTIONS = new Map([
  ['search.replace', '§12 D-Q：macOS Cmd+H 被系统「隐藏应用」占用，沿用 Cmd+Alt+F；Win/Linux 已对齐 Ctrl+H'],
  // G7-KEY-08：Command+` 在 SDI 下语义变为窗口切换，未绑定为文档切换。
  // G7-KEY-09：New Tab (Cmd+T) 随 SDI 决策移除。
]);

const shortcutMapFrom = (src) => new Map(
  parseMenuSchema(src)
    .flatMap((rootEntry) => [...walkEntries(rootEntry.entries)])
    .filter((e) => e.kind === 'command' && e.shortcut)
    .map((e) => [e.id, e.shortcut]),
);

function checkOfficialShortcuts(src) {
  const out = [];
  const parsed = shortcutMapFrom(src);
  for (const [id, mac, win] of OFFICIAL_SHORTCUTS) {
    if (OFFICIAL_SHORTCUT_EXCEPTIONS.has(id)) continue;
    const actual = parsed.get(id);
    if (!actual) {
      out.push(`官方快捷键表：schema 缺少命令 ${id}`);
      continue;
    }
    if (normalizeCombo(actual.mac ?? '') !== normalizeCombo(mac)) {
      out.push(`官方快捷键表漂移：${id} macOS 应为 ${mac}，实际 ${actual.mac ?? '（无）'}`);
    }
    if (win !== null && normalizeCombo(actual.winLinux ?? '') !== normalizeCombo(win)) {
      out.push(`官方快捷键表漂移：${id} Win/Linux 应为 ${win}，实际 ${actual.winLinux ?? '（无）'}`);
    }
  }
  return out;
}

for (const message of checkOfficialShortcuts(schemaSource)) fail(message);

// 有意差异必须「按登记值」存在：既防止悄悄回退，也防止例外表本身过期。
// 2026-09-13：D-Q 登记值由 `Cmd+Alt+F` 改为 `Cmd+Alt+H` —— 前者与 W1.9 按官方表
// 改定的 `window.fullscreen = Cmd+Option+F` 撞车（同一 mac 组合绑两个命令，
// 属 §10 Release Blocker 的「快捷键冲突」）。取舍：全屏保留官方键（有据），
// replace 取官方 `Cmd+H` 的同一字母并加 Alt 规避 macOS 系统「隐藏应用」。
const replaceShortcut = schemaShortcuts.get('search.replace');
if (replaceShortcut?.mac !== 'Cmd+Alt+H' || replaceShortcut?.winLinux !== 'Ctrl+H') {
  fail(`search.replace 键位与 §12 D-Q 登记值不符：期望 mac=Cmd+Alt+H / winLinux=Ctrl+H，实际 ${JSON.stringify(replaceShortcut ?? null)}`);
}
for (const [id] of OFFICIAL_SHORTCUT_EXCEPTIONS) {
  if (!schemaShortcuts.has(id)) fail(`OFFICIAL_SHORTCUT_EXCEPTIONS 已过期：schema 不再包含 ${id}`);
}
// 平台互补键位专项：settings.open 的 Win/Linux `Ctrl+,` 不在 schema（macOnly 应用菜单），
// 而在 App.tsx CommandRegistry。官方表 Preference = Ctrl+,，必须是同一命令而非另立入口。
if (!/id: 'settings\.open'[\s\S]{0,240}?winLinux: 'Ctrl\+,'/.test(appSource)) {
  fail('settings.open 缺少 Win/Linux 键盘键位 Ctrl+,（官方表 Preference；macOnly 菜单项由 CommandRegistry 互补提供）');
}

// canary：把 W1.9 纠偏前的旧键位（⌃` 行内代码）注回 schema，合同必须拒绝。
// 先正则提取锚点片段 → 整体抹除 → 复检（避免直接 replace 命中无关片段）。
const codeAnchor = /\{ kind: 'command', id: 'format\.code'[^}]*shortcut: \{[^}]*\}\s*\}/.exec(schemaSource)?.[0];
if (!codeAnchor) {
  fail('官方快捷键表 canary 未武装：schema 中找不到 format.code 条目（锚点漂移，请更新 canary）');
} else {
  // 注入目标取一个「永不等于当前值」的非官方键位，避免文件已处于漂移态时
  // replace 变成无操作而被误判为 canary 未武装（真实注入已验证：旧值 ⌃` 会被拒绝）。
  const drifted = schemaSource.replace(codeAnchor, codeAnchor.replace("mac: 'Cmd+Shift+`'", "mac: 'Ctrl+Alt+`'"));
  if (drifted === schemaSource) {
    fail('官方快捷键表 canary 未武装：无法注入漂移键位（锚点漂移，请更新 canary）');
  } else if (checkOfficialShortcuts(drifted).length === 0) {
    fail('官方快捷键表合同假绿：format.code 键位漂移到非官方值仍未被拒绝');
  }
}
// canary：把 W1.5 纠偏前的缺失态（Articles 未绑定 ⌃⌘2）注回，合同必须拒绝。
const articlesAnchor = /\{ kind: 'command', id: 'view\.sidebar\.fileList'[^}]*shortcut: \{[^}]*\}\s*\}/.exec(schemaSource)?.[0];
if (!articlesAnchor) {
  fail('Articles canary 未武装：schema 中找不到 view.sidebar.fileList 条目（锚点漂移，请更新 canary）');
} else {
  const drifted = schemaSource.replace(articlesAnchor, articlesAnchor.replace("mac: 'Ctrl+Cmd+2'", "mac: 'Ctrl+Cmd+9'"));
  if (drifted === schemaSource) {
    fail('Articles canary 未武装：无法注入漂移键位（锚点漂移，请更新 canary）');
  } else if (checkOfficialShortcuts(drifted).length === 0) {
    fail('官方快捷键表合同假绿：Articles 键位漂移到 ⌃⌘9 仍未被拒绝');
  }
}

// ── §12 官方菜单文案合同（Typora 1.14.9 build 7785 Menu.strings）─────────
//
// 立节原因（第六类失真的回归防线）：本机装有 Typora 1.14.9，直接读其
// `zh-Hans.lproj/Menu.strings` 与 Base（英文）逐条对照，发现 Mellow 有 **19 处**
// 文案偏离官方：
//   · 12 处**多加省略号** —— Typora 的 Menu.strings 全库只有 1 处 `…`
//     （`Search With…`），而 Mellow 给「打开 / 另存为 / 打印 / 导入 / 查找 /
//     超链接 / 插入本地图片 …」统统加了 `…`；
//   · 7 处用词不同 —— 设置…(应为「偏好设置」)、移到…(「移动到」)、
//     文件信息…(「显示简介」)、关闭窗口(「关闭」)、打开文件位置(「在 Finder 中显示」)、
//     Quick Open(中文菜单里**直接是英文**，应为「快速打开」)、检查更新…/反馈问题…。
//
// 真值不能靠 CI 现读（runner 上不装 Typora），故把期望值内嵌于此，
// 由本护栏长期锁定，防再次漂移。修改前请先对照 Typora 的 Menu.strings。
//
// ⚠️ 2026-09-13 二次核对（第九轮）：用本机 Typora 反查本表**内嵌值本身**是否真的
// 来自官方，发现 **2 条「Typora en」是伪造的** —— 实为把 Mellow 自己的英文值填进了
// 官方列，护栏于是「自己给自己盖章」，永远绿：
//   · `menu.file.saveAll` 官方 Base 为 `Save All`（非 `Save All Open Files`）；
//   · `menu.quickOpen.open` 官方 Base 为 `Open Quickly`（非 `Quick Open`）。
// 同批核对还发现 7 条**从未纳入合同**的偏离（recentClear / export.htmlPlain /
// export.repeat / image.uploadAll / image.moveAll / image.copyAll / 空态占位）。
// 复核脚本：`node tests/parity/tools/audit-typora-menu-labels.mjs`
// （需本机装有 Typora，不进 CI；用于每次扩充本表后自查内嵌真值）。
const TYPORA_MENU_LABELS = [
  // [labelKey, Typora zh-Hans, Typora en（Base）]
  ['menu.file.open', '打开', 'Open'],
  ['menu.workspace.openFolder', '打开文件夹', 'Open Folder'],
  ['menu.file.saveAs', '另存为', 'Save As'],
  ['menu.file.saveAll', '保存全部打开的文件', 'Save All'],
  ['menu.file.import', '导入', 'Import'],
  ['menu.file.print', '打印', 'Print'],
  ['menu.file.moveTo', '移动到', 'Move To'],
  ['menu.file.info', '显示简介', 'Get Info'],
  ['menu.file.closeWindow', '关闭', 'Close'],
  ['menu.file.reveal', '在 Finder 中显示', 'Reveal in Finder'],
  ['menu.top.settings', '偏好设置', 'Preferences'],
  ['menu.top.checkUpdate', '检查更新', 'Check for Updates'],
  ['menu.help.feedback', '反馈', 'Feedback'],
  ['menu.quickOpen.open', '快速打开', 'Open Quickly'],
  // 「打开最近文件」子菜单：Typora 的「清除」项官方 en 是 `Clear Items`（zh「清除最近文件」），
  // 空态是**禁用占位项** `No Recent Files`（zh 真值即「空」）。
  ['menu.file.recentClear', '清除最近文件', 'Clear Items'],
  ['menu.file.recentEmpty', '空', 'No Recent Files'],
  ['menu.export.htmlPlain', 'HTML (无样式)', 'HTML (without Styles)'],
  ['menu.export.repeat', '使用上一次设置导出', 'Export with Previous'],
  ['menu.image.uploadAll', '上传所有本地图片', 'Upload All Local Images'],
  ['menu.image.moveAll', '移动所有图片到', 'Move All Images to'],
  ['menu.image.copyAll', '复制所有图片到', 'Copy All Images to'],
  ['menu.search.find', '查找', 'Find'],
  ['menu.search.replace', '查找和替换', 'Find and Replace'],
  ['menu.format.link', '超链接', 'Hyperlink'],
  ['menu.format.referenceLink', '链接引用', 'Link Reference'],
  ['menu.image.insertLocal', '插入本地图片', 'Insert Local Images'],
  // 右键菜单：Typora 区分 `Delete Image`（仅移除引用）与 `Delete Image File`（删磁盘文件）。
  // Mellow 该项确认框是「将图片移到回收站并移除引用？」= 会删磁盘文件，
  // 故文案必须对齐 `Delete Image File` —— 否则破坏性操作的标签比实际行为更轻。
  ['contextmenu.editorImageDelete', '删除图片文件', 'Delete Image File'],
  // P0-EDITOR-005：拼写子菜单三条（一级证据：typora-menu-dump.txt）
  ['menu.edit.checkDocumentNow', '立即检查文稿', 'Check Document Now'],
  ['menu.edit.learnSpelling', '添加到字典', 'Learn Spelling'],
  ['menu.edit.unlearnSpelling', '忘记拼写', 'Unlearn Spelling'],
];
function checkTyporaMenuLabels(zhMap, enMap) {
  const bad = [];
  for (const [key, zh, en] of TYPORA_MENU_LABELS) {
    if (zhMap.get(key) !== zh) bad.push(`${key} zh 期望「${zh}」实际「${zhMap.get(key) ?? '(缺失)'}」`);
    if (enMap.get(key) !== en) bad.push(`${key} en 期望「${en}」实际「${enMap.get(key) ?? '(缺失)'}」`);
  }
  return bad;
}
// 注意：`zhMenu` / `enMenu` 只含 `menu.*` 键，而本合同的条目里含右键菜单键
// （`contextmenu.*`）—— 故这里用不过滤前缀的完整映射。
for (const msg of checkTyporaMenuLabels(parseLocaleBlock('zhCN', ''), parseLocaleBlock('enUS', ''))) {
  fail(`菜单文案偏离 Typora：${msg}`);
}

// 省略号合同：Typora 全库仅 1 处 `…`，故 Mellow 不得对上述「Typora 有对应项」
// 的条目自行添加省略号。canary：把 file.open 的 zh 文案改成「打开…」必须被拒。
{
  const driftedZh = new Map(zhMenu);
  driftedZh.set('menu.file.open', '打开…');
  if (checkTyporaMenuLabels(driftedZh, enMenu).length === 0) {
    fail('菜单文案 canary 未生效：把「打开」改成「打开…」仍未被拒绝');
  }
}

// ── §12b 菜单项 enabled 通道（占位项必须真的灰显）────────────────────────
//
// 立节原因：Typora 的「打开最近文件」在**空态**是一个**禁用项**「空」/No Recent Files，
// 而 Mellow 此前空态只剩「清除最近文件」，下拉看起来像坏掉。补上占位项时新增了
// 跨层字段 `enabled`（TS spec → Rust materialization），而**只在前端加字段是不够的**：
// Rust 若忽略它，该项会**可点击且点击无任何反应** —— 比不显示更糟，且屏幕上看不出异常
// （点击被 CommandRegistry 静默丢弃）。故两端 + 三个前端要点一起锁。
{
  const enabledChannelOk = (schemaSrc, rsSrc) =>
    /enabled\?: boolean/.test(schemaSrc) // ① spec 类型声明
    && /id: 'recent\.empty'/.test(schemaSrc) // ② 空态占位确实被装配
    && /input\.translate\('menu\.file\.recentEmpty'\)/.test(schemaSrc) // ③ 文案走 i18n（不得硬编码）
    && /enabled: false/.test(schemaSrc) // ④ 占位项声明为禁用
    && /enabled: Option<bool>/.test(rsSrc) // ⑤ Rust 反序列化字段
    && /enabled\.unwrap_or\(true\)/.test(rsSrc); // ⑥ Rust 透传到 MenuItem

  if (!enabledChannelOk(schemaSource, menuRsSource)) {
    fail('菜单项 enabled 通道不完整：空态占位可能变成「可点击但无反应」的假死项（见 §12b 注释）');
  }
  const schemaDrifts = [
    ['spec 未声明 enabled', schemaSource.replace('enabled?: boolean', 'checked?: boolean')],
    ['空态占位未装配', schemaSource.replace("id: 'recent.empty'", "id: 'recent.placeholder'")],
    ['空态占位未灰显', schemaSource.replace('enabled: false', 'enabled: true')],
  ];
  for (const [name, drift] of schemaDrifts) {
    if (drift === schemaSource) fail(`enabled 通道 canary 未武装（${name}）：注入点未命中`);
    else if (enabledChannelOk(drift, menuRsSource)) fail(`enabled 通道 canary 失效（${name}）：漂移未被检出`);
  }
  const rsDrift = menuRsSource.replace('enabled.unwrap_or(true)', 'true');
  if (rsDrift === menuRsSource) fail('enabled 通道 canary 未武装（Rust 未透传）：注入点未命中');
  else if (enabledChannelOk(schemaSource, rsDrift)) fail('enabled 通道 canary 失效（Rust 未透传）：漂移未被检出');
}

// ── §13 快捷键唯一性（Release Blocker 项）────────────────────────────────
//
// 立节原因：§10 Release Blockers 明确「菜单高频入口缺失或**快捷键冲突**」为阻断项，
// 但唯一性此前**只由 tests/e2e/sidebar-verify.mjs 检查，而 e2e 不进 CI** ——
// 于是 `Cmd+Alt+F` 同时绑给 `search.replace` 与 `window.fullscreen` 长期无人发现
// （2026-09-13 跑 e2e 才暴露；W1.9 把全屏改为官方键时撞上了 D-Q 给 replace 的键）。
// 现把该不变量提升到 CI 常跑的 parity 链。
{
  const byPlatform = new Map();
  for (const [id, combo] of schemaShortcuts) {
    // schemaShortcuts 已在别处收集；此处按平台展开
    const entry = typeof combo === 'string' ? { mac: combo, winLinux: combo } : combo;
    for (const [platform, key] of [['mac', entry.mac], ['winLinux', entry.winLinux]]) {
      if (typeof key !== 'string' || key === '') continue;
      const norm = normalizeCombo(key);
      const bucket = byPlatform.get(platform) ?? new Map();
      const ids = bucket.get(norm) ?? [];
      ids.push(id);
      bucket.set(norm, ids);
      byPlatform.set(platform, bucket);
    }
  }
  for (const [platform, bucket] of byPlatform) {
    for (const [combo, ids] of bucket) {
      if (ids.length > 1) {
        fail(`快捷键冲突（${platform}）：${combo} 同时绑给 ${ids.join(', ')} —— §10 Release Blocker`);
      }
    }
  }
  // canary：人为把 fullscreen 改回 Cmd+Alt+F 必须被检出
  const dupDrift = schemaSource.replace("shortcut: { mac: 'Cmd+Alt+H', winLinux: 'Ctrl+H' }", "shortcut: { mac: 'Cmd+Alt+F', winLinux: 'Ctrl+H' }");
  if (dupDrift === schemaSource) {
    fail('快捷键唯一性 canary 未武装：无法注入 replace 的键位漂移');
  } else if (!dupDrift.includes("mac: 'Cmd+Alt+F', winLinux: 'Ctrl+H'")) {
    fail('快捷键唯一性 canary 失效：注入后未命中漂移值');
  }
}

// ── §14 命令面板文案不得漏译（中文界面出现纯英文标题）────────────────────
//
// 立节原因：命令面板与原生菜单是**两套独立的文案源** ——
//   · 菜单：`menuSchema.ts` 的 `labelKey` → i18n `menu.*`（由 §12 官方文案合同看管）；
//   · 面板：App.tsx 命令注册项的**内联 `localizedTitle: { zh, en }`**（此前无任何护栏）。
// 实测（2026-09-13）：菜单侧把 `quickOpen.open` 的 zh 从英文 `Quick Open` 修正为
// 「快速打开」后，**面板侧仍是 `Quick Open`** —— 中文界面里长期挂着一个纯英文标题。
// 同批交叉比对发现两套文案共 46 处用词不同，其中绝大多数是**两套表面的表达习惯**
// （菜单名词式「专注模式」/ 面板动词式「切换 Focus Mode」），不算缺陷、不应强行统一；
// 唯一可判定的缺陷类是**漏译**。故本节点只锁漏译，不锁风格。
{
  const cjk = /[\u3400-\u9FFF\uF900-\uFAFF]/;
  // 专有名词白名单：中文标题本来就该是拉丁文（登记后不得过期）。
  const NON_TRANSLATED_TITLES = new Set(['paragraph.yamlFrontMatter']);
  const LITERAL_TITLE = /\{\s*id: '([^']+)',\s*localizedTitle: \{\s*zh: '((?:[^'\\]|\\.)*)',\s*en: '((?:[^'\\]|\\.)*)'\s*\}/g;
  // 已知的动态形态（无法用字面量正则解析）。数量必须对得上，否则本节点会**静默漏检**。
  const DYNAMIC_TITLE_FORMS = [
    /localizedTitle: \{ zh: c\.title\.zh \?\?/,
    /localizedTitle: \{ zh, en \}/,
    /localizedTitle: \{ zh: `主题：\$\{theme\.name\}`/,
  ];
  const parseTitles = (src) => [...src.matchAll(LITERAL_TITLE)].map((m) => ({ id: m[1], zh: m[2], en: m[3] }));
  const paletteLeaks = (src) => parseTitles(src)
    .filter((t) => !cjk.test(t.zh) && !NON_TRANSLATED_TITLES.has(t.id))
    .map((t) => `${t.id}（zh「${t.zh}」/ en「${t.en}」）`);

  const totalTitles = (appCode.match(/localizedTitle:/g) ?? []).length;
  const dynamicCount = DYNAMIC_TITLE_FORMS.reduce((n, re) => n + (appCode.match(re) ?? []).length, 0);
  const parsedCount = parseTitles(appCode).length;
  if (parsedCount + dynamicCount !== totalTitles) {
    fail(`命令面板 localizedTitle 解析不完整：总数 ${totalTitles} = 字面量 ${parsedCount} + 已知动态 ${dynamicCount} —— 出现未登记的新形态，§14 会静默漏检，请同步正则/白名单`);
  }
  const leaks = paletteLeaks(appCode);
  if (leaks.length > 0) {
    fail(`命令面板中文标题漏译（中文界面出现纯拉丁标题，且不在专有名词白名单）：\n    ${leaks.join('\n    ')}`);
  }
  for (const id of NON_TRANSLATED_TITLES) {
    if (!parseTitles(appCode).some((t) => t.id === id)) {
      fail(`§14 专有名词白名单已过期（App.tsx 命令表中已无该命令）：${id}`);
    }
  }
  // canary：把 quickOpen.open 的面板 zh 改回英文必须被拒
  const drift = appCode.replace(
    "localizedTitle: { zh: '快速打开', en: 'Open Quickly' }",
    "localizedTitle: { zh: 'Open Quickly', en: 'Open Quickly' }",
  );
  if (drift === appCode) fail('§14 漏译 canary 未武装：注入点未命中');
  else if (paletteLeaks(drift).length === 0) fail('§14 漏译 canary 失效：注入的英文标题未被检出');
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Menu contract violations:\n  ${errors.join('\n  ')}`);
}

const commandCount = [...schemaCommandIds].length;
console.log(`Menu schema: app(mac) → ${TYPOGRAPHIC_MENU_ORDER.join(' → ')}; ${commandCount} schema command IDs dispatch through CommandRegistry`);
console.log(`File menu schema: ${FILE_MENU_CONTRACT.length} slots match plan §7.2 (incl. separators)`);
console.log(`Shortcut single source: ${schemaShortcuts.size} accelerators declared in menuSchema.ts, injected into CommandRegistry (drift canary armed)`);
console.log(`Bilingual labels: ${usedLabelKeys.size} label keys resolved from i18n menu.* (zh-CN + en-US); Rust menu.rs is a pure materialization adapter`);
console.log(`Check state: ${CHECK_STATE_CONTRACT.length} toggles from Settings Store, ${VIEW_GROUP_EXCEPTIONS.size} tracked view-group exceptions; themes derived from Theme Registry`);
console.log(`Official shortcut table: ${OFFICIAL_SHORTCUTS.length} bindings match Typora Shortcut Keys (rev. 2026-09-06); ${OFFICIAL_SHORTCUT_EXCEPTIONS.size} registered D-exceptions (drift canary armed)`);
// ⚠️ 措辞必须如实（2026-09-30）：本护栏**不读**本机 Typora —— 它比对的是**内嵌**的
// `TYPORA_MENU_LABELS`（因 CI runner 上不装 Typora）。原措辞写「read from the local install」
// 会让读者以为每次运行都对着真 Typora 校验过，**而这正是 §12 注释自己警告过的
// 「自己给自己盖章，永远绿」**。真实情况：内嵌值由**人工、非 CI** 的
// `tests/parity/tools/audit-typora-menu-labels.mjs` 反查（需本机 Typora）。
console.log(`Official menu labels: ${TYPORA_MENU_LABELS.length} labels compared against EMBEDDED official values (zh-Hans + en); NOT verified against a live Typora here — run tests/parity/tools/audit-typora-menu-labels.mjs (needs local Typora, not in CI) to re-check the embedded values`);
