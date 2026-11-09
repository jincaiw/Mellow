/**
 * webview 运行环境回归（2026-11-09，审计 §4.385）。
 *
 * 【为什么】`html/assets.ts` 用 node 的 `__dirname` / `require.resolve` / `fs` 定位
 * KaTeX CSS 与 Mermaid bundle。Tauri webview 打包产物里：`fs` 被 vite 替换为**空桩**，
 * `__dirname` / `require` 是**裸标识符** —— `findUp` 第 4 行即抛 ReferenceError。
 * 实测（Playwright + vite dev，浏览器 ESM 语义）：真机「导出 HTML…」在 math 默认开
 * （`markdown.math` = true）时**必失败**成一句通用 toast；而本包 jest 单测全绿
 * （node 有 __dirname）——「零件绿、整车坏」。A37（ADR-0037 = A2，打印管线复用
 * 同一资产装配）被同一缺陷挡住。
 *
 * 【修复】资产定位入口 `resolvePackageFile` 先探测 node 可用性
 * （`hasNodeRuntime()`：typeof 探测不抛错），webview 返回 null →
 * `katexCssWithEmbeddedFonts` / `readMermaidBundle` 走既有「null = 降级」路径，
 * **导出不再抛错**；宿主（App.tsx）经 env 协作者注入浏览器侧资产。
 *
 * 【本测试怎么锁】jest 跑在 node 里，无法直接复现 webview —— 用三件事拼出等价环境：
 *   ① `jest.mock('fs')` 置空桩（vite 对 webview 的行为）；
 *   ② `beforeAll` 里**摘掉 `process.versions.node`**（webview 里它不存在，
 *      `hasNodeRuntime()` 因此返回 false —— 这是本回归的判定核心）；
 *   ③ `new Function` 在**不含 `__dirname` / `require` 绑定**的作用域里调用资产函数
 *      （模拟浏览器顶层裸调用：旧代码在此抛 ReferenceError）。
 * 断言：资产函数返回 null（不抛）、env 协作者注入透传、exportHtml 完整产出。
 */

jest.mock('fs', () => ({}));

import { katexCssWithEmbeddedFonts, readMermaidBundle } from '../src/html/assets';
import { exportHtml } from '../src/html/index';

describe('webview 运行环境（§4.385）：fs 空桩 + 无 process.versions.node + 裸 __dirname/require', () => {
  const versions = process.versions as Record<string, string | undefined>;
  let nodeVersion: string | undefined;

  beforeAll(() => {
    nodeVersion = versions.node;
    delete versions.node; // webview 里不存在 —— hasNodeRuntime() 必须因此返回 false
  });
  afterAll(() => {
    if (nodeVersion !== undefined) versions.node = nodeVersion;
  });

  /** 在「无 __dirname / 无 require」的干净作用域里执行 fn —— 模拟 webview 顶层调用 */
  function callWithoutNodeGlobals<T>(fn: () => T): T {
    const runner = new Function('fn', 'return fn();') as (f: () => T) => T;
    return runner(fn);
  }

  it('katexCssWithEmbeddedFonts 返回 null（不抛 ReferenceError）', () => {
    expect(callWithoutNodeGlobals(() => katexCssWithEmbeddedFonts())).toBeNull();
  });

  it('readMermaidBundle 返回 null（不抛 ReferenceError）', () => {
    expect(callWithoutNodeGlobals(() => readMermaidBundle())).toBeNull();
  });

  it('env 协作者注入时原样透传（宿主通道不被 node 探测拦截）', () => {
    expect(katexCssWithEmbeddedFonts('/* host css */')).toBe('/* host css */');
    expect(readMermaidBundle('// host bundle')).toBe('// host bundle');
  });

  it('exportHtml(math: true) 在 webview 语义下降级产出完整 HTML，而不是抛错中断', async () => {
    const html = await exportHtml('# T\n\n$x^2$ 与 `code`', { mode: 'with-theme', math: true }, {});
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<h1'); // 正文仍在（渲染器本身不依赖 fs）
    // 公式 DOM 仍在（katex 是纯 JS 依赖，vite 正常打包；缺的只是 CSS 内联）
    expect(html).toContain('class="katex');
  });
});
