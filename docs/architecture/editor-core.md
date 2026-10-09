# CoreEditor（TypeScript Editor Core）

> 位置：`packages/editor-core/CoreEditor/`（vendored）。规模：**以 `packages/editor-core/upstream-manifest.json` 为真值源 —— 199 个文件**（上游树，钉住 commit `81da2a20`）。
>
> **⚠️ 2026-10-06 更正**：本行原写「（vendored，**只读**）。规模：**13,625 行 / 201 文件**」——
> ① 「**只读**」**不成立**：本仓**确实修改了** vendored 树（见下「与上游的差异」）；
> ② 「201 文件」与真值源（**199**）不符；③ 「13,625 行」全仓无出处、口径未声明。

## 模块地图

```
src/
├── core.ts              # resetEditor：EditorView 创建、selection/scroll 恢复、状态通知
├── extensions.ts        # 扩展装配：keymap/history/search/styling/input 全管线
├── config.ts            # EditorConfig 契约（window.config 注入目标）
├── languages.ts         # 代码语言注册（CM language registry）
├── modules/
│   ├── commands/        # 格式化命令（toggle bold/heading/block 等）
│   ├── input/           # 输入拦截、word tokenizer、transaction filter
│   ├── selection/       # 选区管理（多光标、normalize、导航）
│   ├── history/         # undo 分组（@vendor custom history）
│   ├── search/          # 搜索（当前文件 find/replace）
│   ├── toc/  link/  completion/  snippets/
│   ├── frontMatter/  lineEndings/  indentation/  lines/
│   └── events/          # composition 事件、clickable link/task、滚动通知
├── styling/
│   ├── matchers/lezer.ts  # Decoration 构建（mark/widget/line/block）
│   ├── nodes/*.ts         # heading/code/def/frontMatter/gutter/indent/
│   │                      # invisible/line/link/selection/table/task
│   └── themes/            # 16 个主题（github-light 等）
├── api/                 # MarkEdit 全局对象 + extension API（addExtension 等）
└── bridge/
    ├── native/          # Web→宿主通知（core/completion/preview/tokenizer/api/...）
    └── web/             # 宿主→Web 调用（core/config/history/selection/format/search/toc/...）
```

## 桥接契约

| 方向 | 机制 | 契约 |
|---|---|---|
| Web → 宿主 | `window.nativeModules.*` → `window.webkit.messageHandlers.bridge.postMessage({moduleName, methodName, parameters})` | Promise 语义；宿主应答 `{result \| error}` |
| 宿主 → Web | `window.webModules.*`（同上下文 JS 直接调用） | `core.resetEditor/getEditorText/getEditorState/insertText/replaceText` 等 |
| 配置注入 | `"{{EDITOR_CONFIG}}"` / `"{{USER_SETTINGS}}"` 占位符替换 | EditorConfig JSON |

类型契约由 ts-gyb（`src/@codegen/config.json` + mustache 模板）生成 Swift 桥；Mellow 侧的桥类型见 `packages/host-api/src/` 与 `apps/desktop/src/host/fileServices.ts`。

> **⚠️ 2026-10-06 更正**：原文写「Mellow 侧的桥类型见 `apps/desktop/src/host/types.ts`」——
> **该文件不存在**。宿主 Adapter 层（`apps/desktop/src/host/`）实际是 **12 个按服务拆分的文件**
> （`fileServices.ts` / `dialogs.ts` / `windowService.ts` / `watcherAdapter.ts` / `searchServices.ts` /
> `spellcheck.ts` / `updater.ts` / `uploadService.ts` / `userThemes.ts` / `openers.ts` /
> `recoveryStorage.ts` / `browserMockHost.ts`），**契约类型在 `packages/host-api/src/`**（纯类型包，PRD §116）。

## 依赖

- 运行时：@codemirror/*（state/view/language/commands/search/autocomplete/lang-markdown/lang-yaml/legacy-modes）+ @lezer/*（markdown/common/highlight/lr/html）
- 内部定制：`src/@vendor/`（lang-markdown/lang-html 分支、joplin markdownMathParser、custom history）
- 类型：markedit-api（GitHub @v0.30.0）
- 构建：vite + vite-plugin-singlefile（单文件 bundle）；browserslist `safari >= 18`（迁移注意点，见 migration.md）

## 平台耦合（已审计）

- 唯一 WebKit 硬依赖：`window.webkit.messageHandlers.bridge`（1 处）
- 其余为标准 Web API（visualViewport/matchMedia/ResizeObserver/MutationObserver）
- Mellow 注入式扩展（`packages/editor-engine`）：marker reveal（Heading/Bold/Italic/Strike/InlineCode），经 `MarkEdit.addExtension` 注入，0 修改 CoreEditor

## 与上游的差异（**⚠️ 2026-10-06 更正：上一行的「0 修改 CoreEditor」不成立**）

`packages/editor-core/UPSTREAM.md` 记录 vendored 树相对上游 `81da2a20` 的改动：
**修改 19 个文件 + 新增 3 个文件**（新增全在 `test/`），并由 `verify-upstream-manifest.mjs`
以「钉住 commit 的上游树哈希」**离线校验**（含 5 项逻辑 canary）。

改动集中在**桥与配置**（`packages/editor-core/CoreEditor/src/bridge/web/config.ts` / `packages/editor-core/CoreEditor/src/config.ts` / `packages/editor-core/CoreEditor/src/extensions.ts` 等），
目的正是给 Mellow 的注入式扩展留出通道。⇒ **准确表述是「注入式扩展不 fork CoreEditor」**，
而不是「0 修改」：**注入是主路径，但 vendored 树确实被改过，且这些改动被记录并受校验。**

> **教训**：把「我们尽量不改」写成「**0 修改**」，会让读者以为该目录是**原样上游** ——
> 而它与上游有 22 处差异，且**其中任何一处丢失都会被 `verify-upstream-manifest` 抓到**。
> 措辞的强度必须与事实一致（同 §4.56「门禁声称满足 vs 实际未闭环」）。
