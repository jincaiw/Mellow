/**
 * Shell Widget 契约护栏（B1 修订：Tabbar 移除，保留 P2-2.5 模式状态指示）
 *
 * B1（SDI）—— Tabbar / 多标签 UI 全量移除
 *   （现状依据 docs/plans/typora-parity-master-plan.md §7.6 域 F 桌面布局；
 *    历史论证见 docs/plans/archive/typora-parity-b1-sdi-plan.md）：
 *   ① desktop-ui 不再存在 Tabbar 组件与导出；
 *   ② App.tsx 不再渲染 Tabbar / overview / 读取 autoHideTabBar；
 *   ③ styles.css 无 .tabbar / .tab-overview 残留；
 *   ④ 已废弃命令 id（tabs.close/closeOthers/closeRight/prev/next/showAll/reopenClosed
 *      与 file.newTab）不出现在 schema 且 Registry 无残留。
 *
 * P2-2.5 —— 模式状态指示（不常驻，轻量，验收：可见且低干扰）：
 *   ① 仅非默认模式时渲染 badge（默认 off/false 时 DOM 零输出，即「不常驻」）；
 *   ② badge 可点击退出对应模式（Focus → off / Typewriter → false）；
 *   ③ Reader（自带 bar）与 Slash（瞬态面板、默认开启）不做常驻指示；
 *   ④ CSS 低干扰（12px、半透明 opacity、pointer-events 穿透容器）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const stylesSource = read('apps/desktop/src/styles.css');
const appSource = read('apps/desktop/src/App.tsx');
const messagesSource = read('packages/i18n/src/messages.ts');
const desktopUiIndex = read('packages/desktop-ui/src/index.ts');
const statusBarSource = read('packages/desktop-ui/src/StatusBar.tsx');
const settingsSource = read('packages/settings/src/index.ts');

// ── B1（SDI）：Tabbar / 多标签 UI 移除契约 ───────────────────────────────
if (existsSync(resolve(root, 'packages/desktop-ui/src/Tabbar.tsx'))) {
  fail('desktop-ui/src/Tabbar.tsx 不得存在（B1：Tabbar 随多标签能力移除）');
}
if (/export \{ Tabbar \}|export type \{ TabbarProps \}/.test(desktopUiIndex)) {
  fail('desktop-ui index.ts 不得导出 Tabbar/TabbarProps（B1）');
}
if (/\bTabbar\b|setTabOverviewOpen|tabOverviewOpen|tab-overview/.test(appSource)) {
  fail('App.tsx 不得残留 Tabbar / Tab Overview 渲染或状态（B1）');
}
if (/mellow\.editor\.autoHideTabBar|setAutoHideTabBar|autoHideTabBar/.test(appSource)) {
  fail('App.tsx 不得残留 autoHideTabBar（设置项已移除，B1）');
}
for (const sel of ['.tabbar', '.tab-overview-panel', '.tab-overview-card', '.tab-new']) {
  if (stylesSource.includes(sel)) fail(`styles.css 不得残留 ${sel} 规则（B1）`);
}
// 已废弃命令 id：schema 不应再引用（App Registry 残留由 verify-menu-contract 的
// schema→registry 覆盖检查兜底，这里只做正面的 DOM/组件级反残留）
for (const key of ['tab.ctx.close', 'tabbar.label', 'tabs.overview.title', 'settings.editor.autoHideTabBar']) {
  if (messagesSource.includes(`'${key}'`)) fail(`i18n 不得残留已废弃键 ${key}（B1）`);
}

// ── P2-2.5：模式状态指示（不常驻，轻量）──────────────────────────────────
// ① 条件渲染：整体容器仅在非默认模式时挂载（默认 DOM 零输出）
if (!/\{\(focusMode !== 'off' \|\| typewriterEnabled\) && \(\s*<div className="mode-indicators">/.test(appSource)) {
  fail('App.tsx 缺少条件渲染的 mode-indicators 容器（仅 focusMode !== off || typewriterEnabled 时挂载，P2-2.5 不常驻）');
}
// ② Focus badge：区分行/段落 + 点击退出
if (!/focusMode !== 'off' && \([\s\S]*?onClick=\{\(\) => setFocusMode\('off'\)\}/.test(appSource)) {
  fail('Focus badge 缺失或不可点击退出（onClick setFocusMode(off)，P2-2.5）');
}
if (!/focusMode === 'line' \? t\('mode\.focusLine'\) : t\('mode\.focusParagraph'\)/.test(appSource)) {
  fail('Focus badge 未区分行/段落文案（mode.focusLine / mode.focusParagraph，P2-2.5）');
}
// ③ Typewriter badge：点击退出
if (!/typewriterEnabled && \([\s\S]*?onClick=\{\(\) => setTypewriterMode\(false\)\}/.test(appSource)) {
  fail('Typewriter badge 缺失或不可点击退出（onClick setTypewriterMode(false)，P2-2.5）');
}
// ④ Reader / Slash 不做常驻指示（低干扰原则）
if (appSource.includes("t('mode.reader')") || appSource.includes("t('mode.slash')")) {
  fail('Reader/Slash 不得渲染常驻 badge（Reader 自带 bar；Slash 瞬态且默认开启，P2-2.5）');
}
// ⑤ badge 文案 zh/en 双语且非空
for (const key of ['mode.focusLine', 'mode.focusParagraph', 'mode.typewriter', 'mode.indicatorHint']) {
  let count = 0;
  for (const [, value] of messagesSource.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))) {
    if (value.trim() !== '') count += 1;
  }
  if (count < 2) fail(`模式指示文案 ${key} 需 zh/en 双语且非空（实际 ${count} 组）`);
}
// ⑥ CSS 低干扰契约：容器穿透 + badge 半透明 + 12px
const indicatorsBlock = /\.mode-indicators \{[^}]*\}/.exec(stylesSource)?.[0];
const indicatorBlock = /\.mode-indicator \{[^}]*\}/.exec(stylesSource)?.[0];
if (!indicatorsBlock || !/pointer-events: none/.test(indicatorsBlock)) {
  fail('styles.css 缺少 .mode-indicators 容器 pointer-events: none（不得拦截编辑区点击，P2-2.5）');
}
if (!indicatorBlock || !/font-size: 12px/.test(indicatorBlock) || !/opacity: 0\.8/.test(indicatorBlock)) {
  fail('styles.css 缺少 .mode-indicator 低干扰样式（12px + opacity 0.8，P2-2.5）');
}
if (!/\.mode-indicator:hover \{[^}]*\}/.test(stylesSource)) {
  fail('styles.css 缺少 .mode-indicator:hover 规则（hover 恢复可见性，P2-2.5）');
}

// ── V7-W2.3（D-A = ③）：`.editor-topbar` 纯操作条契约 ────────────────────
// 背景：Typora 无应用内文件名条，文件名真源是窗口标题栏（windowService.setTitle）。
// 裁决保留该条作为 macOS 侧栏入口 + 浮动大纲开关的载体，但必须已去掉文件名。
// 注释剔除：解释性注释会合法提及历史类名（含多行注释），只有代码残留才算漂移。
// 顺序：先剥块注释（/* */ 与 JSX {/* */}），再剥行注释，避免单行正则漏掉注释续行。
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');
if (stripComments(appSource).includes('editor-topbar-title') || stripComments(stylesSource).includes('.editor-topbar-title')) {
  fail('App.tsx / styles.css 不得残留 .editor-topbar-title（V7-W2.3 D-A：文件名真源为窗口标题栏，Typora 无应用内文件名条）');
}
if (!/<div className="editor-topbar" data-tauri-drag-region>/.test(appSource)) {
  fail('App.tsx 缺少 .editor-topbar 纯操作条（V7-W2.3 D-A：macOS 侧栏入口 + 浮动大纲开关载体）');
}
if (!/editor-topbar-spacer/.test(appSource) || !/\.editor-topbar-spacer \{[^}]*\}/.test(stylesSource)) {
  fail('App.tsx / styles.css 缺少 editor-topbar-spacer（V7-W2.3：去文件名后左右槽由 spacer 撑开）');
}
// macOS 侧栏入口必须可发现（G7-SHELL-05）：左侧按钮在 platformMac 下恒显
if (!/\{\(platformMac \|\| !sidebarShown\) && \(/.test(appSource)) {
  fail('editor-topbar 左侧侧栏按钮条件应为 (platformMac || !sidebarShown)（V7-W2.3：修复 macOS 侧栏入口不可发现 G7-SHELL-05）');
}
if (!/className=\{`editor-topbar-btn\$\{sidebarShown \? ' active' : ''\}`\}/.test(appSource)) {
  fail('editor-topbar 左侧按钮缺少 active 态（V7-W2.3：与侧栏可见性同源）');
}
// 条高不得漂移（布局基线契约）
const topbarBlock = /\.editor-topbar \{[^}]*\}/.exec(stylesSource)?.[0];
if (!topbarBlock || !/height: 34px/.test(topbarBlock) || !/flex: 0 0 34px/.test(topbarBlock)) {
  fail('styles.css .editor-topbar 必须保持 height 34px / flex 0 0 34px（V7-W2.3：避免视觉 Golden 基线漂移）');
}

// ── V7-W2.6/W2.7：字数可见性契约 ─────────────────────────────────────────
// Typora 官方 Word Count 文档：「Word count is displayed on status bar (Windows/Linux)
// or title bar (macOS when hover)」+「You could click on the "word count" button to show
// all of those statistics in the popup panel」。
// ① 状态栏字数项必须是按钮（点击展开面板），不是纯文本
if (!/className="statusbar-item statusbar-stats"/.test(statusBarSource)) {
  fail('StatusBar 字数项必须是 .statusbar-stats 按钮（V7-W2.7：Typora 点击字数展开统计面板）');
}
if (!/onStatsClick\?: \(\) => void;/.test(statusBarSource)) {
  fail('StatusBarProps 缺少 onStatsClick（V7-W2.7）');
}
if (!/\.statusbar-stats \{[^}]*cursor: pointer/.test(stylesSource)) {
  fail('styles.css 缺少 .statusbar-stats 可点击样式（V7-W2.7）');
}
if (!/onStatsClick=\{\(\) => \{[\s\S]{0,200}setWordCountOpen\(true\)/.test(appSource)) {
  fail('App.tsx 必须把状态栏字数项接到字数统计面板（setWordCountOpen(true)，V7-W2.7）');
}
// ② macOS 字数可见性：设置项 + 标题合成（Typora「始终显示」选项）
if (!/id: 'appearance\.wordCount'/.test(settingsSource)) {
  fail('settings 缺少 appearance.wordCount（V7-W2.6：Typora macOS「始终显示字数」选项）');
}
if (!/case 'settings\.wordCount':/.test(appSource) || !/setWordCountInTitle\(Boolean\(value\)\)/.test(appSource)) {
  fail("App.tsx 缺少 settings.wordCount live apply（V7-W2.6）");
}
if (!/wordCountInTitle && wordCountData !== null[\s\S]{0,160}status\.wordCountShort/.test(appSource)) {
  fail('App.tsx 窗口标题未按设置并入字数（V7-W2.6）');
}
for (const key of ['settings.appearance.wordCount', 'status.wordCountShort']) {
  let count = 0;
  for (const [, value] of messagesSource.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))) {
    if (value.trim() !== '') count += 1;
  }
  if (count < 2) fail(`字数可见性文案 ${key} 需 zh/en 双语且非空（实际 ${count} 组）`);
}

// ── V7-W2.8：侧栏模式菜单死 CSS 清理契约 ─────────────────────────────────
for (const sel of ['.sidebar-mode-menu', '.sidebar-mode-item']) {
  if (stripComments(stylesSource).includes(sel)) {
    fail(`styles.css 不得残留 ${sel}（V7-W2.8：死 CSS，G7-SIDE-03）`);
  }
}

// ── drift canary：护栏必须能抓住契约漂移（防「永远绿」假护栏）─────────────
// B1 canary：注入「Tabbar 复活」漂移（App 引用组件 + overview 状态复活），
// 上述反残留断言（第 30–45 行）必须能命中；同时当前干净的 App.tsx 不得误报。
const b1Detector = (s) => /\bTabbar\b|setTabOverviewOpen|tabOverviewOpen|tab-overview/.test(s);
const revivedApp = appSource.replace(
  'const guardSingleDocument',
  "import { Tabbar } from '../../../packages/desktop-ui/src';\nconst [tabOverviewOpen, setTabOverviewOpen] = useState(false);\nconst guardSingleDocument",
);
if (b1Detector(appSource) || !b1Detector(revivedApp)) {
  fail('B1 反残留护栏自检失败：无法模拟 Tabbar/overview 复活漂移，护栏已失效');
}
// P2-2.5 canary：模拟「常驻化」漂移（条件渲染退化为 true），条件渲染断言必须失效
const driftedAppForMode = appSource.replace("(focusMode !== 'off' || typewriterEnabled) && (", "(true) && (");
if (!/\{\(focusMode !== 'off' \|\| typewriterEnabled\) && \(\s*<div className="mode-indicators">/.test(appSource) ||
    /\{\(focusMode !== 'off' \|\| typewriterEnabled\) && \(\s*<div className="mode-indicators">/.test(driftedAppForMode)) {
  fail('模式指示护栏自检失败：无法模拟常驻化漂移（P2-2.5），护栏已失效');
}
// V7-W2.4 canary：模拟「文件名条复活」漂移，反残留断言必须能命中
const revivedTitle = appSource.replace('editor-topbar-spacer', 'editor-topbar-title');
if (!revivedTitle.includes('editor-topbar-title')) {
  fail('D-A 护栏自检失败：无法模拟 .editor-topbar-title 复活漂移，护栏已失效');
}

// ── V7-W2.4（D-B = ①）：常驻 EditorToolbar 退役契约 ─────────────────────
// Typora 1.14 只有浮动的「编辑器工具栏」（Selection 锚定），由 editor-engine 的
// selectionToolbar 提供；壳层常驻横条与 Typora 布局不符且功能重叠，已退役。
if (existsSync(resolve(root, 'packages/desktop-ui/src/EditorToolbar.tsx'))) {
  fail('desktop-ui/src/EditorToolbar.tsx 不得存在（V7-W2.4 D-B：常驻工具栏已退役）');
}
if (/EditorToolbar|EDITOR_TOOLBAR_BUTTONS/.test(stripComments(desktopUiIndex))) {
  fail('desktop-ui index.ts 不得导出 EditorToolbar/EDITOR_TOOLBAR_BUTTONS（V7-W2.4）');
}
if (/\bEditorToolbar\b/.test(stripComments(appSource))) {
  fail('App.tsx 不得渲染 EditorToolbar（V7-W2.4：改用引擎级 selectionToolbar）');
}
for (const sel of ['.editor-toolbar', '.editor-toolbar-btn']) {
  if (stripComments(stylesSource).includes(sel)) fail(`styles.css 不得残留 ${sel} 规则（V7-W2.4）`);
}
// 浮动工具栏必须仍在（退役常驻条不得连带丢失 Typora 等价的浮动工具栏）
if (!/view\.toolbar\.toggle[\s\S]{0,200}toggleSelectionToolbar\(\)/.test(appSource)) {
  fail('view.toolbar.toggle 必须切换浮动工具栏（V7-W2.4：Typora View → Toolbar 语义）');
}
const dBCanary = stripComments(appSource).replace('editor-topbar-spacer', 'EditorToolbar');
if (!/\bEditorToolbar\b/.test(dBCanary)) {
  fail('D-B 护栏自检失败：无法模拟 EditorToolbar 复活漂移，护栏已失效');
}

// ── 浮动工具栏「真的会显示」契约（2026-09-12 真实 bug 回归防线）──────────
// 发现经过：`tests/visual/scenes-golden.mjs` 首次采样 selection-toolbar 得到
// {w:0,h:0,visible:false} —— 元素在、按钮在、但 display 恒为 none。
// 根因：CodeMirror 6 **禁止在 update 周期内读取布局**，`position()` 里的
// `view.coordsAtPos()` 抛错，被 `getAnchor` 的 catch 吞掉并返回 null → 立即
// `hideEl()`；`visible=false` 后后续 update 不再重定位，于是**永不显示**。
// 该缺陷此前无任何测试覆盖（单测只测了纯函数 shouldShowToolbar），
// 即「结构在、功能死」。故在此立静态契约，防止改回同步定位。
const selToolbarSource = read('packages/editor-engine/src/selectionToolbar.ts');
const methodBody = (name, signature) => {
  const re = new RegExp(`${signature}[\\s\\S]*?\\n    \\}`);
  return re.exec(selToolbarSource)?.[0] ?? '';
};
const showElBody = methodBody('showEl', 'private showEl\\(\\): void \\{');
const updateBody = methodBody('update', 'update\\(update: ViewUpdate\\): void \\{');
if (showElBody === '' || updateBody === '') {
  fail('浮动工具栏契约 canary 未武装：无法定位 showEl()/update() 方法体（锚点漂移，请更新护栏）');
}
if (/this\.position\(\)/.test(showElBody)) {
  fail('showEl() 不得同步调用 position()：CM6 禁止在 update 周期读布局，同步定位会让浮动工具栏显示后立刻自隐（永不显示）');
}
if (/this\.position\(\)/.test(updateBody)) {
  fail('update() 不得同步调用 position()：必须用 schedulePosition() 推迟到 update 周期外（布局读取限制）');
}
if (!/schedulePosition\(\)/.test(selToolbarSource)) {
  fail('selectionToolbar.ts 缺少 schedulePosition()（定位必须推迟到 update 周期之外）');
}
if (!/cancelAnimationFrame/.test(selToolbarSource)) {
  fail('destroy() 必须取消待执行的定位帧（cancelAnimationFrame），避免视图销毁后仍回调');
}
// canary：把同步定位注回 showEl，护栏必须拒绝（证明断言不是摆设）
if (showElBody !== '') {
  const drifted = selToolbarSource.replace(showElBody, showElBody.replace('this.schedulePosition();', 'this.position();'));
  if (drifted === selToolbarSource) {
    fail('浮动工具栏 canary 未武装：无法注入同步定位漂移（锚点漂移，请更新护栏）');
  } else {
    const driftedBody = /private showEl\(\): void \{[\s\S]*?\n    \}/.exec(drifted)?.[0] ?? '';
    if (!/this\.position\(\)/.test(driftedBody)) {
      fail('浮动工具栏 canary 失效：注入后仍未检出同步定位');
    }
  }
}

// ── 脏文档离开确认：必须是应用内「保存 / 放弃更改 / 取消」三选一 ─────────────
//
// 立节原因（G7-EDIT-09）：Mellow 此前用 `window.confirm` —— 只有「确定（=丢弃）/ 取消」，
// **用户无法在对话框里保存**；而 Typora 的 `tryLeaveDocument` 是
// `showDialog({ title: 'Save', buttons: [Save, Discard Changes|Discard, Cancel] })`
// （一手证据：`TypeMark/appsrc/main.js`）。SDI 下「切换文档」是主流程
// （文件树单击 / Quick Open / 最近文件 / CLI / 恢复快照），缺「保存」意味着每次都要
// 「取消 → 手动保存 → 再切换」，且「确定」就是丢内容。
{
  const confirmBody = /const confirmCloseDocument = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/m.exec(appSource)?.[0] ?? '';
  if (confirmBody === '') {
    fail('App.tsx 缺少 confirmCloseDocument（脏文档离开确认）');
  } else {
    if (/window\.confirm/.test(confirmBody)) fail('脏文档确认不得再用 window.confirm（只有两选一，缺「保存」）');
    if (!/askUser\(/.test(confirmBody)) fail('脏文档确认必须走应用内对话框 askUser()');
    for (const [label, key] of [['保存', 'dialog.save'], ['取消', 'dialog.cancel']]) {
      if (!confirmBody.includes(`t('${key}')`)) fail(`脏文档确认缺少「${label}」按钮（t('${key}')）`);
    }
    // 「放弃更改 / 丢弃」按是否有磁盘路径切换（Typora 真值：未命名 → Discard，已命名 → Discard Changes）
    if (!/doc\.path === null \? t\('dialog\.discard'\) : t\('dialog\.discardChanges'\)/.test(confirmBody)) {
      fail('脏文档确认的放弃按钮必须按 doc.path 切换为 Typora 真值（未命名 → 丢弃 / 已命名 → 放弃更改）');
    }
    // 选「保存」后必须以**保存结果**决定是否离开 —— 保存失败/取消必须中止（绝不静默丢弃）
    if (!/choice === 'save'\) return await saveDocumentRef\.current\(\)/.test(confirmBody)) {
      fail('脏文档确认选「保存」后必须用保存结果决定是否离开（saveDocumentRef），否则保存失败仍会丢弃内容');
    }
  }
  if (!/const handleSave = useCallback\(async \(\): Promise<boolean> =>/.test(appSource)) {
    fail('handleSave 必须返回 Promise<boolean>（脏文档确认的「保存」分支依赖它判断是否可离开）');
  }
  // 模态必须真的渲染（否则 askUser 的 await 永久悬空 → 切换文档卡死）
  if (!/className="confirm-modal-backdrop"/.test(appSource)) fail('App.tsx 未渲染确认模态（await 会永久悬空 → 切换文档卡死）');
  if (!/className="confirm-modal-actions"/.test(appSource)) fail('确认模态缺少按钮容器 .confirm-modal-actions');
  for (const sel of ['.confirm-modal-backdrop', '.confirm-modal-actions', '.confirm-modal-primary']) {
    if (!stylesSource.includes(sel)) fail(`styles.css 缺少 ${sel} 样式`);
  }
  // 文案对齐 Typora 原文
  if (!messagesSource.includes("'dialog.closeDocDirty': '是否要保存对文档的更改？\\n如果不保存，你的更改将丢失。'")) {
    fail('dialog.closeDocDirty 必须对齐 Typora 原文（是否要保存对文档的更改？/ 不保存则更改丢失）');
  }
  for (const key of ['dialog.saveChangesTitle', 'dialog.save', 'dialog.discard', 'dialog.discardChanges', 'dialog.cancel']) {
    if (!messagesSource.includes(`'${key}':`)) fail(`缺少对话框文案 ${key}`);
  }
  // 守卫已改为 async：**漏 await 会让「取消」失效**（Promise 恒为真 → 用户点取消仍会切走并丢内容）
  const unawaited = [...appSource.matchAll(/(?<!await )!(\(?)(guardSingleDocument|confirmCloseDocument)\(/g)];
  if (unawaited.length > 0) {
    fail(`脏文档守卫存在 ${unawaited.length} 处未 await 的调用点 —— Promise 恒为真，「取消」将失效（点取消仍会切走并丢内容）`);
  }
  const guardDrift = appSource.replace(
    'if (!(await guardSingleDocument())) return false;',
    'if (!guardSingleDocument()) return false;',
  );
  if (guardDrift === appSource) {
    fail('脏文档守卫 canary 未武装：无法注入「漏 await」漂移（锚点漂移，请更新护栏）');
  } else if (!/(?<!await )!(\(?)(guardSingleDocument|confirmCloseDocument)\(/.test(guardDrift)) {
    fail('脏文档守卫 canary 失效：注入的「漏 await」调用点未被检出');
  }

  // ── 离开决策的**唯一入口**是 guardSingleDocument（G7-EDIT-11）────────────────
  // 立节原因：PRD §101 规定自动保存默认含 Document Switch，但该自动保存此前被写在
  // `applyTab()`（切文档前一刻）里，而 applyTab 总在守卫**之后**执行，于是：
  //   · 免不掉确认对话框（PRD 的默认形同未实现）；
  //   · 用户选「放弃更改」后 `dirtyRef` 仍为 true → 又把**已丢弃的内容写回磁盘**；
  //   · `handleTrashDocument` 路径会把**刚删除的文件重新创建**出来。
  // 现将「离开时自动保存」收进守卫（Typora `tryLeaveDocument` 分支 ①），并禁止 applyTab 再自动保存。
  const appCode = stripComments(appSource);
  const guardBody = /const guardSingleDocument = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/m.exec(appCode)?.[0] ?? '';
  if (guardBody === '') {
    fail('App.tsx 缺少 guardSingleDocument');
  } else {
    if (!/isAutosaveEnabled\(readStored\('mellow\.file\.autosave'\)\)/.test(guardBody)) {
      fail('guardSingleDocument 缺少「自动保存开启 → 静默保存后离开」分支（PRD §101 默认含 Document Switch；Typora tryLeaveDocument 分支 ①）');
    }
    if (!/existing\.path !== null/.test(guardBody)) {
      fail('静默保存分支必须以「文档有磁盘路径」为前提（未命名文档须先另存为 → 必须走三选一）');
    }
    if (!/if \(!\(await saveDocumentRef\.current\(\)\)\) return false;/.test(guardBody)) {
      fail('静默保存失败必须中止离开（否则静默丢内容）');
    }
  }
  const applyTabBody = /const applyTab = useCallback\(async \(tab: DocumentTab\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/m.exec(appCode)?.[0] ?? '';
  if (applyTabBody === '') {
    fail('App.tsx 缺少 applyTab');
  } else if (/maybeAutoSave/.test(applyTabBody)) {
    fail('applyTab 不得再自动保存（G7-EDIT-11）：它总在 guardSingleDocument 之后执行 → 会覆盖「放弃更改」把已丢弃内容写回磁盘，且 handleTrashDocument 会重建已删文件');
  }
  const applyTabDrift = appCode.replace(
    '  const applyTab = useCallback(async (tab: DocumentTab) => {\n    const host = hostRef.current;\n    if (!host) return;',
    '  const applyTab = useCallback(async (tab: DocumentTab) => {\n    const host = hostRef.current;\n    if (!host) return;\n    await maybeAutoSaveRef.current?.();',
  );
  if (applyTabDrift === appCode) {
    fail('applyTab 自动保存 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else {
    const driftedApplyTab = /const applyTab = useCallback\(async \(tab: DocumentTab\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/m.exec(applyTabDrift)?.[0] ?? '';
    if (!/maybeAutoSave/.test(driftedApplyTab)) fail('applyTab 自动保存 canary 失效：注入后未检出');
  }
}

// ── N. 原生确认面板清零（G7-EDIT-10）────────────────────────────────────
//
// 立节原因：脏文档确认（G7-EDIT-09）迁到应用内 `askUser()` 后，App 里还剩下 4 处
// `window.confirm`（删除图片 / 文件树删除 / 当前文档删除 / 文件链接自动创建）。
// 它们语义上都是**二选一**，而 `askUser()` 是通用 N 按钮，完全够用；继续用原生面板的代价是：
//   ① 按钮文案无法 i18n（原生面板文案由浏览器/系统语言决定）；
//   ② 与 conflict-bar 视觉语言不一致；
//   ③ 后续若某处需要三选一，会再次踩 G7-EDIT-09 那个坑（两选一表达不了）。
// 本轮 4 处已迁完 → 直接锁**零出现**，比逐处断言更耐用（以后新增也会被拦下）。
{
  const desktopSrc = ['apps/desktop/src/App.tsx'].map((f) => read(f)).join('\n');
  for (const api of ['confirm', 'prompt']) {
    if (new RegExp(`window\\.${api}\\(`).test(desktopSrc)) {
      fail(`apps/desktop/src 仍存在 window.${api} —— 应用内 askUser / askInput 已具备二选一与输入能力，不应再用原生面板`);
    }
  }
  // 三处迁移后的按钮 value 必须存在（证明「确实在问」，而不是直接执行）
  for (const value of ['delete', 'trash', 'create']) {
    if (!desktopSrc.includes(`value: '${value}'`)) {
      fail(`缺少 askUser 的 ${value} 按钮（G7-EDIT-10 迁移后应存在）`);
    }
  }
  // 输入型对话框：askInput 存在 + 输入框真的渲染（有输入框才谈得上替代 window.prompt）
  if (!/const askInput = useCallback\(/.test(desktopSrc)) {
    fail('缺少 askInput（替代 window.prompt 的输入型应用内对话框）');
  }
  if (!/className="confirm-modal-input"/.test(desktopSrc)) {
    fail('输入型对话框未渲染 .confirm-modal-input（askInput 会拿不到用户输入）');
  }
  if (!/\.confirm-modal-input \{/.test(read('apps/desktop/src/styles.css'))) {
    fail('styles.css 缺少 .confirm-modal-input 样式');
  }
  // G7-MENU-14：清除最近项必须先让用户选择作用域（Typora 官方有四种相关文案，
  // 不能退化为「直接清空 recentFiles」）。
  if (!/const clearRecentItems = useCallback\(async \(\) => \{[\s\S]{0,1200}?dialog\.clearRecentTitle/.test(desktopSrc)) {
    fail('recent.clear 缺少作用域选择对话框（G7-MENU-14）');
  }
  for (const value of ['documents', 'locations', 'all']) {
    if (!desktopSrc.includes(`value: '${value}'`)) fail(`recent.clear 缺少作用域按钮 value=${value}`);
  }
  if (!/id: 'recent\.clear'[\s\S]{0,280}?void clearRecentItems\(\)/.test(desktopSrc)) {
    fail('recent.clear 未调用 clearRecentItems（可能又退化为直接清空）');
  }

  // ── G7-SIDE-08：「在新窗口中打开」的**跨层**契约 ─────────────────────────
  //
  // 立节原因：该能力横跨 Rust（建窗口 + 待打开请求）与 TS（菜单入口 + invoke 传参），
  // 任一端缺失都表现为「点了没反应」——而屏幕上看不出原因（与 §12b 的 enabled 通道同类）。
  // 另：`PendingOpen` 必须是**按窗口隔离**的 —— 全局单槽在多窗口下会「串窗」。
  const rustLib = read('apps/desktop/src-tauri/src/lib.rs');
  const rustWindow = read('apps/desktop/src-tauri/src/window.rs');
  const crossLayer = [
    // Rust：按窗口隔离的待打开请求
    ['PendingOpen 必须按窗口 label 隔离（HashMap）', /PendingOpen\(Mutex<std::collections::HashMap<String, OpenRequest>>\)/.test(rustLib)],
    ['pending_open_path 必须取调用方窗口的 label', /fn pending_open_path\(window: tauri::WebviewWindow/.test(rustLib)],
    ['take_pending_open 必须按 label 取', /fn take_pending_open\(pending: &PendingOpen, label: &str\)/.test(rustLib)],
    // Rust：new_window 接受路径并挂到新窗口 label
    ['new_window 必须接受 path/mode', /pub fn new_window\([\s\S]{0,120}?path: Option<String>/.test(rustWindow)],
    ['new_window 必须把路径挂到本窗口 label', /insert_pending_open\([\s\S]{0,200}?&window_label/.test(rustWindow)],
    // TS：菜单入口 + invoke 传参
    ['文件树右键必须有「在新窗口中打开」', /contextmenu\.openInNewWindow/.test(desktopSrc)],
    ['openInNewWindow 必须把 path 传给 new_window', /invoke\('new_window', \{ path, mode: null \}\)/.test(desktopSrc)],
  ];
  for (const [name, ok] of crossLayer) {
    if (!ok) fail(`G7-SIDE-08 跨层契约不完整：${name}`);
  }
  // canary：把「按窗口隔离」改回全局单槽，同一条检查必须检出
  const rustDrift = rustLib.replace(
    'PendingOpen(Mutex<std::collections::HashMap<String, OpenRequest>>)',
    'PendingOpen(Mutex<Option<OpenRequest>>)',
  );
  if (rustDrift === rustLib) {
    fail('按窗口隔离 canary 未武装：注入点未命中');
  } else if (/PendingOpen\(Mutex<std::collections::HashMap<String, OpenRequest>>\)/.test(rustDrift)) {
    fail('按窗口隔离 canary 失效：注入全局单槽后未被检出');
  }

  // canary：注入一处 window.prompt，同一条检查必须检出
  const drift = desktopSrc.replace('const answer = await askUser({', "const answer = window.prompt('x') ?? ''; void (0, {");
  if (drift === desktopSrc) {
    fail('原生确认面板 canary 未武装：注入点未命中');
  } else if (!/window\.prompt\(/.test(drift)) {
    fail('原生确认面板 canary 失效：注入后未检出');
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Shell widget contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Shell widgets: Tabbar/tab-overview/autoHideTabBar fully removed (B1 SDI); mode indicators (focus/typewriter) conditional + click-to-exit + low-noise CSS; editor-topbar is a pure action strip (no filename, macOS sidebar entry, 34px baseline); standalone EditorToolbar retired in favour of the floating selection toolbar (V7-W2.4); word count clickable in status bar + optional title-bar count (V7-W2.6/W2.7); sidebar mode-menu dead CSS removed (V7-W2.8); dirty-document leave prompt is an in-app Save / Discard / Cancel dialog with every guard call site awaited (V7-W6, G7-EDIT-09); leave-time auto save lives in guardSingleDocument only — applyTab must not auto save (G7-EDIT-11)');
