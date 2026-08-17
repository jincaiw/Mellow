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
  };
  win.__MELLOW_SOURCE_API__ = {
    toggle: () => {
      setSourceMode(!isSourceMode());
    },
    isActive: () => isSourceMode(),
  };
}
