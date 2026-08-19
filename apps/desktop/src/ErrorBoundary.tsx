/**
 * 根级 ErrorBoundary —— 白屏防线（阶段 0-2）。
 *
 * 背景：启动竞态期间任何渲染错误曾让整个 React 树崩溃卸载，
 * 窗口只剩纯白（2026-08-19 真机复现）。此边界保证：
 * - 永不整窗白屏：崩溃时显示可恢复的错误界面；
 * - 诊断可复制：错误消息 + 堆栈一键复制，便于回填 issue；
 * - 一键重载：无需重启进程。
 *
 * 文案内联 zh/en（无法依赖 i18n 包——崩溃点可能在 i18n 初始化前后任意位置）。
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

function isZh(): boolean {
  try {
    return (localStorage.getItem('mellow.locale') ?? navigator.language).toLowerCase().startsWith('zh');
  } catch {
    return true; // 默认中文（PRD §87）
  }
}

const COPY_LABEL = { zh: '复制错误详情', en: 'Copy error details' };
const RELOAD_LABEL = { zh: '重新加载', en: 'Reload' };
const TITLE = { zh: 'Mellow 遇到了错误', en: 'Mellow encountered an error' };
const HINT = {
  zh: '界面已停止渲染，但你的文件不会受影响（保存采用原子写）。可复制错误详情后重载。',
  en: 'The interface stopped rendering. Your files are safe (atomic saves). Copy details and reload.',
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] render crash', error, info.componentStack);
  }

  private readonly copyDetails = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.message}\n\n${error.stack ?? ''}`;
    void navigator.clipboard?.writeText(text).catch(() => { /* 剪贴板不可用时静默 */ });
  };

  private readonly reload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const zh = isZh();
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          height: '100vh',
          padding: '32px',
          fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif',
          color: 'var(--mellow-fg, #333)',
          background: 'var(--mellow-bg, #fff)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '18px', margin: 0 }}>{zh ? TITLE.zh : TITLE.en}</h1>
        <p style={{ fontSize: '13px', margin: 0, opacity: 0.75, maxWidth: '520px' }}>
          {zh ? HINT.zh : HINT.en}
        </p>
        <pre
          style={{
            maxWidth: '640px',
            maxHeight: '200px',
            overflow: 'auto',
            fontSize: '12px',
            textAlign: 'left',
            background: 'rgba(127,127,127,0.08)',
            borderRadius: '8px',
            padding: '12px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error.message}
        </pre>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={this.copyDetails} style={{ padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            {zh ? COPY_LABEL.zh : COPY_LABEL.en}
          </button>
          <button
            type="button"
            onClick={this.reload}
            style={{ padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            {zh ? RELOAD_LABEL.zh : RELOAD_LABEL.en}
          </button>
        </div>
      </div>
    );
  }
}
