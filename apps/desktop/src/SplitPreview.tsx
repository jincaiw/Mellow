/**
 * Split Mode Preview 面板（T-0410 Split，PRD §32）。
 *
 * Source | Preview：
 * - same Markdown source：html 由 App 从编辑器真源渲染（无第二文档状态）；
 * - bidirectional scroll sync：外部经 handle.setRatio 驱动（编辑器滚动 → preview），
 *   本地滚动经 onScroll 上报（preview 滚动 → 编辑器 setScrollRatio）；阈值防回环；
 * - heading anchor / click navigation：点击带 data-offset 的块 → onPreviewClick(offset) → 编辑器定位；
 * - no caret：只读渲染。
 */

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { useAsyncRenderers } from './useAsyncRenderers';

export interface SplitPreviewHandle {
  /** 外部（编辑器滚动）驱动 preview 滚动到文档比例位置 */
  setRatio(ratio: number): void;
}

export interface SplitPreviewProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  html: string;
  onPreviewClick(offset: number): void;
  onScroll(ratio: number): void;
}

const SplitPreview = forwardRef<SplitPreviewHandle, SplitPreviewProps>(function SplitPreview({ t, html, onPreviewClick, onScroll }, ref) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);

  useAsyncRenderers(contentRef, html);

  useImperativeHandle(ref, () => ({
    setRatio(ratio) {
      const dom = scrollRef.current;
      if (dom === null) return;
      const max = dom.scrollHeight - dom.clientHeight;
      if (max <= 0) return;
      const target = Math.max(0, Math.min(1, ratio)) * max;
      // 阈值防回环：同值赋值不产生 scroll 事件，差 <1px 忽略
      if (Math.abs(dom.scrollTop - target) > 1) dom.scrollTop = target;
    },
  }), []);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== 0) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const dom = scrollRef.current;
      if (dom === null) return;
      const max = dom.scrollHeight - dom.clientHeight;
      onScroll(max > 0 ? dom.scrollTop / max : 0);
    });
  }, [onScroll]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const el = (event.target as HTMLElement).closest('[data-offset]');
    if (el !== null) {
      const offset = Number(el.getAttribute('data-offset'));
      if (Number.isFinite(offset)) onPreviewClick(offset);
    }
  }, [onPreviewClick]);

  return (
    <div className="split-preview">
      <div className="split-preview-bar">
        <span className="split-preview-label">{t('split.preview')}</span>
        <span className="split-preview-hint">{t('split.hint')}</span>
      </div>
      <div className="split-preview-scroll" ref={scrollRef} onScroll={handleScroll}>
        {/* eslint-disable-next-line react/no-danger */}
        <article className="mellow-reader" ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} onClick={handleClick} />
      </div>
    </div>
  );
});

export default SplitPreview;
