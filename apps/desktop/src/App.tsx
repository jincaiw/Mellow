/**
 * App —— Mellow V0.0 Runtime Qualification Shell（最小编辑器壳）。
 * 不开发正式 UI：Open / Save / New + 编辑器容器 + 状态栏。
 *
 * 依赖注入（host-api 契约）：
 *   EditorHost（editor-react）→ CoreEditor
 *   DocumentService（app-core）→ FileService（desktop Adapter 实现）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorCore } from '../../../packages/editor-core/src';
import { DocumentService } from '../../../packages/app-core/src';
import { createDesktopFileService } from './host/fileServices';
import type { Encoding, LineEnding } from '../../../packages/host-api/src/index';

type EditorStatus = 'idle' | 'ready' | 'error';

interface DocMeta {
  encoding: Encoding;
  eol: LineEnding;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorCore | null>(null);
  const filePathRef = useRef<string | null>(null);
  const documentsRef = useRef<DocumentService | null>(null);
  // preserve metadata：打开时记录编码/EOL，保存时原样传回
  const docMetaRef = useRef<DocMeta>({ encoding: 'utf-8', eol: '\n' });
  // validate disk revision：打开时记录的磁盘状态，保存时校验外部变更（spec §5）
  const diskStateRef = useRef<{ mtimeMs: number; identityKey: string } | null>(null);

  const [status, setStatus] = useState<EditorStatus>('idle');
  const [statusText, setStatusText] = useState('未加载');
  const [dirty, setDirty] = useState(false);
  const [stats, setStats] = useState('');

  // 挂载编辑器 + 文件服务
  useEffect(() => {
    if (!containerRef.current) return;
    documentsRef.current = new DocumentService(createDesktopFileService());

    const host = new EditorCore();
    hostRef.current = host;
    host.mount(containerRef.current);

    host
      .ready()
      .then(async () => {
        await host.open('# Mellow V0.0\n\nRuntime Qualification Shell', undefined, true);
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

  const refreshStats = useCallback((host: EditorCore) => {
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
    docMetaRef.current = { encoding: 'utf-8', eol: '\n' }; // 新文档默认 UTF-8/LF
    diskStateRef.current = null; // 新文档无磁盘基准（保存时跳过 validate）
    setDirty(false);
    await host.open('', undefined, true);
    setStatusText('新建文档（未保存）');
    refreshStats(host);
  }, [refreshStats]);

  const handleOpen = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const result = await documents.open();
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(`打开失败: ${result.error.message}`);
      }
      return;
    }
    filePathRef.current = result.value.path;
    docMetaRef.current = { encoding: result.value.encoding, eol: result.value.eol }; // preserve metadata
    diskStateRef.current = result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
      ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
      : null;
    setDirty(false);
    await host.open(result.value.content, undefined, true);
    setStatusText(`已打开 ${result.value.path}`);
    refreshStats(host);
  }, [refreshStats]);

  const handleSave = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const meta = docMetaRef.current;
    const expected = diskStateRef.current ?? undefined;
    const result = await documents.save(filePathRef.current, content, {
      encoding: meta.encoding,
      eol: meta.eol,
      expectedDisk: expected,
    });
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(`保存失败: ${result.error.message}`);
      }
      return;
    }
    filePathRef.current = result.value.path;
    diskStateRef.current = result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
      ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
      : null;
    setDirty(false);
    setStatusText(`已保存 ${result.value.path}`);
  }, []);

  const handleSaveAs = useCallback(async () => {
    const host = hostRef.current;
    const documents = documentsRef.current;
    if (!host || !documents) return;
    const content = host.getText();
    const meta = docMetaRef.current;
    const result = await documents.save(null, content, { encoding: meta.encoding, eol: meta.eol });
    if (!result.ok) {
      if (result.error.code !== 'canceled') {
        setStatusText(`另存失败: ${result.error.message}`);
      }
      return;
    }
    filePathRef.current = result.value.path;
    diskStateRef.current = result.value.diskMtimeMs !== undefined && result.value.identityKey !== undefined
      ? { mtimeMs: result.value.diskMtimeMs, identityKey: result.value.identityKey }
      : null;
    setDirty(false);
    setStatusText(`已另存 ${result.value.path}`);
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
