/** Slash Commands trigger bridge（T-0311）。
 *
 * 仅在允许上下文触发（当前实现：行首/行首空白）并且非 IME composition 时通知宿主打开 Slash UI。
 * 本扩展不修改 Markdown，不改变 selection；真正插入由统一 Command Registry dispatch 后经 host patch 完成。
 */

import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

export interface SlashOpenRequest {
  from: number;
  to: number;
  query: string;
  context: 'line-start';
}

export interface SlashCommandsOptions {
  onOpen?: (request: SlashOpenRequest) => void;
}

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { EditorView: view.EditorView };
}

function defaultOpen(request: SlashOpenRequest): void {
  window.parent?.postMessage({ type: 'mellow.slash.open', payload: request }, window.location.origin);
}

function lineStartTrigger(view: EditorView): SlashOpenRequest | null {
  const selection = view.state.selection.main;
  if (!selection.empty) return null;
  const line = view.state.doc.lineAt(selection.head);
  const prefix = view.state.doc.sliceString(line.from, selection.head);
  if (!/^\s*$/.test(prefix)) return null;
  return { from: line.from, to: selection.head, query: '', context: 'line-start' };
}

export function canTriggerSlashCommand(view: EditorView): SlashOpenRequest | null {
  return lineStartTrigger(view);
}

export function buildSlashCommandsExtension(options: SlashCommandsOptions = {}): Extension {
  const { EditorView: CmEditorView } = resolveCm();
  const open = options.onOpen ?? defaultOpen;
  return CmEditorView.domEventHandlers({
    keydown(event, view) {
      if (event.key !== '/') return false;
      if (event.isComposing || isComposing()) return false;
      const request = canTriggerSlashCommand(view);
      if (request === null) return false;
      event.preventDefault();
      open(request);
      return true;
    },
  });
}
