/**
 * document-model unit tests —— 覆盖 spec §2/§3/§5/§6/§8 与用户 6 项要求。
 */

import {
  DocumentModel,
  detectEol,
} from '../src/index';
import type { DiskMetadata, RecoverySnapshot } from '../src/index';

const disk = (mtime: number, key: string, device = 'dev1'): DiskMetadata => ({
  mtime,
  identity: { key, device },
});

describe('创建 / 打开（spec §2）', () => {
  test('createNew：unsaved 文档，id 存在，dirty=false，revision=0', () => {
    const doc = DocumentModel.createNew();
    expect(doc.id).toBeTruthy();
    expect(doc.path).toBeNull();
    expect(doc.dirty).toBe(false);
    expect(doc.revision).toBe(0);
    expect(doc.encoding).toBe('utf-8');
    expect(doc.eol).toBe('\n');
    expect(doc.recoveryId).toBeNull();
  });

  test('open：记录 path/content/disk 元数据，dirty=false', () => {
    const doc = DocumentModel.open('/a.md', '# Title', disk(1000, 'ino-1'));
    expect(doc.id).toBeTruthy();
    expect(doc.path).toBe('/a.md');
    expect(doc.snapshotContent()).toBe('# Title');
    expect(doc.diskMtime).toBe(1000);
    expect(doc.fileIdentity?.key).toBe('ino-1');
    expect(doc.dirty).toBe(false);
    expect(doc.revision).toBe(0);
  });

  test('open 自动检测 EOL（CRLF 内容）', () => {
    const doc = DocumentModel.open('/b.md', 'a\r\nb\r\n');
    expect(doc.eol).toBe('\r\n');
  });

  test('不同文档 id 不同（实例独立）', () => {
    const a = DocumentModel.createNew();
    const b = DocumentModel.createNew();
    expect(a.id).not.toBe(b.id);
  });
});

describe('编辑（keystroke 级轻量）', () => {
  test('markContentEdited：dirty=true，revision 递增', () => {
    const doc = DocumentModel.open('/a.md', 'hello');
    doc.markContentEdited();
    expect(doc.dirty).toBe(true);
    expect(doc.revision).toBe(1);
    doc.markContentEdited();
    expect(doc.revision).toBe(2);
  });

  test('唯一真源：attachContentSource 后 snapshotContent 读取编辑器实时文本', () => {
    const doc = DocumentModel.open('/a.md', 'hello');
    let editorText = 'hello world';
    doc.attachContentSource(() => editorText);
    expect(doc.snapshotContent()).toBe('hello world');

    // 编辑器继续输入：模型无需拷贝，按需读取
    editorText = 'hello world!';
    doc.markContentEdited();
    expect(doc.snapshotContent()).toBe('hello world!');
    expect(doc.snapshot.content).toBe('hello world!');
  });

  test('无 source 时 snapshotContent 返回内部快照', () => {
    const doc = DocumentModel.createNew();
    expect(doc.snapshotContent()).toBe('');
  });
});

describe('保存 / 文件操作（spec §4/§8）', () => {
  test('markSaved：dirty=false，更新 disk 元数据，revision 不变', () => {
    const doc = DocumentModel.open('/a.md', 'x', disk(1000, 'ino-1'));
    doc.markContentEdited(); // revision 1, dirty
    doc.markSaved('/a.md', disk(2000, 'ino-1'));
    expect(doc.dirty).toBe(false);
    expect(doc.revision).toBe(1); // 保存不增加修订
    expect(doc.diskMtime).toBe(2000);
    expect(doc.fileIdentity?.key).toBe('ino-1');
  });

  test('markSaved 刷新内容快照（与编辑器对齐）', () => {
    const doc = DocumentModel.open('/a.md', 'x', disk(1000, 'ino-1'));
    let text = 'edited';
    doc.attachContentSource(() => text);
    doc.markContentEdited();
    doc.markSaved('/a.md', disk(2000, 'ino-1'));
    // 保存后即使解绑 source，快照也已刷新
    doc.attachContentSource(null);
    expect(doc.snapshotContent()).toBe('edited');
  });

  test('rename/move：path 更新，id/revision/dirty 不变（要求 5）', () => {
    const doc = DocumentModel.open('/old.md', 'x', disk(1000, 'ino-1'));
    const id = doc.id;
    doc.markContentEdited();
    const revision = doc.revision;

    doc.rename('/new/dir/old.md');
    expect(doc.path).toBe('/new/dir/old.md');
    expect(doc.id).toBe(id);
    expect(doc.revision).toBe(revision);
    expect(doc.dirty).toBe(true); // 重命名不改变 dirty 语义
  });

  test('unsaved 文档支持保存（要求 4）：save 前 path=null，保存后非空', () => {
    const doc = DocumentModel.createNew();
    expect(doc.path).toBeNull();
    doc.markContentEdited();
    doc.markSaved('/untitled-1.md', disk(3000, 'ino-9'));
    expect(doc.path).toBe('/untitled-1.md');
    expect(doc.dirty).toBe(false);
  });
});

describe('文档切换历史隔离（要求 1）', () => {
  test('两个文档实例状态完全独立', () => {
    const a = DocumentModel.open('/a.md', 'aaa');
    const b = DocumentModel.open('/b.md', 'bbb');

    a.markContentEdited();
    expect(a.dirty).toBe(true);
    expect(a.revision).toBe(1);
    expect(b.dirty).toBe(false); // b 不受 a 影响
    expect(b.revision).toBe(0);

    b.markContentEdited();
    expect(b.revision).toBe(1);
    expect(a.revision).toBe(1); // 各自独立计数
  });

  test('Editor 层历史隔离由 resetEditor 保证（文档级约束记录）', () => {
    // CoreEditor.resetEditor 每次销毁并重建 EditorView → CM history 不跨文档。
    // 模型层保证：每文档独立实例 + 独立 revision/id。
    const a = DocumentModel.open('/a.md', 'x');
    const b = DocumentModel.open('/b.md', 'y');
    expect(a.id).not.toBe(b.id);
    expect(a.revision).toBe(0);
    expect(b.revision).toBe(0);
  });
});

