/**
 * Source Mode API（PRD §30：Ctrl/Cmd+/ 切换源码模式）。
 *
 * 宿主（shell 命令 view.source.toggle）经 iframe window.__MELLOW_SOURCE_API__ 调用；
 * 引擎 mode.ts 维护 sourceMode 状态（marker 全显，近似 Typora 源码视图）。
 */
import { setSourceMode, isSourceMode } from './mode';

export function installSourceApi(): void {
  const win = window as unknown as {
    __MELLOW_SOURCE_API__?: { toggle: () => void; isActive: () => boolean };
    editor?: {
      state: { selection: unknown };
      dispatch: (transaction: { selection: unknown }) => void;
    };
  };
  win.__MELLOW_SOURCE_API__ = {
    toggle: () => {
      setSourceMode(!isSourceMode());
      // Source/Live 是纯渲染状态，不改变 Markdown 文本。显式派发当前选区，令所有
      // 依赖 selectionSet 的 ViewPlugin 在本次命令内立即重算；否则只改模块变量，
      // 画面会一直停留在旧模式，直到用户再次移动光标或滚动。
      const editor = win.editor;
      if (editor !== undefined) {
        editor.dispatch({ selection: editor.state.selection });
      }
    },
    isActive: () => isSourceMode(),
  };
}
