# CoreEditor Upstream

- Repository: https://github.com/MarkEdit-app/MarkEdit
- Directory: CoreEditor/
- Commit: 81da2a20122a5a43a0cf45d85f8877e18230ab66
- License: MIT (see LICENSE)

## Sync

```sh
# re-vendor from upstream (keep this file updated)
git -C /tmp/MarkEdit-src pull --depth 1
git -C /tmp/MarkEdit-src rev-parse HEAD          # ← 记下新 commit，手动更新上面 Commit: 一行
cp -R /tmp/MarkEdit-src/CoreEditor ./CoreEditor
```

> ⚠️ **不要写 `git rev-parse HEAD > UPSTREAM.md`**（上游 README 的示例形态）——
> 那会把本文件**整份覆盖成一行 commit hash**，连带删掉下面的改动清单。
>
> ⚠️ **`cp -R` 会静默覆盖 Mellow 的改动。** 本仓库的 `CoreEditor/` **不是**纯净上游 ——
> 见下方「Mellow 的 CoreEditor 改动」。re-vendor 前先备份、re-vendor 后按表重放，
> 并用「生成/校验清单」一节里的命令确认清单仍然准确。

---

## Mellow 的 CoreEditor 改动（**re-vendor 必读**）

> **本文早期版本写「DO NOT modify files under CoreEditor/ directly」，与现状矛盾（2026-10-01 更正）。**
> 实际做法是把一部分改动直接落在 `CoreEditor/` 内（因渲染层行为无法从外部包覆盖），
> 因此该规则**事实上已被打破**。本文的首要作用随之改为：**让 re-vendor 不会静默丢掉这些改动**。
>
> **新增改动仍应优先落在 Mellow 自己的包**（`packages/editor-engine` / `packages/editor-core/src`(wrapper) /
> `apps/desktop/src/host`）。确需改 `CoreEditor/` 时，**必须同步更新下表**。

清单来源：与**本文件钉住的 commit** 的官方 tarball 逐文件 diff（非回忆、非人工枚举）。

### 修改的文件（19）

| 文件 | 规模 | 改动要点 |
|---|---|---|
| `.gitignore` | +2 | 忽略 `*.tsbuildinfo`（本机 `tsc --noEmit` 也会生成的增量产物） |
| `src/@quicklook/zoom.ts` | +37/-7 | `enablePinchZoom` 改为**返回 disposer**（原实现装上监听器撤不掉）；缩放语义 |
| `src/bridge/web/config.ts` | +42 | 新增 Mellow 设置桥方法（含 `setAllowMagnification`） |
| `src/config.ts` | +32 | `Config` 接口新增 Mellow 字段（`contentMaxWidth` / `codeIndentSize` / `allowMagnification` 等） |
| `src/extensions.ts` | +13/-5 | 扩展装配调整（新增 compartment 等） |
| `src/languages.ts` | +156/-1 | 语言/代码高亮集合调整 |
| `src/modules/config/index.ts` | +67 | 设置应用入口（`setAllowMagnification`、`setEditorConfig` 白名单等） |
| `src/modules/indentation/index.ts` | +41/-1 | 正文 Tab 与**代码块缩进宽度**分离（`codeIndentSize`，G7-EDIT-17） |
| `src/modules/input/index.ts` | +14/-5 | 输入辅助开关语义（配对 / 围栏展开的归属） |
| `src/modules/input/insertCodeBlock.ts` | +30/-1 | 代码块插入（默认语言清洗与开围栏） |
| `src/styling/builder.ts` | +1/-1 | 样式构建微调 |
| `src/styling/config.ts` | +100/-12 | 样式配置（引擎级字号阶梯同步、写作限宽等） |
| `src/styling/markdown.ts` | +33/-11 | Markdown 样式（自动配对语义 + 反引号扩展） |
| `src/styling/nodes/heading.ts` | +2/-1 | 标题节点样式微调 |
| `src/styling/nodes/indent.ts` | +18 | **首行缩进**节点样式（`editor.firstLineIndent`，G7-EDIT-15） |
| `src/styling/themes/github-dark.ts` | +5/-2 | 主题微调 |
| `src/styling/themes/github-light.ts` | +5/-2 | 主题微调 |
| `test/zoom.test.ts` | +29 | 手势 disposer 回归 |
| `test/lezer.test.ts` | +10/-3 | **测试时序修复（2026-10-01）**：`parseTypes` 原先直接读 `syntaxTree(state)` —— 它是**增量树**，视图刚建好时可能只有 `Document`/`Body`，导致偶发假红（实测 `npm run parity` 的 vendored jest 步骤报 `Received array: ["Document","Body"]`）。改用 `ensureSyntaxTree(state, doc.length)` **强制完成解析**后再遍历（保留 `?? syntaxTree(...)` 兜底） |

### 新增的文件（3，全在 `test/`）

| 文件 | 用途 |
|---|---|
| `test/document-isolation.test.ts` | **spec §12 Release Blocker**「document history crossing tabs」的真断言（`resetEditor` 后 `undoDepth === 0`） |
| `test/allow-magnification.test.ts` | `setAllowMagnification` 开关的双向可重配 |
| `test/codeBlockFence.test.ts` | 代码围栏相关回归 |

> 这 3 个文件**上游没有**；re-vendor 的 `cp -R` 会把它们删掉。

---

## 生成 / 校验清单

改动清单不靠人工维护，靠下面这条命令**现算**（与钉住 commit 的官方源码比对）：

```sh
# 1) 取钉住 commit 的上游源码
curl -sL https://codeload.github.com/MarkEdit-app/MarkEdit/tar.gz/<COMMIT> -o /tmp/markedit.tar.gz
mkdir -p /tmp/markedit-up && tar -xzf /tmp/markedit.tar.gz -C /tmp/markedit-up

# 2) 与仓库内 CoreEditor 比对（排除依赖与构建产物）
UP=/tmp/markedit-up/MarkEdit-<COMMIT>/CoreEditor
diff -rq "$UP" packages/editor-core/CoreEditor \
  --exclude=node_modules --exclude=dist --exclude=.yarn --exclude=yarn.lock --exclude='*.tsbuildinfo'
```

**re-vendor 后必须重跑此命令**：若输出与上表不一致，说明清单已过期（或重放不完整），
**先补齐再提交** —— 静默丢掉 Mellow 改动不会让任何测试变红。