describe('React 不持有 keystroke 级副本（要求 3）', () => {
  test('snapshot 是不可变快照：修改返回对象不影响模型', () => {
    const doc = DocumentModel.open('/a.md', 'hello');
    const snap = doc.snapshot;
    (snap as { dirty: boolean }).dirty = true;
    (snap as { content: string }).content = 'hacked';
    expect(doc.dirty).toBe(false);
    expect(doc.snapshotContent()).toBe('hello');
  });

  test('模型是权威状态，UI 只读访问', () => {
    const doc = DocumentModel.open('/a.md', 'x');
    doc.markContentEdited();
    // UI 读取：dirty/path/revision/cursor/scroll 均为 getter
    const ui = {
      dirty: doc.dirty,
      path: doc.path,
      revision: doc.revision,
      cursor: doc.cursor,
      scroll: doc.scroll,
    };
    expect(ui.dirty).toBe(true);
    expect(ui.path).toBe('/a.md');
  });
});

describe('cursor / scroll 记录', () => {
  test('updateCursor / updateScroll', () => {
    const doc = DocumentModel.open('/a.md', 'x');
    expect(doc.cursor).toBeNull();
    doc.updateCursor({ anchor: 1, head: 3 });
    doc.updateScroll({ top: 120, left: 0 });
    expect(doc.cursor).toEqual({ anchor: 1, head: 3 });
    expect(doc.scroll).toEqual({ top: 120, left: 0 });
  });
});

describe('Recovery（spec §6，要求 6 准备）', () => {
  test('recoveryId 设置 + recovery snapshot 创建', () => {
    const doc = DocumentModel.open('/a.md', 'hello', disk(1000, 'ino-1'));
    doc.markContentEdited();
    doc.updateCursor({ anchor: 5, head: 5 });
    doc.setRecoveryId(doc.id);

    const snap = doc.createRecoverySnapshot();
    expect(snap.documentId).toBe(doc.id);
    expect(snap.content).toBe('hello');
    expect(snap.revision).toBe(1);
    expect(snap.cursor).toEqual({ anchor: 5, head: 5 });
    expect(snap.savedAt).toBeGreaterThan(0);
  });

  test('fromRecovery 恢复：dirty=true，保留 id/cursor/scroll', () => {
    const doc = DocumentModel.open('/a.md', 'hello', disk(1000, 'ino-1'));
    doc.markContentEdited();
    doc.updateCursor({ anchor: 2, head: 2 });
    doc.updateScroll({ top: 50, left: 0 });
    const snap: RecoverySnapshot = doc.createRecoverySnapshot();

    const restored = DocumentModel.fromRecovery(snap, '/a.md');
    expect(restored.id).toBe(doc.id);
    expect(restored.snapshotContent()).toBe('hello');
    expect(restored.revision).toBe(1);
    expect(restored.dirty).toBe(true);
    expect(restored.cursor).toEqual({ anchor: 2, head: 2 });
    expect(restored.scroll).toEqual({ top: 50, left: 0 });
    expect(restored.recoveryId).toBe(doc.id);
  });

  test('保存管线完成 → clearRecovery（spec §4）', () => {
    const doc = DocumentModel.open('/a.md', 'x', disk(1000, 'ino-1'));
    doc.setRecoveryId('rec-1');
    doc.markSaved('/a.md', disk(2000, 'ino-1'));
    doc.clearRecovery();
    expect(doc.recoveryId).toBeNull();
  });
});

describe('外部变更 / Conflict 准备（spec §5，要求 6）', () => {
  const doc = () => DocumentModel.open('/a.md', 'x', disk(1000, 'ino-1'));

  test('unchanged：mtime 与 identity 均一致', () => {
    expect(doc().detectExternalChange(disk(1000, 'ino-1'))).toBe('unchanged');
  });

  test('modified：仅 mtime 变化', () => {
    expect(doc().detectExternalChange(disk(2000, 'ino-1'))).toBe('modified');
  });

  test('replaced：identity key 变化（文件被替换/重建）', () => {
    expect(doc().detectExternalChange(disk(1000, 'ino-2'))).toBe('replaced');
  });

  test('replaced：device 变化（跨文件系统）', () => {
    expect(doc().detectExternalChange(disk(1000, 'ino-1', 'dev2'))).toBe('replaced');
  });

  test('从未保存的文档：无基准 → unchanged', () => {
    const unsaved = DocumentModel.createNew();
    expect(unsaved.detectExternalChange(disk(1000, 'ino-1'))).toBe('unchanged');
  });
});

describe('detectEol 工具', () => {
  test('LF / CRLF / CR / 空', () => {
    expect(detectEol('a\nb')).toBe('\n');
    expect(detectEol('a\r\nb')).toBe('\r\n');
    expect(detectEol('a\rb')).toBe('\r');
    expect(detectEol('')).toBe('\n');
  });

  test('混合行尾取首个', () => {
    expect(detectEol('a\r\nb\nc')).toBe('\r\n');
    expect(detectEol('a\nb\r\nc')).toBe('\n');
  });
});
