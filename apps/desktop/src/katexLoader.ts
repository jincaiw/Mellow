/**
 * KaTeX 按需加载器（master-plan R3-2）。
 *
 * 首次遇到公式才动态 import（katex + mhchem 扩展 + 主窗口 CSS）；
 * 供 Reader（useAsyncRenderers）与编辑器 iframe 渲染通道共用。
 */

import katexCssUrl from 'katex/dist/katex.min.css?url';

let katexPromise: Promise<typeof import('katex')['default']> | null = null;

/** KaTeX（含 mhchem \ce/\pu 扩展）按需加载单例 */
export function loadKatex(): Promise<typeof import('katex')['default']> {
  katexPromise ??= Promise.all([
    import('katex'),
    import('katex/contrib/mhchem'),
    import('katex/dist/katex.min.css'),
  ]).then(([k]) => k.default);
  return katexPromise;
}

/** KaTeX CSS URL（vite ?url 产物；iframe <link> 注入用） */
export const KATEX_CSS_URL: string = katexCssUrl;

/** 渲染封装：throwOnError=false 宽容渲染；异常返回 null（调用方回退源码显示） */
export function renderKatex(katex: typeof import('katex')['default'], tex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return null;
  }
}

/** 向编辑器 iframe document 注入 KaTeX 样式（幂等） */
export function injectKatexCssIntoFrame(frame: HTMLIFrameElement | null | undefined): void {
  const doc = frame?.contentDocument;
  if (doc === null || doc === undefined) return;
  if (doc.querySelector('link[data-mellow-katex-css]') !== null) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = KATEX_CSS_URL;
  link.dataset.mellowKatexCss = '1';
  doc.head.appendChild(link);
}
