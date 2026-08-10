/**
 * App —— Mellow V0.0 Runtime Qualification Shell（最小编辑器壳）。
 * 不开发正式 UI：Open / Save / New + 编辑器容器 + 状态栏。
 *
 * 依赖注入（host-api 契约）：
 *   EditorHost（editor-react）→ CoreEditor
 *   DocumentService（app-core）→ FileService（desktop Adapter 实现）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorHost } from '../../../packages/editor-react/src';
import { DocumentService } from '../../../packages/app-core/src';
import { createDesktopFileService } from './host/fileServices';

type EditorStatus = 'idle' | 'ready' | 'error';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorHost | null>(null);
  const filePathRef = useRef<string | null>(null);
  const documentsRef = useRef<DocumentService | null>(null);

  const [status, setStatus] = useState<EditorStatus>('idle');
  const [statusText, setStatusText] = useState('未加载');
  const [dirty, setDirty] = useState(false);
  const [stats, setStats] = useState('');

  // 挂载编辑器 + 文件服务
  useEffect(() => {
    if (!containerRef.current) return;
    documentsRef.current = new DocumentService(createDesktopFileService());

    const host = new EditorHost();
    hostRef.current = host;
    host.mount(containerRef.current);

    host
      .ready()
      .then(async () => {
        await host.open('# Mellow V0.0\n\nRuntime Qualification Shell', true);
        setStatus('ready');
        setStatusText('编辑器就绪');
        refreshStats(host);
      })
      .catch((err) => {
        console.error('editor init failed', err);
        setStatus('error');
        setStatusText(`编辑器初始化失败: ${String(err)}`);
      });

    return () => host.destroy();
  }, []);

  const refreshStats = useCallback((host: EditorHost) => {
    try {
      const text = host.getText();
      const lines = text.length === 0 ? 0 : text.split('\n').length;
      setStats(`字符 ${text.length} · 行 ${lines}`);
    } catch {
      setStats('');
    }
  }, []);

  const handleNew = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    filePathRef.current = null;
    setDirty(false);
    await host.open('', true);
    setStatusText('新建文档（未保存）');
    refreshStats(host);
  }, [refreshStats]);

  const handleOpen = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const result = await documents.open();
    if (result.error) {
      setStatusText(`打开失败: ${result.error}`);
      return;
    }
    if (result.path === null) return; // 用户取消
    filePathRef.current = result.path;
    setDirty(false);
    await host.open(result.content ?? '', true);
    setStatusText(`已打开 ${result.path}`);
    refreshStats(host);
  }, [refreshStats]);

  const handleSave = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const result = await documents.save(filePathRef.current, content);
    if (result.error) {
      setStatusText(`保存失败: ${result.error}`);
      return;
    }
    filePathRef.current = result.path;
    setDirty(false);
    setStatusText(`已保存 ${result.path}`);
  }, []);

  const handleSaveAs = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const result = await documents.save(null, content);
    if (result.error) {
      setStatusText(`另存失败: ${result.error}`);
      return;
    }
    filePathRef.current = result.path;
    setDirty(false);
    setStatusText(`已另存 ${result.path}`);
  }, []);

  return (
    <div className="shell">
      <header className="toolbar">
        <span className="app-name">Mellow V0.0</span>
        <button onClick={handleNew} disabled={status !== 'ready'}>新建</button>
        <button onClick={handleOpen} disabled={status !== 'ready'}>打开…</button>
        <button onClick={handleSave} disabled={status !== 'ready'}>保存</button>
        <button onClick={handleSaveAs} disabled={status !== 'ready'}>另存为…</button>
        <span className="spacer" />
        <span className={`status ${status}`}>{statusText}</span>
      </header>
      <main className="editor-container" ref={containerRef} />
      <footer className="statusbar">
        <span>{dirty ? '● 未保存' : '○ 已保存'}</span>
        <span>{stats}</span>
      </footer>
    </div>
  );
}
