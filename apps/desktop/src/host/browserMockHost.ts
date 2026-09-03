/**
 * 浏览器 dev 共享 mock 宿主（单例）。
 *
 * 所有 browser service 必须复用同一 createMockHost() 实例：桌面端由 Rust 侧共享
 * 真实文件系统，fs 写入对 search/watcher 等天然可见；mock 各持独立 state 会导致
 * 「fs 创建的文件在全局搜索中不可见」等装配级不一致（P3.9 sidebar golden 首次暴露）。
 */
import { createMockHost } from '../../../../packages/host-api/src/index';

export const browserMockHost = createMockHost();
