/**
 * 离线资源装配：KaTeX CSS + 字体内联、Mermaid bundle 读取。
 *
 * 不依赖在线 CDN 的策略：
 * - KaTeX：读取 katex 包内的 katex.min.css，将 url(fonts/...) 全部替换为
 *   data:font/...;base64（字体来自 katex 包自带目录）；
 * - Mermaid：读取 mermaid 包内的 mermaid.min.js（自包含 IIFE，无外部 import），
 *   整体内联进导出 HTML，浏览器打开时本地执行渲染；
 * - 读取失败一律降级（返回 null），由调用方回退为源码展示，绝不抛错中断导出。
 */

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

/** 定位包内文件：require.resolve 优先，失败时向上查找 node_modules */
function resolvePackageFile(pkg: string, subpath: string): string | null {
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
  if (cssPath === null) return null;
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
