/**
 * WKWebView-safe page scrolling.
 *
 * MarkEdit's upstream PageUp/PageDown command writes scrollDOM.scrollTop via
 * scrollBy(). A burst of page keys can therefore advance WebKit's scroll layer
 * faster than CodeMirror's virtual viewport is measured, leaving a stable blank
 * viewport. Use CodeMirror's measured caret-page commands so selection, height
 * map, and DOM viewport advance in one transaction (the same behavior Typora
 * exposes for editor Page Up/Down).
 */

import type { EditorView, KeyBinding } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isComposing } from './composition';

interface CmRuntime {
  keymap: typeof import('@codemirror/view').keymap;
  Prec: typeof import('@codemirror/state').Prec;
  cursorPageDown: typeof import('@codemirror/commands').cursorPageDown;
  cursorPageUp: typeof import('@codemirror/commands').cursorPageUp;
  selectPageDown: typeof import('@codemirror/commands').selectPageDown;
  selectPageUp: typeof import('@codemirror/commands').selectPageUp;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-paging] window.require unavailable');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const commands = requireFn('@codemirror/commands') as typeof import('@codemirror/commands');
  return {
    keymap: view.keymap,
    Prec: state.Prec,
    cursorPageDown: commands.cursorPageDown,
    cursorPageUp: commands.cursorPageUp,
    selectPageDown: commands.selectPageDown,
    selectPageUp: commands.selectPageUp,
  };
}

/**
 * Move one rendered page through a CodeMirror selection transaction.
 * Exported for deterministic regression tests.
 */
export function scrollPageSafely(
  view: EditorView,
  forward: boolean,
  commands: Pick<typeof import('@codemirror/commands'), 'cursorPageDown' | 'cursorPageUp'>,
): boolean {
  if (isComposing()) return true;

  // Moving the caret is deliberate. CodeMirror computes paging from measured
  // line blocks and commits selection + scroll atomically. In WKWebView this is
  // the only upstream path that remains stable under rapid key repeat; direct
  // scrollBy and selection-free scroll effects can leave unpainted virtual gaps.
  (forward ? commands.cursorPageDown : commands.cursorPageUp)(view);
  // Always consume the key, including at document boundaries, so WebKit never
  // falls through to its native element scrolling path.
  return true;
}

export function buildPagingExtension(): Extension {
  const { keymap, Prec, cursorPageDown, cursorPageUp, selectPageDown, selectPageUp } = resolveCm();
  const commands = { cursorPageDown, cursorPageUp };
  const bindings: KeyBinding[] = [
    {
      key: 'PageUp',
      run: (view) => scrollPageSafely(view, false, commands),
      shift: selectPageUp,
    },
    {
      key: 'PageDown',
      run: (view) => scrollPageSafely(view, true, commands),
      shift: selectPageDown,
    },
  ];

  // MarkEdit installs its direct scrollBy bindings before user extensions.
  // Highest precedence is required to replace only these two keys without
  // touching the vendored CoreEditor package.
  return Prec.highest(keymap.of(bindings));
}
