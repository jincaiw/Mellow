/**
 * permissions —— 权限模型纯函数（PRD §120 默认最小权限 / ADR-0013）。
 * 运行时门卫与 manifest 校验共用；不依赖宿主。
 */
import {
  ExtensionPermission,
  EXTENSION_PERMISSIONS,
  RESTRICTED_PERMISSIONS,
  ExtensionManifest,
  ExtensionError,
  ExtensionType,
  EXTENSION_TYPES,
} from './types';

/** 扩展是否声明了指定权限 */
export function hasPermission(declared: readonly ExtensionPermission[], permission: ExtensionPermission): boolean {
  return declared.includes(permission);
}

/** 是否为高危权限（V1 一律拒绝实现） */
export function isRestricted(permission: ExtensionPermission): boolean {
  return RESTRICTED_PERMISSIONS.includes(permission);
}

/** 校验权限声明：未知权限 / 重复 → 非法 */
export function validatePermissions(declared: readonly string[]): string | null {
  for (const p of declared) {
    if (!EXTENSION_PERMISSIONS.includes(p as ExtensionPermission)) {
      return `未知权限: ${p}`;
    }
  }
  if (new Set(declared).size !== declared.length) return '权限声明重复';
  return null;
}

/** 校验 manifest（id / version / name / type / permissions） */
export function validateManifest(manifest: ExtensionManifest): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(manifest.id)) {
    return `非法扩展 id: ${manifest.id}（建议反向域名，如 com.example.my-extension）`;
  }
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) return `非法版本号: ${manifest.version}`;
  if (manifest.name.trim() === '') return '扩展 name 不能为空';
  if (!EXTENSION_TYPES.includes(manifest.type as ExtensionType)) return `未知扩展类型: ${manifest.type}`;
  const perms = validatePermissions(manifest.permissions);
  if (perms !== null) return perms;
  return null;
}

/** 门卫：未声明 → 抛 permission-denied；高危权限 → 抛 not-implemented */
export function guardPermission(declared: readonly ExtensionPermission[], permission: ExtensionPermission): void {
  if (!hasPermission(declared, permission)) {
    throw new ExtensionError(`扩展缺少权限: ${permission}`, 'permission-denied');
  }
  if (isRestricted(permission)) {
    throw new ExtensionError(`权限 ${permission} 在 V1 未开放（高危权限）`, 'not-implemented');
  }
}
