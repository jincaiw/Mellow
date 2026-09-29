# UX Gate 30 任务夹具（PRD §132）

> 依据：`docs/qualification/ux-score-gate-template.md` §二、
> PRD §132「任务效率 Gate」、PRD §131「UX Parity Score」、ADR-0020。

## 为什么需要这个目录

门禁要求「**同一台机器、同一份测试文档**」下对照 Typora 1.14.9 与 Mellow。
但此前**没有任何文档被指定为那份文档** —— 模板只写「同一份测试文档（`tests/fixtures/`）」，
而 30 项任务里有一半以上依赖**特定内容**：`[TOC]`、脚注、内联/块级公式、
**一处故意写错的 Mermaid**（任务 17 要求「渲染 → 修正错误」）、可写入的 `assets/`、
任务列表、带对齐的表格、四级标题（大纲）、可被外部修改的文件（任务 28/29）。

没有指定文档的后果：**三场平台会话会各用各的文档**，任务内容不可比、
「修正错误」「加一行」这类动作也无从复现。故把那份文档**固化**在这里。

## 文件

| 文件 | 用途 |
|---|---|
| `ux-gate-30tasks.md` | **主对照文档**（任务 01–29 的载体；各节标题前缀标明服务哪项任务） |
| `notes.md` | 任务 03（切换文件）/ 04（Quick Open）的第二份文档 |
| `assets/gate-placeholder.png` | 任务 12 的图片载体（相对路径引用）；任务 12 的截图也请粘贴到 `assets/` |
| `README.md` | 本文件 |

**主对照文档不在本目录内**：任务 30 的 10 MiB 夹具由基准生成器产出、**不入库**：

```bash
cd tests/benchmark && node generate-fixtures.mjs
# → tests/benchmark/fixtures/10MB.md（10 MiB）
```

## 使用约定

1. 把整个 `tests/fixtures/ux-gate/` 目录**复制到工作目录**再测（任务 12 会往里写截图、
   任务 28/29 会做外部修改 —— 不要污染仓库）。
2. 同一平台的两轮（R1 / R2）**必须用同一份副本**；跨平台会话请用同一版本的本夹具
   （即同一 commit 下的本目录）。
3. 每一条观测都要留证据（截图 / 视频 / 日志路径），命名建议
   `evidence/task-<NN>-<app>-<round>.png`（与 `ux-gate-recorder.mjs` 骨架里的示例一致）。
4. 任务 30 在 Typora 侧**不可执行**（Typora 不渲染 >2,000,000 字符），
   处置见 `docs/adr/ADR-0025-evidence-policy-when-baseline-refuses.md`；
   **裁决前不要编造 Typora 侧数据**。

## 与护栏的关系

`tests/parity/verify-parity-ledger.mjs` 会断言本目录的**内容不变量**（`[TOC]`、脚注、
公式、故意写错的 Mermaid、表格对齐、任务列表、相对路径图片、四级标题等）。
改本夹具时若删掉某项能力，护栏会报错 —— 因为那会让某几项任务**无法执行**，
而「任务无法执行」在人工会话里表现为「跳过」，最终变成一条**静默缺失的观测**。
