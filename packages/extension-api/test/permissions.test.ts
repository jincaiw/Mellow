/**
 * P6.1 Extension permissions 直接单测（V4 计划 P6「Extension permission 与 Safe Mode」+ PRD §120/§121）。
 *
 * app-core extensions.test.ts 已通过 registry 集成间接覆盖；
 * 本文件补齐权限模型纯函数边界：manifest 校验、RESTRICTED 常量一致性、guard 错误码。
 */

import {
  hasPermission,
  isRestricted,
  validatePermissions,
  validateManifest,
  guardPermission,
} from '../src/permissions';
import {
  EXTENSION_PERMISSIONS,
  RESTRICTED_PERMISSIONS,
  ExtensionError,
  type ExtensionManifest,
} from '../src/types';

const VALID_MANIFEST: ExtensionManifest = {
  id: 'com.example.my-extension',
  version: '1.0.0',
  name: 'My Extension',
  type: 'command',
  permissions: ['document.read'],
};

describe('P6.1 permissions 纯函数（PRD §120 最小权限）', () => {
  test('hasPermission：声明命中 / 未声明 false', () => {
    expect(hasPermission(['document.read', 'clipboard'], 'document.read')).toBe(true);
    expect(hasPermission(['document.read'], 'network')).toBe(false);
  });

  test('isRestricted：process/keychain 高危；普通权限 false', () => {
    expect(isRestricted('process')).toBe(true);
    expect(isRestricted('keychain')).toBe(true);
    expect(isRestricted('document.read')).toBe(false);
    expect(isRestricted('network')).toBe(false);
  });

  test('RESTRICTED ⊆ EXTENSION_PERMISSIONS（常量一致性）', () => {
    for (const p of RESTRICTED_PERMISSIONS) {
      expect(EXTENSION_PERMISSIONS).toContain(p);
    }
  });

  test('validatePermissions：合法声明 → null', () => {
    expect(validatePermissions(['document.read', 'workspace.read'])).toBeNull();
  });

  test('validatePermissions：未知权限 → 错误信息含权限名', () => {
    const err = validatePermissions(['document.read', 'fs.root' as string]);
    expect(err).toContain('fs.root');
    expect(err).toContain('未知权限');
  });

  test('validatePermissions：重复声明 → 拒绝', () => {
    expect(validatePermissions(['clipboard', 'clipboard'])).toBe('权限声明重复');
  });

  test('validateManifest：合法 manifest → null', () => {
    expect(validateManifest(VALID_MANIFEST)).toBeNull();
  });

  test('validateManifest：非法 id（过短 / 空格 / 特殊字符）→ 拒绝', () => {
    expect(validateManifest({ ...VALID_MANIFEST, id: 'ab' })).toContain('非法扩展 id');
    expect(validateManifest({ ...VALID_MANIFEST, id: 'has space' })).toContain('非法扩展 id');
    expect(validateManifest({ ...VALID_MANIFEST, id: '!bad' })).toContain('非法扩展 id');
  });

  test('validateManifest：非法版本号（缺 patch / 非数字）→ 拒绝', () => {
    expect(validateManifest({ ...VALID_MANIFEST, version: '1.0' })).toContain('非法版本号');
    expect(validateManifest({ ...VALID_MANIFEST, version: 'abc' })).toContain('非法版本号');
  });

  test('validateManifest：空 name / 未知 type → 拒绝', () => {
    expect(validateManifest({ ...VALID_MANIFEST, name: '  ' })).toContain('name');
    expect(validateManifest({ ...VALID_MANIFEST, type: 'kernel' as never })).toContain('未知扩展类型');
  });

  test('validateManifest：未知权限经 validatePermissions 传递拒绝', () => {
    expect(validateManifest({ ...VALID_MANIFEST, permissions: ['root' as string] })).toContain('未知权限');
  });

  test('guardPermission：未声明 → 抛 permission-denied', () => {
    expect(() => guardPermission(['document.read'], 'clipboard')).toThrow(ExtensionError);
    try {
      guardPermission(['document.read'], 'clipboard');
    } catch (e) {
      expect((e as ExtensionError).code).toBe('permission-denied');
    }
  });

  test('guardPermission：声明了高危权限 → 抛 not-implemented（V1 拒绝）', () => {
    try {
      guardPermission(['process'], 'process');
    } catch (e) {
      expect((e as ExtensionError).code).toBe('not-implemented');
      return;
    }
    throw new Error('expected guardPermission to throw');
  });

  test('guardPermission：声明普通权限 → 不抛', () => {
    expect(() => guardPermission(['document.read', 'document.write'], 'document.write')).not.toThrow();
  });
});
