/**
 * Shell Widget 契约护栏：按 D01 恢复轻量多文档 Tabbar，保留 P2-2.5 模式状态指示。
 * Tabbar 必须单标签静默、支持激活／关闭／新建，且不引入 Tab Overview 的高密度面板。
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
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const stylesSource = read('apps/desktop/src/styles.css');
const appSource = read('apps/desktop/src/App.tsx');
const messagesSource = read('packages/i18n/src/messages.ts');
const desktopUiIndex = read('packages/desktop-ui/src/index.ts');

// ── D01：轻量多文档 Tabbar ───────────────────────────────────────────────
if (!existsSync(resolve(root, 'packages/desktop-ui/src/Tabbar.tsx'))) fail('缺少 desktop-ui Tabbar 组件（D01）');
if (!/export \{ Tabbar \}|export type \{ TabbarProps \}/.test(desktopUiIndex)) fail('desktop-ui index.ts 未导出 Tabbar/TabbarProps（D01）');
if (!/<Tabbar[\s\S]*?tabs=\{documentTabs\}[\s\S]*?onActivate=[\s\S]*?onClose=[\s\S]*?onNew=/.test(appSource)) fail('App.tsx 未将 DocumentState 标签接入 Tabbar 的激活／关闭／新建事件（D01）');
if (!/onContextMenu=\{\(event, id\) => \{ void openTabContextMenu\(event, id\); \}\}/.test(appSource)) fail('Tabbar 未接入命中标签的右键菜单（M04）');
if (!/menu\.file\.closeOtherTabs[\s\S]*?menu\.file\.closeTabsRight[\s\S]*?menu\.file\.reopenClosed/.test(appSource)) fail('标签右键菜单缺少关闭其他／右侧／重新打开操作（M04）');
if (!/if \(tabs\.length < 2\) return null/.test(read('packages/desktop-ui/src/Tabbar.tsx'))) fail('Tabbar 必须在单文档时静默（D06）');
for (const sel of ['.tabbar', '.tab-new', '.tabbar-close']) if (!stylesSource.includes(sel)) fail(`styles.css 缺少 ${sel} 样式（D01）`);
if (/tab-overview-panel|tab-overview-card/.test(appSource) || stylesSource.includes('.tab-overview-panel')) fail('D06 默认界面不得恢复 Tab Overview 面板');
for (const key of ['menu.file.newTab', 'menu.file.closeTab', 'menu.file.reopenClosed']) {
  if (!messagesSource.includes(`'${key}'`)) fail(`i18n 缺少标签命令文案 ${key}`);
}
if (!/const focusExistingDocument = useCallback[\s\S]*?findByPath\(path\)/.test(appSource)) fail('缺少同路径已打开标签的定位守卫（F03）');
for (const name of ['openTreeFile', 'handleOpen', 'openPathInTab']) {
  const block = new RegExp(`const ${name} = useCallback[\\s\\S]*?\\n  }, \\[`, 'm').exec(appSource)?.[0] ?? '';
  if (!block.includes('focusExistingDocument')) fail(`${name} 未复用同路径定位守卫（F03）`);
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

// ── drift canary：护栏必须能抓住契约漂移（防「永远绿」假护栏）─────────────
const noTabs = appSource.replace('tabs={documentTabs}', 'tabs={[]}');
if (!/<Tabbar[\s\S]*?tabs=\{documentTabs\}/.test(appSource) || /<Tabbar[\s\S]*?tabs=\{documentTabs\}/.test(noTabs)) fail('Tabbar 护栏自检失败：无法识别 documentTabs 漂移');
// P2-2.5 canary：模拟「常驻化」漂移（条件渲染退化为 true），条件渲染断言必须失效
const driftedAppForMode = appSource.replace("(focusMode !== 'off' || typewriterEnabled) && (", "(true) && (");
if (!/\{\(focusMode !== 'off' \|\| typewriterEnabled\) && \(\s*<div className="mode-indicators">/.test(appSource) ||
    /\{\(focusMode !== 'off' \|\| typewriterEnabled\) && \(\s*<div className="mode-indicators">/.test(driftedAppForMode)) {
  fail('模式指示护栏自检失败：无法模拟常驻化漂移（P2-2.5），护栏已失效');
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Shell widget contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Shell widgets: quiet multi-document Tabbar verified; mode indicators (focus/typewriter) conditional + click-to-exit + low-noise CSS');
