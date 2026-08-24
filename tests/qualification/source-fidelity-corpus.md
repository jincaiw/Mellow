# Source Fidelity Corpus — Gate 记录

> 对应 PRD §104（Atomic Save）、spec §3（Source Fidelity）：
> **Open → No Edit → Save → byte identical**（除非用户显式转换编码/EOL）。

## 结论

| 指标 | 结果 |
|---|---|
| Open → No Edit → Save → Git Diff | ✅ **0 diff（151/151 字节级一致）** |
| 无意源代码变化 | ✅ 0（无需修复） |

## 执行方式

```sh
bash tests/qualification/run-source-fidelity-corpus.sh
```

流程：

1. **组装语料库**：真实文件 + 生成变体（见下），复制到临时目录；
2. `git init` + baseline commit（`core.autocrlf=false`）；
3. `source_fidelity --dir <corpus> <corpus>` **原地**执行真实保存管线
   （`apps/desktop/src-tauri/src/bin/source_fidelity.rs`，与 `open_document`/`save_document`
   相同的 `decode → encode → atomic_save`）；
4. `git status --porcelain` 必须为空；`git diff` 必须为空。

回归：`cargo test --test file_safety_corpus`（16/16）+ `cargo test --lib`（55/55）全绿。

## 语料库（151 个文件）

| 类别 | 文件 | 说明 |
|---|---|---|
| real（122） | `tests/fixtures/**`、`docs/**`、`README.md`、`AGENTS.md`、`THIRD_PARTY_NOTICES.md`、`tests/benchmark/reports/*.md` | 仓库全部真实 Markdown/HTML/TSV（含 PRD、ADR、Specs 等大量中文文档） |
| LF（2） | mixed-document / table（LF 原样） | |
| CRLF（3） | mixed-document / table / yaml-front-matter 转 CRLF | 46 行 CR 验证通过 |
| BOM（4） | UTF-8 BOM ×2、UTF-16 LE BOM、UTF-16 BE BOM | 真实世界 Word/Sublime/VS Code 产物 |
| Chinese（4） | PRD V1.2 FINAL、file-safety-spec、README、生成富中文样例 | 富样例含中文表格/公式/Mermaid/代码块 |
| Large File（5） | 1MB、5MB、100k-lines（5.4MB）、生成 ~15MB、无尾换行 1MB | 含无尾换行边界 |
| Tables（2） | table、large-table | |
| Math（1） | typora-math-corpus | |
| Mermaid（2） | typora-mermaid-corpus、100-mermaid | |
| YAML（1） | front-matter-corpus | |
| HTML（3） | safe-html-corpus、rich-clipboard、dangerous-rich-clipboard | |
| Images（2） | link-image、1000-images（1000 图片引用） | |

## 运行结果

```text
[source-fidelity] total=151 identical=151 diff/failed=0
PASS —— 151 个文件 Open → No Edit → Save 后 git diff = 0（字节级一致）
```

- 编码覆盖：UTF-8（无 BOM）、UTF-8 BOM、UTF-16 LE/BE（BOM）全部 byte identical；
- EOL 覆盖：LF、CRLF 全部 byte identical（`encode` 不转换 EOL，content 原样写出）；
- 大文件覆盖：~15MB 中文大文件 roundtrip 一致、无半写、无性能异常；
- 全部语料均为合法 UTF-8（Python strict decode 全量校验通过）。

## 结论

Source Fidelity 门禁通过：**任何「Open → No Edit → Save」都不产生字节级变更**，
因此也不存在需要修复的无意源代码变化。

## 后续

1. 将 `run-source-fidelity-corpus.sh` 接入 CI（Linux 上需 `cargo build --bin source_fidelity`；
   iconv/perl 为跨平台工具）。
2. 新 fixture 入库后重跑本 gate。
