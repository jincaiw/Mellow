# Benchmark Fixtures

本目录为**生成产物**（gitignore）。使用 `generate-fixtures.mjs` 确定性生成：

```bash
cd tests/benchmark
node generate-fixtures.mjs
```

生成内容：

| 夹具 | 规格 | 说明 |
|---|---|---|
| `1MB.md` | 1 MiB 散文 markdown | 混合标题/段落/列表/代码块，Latin + CJK |
| `5MB.md` | 5 MiB | 大文件字节阈值边界（>5MB 触发，5MB 不触发） |
| `10MB.md` | 10 MiB | 触发大文件模式 |
| `100k-lines.md` | 100,000 行 | 触发大文件模式（>50,000 行） |
| `large-table.md` | 600×8 表格 | 表格解析压力 |
| `100-mermaid.md` | 100 个 Mermaid 块 | 全量渲染（低于大文件阈值） |
| `1000-images.md` | 1000 图片引用 + `assets/` 1×1 PNG | 图片加载压力 |
| `_blank.md` | 空文档 | startup 指标用（runner 自动创建） |

`manifest.json` 记录每个文件的 sha256 / bytes / lines，用于复现校验。

性能基准见 `docs/specs/performance-benchmark-spec.md`。
