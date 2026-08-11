/**
 * FileOpHistory —— 文件操作撤销栈（PRD §58：rename/move/copy/mkdir 可安全撤销）。
 *
 * 设计（spec document-file-safety §8 + spec image-workflow §11 "where safe"）：
 * - 只记录反向可执行的操作（rename→rename back、move→move back、copy→remove、mkdir→rmdir 仅当本次创建）
 * - trash 不入栈：系统回收站即安全网（跨平台回收站恢复不可靠；应用内 trash-undo 归 T-0508）
 * - 文档引用 patch 撤销由编辑器单事务 Undo 保证（不进文件栈）
 *
 * UI 约定（PRD §58 toast）：`已移动 note.md [撤销]` → undo() 反向执行并通知。
 */

import type { FileService } from '../../host-api/src';
import type { Result } from '../../host-api/src';

export type FileOp =
  /** 反向：rename(to, from) */
  | { kind: 'rename'; from: string; to: string }
  /** 反向：move(to, from) */
  | { kind: 'move'; from: string; to: string }
  /** 反向：remove(to)（复制产生的目标） */
  | { kind: 'copy'; from: string; to: string }
  /** 反向：rmdir（仅当本次创建） */
  | { kind: 'mkdir'; path: string };

export interface FileOpRecord {
  op: FileOp;
  /** 撤销时展示的描述（toast） */
  label: string;
  /** 反向操作是否还可能失败（如目标已被移动）——失败静默，不抛错 */
  bestEffort?: boolean;
}

const MAX_HISTORY = 100;

export class FileOpHistory {
  private stack: FileOpRecord[] = [];

  constructor(private readonly fs: FileService) {}

  /** 记录可撤销操作（PRD §58） */
  push(op: FileOp, label?: string): void {
    this.stack.push({ op, label: label ?? describeOp(op) });
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift();
    }
  }

  get length(): number {
    return this.stack.length;
  }

  /** 栈顶操作描述（toast 用）；空栈 → null */
  peek(): FileOpRecord | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /**
   * 撤销最近 n 次文件操作（反向执行；批量操作一次撤销全部）。
   * @returns ok:true 撤销成功；ok:false 失败或空栈。
   */
  async undo(count = 1): Promise<Result<string>> {
    const records: FileOpRecord[] = [];
    for (let i = 0; i < count; i += 1) {
      const record = this.stack.pop();
      if (record === undefined) {
        break;
      }
      records.push(record);
    }
    if (records.length === 0) {
      return { ok: false, error: { code: 'invalid-argument', message: '没有可撤销的文件操作' } };
    }
    // 逆序执行（栈顶先撤销）
    const label = records[0].label;
    for (const record of records.reverse()) {
      try {
        await executeReverse(this.fs, record.op);
      } catch (e) {
        return { ok: false, error: { code: 'io', message: `撤销失败（${record.label}）: ${String(e)}` } };
      }
    }
    return { ok: true, value: label };
  }

  /** 清空（文档切换/退出时） */
  clear(): void {
    this.stack = [];
  }
}

/** 反向执行（fs 层失败会抛错；上层 catch） */
async function executeReverse(fs: FileService, op: FileOp): Promise<void> {
  switch (op.kind) {
    case 'rename': {
      const r = await fs.rename(op.to, op.from);
      assertOk(r, `恢复 ${op.from}`);
      break;
    }
    case 'move': {
      const r = await fs.move(op.to, op.from);
      assertOk(r, `恢复 ${op.from}`);
      break;
    }
    case 'copy': {
      // 复制撤销 = 删除副本（内部产物，允许永久删除；失败静默）
      await fs.remove(op.to);
      break;
    }
    case 'mkdir': {
      // 仅空目录可撤销移除（asset 目录内有文件 → 保留，静默跳过）
      const entries = await fs.readDir(op.path);
      if (entries.ok && entries.value.length === 0) {
        const r = await fs.remove(op.path);
        if (!r.ok && r.error.code !== 'not-found') {
          assertOk(r, `删除目录 ${op.path}`);
        }
      }
      break;
    }
  }
}

function assertOk(r: Result<unknown>, what: string): void {
  if (!r.ok) {
    throw new Error(`${what}: ${r.error.message}`);
  }
}

/** 默认描述（中文 toast；PRD §58 文案风格） */
export function describeOp(op: FileOp): string {
  switch (op.kind) {
    case 'rename':
      return `已重命名 ${op.from.split('/').pop() ?? op.from}`;
    case 'move':
      return `已移动 ${op.from.split('/').pop() ?? op.from}`;
    case 'copy':
      return `已复制 ${op.from.split('/').pop() ?? op.from}`;
    case 'mkdir':
      return `已创建目录 ${op.path.split('/').pop() ?? op.path}`;
  }
}
