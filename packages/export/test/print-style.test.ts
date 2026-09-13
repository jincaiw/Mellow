/**
 * 打印样式表（printStyle.ts）—— 屏幕留白不得进入打印。
 *
 * 立此测试的原因（2026-09-13 实机对照 Typora 时发现）：
 * 桌面端 `file.print` 直接打印主 Webview，而主 Webview 的**屏幕**留白会一并进入打印：
 *   · Reader `.mellow-reader { padding: 56px 32px 30vh }` —— 30vh 底部留白会额外
 *     产生**尾部空白页**；
 *   · 编辑器 `.cm-content { paddingBottom: 50vh }`（CoreEditor 的滚动手感留白）
 *     —— `file.print` 的 enabled 为 always，从编辑器直接打印同样产生空白页。
 * Typora 亦在 `@media print` 内把 `#write` 的 padding-top / padding-bottom 归零，
 * 属同类处理。以下断言锁定该行为，防止被误删（这类「打印才生效」的规则很容易在
 * 重构时被视为无用样式清掉）。
 */

import { printStylesheet, PRINT_STYLESHEET } from '../src/printStyle';

describe('printStylesheet — 屏幕留白归零（防尾部空白页）', () => {
  const css = printStylesheet();

  test('@media print 内把 Reader / 编辑器 / 滚动容器 的 padding 归零', () => {
    const printBlock = css.slice(css.indexOf('@media print'));
    expect(printBlock).toContain('.mellow-reader');
    expect(printBlock).toContain('.cm-content');
    expect(printBlock).toContain('.cm-scroller');
    // 必须 !important —— 屏幕规则（.mellow-reader / .cm-content）优先级更高或同源，
    // 不加 !important 会被覆盖，表现为「打印仍有空白页」。
    const paddingRule = printBlock.match(/\.mellow-reader,\s*\n?\s*\.cm-content,\s*\n?\s*\.cm-scroller\s*\{[^}]*\}/);
    expect(paddingRule).not.toBeNull();
    expect(paddingRule?.[0]).toMatch(/padding:\s*0\s*!important/);
  });

  test('首个元素的上边距归零（@page 已提供页边距）', () => {
    const printBlock = css.slice(css.indexOf('@media print'));
    expect(printBlock).toMatch(/\.mellow-reader\s*>\s*:first-child/);
    expect(printBlock).toMatch(/margin-top:\s*0\s*!important/);
  });

  test('保留纸张与页边距控制（@page）', () => {
    expect(css).toContain('@page');
    expect(css).toMatch(/@page\s*\{[^}]*size:/);
    expect(css).toMatch(/@page\s*\{[^}]*margin:/);
  });

  test('A4 默认样式表同样包含留白归零规则', () => {
    expect(PRINT_STYLESHEET).toContain('.mellow-reader');
    expect(PRINT_STYLESHEET).toContain('padding: 0 !important');
  });

  test('canary：移除留白归零规则时，本测试的判定条件会失败', () => {
    // 模拟「有人把这组规则删掉」：仅保留 @media print 到结尾之外的内容
    const withoutReset = css.replace(/\.mellow-reader,\s*\n?\s*\.cm-content,\s*\n?\s*\.cm-scroller\s*\{[^}]*\}/, '');
    expect(withoutReset).not.toBe(css); // 注入确实生效（锚点未漂移）
    expect(/padding:\s*0\s*!important/.test(withoutReset)).toBe(false);
  });
});
