/**
 * 导出资产模块声明（A37 / 审计 §4.385，2026-11-09）。
 *
 * 背景：webview（Tauri 打包产物）里 `packages/export` 的 node 资产定位
 * （`__dirname` / `require.resolve` / `fs`）不可用 —— KaTeX CSS 字体
 * 内联与 Mermaid bundle 读取返回 null（降级）。宿主改经 vite 的 `?raw`
 * 导入把**构建期资产内容**注入 `HtmlExportEnv`（`katexCss` / `mermaidBundle`
 * 本就是该 env 的可选协作者通道，非新机制）。
 *
 * - `?raw`：vite 把文件内容作为字符串打包（与 `?url` 同族的资源查询）。
 * - KaTeX CSS：vite 还会把它引用的 `fonts/*.woff2` emit 成相邻资产 ——
 *   但 `?raw` 的字符串里 `url(fonts/...)` 是**相对路径**，独立打印视图
 *   （printview:// 协议加载）解析不到它们 ⇒ 宿主注入前需把字体 URL
 *   重写为应用内绝对路径（见 App.tsx 的 exportAssets 装配段）。
 * - Mermaid：`mermaid.min.js` 是自包含 IIFE，`?raw` 整体内联即可执行。
 */

declare module 'katex/dist/katex.min.css?raw' {
  const css: string;
  export default css;
}

declare module 'mermaid/dist/mermaid.min.js?raw' {
  const bundle: string;
  export default bundle;
}
