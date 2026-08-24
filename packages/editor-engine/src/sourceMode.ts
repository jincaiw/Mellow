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
      const editor = win.editor;
      setSourceMode(!isSourceMode(editor), editor);
      // 仍有少量早期 widget 通过无 view 的兼容 API 读取模式；同步默认值，
      // 保证 Source Mode 在完成全部 StateField 迁移前不出现局部残留渲染。
      setSourceMode(isSourceMode(editor));
      // Source/Live 是纯渲染状态，不改变 Markdown 文本。显式派发当前选区，令所有
      // 依赖 selectionSet 的 ViewPlugin 在本次命令内立即重算；否则只改模块变量，
      // 画面会一直停留在旧模式，直到用户再次移动光标或滚动。
      if (editor !== undefined) {
        editor.dispatch({ selection: editor.state.selection });
      }
    },
    isActive: () => isSourceMode(win.editor),
  };
}
