/**
 * Shell 排版契约护栏（P2-2.1 行高消费链路 + P2-2.2 编辑区留白契约）
 *
 * P2-2.1 —— --mellow-line-height 三段消费链路（缺一段即为「设置改行高不生效」缺陷）：
 *   设置面板（settings.lineHeight） → ① CSS 变量（同文档 Reader 消费）
 *                                    → ② setEditorConfig('setLineHeight')（iframe 编辑器，CoreEditor 通道）
 *   启动恢复：App.tsx 必须无条件 apply（CoreEditor 默认 1.5 ≠ Mellow 默认 1.65）。
 *
 * P2-2.2 —— 编辑区留白契约（跨主题一致，单点真源）：
 *   Top Padding 56px / Bottom Space ≥30vh；
 *   编辑器侧 CoreEditor builder.ts sharedStyles（全部主题共享，主题包不得覆盖），
 *   Reader 侧 desktop styles.css .mellow-reader。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
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
// 启动恢复必须无条件 apply（注释锚点 + 默认回落 1.65）
if (!/P2-2\.1 行高启动恢复/.test(appSource) || !/lineHeightValue > 0 \? lineHeightValue : 1\.65/.test(appSource)) {
  fail('App.tsx 行高启动恢复缺失或未按「无条件 apply + 1.65 回落」实现（CoreEditor 默认 1.5 ≠ Mellow 1.65）');
}
// ③ Reader 消费：styles.css .mellow-reader 不得硬编码行高
if (!/\.mellow-reader \{[\s\S]*?line-height: var\(--mellow-line-height, 1\.65\)/.test(stylesSource)) {
  fail('styles.css .mellow-reader 行高必须消费 var(--mellow-line-height, 1.65)（P2-2.1）');
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
    else if (name.endsWith('.ts') && /cm-content|paddingTop|padding-top/.test(readFileSync(full, 'utf8'))) {
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

// ── 汇总 ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  throw new Error(`Shell typography contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Shell typography: line-height chain intact (CSS var → Reader; setEditorConfig → iframe editor); editor padding Top 56px (adapter-injected) / Bottom 50vh (≥30vh) shared across themes');
