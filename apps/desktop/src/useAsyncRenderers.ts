/**
 * 异步渲染 hook：为 Reader / Split Preview 的渲染 HTML 执行 math / mermaid 渲染。
 * 无库（window.MathJax / window.mermaid / __MELLOW_MERMAID_LOADER__）时保留源码。
 */

import { useEffect } from 'react';
import { createMermaid11Renderer } from '../../../packages/editor-engine/src/mermaid';

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

    for (const el of Array.from(root.querySelectorAll<HTMLElement>('.mellow-reader-math, .mellow-reader-math-block'))) {
      const tex = el.dataset.tex ?? '';
      if (tex === '' || el.dataset.rendered === '1') continue;
      el.dataset.rendered = '1';
      if (win.MathJax?.tex2chtmlPromise === undefined) continue;
      const display = el.classList.contains('mellow-reader-math-block');
      void win.MathJax.tex2chtmlPromise(tex, { display }).then((node) => {
        el.replaceChildren(node);
      }).catch(() => { /* 保留源码 */ });
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
