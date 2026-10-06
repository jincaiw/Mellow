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

// ── 权威 spec 的硬数字必须等于代码单一真源（2026-10-01，审计 §4.69；2026-10-06 §4.118 扩 §6）──
// 立节原因（实测）：`desktop-ui-design-spec` 是**权威层**（优先级高于 ADR / plan），
// 但它的一组硬数字在实现按 Typora 真值对齐后**没同步**：
//   §5 侧栏 default 260 / min 200（实为 270 / 160）
//   §8 writing width default 820 / line-height 1.65（实为 860 / 1.6）
//   §3 macOS 1180×780（实为三平台统一 1200×800）
//   §6 文件树行高 26–30 px（实为 24，2026-10-06 补）
// 即「同一组数值两处维护，只改了一处」—— 与 `TYPOGRAPHY_DEFAULTS` 那次修复**同型**：
// 那次把 settings 默认 / App 回落 / Reader CSS **三处**统一了，**spec 这「第四处」被漏掉**。
//
// 判据：从**单一真源**读数值，断言 spec 的**声明行**与之相等
// （**不是**从 spec 取值再断言它等于自己 —— 那是恒真）。
// ⚠️ 只认「列表项」形态（行首 `-`）⇒ spec 里用 `>` 引用块写下的**更正说明**不会自我命中
// （本条首版的设计要点；同 §4.51「护栏检出自己写的注释」的处置）。
// ⚠️ **范围限制**：只覆盖**能解析出单一数值**的硬数字。§4（Tabs 整节作废）与 §10（默认可见字段集，
// 已由 `packages/desktop-ui/test/statusbar-defaults.test.ts` 单测锁住）**不在**本条内。
{
  const specSrc = read('docs/specs/desktop-ui-design-spec.md');
  const specSection = (title) => {
    const at = specSrc.indexOf(title);
    if (at < 0) return '';
    const next = specSrc.indexOf('\n## ', at + 1);
    return specSrc.slice(at, next < 0 ? specSrc.length : next);
  };
  const listValue = (text, re) => {
    for (const line of text.split('\n')) {
      const m = re.exec(line);
      if (m !== null) return Number(m[1]);
    }
    return null;
  };
  const check = (what, specValue, truthValue, where) => {
    if (specValue === null) {
      fail(`desktop-ui-design-spec ${where} 找不到「${what}」的**声明行**（行首 \`- \`）`
        + ' —— 判据锚点漂移，别静默跳过');
    } else if (truthValue === null) {
      fail(`${where}「${what}」的单一真源解析失败（护栏取不到真值，判据会变成空壳）`);
    } else if (specValue !== truthValue) {
      fail(`desktop-ui-design-spec ${where} 声明「${what}」= ${specValue}，而单一真源是 ${truthValue}`
        + ' —— 权威层与代码不一致（改了一处没改另一处）');
    }
  };

  // §5 Sidebar：单一真源 = App.tsx 的 SIDEBAR_* 常量
  const side = specSection('## 5. Sidebar');
  const sidebarConst = (name) => {
    const n = Number(new RegExp(`const ${name} = (\\d+);`).exec(appSource)?.[1] ?? NaN);
    return Number.isNaN(n) ? null : n;
  };
  check('default 宽度', listValue(side, /^-\s*default\s*\*{0,2}(\d+)\*{0,2}\s*px/), sidebarConst('SIDEBAR_DEFAULT_WIDTH'), '§5');
  check('min 宽度', listValue(side, /^-\s*min\s*\*{0,2}(\d+)/), sidebarConst('SIDEBAR_MIN_WIDTH'), '§5');

  // §8 Editor Surface：单一真源 = TYPOGRAPHY_DEFAULTS（本节上方已解析出 defWritingWidth / defLineHeight）
  const editor = specSection('## 8. Editor Surface');
  check('writing width 默认值', listValue(editor, /^-\s*\*{0,2}(\d+)\*{0,2}\s*default/), defWritingWidth, '§8');
  check('line-height', listValue(editor, /^-\s*line-height\s*\*{0,2}([0-9.]+)/), defLineHeight, '§8');

  // §3 Window：单一真源 = src-tauri/src/window.rs 的 inner_size
  const win = specSection('## 3. Window');
  const innerSize = /inner_size\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/.exec(read('apps/desktop/src-tauri/src/window.rs'));
  check('初始宽度（Windows/Linux）',
    listValue(win, /^-\s*Windows\/Linux：\s*(\d+)\s*×/),
    innerSize === null ? null : Number(innerSize[1]),
    '§3');
  // 注：§3 的 macOS `1180 × 780` **不纳入**本判据 —— 它未实现，已在 spec 内如实标注为
  // 「未实现的建议值」（非有意差异）；断言它等于真值会得到一个必然失败的门禁。

  // §6 File Tree 行高（2026-10-06 补，审计 §4.118）：单一真源 = styles.css 的 `.tree-row` 规则。
  // 立此条的原因：本节原写 `26–30 px`，而实现是 `min-height: 24px`（有意对齐 Typora 的
  // `line-height: 22px` + 上下各 1px padding）⇒ **同一组数值两处维护、只改了一处**，
  // 与 §5（260/200 → 270/160）、§8（820/1.65 → 860/1.6）**同型**。
  // ⚠️ 取值方式：**从 `.tree-row` 规则本体现读** `min-height`，不写死 24 ——
  //    写死会让本判据在实现改动后**仍然通过**（恒真）。
  // ⚠️ 不锁选择器形状（`.tree-row,` 与 `.file-tree .tree-row {` 是同一规则的两行写法）；
  //    只要求「首个 `.tree-row` 规则块里能读到 min-height」。
  {
    const firstRuleBlock = (src, selector) => {
      const at = src.indexOf(`\n${selector}`);
      if (at < 0) return null;
      const open = src.indexOf('{', at);
      const close = src.indexOf('}', open);
      if (open < 0 || close < 0) return null;
      return src.slice(open + 1, close);
    };
    const treeRowBlock = firstRuleBlock(stylesSource, '.tree-row');
    const treeRowMinHeight = treeRowBlock === null
      ? null
      : Number(/min-height:\s*(\d+)px/.exec(treeRowBlock)?.[1] ?? NaN);
    check('行高',
      listValue(specSection('## 6. File Tree'), /^-\s*\*{0,2}(\d+)\*{0,2}\s*px/),
      Number.isNaN(treeRowMinHeight) ? null : treeRowMinHeight,
      '§6');
    // canary：判据必须能区分「一致 / 不一致」两个方向（且不能因为找不到规则块而静默放过）
    const driftedStyles = stylesSource.replace('min-height: 24px;\n  display: flex;', 'min-height: 30px;\n  display: flex;');
    const driftedBlock = firstRuleBlock(driftedStyles, '.tree-row');
    if (driftedStyles === stylesSource || driftedBlock === null
      || Number(/min-height:\s*(\d+)px/.exec(driftedBlock)?.[1] ?? NaN) !== 30) {
      errors.push('§6 行高判据 canary 未武装：无法从 `.tree-row` 规则现读出漂移后的值（锚点已漂移）');
    } else if (!/^-\s*\*{0,2}(\d+)\*{0,2}\s*px/.test('- **24** px')) {
      errors.push('§6 行高判据 canary 失效：声明行形态（`- **24** px`）未被识别');
    }
  }

  // canary：四个方向（判据与 canary 共用 listValue）
  {
    const parseDefault = (t) => listValue(t, /^-\s*default\s*\*{0,2}(\d+)\*{0,2}\s*px/);
    if (parseDefault('## 5. Sidebar\n\n- default **270** px\n') !== 270
      || parseDefault('## 5. Sidebar\n\n- default **260** px\n') !== 260) {
      errors.push('spec 数值一致性护栏 canary 失效：default 宽度解析不能区分正/负样本');
    }
    if (parseDefault('## 5. Sidebar\n\n> 本节原写 `- default 260 px`（更正说明）\n\n- default **270** px\n') !== 270) {
      errors.push('spec 数值一致性护栏 canary 失效：**引用块里的更正说明**被当成了声明行（会自我命中）');
    }
    if (parseDefault('## 5. Sidebar\n\n宽度：\n') !== null) {
      errors.push('spec 数值一致性护栏 canary 过宽：没有声明行时不应返回数值');
    }
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
// ── Reader 段内单换行必须保留（V7-W6，G7-EDIT-14）──────────────────────────
//
// 立节原因：Typora 的菜单 `Edit → Whitespace and Line Breaks → Preserve single line break`
// **默认勾选**（一手证据：`main.js` 的 `setIgnoreLineBreak` → `state: !e`，而 `ignoreLineBreak`
// 默认 false），且 Mellow 编辑器本身是 CM6 **行式渲染**（单 `\n` 必然显示为换行）。
// 而 Reader 此前把段落 `join(' ')` 折叠、**引用却保留 `<br>`**（自身不一致）→
// 「编辑区看得见换行、切到 Reader 就消失」。这类不一致**必须开 Reader 才发现**，故锁进 CI 护栏。
{
  const readerSource = read('packages/app-core/src/reader.ts');
  // 断言前必须剥注释：本节的说明文字里就有 `join(' ')` 字样，否则会**自我命中**（假阳性）。
  const readerCode = readerSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  if (!/function renderInlineWithSoftBreaks\(lines: readonly string\[\]\): string/.test(readerCode)) {
    fail('Reader 缺少 renderInlineWithSoftBreaks（段内软换行 → <br> 的统一入口）');
  }
  if (!/const SOFT_BREAK_MARK = '\\uE001'/.test(readerCode)) {
    fail('Reader 缺少软换行哨兵 SOFT_BREAK_MARK —— 逐行渲染会切断跨行行内标记（如跨软换行的粗体）');
  }
  // 链路：段落分支 → pushInlineParagraph → renderInlineWithSoftBreaks
  if (!/pushInlineParagraph\(para, paraOffset\)/.test(readerCode)) {
    fail('Reader 段落分支未把「整段行数组」交给 pushInlineParagraph（应为 pushInlineParagraph(para, …)）');
  }
  if (!/renderInlineWithSoftBreaks\(paraLines\)/.test(readerCode)) {
    fail('pushInlineParagraph 未走 renderInlineWithSoftBreaks（段落软换行会被折叠）');
  }
  if (!/renderInlineWithSoftBreaks\(quoteLines\)/.test(readerCode)) {
    fail('Reader 引用未与段落共用 renderInlineWithSoftBreaks（两者必须同源，否则又会不一致）');
  }
  // 不变量：reader 代码里不得再用 `join(' ')` 把段内行折叠（段落/引用都会命中）
  if (/\.join\(' '\)/.test(readerCode)) {
    fail("Reader 仍存在 .join(' ') 的段落折叠（应与引用一致保留 <br>）");
  }
  const softBreakDrift = readerCode.replace('renderInlineWithSoftBreaks(paraLines)', "renderInline(paraLines.join(' '))");
  if (softBreakDrift === readerCode) {
    fail('Reader 软换行 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else if (!/\.join\(' '\)/.test(softBreakDrift)) {
    fail('Reader 软换行 canary 失效：注入的「折叠」漂移未被检出');
  }
}

if (errors.length > 0) {
  throw new Error(`Shell typography contract violations:\n  ${errors.join('\n  ')}`);
}

console.log(`Shell typography: line-height chain intact (CSS var → Reader; setEditorConfig → iframe editor); editor padding Top 56px (adapter-injected) / Bottom 50vh (≥30vh) shared across themes; typography single source TYPOGRAPHY_DEFAULTS{fontSize ${defFontSize}, lineHeight ${defLineHeight}, writingWidth ${defWritingWidth}} cross-checked against settings defaults + Reader CSS fallbacks; ${''
}--- V7-W4 ---${''
} W4.3 单图独占段落居中（Typora \`p > img:only-child\`）：widget 按「行内无其他内容」判定（图文混排 / 两图并排均不居中）+ centered 参与 widget 相等判定（居中态随编辑更新）+ 5 例单测;${''
} W4.8 主题数量文档一致：内置 ${themeIds.length} 主题，注释声明 ${declared} 个（交叉比对，防再次失真）;${''
}--- V7-W5 ---${''
} 正文字号双消费方同源：Reader 消费 --mellow-content-font-size（回落 ${defFontSize}px）+ 编辑器 setEditorConfig，三个写入点（启动恢复 / 缩放 / live apply）齐全（消除「设置 20px、Reader 仍 16px」）;${''}
}--- V7-W6 ---${''}
} Reader 段内单换行保留为 <br>（Typora「Preserve single line break」默认开）：段落与引用共用 renderInlineWithSoftBreaks（哨兵法整段渲染，跨行行内标记不被切断）`);
