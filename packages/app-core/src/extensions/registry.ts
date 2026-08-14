/**
 * extensions/registry.ts —— 扩展运行时（PRD §119-121 实现）。
 *
 * 职责：
 * - register：校验 manifest（validateManifest）→ 存记录（enabled=false）；
 * - enable：构建按权限裁剪的 context → 调用 setup（异常 → enabled=false + setupError）；
 * - disable / unload：状态管理；
 * - Safe Mode（PRD §121）：开启后 enable 一律拒绝；
 * - 贡献点分发：遍历已启用扩展的 contributions（宿主消费）。
 */
import {
  ExtensionAPI,
  ExtensionContext,
  ExtensionManifest,
  ExtensionRecord,
  ExtensionStatus,
  ExtensionContributions,
  ExtensionError,
} from '../../../extension-api/src';
import { validateManifest } from '../../../extension-api/src/permissions';
import { buildExtensionContext } from './context';
import type { ExtensionHost } from './host';

interface RegisteredExtension {
  manifest: ExtensionManifest;
  setup: (ctx: ExtensionContext) => void | Promise<void>;
  enabled: boolean;
  setupError?: string;
  registeredAt: number;
  /** setup 填充的贡献点（enable 成功后读取） */
  contributions: ExtensionContributions;
}

export class ExtensionRegistry implements ExtensionAPI {
  private entries = new Map<string, RegisteredExtension>();
  private safeMode = false;

  constructor(private readonly host: ExtensionHost) {}

  isSafeMode(): boolean { return this.safeMode; }
  setSafeMode(on: boolean): void { this.safeMode = on; }

  async register(manifest: ExtensionManifest, setup: (ctx: ExtensionContext) => void | Promise<void>): Promise<string> {
    const problem = validateManifest(manifest);
    if (problem !== null) throw new ExtensionError(problem, 'invalid-manifest');
    if (this.entries.has(manifest.id)) throw new ExtensionError(`扩展已注册: ${manifest.id}`, 'invalid-manifest');
    this.entries.set(manifest.id, {
      manifest,
      setup,
      enabled: false,
      registeredAt: Date.now(),
      contributions: {},
    });
    return manifest.id;
  }

  list(): ExtensionRecord[] {
    return Array.from(this.entries.values()).map(toRecord);
  }

  get(id: string): ExtensionRecord | undefined {
    const e = this.entries.get(id);
    return e === undefined ? undefined : toRecord(e);
  }

  async enable(id: string): Promise<ExtensionStatus> {
    const entry = this.requireEntry(id);
    if (this.safeMode) {
      throw new ExtensionError('Safe Mode：扩展已禁用', 'setup-failed');
    }
    if (entry.enabled) return toRecord(entry);

    const contributions: ExtensionContributions = {};
    const ctx = buildExtensionContext(entry.manifest, this.host, { contributions });
    try {
      await entry.setup(ctx);
      entry.enabled = true;
      entry.setupError = undefined;
      entry.contributions = contributions;
    } catch (e) {
      entry.enabled = false;
      entry.setupError = e instanceof Error ? e.message : String(e);
      throw new ExtensionError(`扩展 setup 失败: ${entry.setupError}`, 'setup-failed');
    }
    return toRecord(entry);
  }

  async disable(id: string): Promise<ExtensionStatus> {
    const entry = this.requireEntry(id);
    entry.enabled = false;
    return toRecord(entry);
  }

  async unload(id: string): Promise<void> {
    this.entries.delete(id);
  }

  isEnabled(id: string): boolean {
    return this.entries.get(id)?.enabled ?? false;
  }

  // ── 贡献点分发（宿主消费；V1 通用遍历） ──

  /** 全部已启用扩展的贡献点（宿主按类型消费） */
  contributions(): Array<{ id: string; contributions: ExtensionContributions }> {
    return Array.from(this.entries.values())
      .filter((e) => e.enabled)
      .map((e) => ({ id: e.manifest.id, contributions: e.contributions }));
  }

  /** 按类型聚合贡献点（V1 用于 Command/Theme/Editor 接线） */
  collect<K extends keyof ExtensionContributions>(key: K): Array<{ extensionId: string; value: NonNullable<ExtensionContributions[K]> }> {
    const out: Array<{ extensionId: string; value: NonNullable<ExtensionContributions[K]> }> = [];
    for (const { id, contributions } of this.contributions()) {
      const value = contributions[key];
      if (value !== undefined) out.push({ extensionId: id, value } as { extensionId: string; value: NonNullable<ExtensionContributions[K]> });
    }
    return out;
  }

  private requireEntry(id: string): RegisteredExtension {
    const entry = this.entries.get(id);
    if (entry === undefined) throw new ExtensionError(`扩展未注册: ${id}`, 'not-found');
    return entry;
  }
}

function toRecord(e: RegisteredExtension): ExtensionRecord {
  return { ...e.manifest, enabled: e.enabled, setupError: e.setupError, registeredAt: e.registeredAt };
}
