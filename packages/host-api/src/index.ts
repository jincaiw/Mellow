/**
 * @mellow/host-api —— Mellow 系统能力契约（PRD §116）。
 *
 * 纯类型/契约包 + Null/Mock 实现，零运行时依赖。
 * 平台实现在 apps/desktop（Adapter 层）。
 */

export * from './types';
export * from './services';
export * from './host';
export { createNullHost } from './null-host';
export { createMockHost, createMockHostState } from './mock-host';
export type { MockHostState } from './mock-host';
