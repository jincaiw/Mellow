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
import { DocumentService, RecoveryService } from '../../../packages/app-core/src';
import { createDesktopFileService } from './host/fileServices';
import { createDesktopRecoveryStorage } from './host/recoveryStorage';
import type { Encoding, LineEnding, RecoveryEntry } from '../../../packages/host-api/src/index';

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
  const recoveryRef = useRef<RecoveryService | null>(null);
  // Crash Recovery：文档 id + 修订（快照 keyed by document id）
  const docIdRef = useRef<string>(crypto.randomUUID());
  const revisionRef = useRef(0);
  // preserve metadata：打开时记录编码/EOL，保存时原样传回
  const docMetaRef = useRef<DocMeta>({ encoding: 'utf-8', eol: '\n' });
  // validate disk revision：打开时记录的磁盘状态，保存时校验外部变更（spec §5）
  const diskStateRef = useRef<{ mtimeMs: number; identityKey: string } | null>(null);

  const [status, setStatus] = useState<EditorStatus>('idle');
  const [statusText, setStatusText] = useState('未加载');
  const [dirty, setDirty] = useState(false);
  const [stats, setStats] = useState('');
  // 启动发现的未恢复文档（恢复 / 比较 / 忽略）
  const [recoveryEntries, setRecoveryEntries] = useState<RecoveryEntry[]>([]);

  /** 组装当前文档恢复快照并防抖写入（与 Auto Save 分离：只写 AppData） */
  const scheduleRecoverySnapshot = useCallback((host: EditorCore) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    const meta = docMetaRef.current;
    recovery.scheduleSnapshot({
      documentId: docIdRef.current,
      path: filePathRef.current,
      content: host.getText(),
      revision: revisionRef.current,
      encoding: meta.encoding,
      eol: meta.eol,
      cursor: null,
      scroll: null,
      savedAt: Date.now(),
    });
  }, []);

  // 挂载编辑器 + 文件服务 + Recovery
  useEffect(() => {
    if (!containerRef.current) return;
    documentsRef.current = new DocumentService(createDesktopFileService());
    recoveryRef.current = new RecoveryService(createDesktopRecoveryStorage());

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

        // Crash Recovery：编辑事件 → 防抖快照（与 Auto Save 分离）
        host.onEvent((e) => {
          if (e.type === 'viewUpdate') {
            revisionRef.current += 1;
            setDirty(true);
            scheduleRecoverySnapshot(host);
          }
        });

        // 启动发现未恢复文档（spec §6：Recover / Compare / Ignore）
        const recovery = recoveryRef.current;
        if (recovery) {
          const list = await recovery.listPending();
          if (list.ok && list.value.length > 0) {
            setRecoveryEntries(list.value);
            setStatusText(`发现 ${list.value.length} 个未恢复文档`);
          }
        }
      })
      .catch((err) => {
        console.error('editor init failed', err);
        setStatus('error');
        setStatusText(`编辑器初始化失败: ${String(err)}`);
      });

    return () => {
      host.destroy();
      recoveryRef.current?.dispose();
    };
  }, [scheduleRecoverySnapshot]);

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
    docIdRef.current = crypto.randomUUID(); // 新文档新 id
    revisionRef.current = 0;
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
    docIdRef.current = crypto.randomUUID(); // 打开新文档新 id（历史/恢复隔离）
    revisionRef.current = 0;
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
    // 保存成功 → cleanup recovery（spec §4 clear recovery snapshot）
    void recoveryRef.current?.onSaved(docIdRef.current);
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
    void recoveryRef.current?.onSaved(docIdRef.current);
    setStatusText(`已另存 ${result.value.path}`);
  }, []);

  // ── Crash Recovery 三选项（spec §6：Recover / Compare / Ignore）──

  const handleRecover = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
    const result = await recovery.recover(entry.documentId);
    if (!result.ok || result.value === null) {
      setStatusText(`恢复失败: ${result.ok ? '快照不存在' : result.error.message}`);
      return;
    }
    const snapshot = result.value;
    // 用快照内容打开（恢复上次崩溃前状态）
    filePathRef.current = snapshot.path;
    docIdRef.current = snapshot.documentId; // 保持原文档 id（恢复语义）
    revisionRef.current = snapshot.revision;
    docMetaRef.current = { encoding: snapshot.encoding, eol: snapshot.eol };
    diskStateRef.current = null; // 磁盘状态未知：跳过 validate（恢复场景）
    await host.open(snapshot.content, undefined, true);
    setDirty(true);
    setStatusText(`已恢复 ${snapshot.path ?? '未保存文档'}（修订 ${snapshot.revision}）`);
    // 恢复后清理快照（用户已处理）
    await recovery.onSaved(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    refreshStats(host);
  }, [refreshStats]);

  const handleCompare = useCallback(async (entry: RecoveryEntry) => {
    const host = hostRef.current;
    const recovery = recoveryRef.current;
    if (!host || !recovery) return;
    const result = await recovery.recover(entry.documentId);
    if (!result.ok || result.value === null) {
      setStatusText(`读取快照失败: ${result.ok ? '快照不存在' : result.error.message}`);
      return;
    }
    // 比较：加载快照到编辑器（磁盘版本保留在原路径，供用户对比），不删除快照
    const snapshot = result.value;
    filePathRef.current = snapshot.path;
    docIdRef.current = snapshot.documentId;
    revisionRef.current = snapshot.revision;
    docMetaRef.current = { encoding: snapshot.encoding, eol: snapshot.eol };
    diskStateRef.current = null;
    await host.open(snapshot.content, undefined, true);
    setDirty(true);
    setStatusText(`比较模式：已加载快照（磁盘版本在 ${snapshot.path ?? '(未保存)'}，快照保留待处理）`);
    refreshStats(host);
  }, [refreshStats]);

  const handleIgnore = useCallback(async (entry: RecoveryEntry) => {
    const recovery = recoveryRef.current;
    if (!recovery) return;
    await recovery.ignore(entry.documentId);
    setRecoveryEntries((prev) => prev.filter((e) => e.documentId !== entry.documentId));
    setStatusText(`已忽略 ${entry.documentId}`);
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
      {recoveryEntries.length > 0 && (
        <div className="recovery-bar">
          <span>发现 {recoveryEntries.length} 个未恢复文档：</span>
          {recoveryEntries.map((entry) => (
            <span key={entry.documentId} className="recovery-item">
              {entry.path ?? '(未保存文档)'} · 修订 {entry.revision}
              <button onClick={() => void handleRecover(entry)}>恢复</button>
              <button onClick={() => void handleCompare(entry)}>比较</button>
              <button onClick={() => void handleIgnore(entry)}>忽略</button>
            </span>
          ))}
        </div>
      )}
      <footer className="statusbar">
        <span>{dirty ? '● 未保存' : '○ 已保存'}</span>
        <span>{stats}</span>
      </footer>
    </div>
  );
}
