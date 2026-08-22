/**
 * KaTeX 动态导入模块声明（R3-2 katexLoader）。
 * - katex/contrib/mhchem：官方 contrib 无类型（副作用模块，注册 \ce/\pu 宏）
 * - katex/dist/katex.min.css 与 ?url：vite 处理的 CSS 资源导入
 */
declare module 'katex/contrib/mhchem';
declare module 'katex/dist/katex.min.css' {
  const css: string;
  export default css;
}
declare module 'katex/dist/katex.min.css?url' {
  const url: string;
  export default url;
}
