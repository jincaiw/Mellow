/**
 * 异步渲染 hook：为 Reader / Split Preview 的渲染 HTML 执行 math / mermaid 渲染。
 * - math：MathJax（tex2chtmlPromise，若宿主注入）优先；否则按需动态加载 KaTeX
 *   + mhchem（R3-2：`\ce{}`/`\pu{}` 化学式），renderToString 渲染；
 * - mermaid：window.mermaid / __MELLOW_MERMAID_LOADER__；
 * - 全部无库时保留源码。
 */

import { useEffect } from 'react';
import { createMermaid11Renderer } from '../../../packages/editor-engine/src/mermaid';
import { loadKatex, renderKatex } from './katexLoader';

let mermaidId = 0;

export function useAsyncRenderers(contentRef: React.RefObject<HTMLElement | null>, html: string): void {
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const win = window as unknown as {
      MathJax?: { tex2chtmlPromise?: (tex: string, opts?: { display?: boolean }) => Promise<HTMLElement> };
      mermaid?: unknown;
      __MELLOW_MERMAID_LOADER__?: unknown;
    };

    const mathEls = Array.from(root.querySelectorAll<HTMLElement>('.mellow-reader-math, .mellow-reader-math-block'));
    if (mathEls.length > 0) {
      if (win.MathJax?.tex2chtmlPromise !== undefined) {
        for (const el of mathEls) {
          const tex = el.dataset.tex ?? '';
          if (tex === '' || el.dataset.rendered === '1') continue;
          el.dataset.rendered = '1';
          const display = el.classList.contains('mellow-reader-math-block');
          void win.MathJax.tex2chtmlPromise!(tex, { display }).then((node) => {
            el.replaceChildren(node);
          }).catch(() => { /* 保留源码 */ });
        }
      } else {
        // R3-2：无 MathJax 时按需加载 KaTeX（含 mhchem \ce/\pu）
        void loadKatex().then((katex) => {
          for (const el of mathEls) {
            const tex = el.dataset.tex ?? '';
            if (tex === '' || el.dataset.rendered === '1') continue;
            el.dataset.rendered = '1';
            const display = el.classList.contains('mellow-reader-math-block');
            const html = renderKatex(katex, tex, display);
            if (html !== null) el.innerHTML = html;
          }
        }).catch(() => { /* KaTeX 加载失败保留源码 */ });
      }
    }

    for (const el of Array.from(root.querySelectorAll<HTMLElement>('.mellow-reader-mermaid'))) {
      const source = el.dataset.source ?? '';
      if (source === '' || el.dataset.rendered === '1') continue;
      el.dataset.rendered = '1';
      const api = win.mermaid ?? win.__MELLOW_MERMAID_LOADER__;
      if (api === undefined) continue;
      const renderer = createMermaid11Renderer(() => api as never);
      mermaidId += 1;
      void renderer.render({ id: `mellow-reader-${mermaidId}`, source }).then((result) => {
        el.innerHTML = result.svg;
      }).catch(() => { /* 保留源码 */ });
    }
  }, [html, contentRef]);
}
