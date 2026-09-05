/**
 * Shell Widget 契约护栏（B1 修订：Tabbar 移除，保留 P2-2.5 模式状态指示）
 *
 * B1（SDI）—— Tabbar / 多标签 UI 全量移除（typora-parity-b1-sdi-plan.md）：
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
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const stylesSource = read('apps/desktop/src/styles.css');
const appSource = read('apps/desktop/src/App.tsx');
const messagesSource = read('packages/i18n/src/messages.ts');
const desktopUiIndex = read('packages/desktop-ui/src/index.ts');

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

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Shell widget contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Shell widgets: Tabbar/tab-overview/autoHideTabBar fully removed (B1 SDI); mode indicators (focus/typewriter) conditional + click-to-exit + low-noise CSS');
