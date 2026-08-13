# Mellow Security Review

- 日期：2026-08-13
- 被测 commit：`20c2dbd`（含未提交工作区改动：largeFile / print / export）
- 范围：HTML / Mermaid / Links / Remote Images / File Access / Tauri capabilities / Clipboard / Custom Commands / Extensions / Keychain / Network + 默认隐私原则（无需联网 / Telemetry Off / AI Off / Upload None）
- 方法：静态代码审查（前端渲染链路 + Rust System Core + Tauri 配置），不包含动态模糊测试

## 结论摘要

| 级别 | 数量 | 摘要 |
|---|---|---|
| 🔴 高 | 2 | Reader 正则净化实体编码绕过（XSS → 任意文件读写）；Reader/SplitPreview 链接点击默认 webview 导航（恶意页面入驻 → invoke 全权限） |
| 🟠 中 | 3 | CSP 缺失（`csp: null`）；远程图片打开文档即隐式加载（默认联网冲突）；invoke 自定义命令面大且无 ACL（纵深防御） |
| 🟡 低 | 3 | `download_remote` 无 scheme/大小限制；recovery 快照明文；capabilities 不约束自定义命令 |
| ✅ 通过 | 8 | 编辑器 safeHtml（DOM 白名单）；smartPaste 净化；Mermaid strict；无遥测；无 AI；无上传；无 keychain 实现；前端零网络 |

**默认隐私原则**：Telemetry Off ✅ / AI Off ✅ / Upload None ✅ / **默认无需联网 ❌**（远程图片打开即加载，见中危 #2）。

---

## 🔴 高危发现

### H1. Reader 原始 HTML 净化可被实体编码绕过 → XSS → 任意文件读写

- **位置**：`packages/app-core/src/reader.ts:55-68`（`sanitizeHtml`，正则净化）
- **问题**：Reader 对文档中的原始 HTML 块使用**正则替换**剥离 `<script>/<style>/on* 属性/javascript:/vbscript:`。正则作用于未解码的原始字符串，而浏览器解析 HTML 时**属性值会实体解码**：
  - 恶意文档：`<a href="java&#115;cript:alert(1)">click</a>`
  - 正则净化后：`java&#115;cript:` 字面不匹配 `javascript:` → **保留**
  - 浏览器点击：href 解码为 `javascript:alert(1)` → **脚本执行（已验证）**
- **放大**：XSS 发生在 webview 上下文，且 `lib.rs` 的 `invoke_handler` 对 webview 暴露**全部 fs 命令**（`read_text` / `write_text` / `copy_file` / `move_file` / `remove_file` / `trash` / `read_dir` / `download_remote` / `search_start` …）。攻击者可读取任意路径文件、写入任意文件、发起内网请求（SSRF）——**等价于任意文件读写 + 内网访问**。
- **对照**：编辑器内 live 渲染（`editor-engine/src/safeHtml.ts:70-101`）用 **DOMParser + 白名单**（`isSafeUrl` 基于 `new URL()` 协议校验，HTML 解析器已实体解码）——**同样输入安全**。两处净化标准不一致。
- **建议（P0）**：`reader.ts` 的 `sanitizeHtml` 改为 DOM 白名单方案（提取 `editor-engine/src/safeHtml.ts` 的 sanitize 为共享实现，或复制同一逻辑到 app-core）；为 sanitize 补充回归测试（实体编码 / data: / 嵌套 / 属性变体）。

### H2. Reader / Split Preview 中点击链接默认在 webview 内导航

- **位置**：`apps/desktop/src/Reader.tsx:192`、`apps/desktop/src/SplitPreview.tsx:73`（`dangerouslySetInnerHTML` 渲染的 `<a href>` 无点击拦截）；`tauri.conf.json` 未配置导航限制
- **问题**：Reader 渲染的合法链接（`http(s)`）点击后 **WKWebView 默认导航**到该页面。导航后页面与 Mellow 同一窗口/上下文，`invoke` 权限仍生效（capabilities 按窗口绑定，不校验 origin）→ **恶意页面在应用 webview 中运行 = 与 H1 同等后果**。
- **建议（P0）**：Reader/SplitPreview 的 `handleClick` 拦截 `<a>` 点击 → `preventDefault()` + `opener.openUrl()`（系统浏览器打开）；并在 Tauri 配置 `app.windows[].url` 之外的导航限制（或前端统一拦截）。

---

## 🟠 中危发现

### M1. CSP 缺失

- **位置**：`apps/desktop/src-tauri/tauri.conf.json:29`（`"csp": null`）
- **问题**：无 Content-Security-Policy。当前无远程内容直接进入编辑器 DOM（均经净化），CSP 是 H1/H2 修复前的**纵深防御**（可显著提高利用难度：`script-src 'self'`、`img-src` 限制等）。
- **建议（P1）**：配置合理 CSP（注意前端无内联脚本/无 eval 可验证后收紧）。

### M2. 远程图片打开文档即隐式加载（与「默认无需联网」冲突）

- **位置**：`packages/editor-engine/src/image/widget.ts:149`（`img.src = this.resolvedUrl`）；`scan.ts`（`isRemoteSrc`）
- **问题**：文档含 `![alt](https://...)` 时，编辑器打开即发起网络请求加载远程图片（IP 泄露、按需加载策略缺失）。与核心原则「默认无需联网」冲突。Rust 侧 `download_remote` 是显式命令（合规），但 **img 标签加载是隐式**。
- **建议（P1）**：默认不加载远程图片（设置项「加载远程图片」默认 Off；或显示占位 + 点击确认加载），与 Typora 行为一致。

### M3. invoke 自定义命令面大 + 文件访问无沙箱（纵深防御）

