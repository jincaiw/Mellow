/**
 * extensions —— 扩展运行时（app-core 应用核心逻辑，PRD §119-121 / ADR-0013）。
 */
export { ExtensionRegistry } from './registry';
export { buildExtensionContext } from './context';
export { createNullExtensionHost } from './host';
export type { ExtensionHost, ExtensionDocumentHost } from './host';
