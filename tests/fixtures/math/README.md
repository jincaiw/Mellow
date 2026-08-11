# Typora Math Corpus

`typora-math-corpus.md` 是 Mellow Math 兼容性回归语料，覆盖：

- inline `$...$`
- inline `\(...\)`
- block `$$...$$`
- block `\[...\]`
- macro (`\newcommand`)
- mhchem compatibility (`\ce`)
- render error
- copy source

验收原则：Typora 文档兼容率优先；fast path 只能用于明确支持语法，unsupported syntax 必须 fallback 到 MathJax-compatible renderer。