- **位置**：`apps/desktop/src-tauri/src/lib.rs:38-62`（`generate_handler!` 全量暴露）；`fs.rs`（`read_text`/`write_text` 等任意路径）
- **问题**：V0.0 按「用户显式选择文件」模型设计，无路径沙箱（与 Typora 等同类编辑器一致，可接受）；但 webview 侧攻击（H1/H2）一旦发生，invoke 面无 ACL、路径无限制 → 放大为任意文件读写。Tauri capabilities 的 `default.json` 只约束插件 API，**不约束自定义命令**。
- **建议（P1）**：修复 H1/H2 后此项降为信息级；中长期可将 fs 命令加路径前缀校验（仅允许已打开文档/工作区根目录）或引入命令级权限（ADR-0013 的权限模型）。

---

## 🟡 低危 / 信息

- **L1 `download_remote` 无 scheme/大小限制**：`fs.rs:652`（`ureq::get(url)` 未校验 scheme——非 http/https 会失败，功能安全；无响应大小上限，恶意源可撑爆磁盘。用户显式命令缓解）。建议：显式 scheme 校验 + 大小上限（如 100MB）。
- **L2 recovery 快照明文**：`recovery.rs`（AppData/recovery 目录明文存文档快照）。AppData 默认用户私有（macOS 700），风险低。建议确认目录权限，长期可考虑加密（非必需）。
- **L3 capabilities 不约束自定义命令**：`capabilities/default.json` 权限面窄（core:default + window + dialog + opener ✅），但自定义 `#[tauri::command]` 不受其约束（见 M3）。

---

## ✅ 通过项

| 检查项 | 结论 | 证据 |
|---|---|---|
| 编辑器内 HTML（safeHtml） | ✅ DOM 白名单 + URL 协议校验 + on*/style/srcdoc 剥离 + IFRAME sandbox | `editor-engine/src/safeHtml.ts` |
| 粘贴净化（smartPaste） | ✅ 移除 SCRIPT/STYLE/IFRAME/OBJECT/EMBED/META/LINK/BASE/FORM + 协议校验 | `editor-engine/src/smartPaste.ts:50-70` |
| Mermaid | ✅ `securityLevel: 'strict'` + 错误信息转义 | `editor-engine/src/mermaid.ts:191,210-213` |
| 数学（MathJax） | ✅ 渲染产物为 DOM 节点（`replaceChildren`），无 HTML 注入 | `apps/desktop/src/useAsyncRenderers.ts` |
| GitHub Alerts / YAML 前置元 | ✅ 动态内容经转义渲染 | `githubAlerts.ts` / `yamlFrontMatter.ts` |
| Links（编辑器内） | ✅ CM6 编辑器内点击链接无导航行为 | `editor-core` 无链接处理器 |
| Custom Commands | ✅ Command Registry 为前端内部注册表，Slash 仅触发 UI，无外部输入执行 | `slashCommands.ts` |
| Extensions | ✅ `extension-api` 仅契约骨架（PRD §119-120），V0.0 无扩展运行时，无攻击面；权限模型最小化（editor.read/write、file.read/write、clipboard.read、network） | `extension-api/src/index.ts`（ADR-0013） |
| Keychain | ✅ desktop 无 keychain 实现（host-api 契约 + mock），V0.0 不存任何凭据 | `host-api` |
| Clipboard | ✅ 复制走用户手势（`navigator.clipboard.writeText`），粘贴经 smartPaste 净化 | `Reader.tsx:156` |
| File Access（Rust） | ✅ temp+rename 原子写、编码往返保真（详见 M3 的纵深防御缺口） | `fs.rs` |
| Tauri capabilities | ✅ `default.json` 权限面窄（core:default + window 基础操作 + dialog + opener） | `capabilities/default.json` |
| Telemetry | ✅ 无任何遥测/分析 SDK（无 firebase/sentry/amplitude） | 全仓扫描 |
| AI | ✅ 无 AI 集成（ADR-0018：AI 为可选扩展，未实现） | — |
| Document upload | ✅ 无上传功能 | — |
| 前端网络 | ✅ 前端代码零 `fetch`/WebSocket（唯一网络路径是 Rust `download_remote` + 远程图片 img 加载） | 全仓扫描 |

---

## 风险路径图

```
恶意 Markdown 文档
  ├─ 打开 → Reader 原始 HTML 块 → sanitizeHtml（正则）→ 实体编码绕过（H1）
  │     └─ javascript: XSS → invoke('read_text'/'write_text'/'download_remote') → 任意文件读写 / 内网访问
  ├─ 打开 → 远程图片 → img src 隐式加载（M2）→ IP 泄露 / 第三方追踪
  └─ Reader 点击链接 → webview 导航（H2）→ 恶意页面入驻 → 同上 invoke 全权限
```

## 修复优先级建议

| 优先级 | 项 | 工作量 |
|---|---|---|
| P0 | H1：reader.ts 正则净化 → DOM 白名单 + 回归测试 | S（提取共享 sanitizer） |
| P0 | H2：Reader/SplitPreview 链接拦截 + 系统浏览器打开 | XS |
| P1 | M1：配置 CSP | XS |
| P1 | M2：远程图片默认不加载（设置开关） | S |
| P1 | M3：H1/H2 修复后复核（长期：命令路径校验） | — |
| P2 | L1：download_remote scheme/大小校验 | XS |

> 说明：H1/H2 为真实可利用路径（H1 的实体编码绕过已用模拟输入验证）；其余为纵深防御与默认隐私对齐项。按 AGENTS.md 冲突处理原则，本报告不修改代码，修复建议待确认后实施。
