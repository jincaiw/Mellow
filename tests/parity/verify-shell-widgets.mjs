/**
 * Shell Widget 契约护栏（P2-2.3 Tab overflow + P2-2.4 Tab 右键菜单 + P2-2.5 模式状态指示）
 *
 * P2-2.3 —— Tab 溢出行为（验收：20 Tab 不破版）：
 *   ① active 变化自动 scrollIntoView（滚动到可视区）；
 *   ② tab 数量达阈值进入 compact（缩窄），溢出由 overflow-x 滚动兜底。
 *
 * P2-2.4 —— Tab 右键菜单：关闭 / 关闭其他 / 关闭右侧 / 重新打开；
 *   关闭其他/右侧以被右键 tab 为锚点（handle* 可选 anchorId 参数），
 *   zh/en 文案必须齐备。
 *
 * P2-2.5 —— 模式状态指示（不常驻，轻量，验收：可见且低干扰）：
 *   ① 仅非默认模式时渲染 badge（默认 off/false 时 DOM 零输出，即「不常驻」）；
 *   ② badge 可点击退出对应模式（Focus → off / Typewriter → false）；
 *   ③ Reader（自带 bar）与 Slash（瞬态面板、默认开启）不做常驻指示；
 *   ④ CSS 低干扰（12px、半透明 opacity、pointer-events 穿透容器）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const tabbarSource = read('packages/desktop-ui/src/Tabbar.tsx');
const stylesSource = read('apps/desktop/src/styles.css');
const appSource = read('apps/desktop/src/App.tsx');
const messagesSource = read('packages/i18n/src/messages.ts');

// ── P2-2.3：Tab overflow ─────────────────────────────────────────────────
if (!/scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/.test(tabbarSource)) {
  fail('Tabbar 缺少 active tab scrollIntoView（block/inline nearest，P2-2.3）');
}
if (!/\[activeTabId, tabs\.length\]/.test(tabbarSource)) {
  fail('Tabbar 滚动 effect 依赖缺失（[activeTabId, tabs.length]），关闭/新建后不会滚动到 active');
}
if (!/const COMPACT_THRESHOLD = \d+;/.test(tabbarSource)) {
  fail('Tabbar 缺少 COMPACT_THRESHOLD 常量（compact 档位，P2-2.3）');
}
const compactBlock = /\.tabbar\.compact \.tab \{[^}]*\}/.exec(stylesSource)?.[0];
if (!compactBlock || !/min-width: 56px/.test(compactBlock) || !/max-width: 140px/.test(compactBlock)) {
  fail('styles.css 缺少 .tabbar.compact .tab 缩窄规则（min 56px / max 140px，P2-2.3）');
}

// ── P2-2.4：Tab 右键菜单 ─────────────────────────────────────────────────
if (!/onTabContextMenu\?: \(tabId: string, x: number, y: number\) => void/.test(tabbarSource)) {
  fail('Tabbar 缺少 onTabContextMenu prop（P2-2.4）');
}
if (!/onContextMenu=\{onTabContextMenu === undefined[\s\S]*?preventDefault\(\)/.test(tabbarSource)) {
  fail('Tabbar tab 元素未接 onContextMenu preventDefault（P2-2.4）');
}
for (const key of ['tab.ctx.close', 'tab.ctx.closeOthers', 'tab.ctx.closeRight', 'tab.ctx.reopenClosed']) {
  let count = 0;
  for (const [, value] of messagesSource.matchAll(new RegExp(`'${key}': '([^']*)'`, 'g'))) {
    if (value.trim() !== '') count += 1;
  }
  if (count < 2) fail(`Tab 右键文案 ${key} 需 zh/en 双语且非空（实际 ${count} 组）`);
  if (!appSource.includes(`t('${key}')`)) fail(`App.tsx Tab 右键菜单缺少条目 ${key}`);
}
if (!/const handleCloseOthers = useCallback\(async \(anchorId\?: string\)/.test(appSource) ||
    !/const handleCloseRight = useCallback\(async \(anchorId\?: string\)/.test(appSource)) {
  fail('handleCloseOthers/handleCloseRight 需支持可选 anchorId 锚点参数（P2-2.4 右键以被右键 tab 为基准）');
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
const driftedTabbar = tabbarSource.replace("scrollIntoView({ block: 'nearest', inline: 'nearest' })", 'scrollIntoView()');
if (/scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/.test(driftedTabbar)) {
  fail('Tab overflow 护栏自检失败：无法模拟 scrollIntoView 漂移，护栏已失效');
}
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

console.log('Shell widgets: tab overflow scroll-to-active + compact armed; tab context menu (close/others/right/reopen) bilingual with anchor semantics; mode indicators (focus/typewriter) conditional + click-to-exit + low-noise CSS');
