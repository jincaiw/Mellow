# Mellow v1.5.30

## 本次发布

**本次含产品行为变更** —— 补齐 Tauri capability 里**缺失的 4 个窗口写操作权限**。

> 一句话：**窗口标题（文件名 / 脏标记 `●` / 字数）此前不会更新**，
> 窗口尺寸与位置**不会恢复**，菜单「保持窗口在最前端」**点了没反应** —— 本次修掉。

---

## 1. 缺陷：4 个写操作未授权

`apps/desktop/src-tauri/capabilities/default.json` 是一份**手工列举**的权限白名单。
前端实际调用了 16 个 window API，而清单只覆盖了其中一部分：

| 前端调用 | 需要的权限 | 修前 | 后果 |
|---|---|---|---|
| `win.setTitle()`（`App.tsx` ×3：标题栏文件名 / 脏标记 `●` / 字数） | `core:window:allow-set-title` | ❌ 缺 | **窗口标题永不更新** |
| `win.setSize()`（窗口尺寸恢复） | `core:window:allow-set-size` | ❌ 缺 | 尺寸不恢复 |
| `win.setPosition()`（窗口位置恢复） | `core:window:allow-set-position` | ❌ 缺 | 位置不恢复 |
| `win.setAlwaysOnTop()`（菜单「保持窗口在最前端」） | `core:window:allow-set-always-on-top` | ❌ 缺 | 菜单项无效 |

按 Tauri 2 ACL 语义，**未授予 = 运行时拒绝**；而前端普遍写成
`void win?.setTitle(...)`（fire-and-forget）⇒ **静默失败**：无弹窗、无日志，
**测试也看不见**（浏览器 dev 走 mock，不走 ACL）。

**旁证 —— 这份清单是「人工列举且不完整」，不是「刻意最小化」**：
清单**授了** `allow-set-fullscreen` / `allow-minimize` / `allow-maximize` / `allow-close`，
却漏了上面 4 个。而安全评审只按**面**审过（原话「权限面窄 ✅」）——
**「面窄」是关于面的命题，「覆盖了实际调用」是关于覆盖的命题**。

## 2. 修法

```json
"core:window:allow-set-title",
"core:window:allow-set-size",
"core:window:allow-set-position",
"core:window:allow-set-always-on-top",
```

**安全评估（为什么这不等于放宽攻击面）**：

1. **单调安全**：这 4 个权限是**只增**的 —— 若分析有误，加上它们就是**空操作**；
   若分析正确，则修掉 4 个静默失效的功能。**不存在「改了更糟」的路径。**
2. **边际风险 ≈ 0**：它们只作用于**应用自己的窗口**，不碰文件系统 / 网络 / 进程。
   而清单里**早已授权** `allow-close`、`allow-minimize`、`allow-maximize`、
   `allow-set-fullscreen` —— 即便 webview 被攻破（安全评审的 H1/H2，均已修），
   攻击者**本来就能**关闭 / 全屏这个窗口。新增项的边际能力**严格弱于**已授权项。
3. **安全评审的三条中危均未被触及**：CSP（已设）、远程导航（H2，已修）、
   自定义命令无 ACL（M3，设计使然）。

## 3. 护栏

`tests/parity/verify-tauri-capability-contract.mjs`（v1.5.29 引入）的例外表**已清空** ——
该表不是「没有判据」：判据是「**前端用到的每个 window API，其所需权限必须已授予**」
+ 例外表**双向**（一旦授权 / 一旦不再被使用，登记项必须删除）。

**注入验证 4/4**：逐一撤掉这 4 个权限 ⇒ 护栏**直接变红**并指名该权限（不再有任何豁免）。
还原后全绿且文件与快照逐字节一致。

## 4. ⚠️ 证据等级与仍存在的缺口（如实声明）

- **本次修复的证据等级**：**静态、高置信**（Tauri 官方 ACL 文档 + 代码调用点 +
  清单里同类写操作的授权惯例）。
  **未在真机确认**这些调用此前确实被拒、也**未确认修复后行为正确** ——
  本环境**无法做真机验证**：实测 `screen-timing windows` 返回 `cgWindows: []`
  （无屏幕录制权限），`osascript` 访问 System Events 报 **`-10004 权限违例`**（无辅助功能权限）。
- **macOS 产物未签名未公证** ⇒ 首次打开会遇到 Gatekeeper 警告。
- **`PASS-E = 0/50`、9 项 P0 未闭环依然成立**（全部被人工 UX Gate / 真机 / 运行时验证阻塞）
  —— 发布状态的变更**不是**完成度的变更。
