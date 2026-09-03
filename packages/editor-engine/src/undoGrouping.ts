/**
 * Undo 按用户动作分组（P4.3，live-markdown-engine-spec §7 Undo Contract）。
 *
 * CM6 history 默认分组（@codemirror/commands dist 已核实）：
 * - `joinableUserEvent = /^(input\.type|delete)($|\.)/` —— 连续输入/删除在
 *   500ms 窗口（newGroupDelay）且 selection 相邻时合并为一组；
 * - paste（input.paste）、copyline、move 等其他 userEvent 天然独立；
 * - composition（input.type.compose）无条件与栈顶 join；
 * - **无 userEvent 的程序化 dispatch 同样 joinable**（`!userEvent` 分支）——
 *   引擎命令（checkbox toggle、table 编辑、宿主 patchChanges 等）会并入
 *   相邻用户输入组，违背 Typora「一个用户动作 = 一个 undo 单元」语义。
 *
 * 本扩展（transactionExtender）：docChanged 且无 userEvent 的事务 →
 * `isolateHistory('full')`，使其成为独立 undo 单元。CM 原生
 * input.type / input.paste / delete / select / undo / redo 事务均带
 * userEvent annotation，不受影响（undo 事务 userEvent 为 "undo"/"redo"）。
 *
 * EditorView 经 window.require 延迟解析（引擎约定：iframe 内不能有裸 ESM
 * 导入 @codemirror/*，见 smartPunctuation.ts 文件头注释）。
 */

import type { Extension } from '@codemirror/state';

/** 运行时 CM6 模块（iframe 内与 CoreEditor 同一实例） */
interface CmRuntime {
  EditorState: typeof import('@codemirror/state').EditorState;
  Transaction: typeof import('@codemirror/state').Transaction;
  isolateHistory: typeof import('@codemirror/commands').isolateHistory;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const commands = requireFn('@codemirror/commands') as typeof import('@codemirror/commands');
  return {
    EditorState: state.EditorState,
    Transaction: state.Transaction,
    isolateHistory: commands.isolateHistory,
  };
}

/**
 * 构建 Undo 分组扩展（install() 装配）。
 *
 * 规则：`docChanged && !userEvent` → isolateHistory('full')。
 * 无 changes 的状态事务（面板 effect、decoration 版本空 dispatch）与带
 * userEvent 的原生动作不触碰；分组逻辑仍全部交给 CM history 默认策略。
 */
export function buildUndoGroupingExtension(): Extension {
  const { EditorState, Transaction, isolateHistory } = resolveCm();
  return EditorState.transactionExtender.of((tr) => {
    if (!tr.docChanged) return null;
    const userEvent = tr.annotation(Transaction.userEvent);
    if (userEvent !== undefined && userEvent !== '') return null;
    // 程序化命令（引擎/宿主 dispatch）：独立 undo 单元（spec §7）
    return { annotations: isolateHistory.of('full') };
  });
}
