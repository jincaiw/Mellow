/**
 * 离线资源装配：KaTeX CSS + 字体内联、Mermaid bundle 读取。
 *
 * 不依赖在线 CDN 的策略：
 * - KaTeX：读取 katex 包内的 katex.min.css，将 url(fonts/...) 全部替换为
 *   data:font/...;base64（字体来自 katex 包自带目录）；
 * - Mermaid：读取 mermaid 包内的 mermaid.min.js（自包含 IIFE，无外部 import），
 *   整体内联进导出 HTML，浏览器打开时本地执行渲染；
 * - 读取失败一律降级（返回 null），由调用方回退为源码展示，绝不抛错中断导出。
 *
 * ⚠️ 运行环境双态（2026-11-09，审计 §4.385）：本模块同时被两种环境加载 ——
 *   · node（单测 / jest）：`fs` / `__dirname` / `require.resolve` 可用；
 *   · webview（Tauri 打包产物）：vite 把 `fs` 替换为**空桩模块**，`__dirname` 与
 *     `require` 是**裸标识符** —— 直接引用会抛 ReferenceError。实测：真机
 *     「导出 HTML…」在 math 默认开时一直失败成一句通用 toast（$x^2$ 文档必炸），
 *     而本机单测全绿（node 有 __dirname）—— 典型「零件绿、整车坏」。
 *   ⇒ 资产定位**入口处**先探测 node 可用性（typeof 探测不抛错），不可用即返回
 *   null 走降级；宿主（App.tsx）在 webview 里经 env 协作者
 *   （`katexCss` / `mermaidBundle`）注入浏览器侧资产 —— env 本就是为这准备的
 *   可选协作者通道（HtmlExportEnv），此处不再发明新机制。
 */

/** node 内建可用性（浏览器/webview 为 false；typeof 探测本身不会抛 ReferenceError） */
function hasNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined'
    && process !== null
    && typeof process.versions === 'object'
    && process.versions !== null
    && typeof (process.versions as Record<string, string | undefined>).node === 'string'
  );
}

import * as fs from 'fs';
import * as path from 'path';

/** 从当前模块向上查找 node_modules/<pkg>/<subpath> 的绝对路径 */
function findUp(pkg: string, subpath: string): string | null {
  let dir = __dirname;
  while (true) {
    const candidate = path.join(dir, 'node_modules', pkg, subpath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 定位包内文件：require.resolve 优先，失败时向上查找 node_modules。
 *  ⚠️ 仅在 node 运行时可用；webview（vite 空桩 fs + 裸 __dirname/require）返回 null。 */
function resolvePackageFile(pkg: string, subpath: string): string | null {
  if (!hasNodeRuntime()) return null; // 浏览器/webview：无 node 资产定位能力（§4.385）
  const candidates: string[] = [];
  try {
    candidates.push(require.resolve(`${pkg}/${subpath}`));
  } catch {
    /* 继续尝试其他候选 */
  }
  try {
    candidates.push(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), subpath));
  } catch {
    /* 继续尝试其他候选 */
  }
  const found = findUp(pkg, subpath);
  if (found !== null) candidates.push(found);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── KaTeX ───────────────────────────────────────────────────

let cachedKatexCss: string | null = null;

/**
 * 返回 KaTeX CSS，字体全部内联为 data URL。
 * override 存在时原样返回（宿主提供，例如已含 data URI 的自定义 CSS）。
 */
export function katexCssWithEmbeddedFonts(override?: string): string | null {
  if (override !== undefined && override !== '') return override;
  if (cachedKatexCss !== null) return cachedKatexCss;
  const cssPath = resolvePackageFile('katex', 'dist/katex.min.css');
  if (cssPath === null) return null; // webview：返回 null，等宿主经 env.katexCss 注入（§4.385）
  try {
    const dir = path.dirname(cssPath);
    let css = fs.readFileSync(cssPath, 'utf8');
    css = css.replace(/url\((fonts\/[^)]+)\)/g, (_match, rel: string) => {
      const file = path.join(dir, rel);
      if (!fs.existsSync(file)) return `url(${rel})`;
      const mime = rel.endsWith('.woff2')
        ? 'font/woff2'
        : rel.endsWith('.woff')
          ? 'font/woff'
          : 'font/ttf';
      const b64 = fs.readFileSync(file).toString('base64');
      return `url(data:${mime};base64,${b64})`;
    });
    cachedKatexCss = css;
    return css;
  } catch {
    return null;
  }
}

// ── Mermaid ─────────────────────────────────────────────────

let cachedMermaidBundle: string | null = null;

/** 读取 mermaid bundle（自包含 IIFE，可内联为普通 <script>）。失败返回 null。 */
export function readMermaidBundle(override?: string): string | null {
  if (override !== undefined && override !== '') return override;
  if (cachedMermaidBundle !== null) return cachedMermaidBundle;
  for (const subpath of ['dist/mermaid.min.js', 'dist/mermaid.esm.min.mjs']) {
    const file = resolvePackageFile('mermaid', subpath);
    if (file === null) continue;
    try {
      const source = fs.readFileSync(file, 'utf8');
      if (source.length === 0) continue;
      cachedMermaidBundle = source;
      return source;
    } catch {
      /* 尝试下一个候选 */
    }
  }
  return null;
}

/** Mermaid 浏览器端渲染脚本（内联，DOM ready 后渲染所有 pre.mermaid）。
 *  渲染完成后 dispatch `mellow-mermaid-ready`（打印/截图等消费方可监听）。 */
export function mermaidInitScript(theme: 'light' | 'dark'): string {
  const mermaidTheme = theme === 'dark' ? 'dark' : 'default';
  return `(function () {
  var m = window.mermaid;
  if (!m || typeof m.run !== 'function') return;
  function renderAll() {
    try {
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: ${JSON.stringify(mermaidTheme)} });
      var nodes = document.querySelectorAll('pre.mermaid');
      if (nodes.length === 0) return;
      m.run({ nodes: nodes }).then(function () {
        window.dispatchEvent(new Event('mellow-mermaid-ready'));
      }).catch(function (err) {
        console.error('[mellow] mermaid render failed:', err);
        window.dispatchEvent(new Event('mellow-mermaid-ready'));
      });
    } catch (err) {
      console.error('[mellow] mermaid render failed:', err);
      window.dispatchEvent(new Event('mellow-mermaid-ready'));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }
})();`;
}
