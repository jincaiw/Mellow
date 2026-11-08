/**
 * 浏览器 dev 共享 mock 宿主（单例）。
 *
 * 所有 browser service 必须复用同一 createMockHost() 实例：桌面端由 Rust 侧共享
 * 真实文件系统，fs 写入对 search/watcher 等天然可见；mock 各持独立 state 会导致
 * 「fs 创建的文件在全局搜索中不可见」等装配级不一致（P3.9 sidebar golden 首次暴露）。
 */
import { createMockHost } from '../../../../packages/host-api/src/index';

/**
 * 浏览器 dev 词条：系统文本替换词典在真实宿主里来自 macOS 系统设置，
 * dev 环境无此存储 ⇒ 给两条**确定性**词条，使 e2e 探针能跑完整链路
 * （App 启动注入 → 引擎 inputHandler → 文档替换）。真实宿主不受影响。
 */
export const browserMockHost = createMockHost({
  textReplacements: [
    { phrase: 'omw', value: 'on my way' },
    { phrase: '(c)', value: '©' },
  ],
});
