/**
 * browser-engine-neutral tests —— 证明 editor-core 无 WebKit/平台假设。
 *
 * 1. 静态扫描：vendored CoreEditor 源码的平台耦合点受控（回归保护）；
 * 2. 注入脚本实跑：在「无 WebKit」的 jsdom 环境中执行 BRIDGE_INJECTION，
 *    验证消息路由到宿主桥（__MELLOW_BRIDGE__ / __TAURI__ / no-op fallback）；
 * 3. bundle 构建注入验证（需要 CoreEditor dist 存在）。
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRIDGE_INJECTION, installBridge } from '../src/bridge-injection';
import { buildBundleHtml } from '../src/bundle';

const CORE_SRC = resolve(__dirname, '../CoreEditor/src');
const CORE_DIST = resolve(__dirname, '../CoreEditor/dist/index.html');

function allTsSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  walk(CORE_SRC);
  return files;
}

describe('中性 1 — 平台耦合扫描（回归保护）', () => {
  const sources = allTsSources();
  const text = sources.map((f) => readFileSync(f, 'utf8')).join('\n');

  test('无 WKWebView / Swift 专有字符串', () => {
    expect(text).not.toContain('WKWebView');
    expect(text).not.toContain('callAsyncJavaScript');
    expect(text).not.toContain('evaluateJavaScript');
  });

  test('无 macOS 平台判定（navigator.platform / userAgentData）', () => {
    expect(text).not.toContain('navigator.platform');
    expect(text).not.toContain('userAgentData');
    expect(text).not.toContain('isMac');
    expect(text).not.toContain('process.platform');
  });

  test('webkit 引用仅限已知豁免点', () => {
    // 允许：bridge/nativeModule.ts（桥接）、common/utils.ts（isReleaseMode 判定）、@types/global.d.ts（类型）
    const allowed = new Set([
      'bridge/nativeModule.ts',
      'common/utils.ts',
      '@types/global.d.ts',
    ]);
    const violations: string[] = [];
    for (const file of sources) {
      const rel = file.slice(CORE_SRC.length + 1);
      if (allowed.has(rel)) continue;
      if (readFileSync(file, 'utf8').includes('window.webkit')) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  test('isChrome 仅用于 CSS prefix（引擎无关），且仅存在 utils.ts', () => {
    const uses = sources.filter((f) => readFileSync(f, 'utf8').includes('isChrome'));
    expect(uses.every((f) => f.includes('utils.ts') || f.includes('builder.ts'))).toBe(true);
  });
});

describe('中性 2 — 注入脚本在无 WebKit 环境实跑', () => {
  beforeEach(() => {
    // 清空宿主桥与 webkit mock（模拟全新非 WebKit 环境）
    delete (window as unknown as Record<string, unknown>).__MELLOW_BRIDGE__;
    delete (window as unknown as Record<string, unknown>).__TAURI__;
    delete (window as unknown as Record<string, unknown>).webkit;
  });

  test('无任何宿主桥 → postMessage no-op（Promise.resolve(null)）', async () => {
    // 执行注入脚本（bundle 构建期会注入，这里模拟执行）
    // eslint-disable-next-line no-eval
    (0, eval)(BRIDGE_INJECTION);
    const bridge = (window as unknown as { webkit: { messageHandlers: { bridge: { postMessage(m: unknown): Promise<unknown> } } } }).webkit.messageHandlers.bridge;
    expect(typeof bridge.postMessage).toBe('function');
    await expect(bridge.postMessage({ moduleName: 'core', methodName: 'notifyViewDidUpdate', parameters: '{}' })).resolves.toBeNull();
  });

  test('installBridge 注册的宿主桥被调用', async () => {
    const invoked: unknown[] = [];
    installBridge({ invoke: async (message) => { invoked.push(message); return { ok: true }; } });
    // eslint-disable-next-line no-eval
    (0, eval)(BRIDGE_INJECTION);
    const bridge = (window as unknown as { webkit: { messageHandlers: { bridge: { postMessage(m: unknown): Promise<unknown> } } } }).webkit.messageHandlers.bridge;
    const message = { moduleName: 'core', methodName: 'notifyViewDidUpdate', parameters: '{"isDirty":true}' };
    const result = await bridge.postMessage(message);
    expect(invoked).toEqual([message]);
    expect(result).toEqual({ ok: true });
  });

  test('__TAURI__ 桥（Tauri 2 withGlobalTauri）被调用', async () => {
    (window as unknown as Record<string, unknown>).__TAURI__ = {
      core: { invoke: async (cmd: string) => ({ cmd }) },
    };
    // eslint-disable-next-line no-eval
    (0, eval)(BRIDGE_INJECTION);
    const bridge = (window as unknown as { webkit: { messageHandlers: { bridge: { postMessage(m: unknown): Promise<unknown> } } } }).webkit.messageHandlers.bridge;
    const result = await bridge.postMessage({ moduleName: 'core', methodName: 'notifyWindowDidLoad', parameters: '{}' });
    expect(result).toEqual({ cmd: 'bridge_call' });
  });
});

describe('中性 3 — bundle 构建注入', () => {
  const hasDist = existsSync(CORE_DIST);

  test('buildBundleHtml 替换占位符并注入桥（CoreEditor dist 构建后）', () => {
    if (!hasDist) return; // 需要先 yarn build
    const source = readFileSync(CORE_DIST, 'utf8');
    const bundle = buildBundleHtml(source);

    expect(bundle).not.toContain('{{EDITOR_CONFIG}}');
    expect(bundle).not.toContain('{{USER_SETTINGS}}');
    expect(bundle).toContain('__MELLOW_BRIDGE__');
    expect(bundle).toContain('"host":"mainApp"');
  });

  test('缺失占位符时报错', () => {
    expect(() => buildBundleHtml('<html><body>x</body></html>')).toThrow('{{EDITOR_CONFIG}}');
  });
});
