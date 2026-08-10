# CoreEditor（TypeScript Editor Core）

> 位置：`packages/core-editor/CoreEditor/`（vendored，只读）。规模：13,625 行 / 201 文件。

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
│   ├── toc/  link/  task/  table/  completion/  snippets/
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
| Web → 宿主 | `window.nativeModules.*` → `window.webkit.messageHandlers.bridge.postMessage({moduleName, methodName, parameters})` | Promise 语义；宿主应答 `{result | error}` |
| 宿主 → Web | `window.webModules.*`（同上下文 JS 直接调用） | `core.resetEditor/getEditorText/getEditorState/insertText/replaceText` 等 |
| 配置注入 | `"{{EDITOR_CONFIG}}"` / `"{{USER_SETTINGS}}"` 占位符替换 | EditorConfig JSON |

类型契约由 ts-gyb（`src/@codegen/config.json` + mustache 模板）生成 Swift 桥；Mellow 侧的桥类型见 `apps/desktop/src/host/types.ts`。

## 依赖

- 运行时：@codemirror/*（state/view/language/commands/search/autocomplete/lang-markdown/lang-yaml/legacy-modes）+ @lezer/*（markdown/common/highlight/lr/html）
- 内部定制：`src/@vendor/`（lang-markdown/lang-html 分支、joplin markdownMathParser、custom history）
- 类型：markedit-api（GitHub @v0.30.0）
- 构建：vite + vite-plugin-singlefile（单文件 bundle）；browserslist `safari >= 18`（迁移注意点，见 migration.md）

## 平台耦合（已审计）

- 唯一 WebKit 硬依赖：`window.webkit.messageHandlers.bridge`（1 处）
- 其余为标准 Web API（visualViewport/matchMedia/ResizeObserver/MutationObserver）
- Mellow 注入式扩展（`packages/editor-engine`）：marker reveal（Heading/Bold/Italic/Strike/InlineCode），经 `MarkEdit.addExtension` 注入，0 修改 CoreEditor
