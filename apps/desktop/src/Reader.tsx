/**
 * Reader Mode 视图（T-0409 Reader）。
 *
 * 极简 Reader，不是独立产品：复用主窗口侧栏（File Tree / Outline / Search），
 * 仅替换 Document Surface 为只读渲染视图。
 * - no caret：纯 HTML 渲染，无 contentEditable；
 * - no markers：渲染器输出语义标签，不含语法字符；
 * - 内置：文档内搜索（高亮 + 上/下跳转）、Zoom、打印、图片 Lightbox、代码复制、
 *   math / mermaid 异步渲染（沿用 editor-engine renderer 契约）、Open With（编辑器）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAsyncRenderers } from './useAsyncRenderers';
import { invoke } from '@tauri-apps/api/core';

export interface ReaderViewProps {
  /** 翻译函数（App 注入 i18n） */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** App 侧已渲染好的语义 HTML（renderReaderHtml 输出，含 heading id） */
  html: string;
  title: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onOpenInEditor: () => void;
  onClose: () => void;
  onCurrentHeadingChange: (id: string | null) => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function ReaderView(props: ReaderViewProps) {
  const { t, html, title, zoom, onZoomChange, onOpenInEditor, onClose, onCurrentHeadingChange } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const marksRef = useRef<HTMLElement[]>([]);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [lightboxScale, setLightboxScale] = useState(1);
  const scrollRafRef = useRef(0);

  // ── math / mermaid 异步渲染（无库时保留源码）──
  useAsyncRenderers(contentRef, html);

  // ── 搜索高亮 ──
  const clearMarks = useCallback(() => {
    for (const mark of marksRef.current) {
      const parent = mark.parentNode;
      if (parent === null) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
      parent.normalize();
    }
    marksRef.current = [];
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    clearMarks();
    setMatchCount(0);
    setMatchIndex(-1);
    const q = query.trim();
    if (q === '') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      const text = node as Text;
      if (text.parentElement?.closest('.mellow-reader-code, .mellow-reader-math, .mellow-reader-math-block, .mellow-reader-mermaid, .mellow-reader-toc')) continue;
      if ((text.textContent ?? '').toLowerCase().includes(q.toLowerCase())) targets.push(text);
    }
    const re = new RegExp(escapeRegExp(q), 'ig');
    for (const target of targets) {
      const text = target.textContent ?? '';
      const frag = document.createDocumentFragment();
      let last = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        const mark = document.createElement('mark');
        mark.textContent = match[0];
        marksRef.current.push(mark);
        frag.appendChild(mark);
        last = match.index + match[0].length;
        if (match.index === re.lastIndex) re.lastIndex += 1;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      target.parentNode?.replaceChild(frag, target);
    }
    setMatchCount(marksRef.current.length);
    setMatchIndex(marksRef.current.length > 0 ? 0 : -1);
  }, [query, html, clearMarks]);

  useEffect(() => {
    marksRef.current.forEach((mark, index) => {
      mark.classList.toggle('current', index === matchIndex);
    });
  }, [matchIndex]);

  const gotoMatch = useCallback((index: number) => {
    if (marksRef.current.length === 0) return;
    const clamped = (index + marksRef.current.length) % marksRef.current.length;
    setMatchIndex(clamped);
    marksRef.current[clamped]?.scrollIntoView({ block: 'center' });
  }, []);

  // ── 滚动 → 当前 heading（侧栏高亮，不反滚侧栏）──
  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== 0) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const root = contentRef.current;
      const container = scrollRef.current;
      if (!root || !container) return;
      const containerTop = container.getBoundingClientRect().top;
      let current: string | null = null;
      for (const heading of Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))) {
        if (heading.getBoundingClientRect().top - containerTop <= 120) current = heading.id;
        else break;
      }
      onCurrentHeadingChange(current);
    });
  }, [onCurrentHeadingChange]);

  // ── 键盘：Cmd/Ctrl+F 聚焦搜索；Escape 关 lightbox/清搜索 ──
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === 'Escape') {
        if (lightbox !== null) { setLightbox(null); setLightboxScale(1); }
        else if (query !== '') {
          setQuery('');
          searchRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox, query]);

  // ── 点击：代码复制 / 链接 → 系统浏览器（Security H2）/ 图片 lightbox ──
  const handleContentClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const copyButton = target.closest<HTMLButtonElement>('.mellow-reader-copy');
    if (copyButton !== null) {
      const code = copyButton.closest('.mellow-reader-code')?.querySelector('code')?.textContent ?? '';
      void navigator.clipboard?.writeText(code).catch(() => { /* no-op */ });
      const original = copyButton.textContent;
      copyButton.textContent = t('reader.copied');
      window.setTimeout(() => { copyButton.textContent = original; }, 1200);
      return;
    }
    // Security Review H2：链接禁止 webview 导航；Typora 对齐 —— 普通点击不打开，
    // Cmd/Ctrl+Click 才经系统浏览器打开（页内 # 锚点除外）
    const link = target.closest<HTMLAnchorElement>('a');
    if (link !== null) {
      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('#')) {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
          void import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
            void openUrl(href).catch(() => { /* 非法 URL（相对/未知协议）忽略 */ });
          });
        }
        return;
      }
    }
    if (target.tagName === 'IMG' && target.closest('a') === null) {
      setLightbox((target as HTMLImageElement).src);
      setLightboxScale(1);
    }
  }, [t]);

  return (
    <div className="mellow-reader-shell">
      <div className="mellow-reader-bar">
        <span className="mellow-reader-title" title={title}>{title}</span>
        <span className="toolbar-sep" />
        <input
          ref={searchRef}
          className="mellow-reader-search"
          placeholder={t('reader.search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="mellow-reader-search-count">{matchCount > 0 ? `${matchIndex + 1}/${matchCount}` : ''}</span>
        <button type="button" title={t('reader.prev')} onClick={() => gotoMatch(matchIndex - 1)} disabled={matchCount === 0}>↑</button>
        <button type="button" title={t('reader.next')} onClick={() => gotoMatch(matchIndex + 1)} disabled={matchCount === 0}>↓</button>
        <span className="spacer" />
        <button type="button" title={t('reader.zoomOut')} onClick={() => onZoomChange(Math.max(0.5, zoom - 0.1))}>A−</button>
        <span className="mellow-reader-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" title={t('reader.zoomIn')} onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}>A+</button>
        <button type="button" title={t('reader.print.title')} onClick={() => { void invoke('print_window').catch(() => window.print()); }}>{t('reader.print')}</button>
        <button type="button" title={t('reader.openInEditor')} onClick={onOpenInEditor}>{t('reader.openInEditor')}</button>
        <button type="button" title={t('reader.close.title')} onClick={onClose}>{t('reader.close')}</button>
      </div>
      <div className="mellow-reader-scroll" ref={scrollRef} onScroll={handleScroll}>
        {/* eslint-disable-next-line react/no-danger */}
        <article className="mellow-reader" style={{ fontSize: `${zoom * 100}%` }} ref={contentRef} role="main" aria-label={title} dangerouslySetInnerHTML={{ __html: html }} onClick={handleContentClick} />
      </div>
      {lightbox !== null && (
        // R3-1 lightbox：滚轮缩放（50%-400%）/ 双击重置 / Esc 或点遮罩关闭
        <div
          className="mellow-reader-lightbox"
          onClick={() => { setLightbox(null); setLightboxScale(1); }}
          onWheel={(e) => {
            e.preventDefault();
            setLightboxScale((s) => Math.min(4, Math.max(0.5, s + (e.deltaY < 0 ? 0.1 : -0.1))));
          }}
        >
          <img
            src={lightbox}
            alt="lightbox"
            style={{ transform: `scale(${lightboxScale})` }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setLightboxScale(1)}
          />
          <span className="mellow-reader-lightbox-zoom">{Math.round(lightboxScale * 100)}%</span>
        </div>
      )}
    </div>
  );
}
