# Mellow v1.5.29

## 本次发布

**本次含产品行为变更** —— 修的是 **Tauri capability 的窗口绑定**。

> 一句话：**新开出来的窗口此前拿不到任何 IPC 权限**（invoke / listen 全被拒），
> 本次让它与主窗口享有同一套权限。

---

## 1. 缺陷：新窗口不匹配任何 capability ⇒ **对 IPC 层毫无访问权限**

`apps/desktop/src-tauri/capabilities/default.json` 写的是：

```json
"windows": ["main"]
```

而 `apps/desktop/src-tauri/src/window.rs:67`（`new_window`，即 ⌘N / ⇧⌘N / 文件树右键
「在新窗口中打开」）创建的窗口 label 是：

```rust
let label = format!("main-{stamp}");   // ⇒ 形如 main-1728192000000
```

**`main-1728192000000` 不匹配精确模式 `main`**。Tauri 官方文档对 `windows` 字段的原话是：

> 「**If a webview or its window is not matching any capability then it has no access to the
> IPC layer at all.**」
> 「Windows can be added to a capability by exact name (e.g. `main-window`) or
> **glob patterns** like `*` or `admin-*`.」

⇒ **新窗口照样加载 `index.html`、照样启动前端，然后每一次 `invoke` / `listen` 都被拒**。

**受影响的功能**：⌘N（新建窗口空白文档）、⇧⌘N（新建窗口）、文件树右键「在新窗口中打开」、
以及 `Reopen Closed File` 的「新窗口打开」路径 —— **全部落到一个 IPC 全禁的窗口里**。

## 2. 为什么长期没被发现

1. **已有护栏只查「接线」不查「权限」**：`verify-shell-widgets.mjs` 断言 `new_window` 接受
   `path`/`mode`、把路径挂到本窗口 label、前端把 path 传给它 —— **全都成立**。
   缺的是「这个窗口有没有权限用 IPC」。
2. **UX Gate 从未跑过**（`PASS-E = 0/50`，`P0-QA-001` 是 `NOT_TESTED / human-ux-gate-session`）
   ⇒ 多窗口从没有人类验收过。
3. 本项目**已有同型前科**：`master-plan §5.7` 记录过「`AUTO` 把一个完全不可用的功能当作已闭环」
   （浮动工具栏）。

## 3. 修法

```json
"windows": ["main", "main-*"]
```

并同步入库的 `gen/schemas/capabilities.json`。

**安全性说明（为什么这不等于放宽攻击面）**：`main-*` 窗口是**应用自己**用 `new_window` 创建的，
与主窗口**同一 URL、同一 `on_navigation` 白名单、同一关闭保护** ——
本就是「同一个应用窗口」；`main-{stamp}` 这个命名方案正是为了表明它属于 main 家族。
它不是给「不可信内容」的窗口（本应用目前不存在这种窗口）。
**若将来出现应当无权限的窗口**（例如承载远程内容），必须登记进护栏的 `UNPRIVILEGED_WINDOWS`
并写明理由 —— 这样「该不该有权限」会被**显式决定**，而不是静默掉进「无权限」的坑。

## 4. 新增护栏判据

并入 `tests/parity/verify-tauri-capability-contract.mjs`（护栏总数仍为 21）：

**凡 Rust 侧创建的窗口 label，必须被某个 capability 的 `windows` 模式覆盖**（glob 语义）。
- 从 Rust 解析窗口 label：字面量 `"main"`，以及 `format!("main-{stamp}")` → `main-*`；
- capability 缺 `windows` 字段视为「覆盖全部」（避免误报）；
- `UNPRIVILEGED_WINDOWS` 例外表**双向**；扫描面下限（窗口创建点 ≥ 2）；canary 11 项。

**注入验证 4/4**：① capability 退回 `["main"]`（**修前状态**）⇒ 报「`main-*` 无覆盖」；
② 移除 `windows` 字段 ⇒ 仍绿（不误报）；③ Rust 把 label 改成 `panel-{stamp}` ⇒ 报「`panel-*` 无覆盖」；
④ `windows` 变成过宽的 `["*"]` ⇒ 仍绿（不误报）。还原后全绿且文件与快照逐字节一致。

> ① 是关键证据：它证明**这条护栏确实能抓到修前的缺陷**。

## 5. ⚠️ 证据等级与仍存在的缺口（如实声明）

- **本次修复的证据等级**：**静态、高置信**（Tauri 官方文档明示「不匹配即无 IPC 访问」+
  代码中的 label 构造 + 修复前的 capability 内容）。
  **未在真机确认**新窗口此前确实不可用，也**未确认修复后可用** ——
  本环境无法运行 Tauri 应用、无法做真机 UX Gate。
- **同一文件里另有一处已知缺口，本次未改**（见审计 §4.97）：
  `core:window:allow-set-title` / `allow-set-size` / `allow-set-position` /
  `allow-set-always-on-top` **四个写操作未授权** ⇒
  窗口标题（脏标记 `●` / 字数）不更新、窗口尺寸与位置不恢复、菜单「保持窗口在最前端」无效。
  放宽 capability 安全面属**策略决定**，已登记进护栏例外表并标注「待裁决」。
- **macOS 产物未签名未公证** ⇒ 首次打开会遇到 Gatekeeper 警告。
- **`PASS-E = 0/50`、9 项 P0 未闭环依然成立** —— 发布状态的变更**不是**完成度的变更。
