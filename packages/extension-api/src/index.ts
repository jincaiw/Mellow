/**
 * extension-api —— 扩展 API 契约入口（PRD §119-121 / ADR-0013）。
 * V1：无 Marketplace；默认最小权限；process/keychain 高危权限运行时拒绝；AI 默认 Off。
 * 运行时实现见 app-core/src/extensions。
 */
export * from './types';
export { hasPermission, isRestricted, validateManifest, validatePermissions, guardPermission } from './permissions';
