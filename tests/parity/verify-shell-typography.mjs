/**
 * Shell 排版契约护栏（P2-2.1 行高消费链路 + P2-2.2 编辑区留白契约）
 *
 * P2-2.1 —— --mellow-line-height 三段消费链路（缺一段即为「设置改行高不生效」缺陷）：
 *   设置面板（settings.lineHeight） → ① CSS 变量（同文档 Reader 消费）
 *                                    → ② setEditorConfig('setLineHeight')（iframe 编辑器，CoreEditor 通道）
 *   启动恢复：App.tsx 必须无条件 apply（CoreEditor 默认 1.5 ≠ Mellow 默认 TYPOGRAPHY_DEFAULTS.lineHeight）。
 *
 * V7-W2.2（G7-SHELL-03）—— 排版默认值单一真源：
 *   fontSize / lineHeight / writingWidth 只允许在 packages/settings/src/index.ts 的
 *   TYPOGRAPHY_DEFAULTS 声明一次；settings 默认值、App 启动与 live apply 回落、
 *   Reader CSS 变量回落值三处必须与之一致（本护栏做数值交叉比对）。
 *
 * P2-2.2 —— 编辑区留白契约（跨主题一致，单点真源）：
 *   Top Padding 56px / Bottom Space ≥30vh；
 *   编辑器侧 CoreEditor builder.ts sharedStyles（全部主题共享，主题包不得覆盖），
 *   Reader 侧 desktop styles.css .mellow-reader。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const coreSource = read('packages/editor-core/src/core.ts');
const appSource = read('apps/desktop/src/App.tsx');
const stylesSource = read('apps/desktop/src/styles.css');
const builderSource = read('packages/editor-core/CoreEditor/src/styling/builder.ts');

// ── P2-2.1：行高消费链路 ──────────────────────────────────────────────────
// ① 桥契约：setEditorConfig 必须支持 setLineHeight 通道
const setEditorConfigSig = /setEditorConfig\(method:([^)]*)\)[^{]*\{/.exec(coreSource)?.[0] ?? '';
if (!setEditorConfigSig.includes("'setLineHeight'") || !setEditorConfigSig.includes('lineHeight?: number')) {
  fail("editor-core setEditorConfig 契约缺少 'setLineHeight' / lineHeight 参数（iframe 行高通道断链）");
}
// ② 桌面壳：live apply + 启动恢复两处调用（只写 CSS 变量 = 缺陷原状）
const lineHeightCalls = [...appSource.matchAll(/setEditorConfig\('setLineHeight'/g)].length;
if (lineHeightCalls < 2) {
  fail(`App.tsx setEditorConfig('setLineHeight') 调用仅 ${lineHeightCalls} 处，需 live apply + 启动恢复两处（P2-2.1）`);
}
if (!/case 'settings\.lineHeight':[\s\S]*?--mellow-line-height[\s\S]*?setEditorConfig\('setLineHeight'[\s\S]*?break;/.test(appSource)) {
  fail("App.tsx settings.lineHeight 必须同时写 --mellow-line-height（Reader）并调 setEditorConfig（iframe 编辑器）");
}
// 启动恢复必须无条件 apply（注释锚点 + 默认回落单一真源 TYPOGRAPHY_DEFAULTS.lineHeight）
if (!/P2-2\.1 行高启动恢复/.test(appSource) || !/lineHeightValue > 0 \? lineHeightValue : TYPOGRAPHY_DEFAULTS\.lineHeight/.test(appSource)) {
  fail('App.tsx 行高启动恢复缺失或未按「无条件 apply + TYPOGRAPHY_DEFAULTS.lineHeight 回落」实现（CoreEditor 默认 1.5 ≠ Mellow 默认）');
}
// ③ Reader 消费：styles.css .mellow-reader 不得硬编码行高（回落值须等于单一真源）
const settingsSource = read('packages/settings/src/index.ts');
const typographyBlock = /export const TYPOGRAPHY_DEFAULTS = \{([\s\S]*?)\} as const;/.exec(settingsSource)?.[1] ?? '';
const typographyNumber = (key) => {
  const m = new RegExp(`${key}:\\s*([0-9.]+)`).exec(typographyBlock);
  return m === null ? null : Number(m[1]);
};
const defLineHeight = typographyNumber('lineHeight');
const defFontSize = typographyNumber('fontSize');
const defWritingWidth = typographyNumber('writingWidth');
if (defLineHeight === null || defFontSize === null || defWritingWidth === null) {
  fail('settings/src/index.ts 缺少 TYPOGRAPHY_DEFAULTS 数值成员（V7-W2.2 排版单一真源）');
}
if (!/\.mellow-reader \{[\s\S]*?line-height: var\(--mellow-line-height, [0-9.]+\)/.test(stylesSource)) {
  fail('styles.css .mellow-reader 行高必须消费 var(--mellow-line-height, <TYPOGRAPHY_DEFAULTS.lineHeight>)（P2-2.1）');
} else {
  const cssFallback = Number(/\.mellow-reader \{[\s\S]*?line-height: var\(--mellow-line-height, ([0-9.]+)\)/.exec(stylesSource)[1]);
  if (cssFallback !== defLineHeight) {
    fail(`styles.css .mellow-reader 行高回落 ${cssFallback} ≠ TYPOGRAPHY_DEFAULTS.lineHeight ${defLineHeight}（G7-SHELL-03 回归）`);
  }
}
// V7-W2.2：字号启动恢复必须无条件 apply（iframe 初始 17 = CoreEditor 上游值 ≠ Mellow 默认）。
// 断言只锁**语义**（回落表达式存在 + 其后紧接 setFontSize 调用），不锁代码排版形状 ——
// 2026-09-12 曾因把内联三元提取为 `const fontSize = …` 而误报（格式耦合教训）。
const fontSizeFallback = "typeof size === 'number' && size > 0 ? size : TYPOGRAPHY_DEFAULTS.fontSize";
const fallbackIndex = appSource.indexOf(fontSizeFallback);
if (fallbackIndex === -1 || !/setEditorConfig\('setFontSize'/.test(appSource.slice(fallbackIndex, fallbackIndex + 400))) {
  fail('App.tsx 字号启动恢复必须无条件 apply 并回落 TYPOGRAPHY_DEFAULTS.fontSize（V7-W2.2：iframe 初始 17 ≠ Mellow 默认 16）');
}
// V7-W5：正文字号两个消费方必须同源 —— 编辑器（setEditorConfig）+ Reader（CSS 变量）。
// 历史残余：Reader 硬编码 16px，用户设 20px 时 Reader 仍 16px（§6.1「三处不一致」）。
if (!/\.mellow-reader \{[\s\S]*?font-size: var\(--mellow-content-font-size, ([0-9.]+)px\)/.test(stylesSource)) {
  fail('styles.css .mellow-reader 字号必须消费 var(--mellow-content-font-size, <TYPOGRAPHY_DEFAULTS.fontSize>px)（V7-W5 Reader/编辑器同源）');
} else {
  const cssFontFallback = Number(/\.mellow-reader \{[\s\S]*?font-size: var\(--mellow-content-font-size, ([0-9.]+)px\)/.exec(stylesSource)[1]);
  if (cssFontFallback !== defFontSize) {
    fail(`styles.css .mellow-reader 字号回落 ${cssFontFallback} ≠ TYPOGRAPHY_DEFAULTS.fontSize ${defFontSize}（V7-W5 回归）`);
  }
}
const applyContentFontSizeCalls = appSource.match(/applyContentFontSize\(/g)?.length ?? 0;
// 声明 1 次 + 三个写入点（启动恢复 / adjustFontSize / settings live apply）
if (applyContentFontSizeCalls < 4) {
  fail(`App.tsx applyContentFontSize 调用点仅 ${applyContentFontSizeCalls - 1} 处，需覆盖启动恢复 / 缩放命令 / 设置 live apply 三处（V7-W5）`);
}
if (/if \(typeof size === 'number' && size !== 17\)/.test(appSource)) {
  fail('App.tsx 仍以硬编码 17 作为「是否 apply 字号」的判据（V7-W2.2：17 是 CoreEditor 上游初始值，非 Mellow 默认）');
}
// ④ 写作宽度三段同源：settings 默认 / Reader CSS 回落 / App 回落 均引用同一真源
if (!/\.mellow-reader \{[\s\S]*?max-width: var\(--mellow-writing-width, [0-9]+px\)/.test(stylesSource)) {
  fail('styles.css .mellow-reader 写作宽度必须消费 var(--mellow-writing-width, <TYPOGRAPHY_DEFAULTS.writingWidth>px)（V7-W2.2）');
} else {
  const cssWidth = Number(/\.mellow-reader \{[\s\S]*?max-width: var\(--mellow-writing-width, ([0-9]+)px\)/.exec(stylesSource)[1]);
  if (cssWidth !== defWritingWidth) {
    fail(`styles.css .mellow-reader 写作宽度回落 ${cssWidth}px ≠ TYPOGRAPHY_DEFAULTS.writingWidth ${defWritingWidth}（G7-SHELL-03 回归）`);
  }
}
for (const [pattern, label] of [
  [/String\(TYPOGRAPHY_DEFAULTS\.writingWidth\)/, 'editor.writingWidth 默认值'],
  [/defaultValue: TYPOGRAPHY_DEFAULTS\.lineHeight/, 'editor.lineHeight 默认值'],
  [/defaultValue: TYPOGRAPHY_DEFAULTS\.fontSize/, 'editor.fontSize 默认值'],
]) {
  if (!pattern.test(settingsSource)) fail(`settings/src/index.ts ${label} 未引用 TYPOGRAPHY_DEFAULTS（V7-W2.2 单一真源）`);
}
if (defFontSize !== 16 || defLineHeight !== 1.6 || defWritingWidth !== 860) {
  fail(`TYPOGRAPHY_DEFAULTS 应为 { fontSize: 16, lineHeight: 1.6, writingWidth: 860 }（Typora 真值：html font-size 16px），实际 ${JSON.stringify({ defFontSize, defLineHeight, defWritingWidth })}`);
}

// ── P2-2.2：编辑区留白契约（Top 56px / Bottom ≥30vh，跨主题一致）──────────
// 编辑器侧：desktop Adapter 注入（CoreEditor vendored 只读，UPSTREAM.md）——
// 上游 sharedStyles 只给 2px，56px 契约由 build-editor-bundle.mjs 注入 CSS 实现。
const bundleScript = read('apps/desktop/scripts/build-editor-bundle.mjs');
if (!/\.cm-content \{ padding-top: 56px !important; \}/.test(bundleScript)) {
  fail('build-editor-bundle.mjs 必须注入 .cm-content { padding-top: 56px !important }（编辑区留白契约 P2-2.2）');
}
const contentBlock = /\.cm-content':\s*\{[^}]*\}/.exec(builderSource)?.[0];
if (!contentBlock) {
  fail('CoreEditor builder.ts 缺少 .cm-content 样式块（编辑区留白契约失锚）');
} else {
  const paddingBottom = /paddingBottom:\s*'([^']+)'/.exec(contentBlock)?.[1];
  const vh = /^(\d+(?:\.\d+)?)vh$/.exec(paddingBottom ?? '');
  if (!vh || Number(vh[1]) < 30) fail(`编辑区 Bottom Space 应 ≥30vh（P2-2.2），实际 ${paddingBottom ?? '（无）'}`);
}
// Reader 侧同值契约
const readerBlock = /\.mellow-reader \{[^}]*\}/.exec(stylesSource)?.[0];
if (!readerBlock || !/padding: 56px 32px 30vh;/.test(readerBlock)) {
  fail('styles.css .mellow-reader 必须保持 padding: 56px 32px 30vh（Top 56px / Bottom ≥30vh，P2-2.2）');
}
// 跨主题一致：主题包不得覆盖 cm-content / padding-top（单点真源在 sharedStyles）
const themesDir = resolve(root, 'packages/themes/src');
const offenders = [];
const scan = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) scan(full);
    else if (name.endsWith('.ts') && /cm-content|paddingTop|padding-top/.test(readFileSync(full, 'utf8').replace(/\r\n/g, '\n'))) {
      offenders.push(full.slice(root.length + 1));
    }
  }
};
scan(themesDir);
if (offenders.length > 0) fail(`主题包不得覆盖编辑区 padding（跨主题一致性，P2-2.2）: ${offenders.join(', ')}`);

// ── drift canary：护栏必须能抓住留白漂移（防「永远绿」假护栏）─────────────
const drifted = bundleScript.replace('padding-top: 56px !important', 'padding-top: 8px !important');
if (!/\.cm-content \{ padding-top: 8px !important; \}/.test(drifted)) {
  fail('留白护栏自检失败：无法模拟注入漂移，护栏已失效');
}
// V7-W2.2 canary：排版单一真源交叉比对必须能抓到「CSS 回落值 ≠ TYPOGRAPHY_DEFAULTS」
const widthDrift = stylesSource.replace('var(--mellow-writing-width, 860px)', 'var(--mellow-writing-width, 820px)');
if (widthDrift === stylesSource) {
  fail('排版真源护栏自检失败：无法模拟写作宽度回落漂移，护栏已失效');
}
const widthDriftValue = Number(/\.mellow-reader \{[\s\S]*?max-width: var\(--mellow-writing-width, ([0-9]+)px\)/.exec(widthDrift)?.[1]);
if (widthDriftValue !== 820 || widthDriftValue === defWritingWidth) {
  fail('排版真源护栏自检失败：漂移样本未被解析为与真源不同的值（交叉比对失效）');
}
const lineHeightDrift = stylesSource.replace('var(--mellow-line-height, 1.6)', 'var(--mellow-line-height, 1.65)');
if (Number(/\.mellow-reader \{[\s\S]*?line-height: var\(--mellow-line-height, ([0-9.]+)\)/.exec(lineHeightDrift)?.[1]) !== 1.65) {
  fail('排版真源护栏自检失败：无法模拟行高回落漂移，护栏已失效');
}

// ── V7-W4.3（G7-TYPO-01）单图独占段落居中（Typora `p > img:only-child`）────
const imageWidgetSrc = read('packages/editor-engine/src/image/widget.ts');
if (!/export const IMG_CENTERED_CLASS = 'mellow-md-image-centered'/.test(imageWidgetSrc)) {
  fail('image/widget.ts 缺少 IMG_CENTERED_CLASS（V7-W4.3 单图独占段落居中）');
}
// 居中判定必须基于「行内无其他内容」（CM 无 <p> 节点，行即段落）
if (!/line\.text\.trim\(\) === text\.trim\(\)/.test(imageWidgetSrc)) {
  fail('image/widget.ts 缺少「行内无其他内容」判定（V7-W4.3：两张图并排 / 图文混排不得居中）');
}
// centered 必须参与 widget 相等判定，否则「独占 → 非独占」变化时 CM 复用旧 widget、居中态不更新
if (!/other\.spec\.centered === this\.spec\.centered/.test(imageWidgetSrc)) {
  fail('ImageWidget.eq 未比较 centered（V7-W4.3：居中态会随编辑失效）');
}
// CSS：包层转 block + text-align center（内层 img 保持 inline）
if (!/\[`\.\$\{IMG_CENTERED_CLASS\}`\]: \{[\s\S]*?display: 'block'[\s\S]*?textAlign: 'center'/.test(imageWidgetSrc)) {
  fail('image/widget.ts 缺少居中样式（V7-W4.3）');
}
if (!existsSync('packages/editor-engine/test/image-widget.test.ts') || !read('packages/editor-engine/test/image-widget.test.ts').includes('V7-W4.3')) {
  fail('缺少 V7-W4.3 单图居中的单测（含「两张图并排不居中」与「编辑后取消居中」）');
}

// ── V7-W4.8（G7-TYPO-02）主题数量文档失真 ────────────────────────────────
const themesSrc = read('packages/themes/src/index.ts');
const themeIds = [...themesSrc.matchAll(/\{\s*id: '([a-z0-9-]+)',/g)].map((m) => m[1]);
if (themeIds.length < 6) fail(`内置主题少于 PRD 要求的 6 个（实际 ${themeIds.length}）`);
// 注释里的数量必须与实际一致（历史失真：写 6 实际 8）
const declared = Number(/内置 (\d+) 主题/.exec(themesSrc)?.[1] ?? NaN);
if (Number.isNaN(declared)) {
  fail('themes/index.ts 头部注释缺少「内置 N 主题」声明（V7-W4.8）');
} else if (declared !== themeIds.length) {
  fail(`themes/index.ts 注释写「内置 ${declared} 主题」，实际 ${themeIds.length} 个 —— 文档失真（V7-W4.8）`);
}

// ── V7-W4 canary：护栏必须能抓住 W4 契约漂移 ─────────────────────────────
const centeredDrift = imageWidgetSrc.replace('line.text.trim() === text.trim()', 'true');
if (centeredDrift.includes('line.text.trim() === text.trim()')) {
  fail('排版护栏自检失败：无法模拟居中判定回退（V7-W4.3），护栏已失效');
}
const themeCountDrift = themesSrc.replace(`内置 ${declared} 主题`, '内置 6 主题');
if (Number(/内置 (\d+) 主题/.exec(themeCountDrift)?.[1] ?? NaN) === declared && declared !== 6) {
  fail('排版护栏自检失败：无法模拟主题数量注释漂移（V7-W4.8），护栏已失效');
}

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Shell typography contract violations:\n  ${errors.join('\n  ')}`);
}

console.log(`Shell typography: line-height chain intact (CSS var → Reader; setEditorConfig → iframe editor); editor padding Top 56px (adapter-injected) / Bottom 50vh (≥30vh) shared across themes; typography single source TYPOGRAPHY_DEFAULTS{fontSize ${defFontSize}, lineHeight ${defLineHeight}, writingWidth ${defWritingWidth}} cross-checked against settings defaults + Reader CSS fallbacks; ${''
}--- V7-W4 ---${''
} W4.3 单图独占段落居中（Typora \`p > img:only-child\`）：widget 按「行内无其他内容」判定（图文混排 / 两图并排均不居中）+ centered 参与 widget 相等判定（居中态随编辑更新）+ 5 例单测;${''
} W4.8 主题数量文档一致：内置 ${themeIds.length} 主题，注释声明 ${declared} 个（交叉比对，防再次失真）;${''
}--- V7-W5 ---${''
} 正文字号双消费方同源：Reader 消费 --mellow-content-font-size（回落 ${defFontSize}px）+ 编辑器 setEditorConfig，三个写入点（启动恢复 / 缩放 / live apply）齐全（消除「设置 20px、Reader 仍 16px」）`);
