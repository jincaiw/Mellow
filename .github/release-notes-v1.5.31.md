# Mellow v1.5.31

## 本次发布

**本次含产品行为变更** —— 修的是 **Tauri `invoke` 的实参键名**。

> 一句话：**对未命名文档执行保存时，「另存为」对话框的建议文件名永远是 `untitled.md`**，
> 而不是按 Typora parity 从文档首行/首个标题推导 —— 本次修掉。

---

## 1. 缺陷：一个 snake_case 键，让建议文件名功能**自始至终没有生效过**

`apps/desktop/src/host/fileServices.ts` 的 `save()` 把键写成了 **snake_case**：

```ts
await invoke<TauriSaveResponse>('save_document', {
  path, content, encoding: …, eol: …,
  default_name: options?.suggestedName ?? null,   // ← 键名写错了
  expected: …,
});
```

而 Tauri 的实参键规则是 **`to_lower_camel_case(Rust 形参标识符)`**
（`tauri-macros/src/command/wrapper.rs`：默认 `ArgumentCase::Camel`，`key = key.to_lower_camel_case()`）
⇒ 正确的键是 **`defaultName`**。

**为什么没有报错**：Rust 形参是 `default_name: Option<String>`，
而 Tauri 对缺键的处理是「**目标类型不是 `Option` 才报错**」
（`tauri/src/ipc/command.rs` 原话）⇒ 缺键 ⇒ **静默 `None`**。

**后果**：`fs.rs` 里

```rust
let suggested = default_name
    .filter(|n| !n.trim().is_empty())
    .map(|n| if n.ends_with(".md") { n } else { format!("{n}.md") })
    .unwrap_or_else(|| "untitled.md".to_string());   // ← 永远走这一支
```

⇒ 「另存为」的预填文件名**永远**是 `untitled.md`。
（Rust 注释写明了意图：「C1（第四轮）：建议文件名来自文档首行/首个标题（Typora parity）」——
**该功能从未生效，且没有任何报错**。）

## 2. 修法

前端键 `default_name` → **`defaultName`**（与其余 58 处调用一致），并在该行上方写明
「键名必须 camelCase + 宏源码出处 + 本次事故」以防回归。

**为什么不用 `#[tauri::command(rename_all = "snake_case")]`**：那会与全仓约定相反，
且该命令其余形参都是单词（`path`/`content`/…）⇒ 改前端键是最小且一致的做法。

## 3. 新增护栏判据

并入 `tests/parity/verify-tauri-command-contract.mjs`（护栏总数仍为 22）：

**前端 `invoke(cmd, {…})` 的每个顶层键必须等于 `toArgKey(形参)`**（Tauri 的真实变换），
且**必填形参（非 `Option`）必须被传**；例外表 `ARG_FIELD_EXEMPT`（**刻意为空**）+ 双向。
**canary 21 项**（新增 11 项）。

**注入验证 5/5**：① 把前端键退回 `default_name`（**修前状态**）⇒ 报「没有的实参键」；
② 反向把 Rust 形参改名 ⇒ 同样报；③ 删掉必填键 ⇒ 报「未传必填形参」；
④ 删掉 `Option` 键 ⇒ **仍绿**；⑤ 例外表登记不存在的缺口 ⇒ 报「已不存在」。

## 4. ⚠️ 两个「差点搞错」的记录（已写进判据与文档）

1. **差点误报一处不存在的缺陷**：初版判据用「`snake(jsKey) === 形参名`」比对，
   把 `search_cancel(_search_id)` 判成不匹配。回查宏源码才发现：
   `heck` 的 `to_lower_camel_case` **会丢掉下划线切出的空段** ⇒ `_search_id` → `searchId`，
   与前端**完全一致**。
   ⇒ **跨层字段判据必须复刻框架的真实变换**（读源码那几行），不能自己发明一种「看起来等价」的。
2. **注入验证当场抓到一个空转判据**：给 `defaultName:` 上方加注释后，
   对象解析把「注释行 + 键」当成同一段 ⇒ **该键根本没被提取** ⇒ 判据对该键是空的
   （把键改回 snake_case 竟然不报）。**没有注入验证，这条护栏会带着空洞上线。**

## 5. ⚠️ 证据等级（如实声明）

- **本次修复的证据等级**：**静态、高置信** —— Tauri 宏与 IPC 的源码逐行确认了
  键变换规则（`wrapper.rs:51/505-507`）与缺键行为（`command.rs:110-112`）。
- **未在真机确认**「另存为」对话框此前的预填名确实为 `untitled.md`、也未确认修复后为推导名 ——
  **本环境无法做真机验证**（实测 `screen-timing windows` 返回 `cgWindows: []`（无屏幕录制权限）、
  `osascript` 访问 System Events 报 `-10004`（无辅助功能权限））。
- **macOS 产物未签名未公证** ⇒ 首次打开会遇到 Gatekeeper 警告。
- **`PASS-E = 0/50`、9 项 P0 未闭环依然成立** —— 发布状态的变更**不是**完成度的变更。
