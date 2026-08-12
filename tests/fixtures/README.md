# Fixtures — 测试素材库

供 CoreEditor / editor-engine / parity / 性能测试复用的 Markdown 样本。

## 使用约定

- 每个 fixture 是**合法的 Markdown 文档**（顶部用 HTML 注释标注用途，不影响解析）；
- 修改 fixture 需同步检查引用它的测试；
- 新增节点类型（如 Phase 2）时在 `markdown/` 追加对应文件。

## 目录

| 文件 | 覆盖 |
|---|---|
| `markdown/heading.md` | ATX H1–H6、setext、空标题 |
| `markdown/inline-format.md` | Bold/Italic/Strike/InlineCode 及嵌套 |
| `markdown/list.md` | 无序/有序/嵌套/任务列表 |
| `markdown/table.md` | 表格（对齐、多行） |
| `markdown/link-image.md` | 链接、图片（相对路径/中文名） |
| `markdown/code-fence.md` | 代码块 + 语言标注 |
| `markdown/quote.md` | 引用、嵌套引用 |
| `markdown/mixed-document.md` | 综合文档（仿真实写作场景） |
| `clipboard/rich-clipboard.html` | 富文本剪贴板：中文、格式、表格和恶意 HTML |
| `clipboard/dangerous-rich-clipboard.html` | 安全测试：script、event handler、javascript/data URL 与 Unicode |
| `clipboard/copy-source.md` | Clipboard Copy：中文、Unicode、链接、列表、表格、代码块 |
| `clipboard/spreadsheet.tsv` | 电子表格 TSV → GFM Table |
| `clipboard/spreadsheet-unicode.tsv` | TSV：中文、emoji、pipe 转义 |
| `math/typora-math-corpus.md` | Typora Math Corpus：inline、block、macro、mhchem、error、copy source |
| `mermaid/typora-mermaid-corpus.md` | Typora Mermaid Corpus：flowchart、sequence、class、state、ER、pie、mindmap、timeline、kanban、error |
| `footnote/typora-footnote-corpus.md` | Footnote Corpus：引用、重复引用、定义、多行定义、代码块跳过 |
| `toc/toc-corpus.md` | TOC Corpus：`[TOC]`、多级 heading、中文/emoji、代码块/YAML 跳过 |
| `alerts/github-alerts-corpus.md` | GitHub Alerts Corpus：NOTE/TIP/IMPORTANT/WARNING/CAUTION、普通引用、代码块跳过 |
| `yaml/front-matter-corpus.md` | YAML Front Matter Corpus：顶部 front matter、列表、布尔/数字、正文分隔 |

## 用法示例（jest）

```ts
import { readFileSync } from 'node:fs';
const doc = readFileSync(new URL('./markdown/heading.md', import.meta.url), 'utf8');
```
