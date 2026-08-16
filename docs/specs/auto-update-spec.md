# Auto Update Spec（安全自动更新）

> 对应 PRD §125-127（打包发布）、tauri-plugin-updater（signed update 基础设施）、
> ADR-0009（数据安全优先）。实现：Rust `src-tauri/src/updater.rs`（rollback 策略）、
> 前端 `apps/desktop/src/host/updater.ts` + App.tsx 横幅 UI。

## 1. 硬约束

1. **signed update**：所有更新产物必须用 updater 私钥签名（CI `TAURI_SIGNING_PRIVATE_KEY`），
   应用内嵌公钥（`tauri.conf.json → plugins.updater.pubkey`）校验。
2. **verify package**：下载完成后、安装前校验签名（tauri-plugin-updater `download()` 内置
   `verify_signature`，失败即拒绝安装，绝无半更新）。
3. **不得自动上传用户数据**：更新检查/下载**只发送**当前版本号、平台/架构、渠道头
   （`X-Mellow-Channel`）与 User-Agent。**绝不**包含文档内容、文件路径、目录列表或任何
   用户文件；无遥测。服务器除上述元数据外不应收到其他信息（见 §6 审计点）。
4. **release channel**：stable（默认）/ beta，经请求头选择；客户端默认 stable，只对
   stable 自动检查（设置可切换）。
5. **rollback strategy**：更新前备份当前版本；更新重启后健康确认；未健康启动可回滚。

## 2. 流程

```
启动
 ├─ rollback 健康确认（marker pending？）
 │    ├─ 版本未变 → 清理
 │    ├─ launch_count ≥ 2 → 提示回滚（恢复备份 + 重启）
 │    └─ 首次（count=1）→ 15s 健康窗口后 commit（删备份）
 └─ 启动后 4s：check（channel 头）
      ├─ 无更新 → 静默
      └─ 有更新 → 横幅「发现新版本 vX」[稍后 / 立即更新]
           立即更新：rollback_prepare（备份当前版本）
                    → download（Rust 校验签名，进度显示）
                    → 「下载完成，重启安装」→ install + relaunch
```

## 3. signed update / verify package

- 签名：发布流水线 `tauri build`（`createUpdaterArtifacts: true`）用私钥对更新产物
  生成 `.sig`；`latest.json` 携带签名与下载 URL。
- 校验：客户端插件 `download()` 内调用 `verify_signature(bytes, sig, pubkey)`（minisign
  语义，与 `minisign-verify` 同款）。签名不符 → 拒绝安装。
- 测试：`apps/desktop/src-tauri/tests/updater_safety.rs`
  - fixture 签名可校验（test-only 密钥，见 `tests/fixtures/updater/README.md`）；
  - **篡改产物必须拒绝**；
  - 生产 pubkey 必须是合法 minisign 公钥；
  - mock 服务器端到端：check（latest.json）→ download → verify。

## 4. release channel

| 渠道 | 检查头 | 用途 |
|---|---|---|
| stable（默认） | `X-Mellow-Channel: stable` | 正式版自动更新 |
| beta | `X-Mellow-Channel: beta` | 预览版（设置切换；默认不启用） |

服务端按头返回对应渠道的 `latest.json`。客户端**只发送**该头 + 版本元数据。

## 5. rollback strategy（Rust System Core）

| 阶段 | 动作 |
|---|---|
| 更新前 | `update_rollback_prepare`：备份当前应用（macOS 整个 .app / Windows .exe / Linux AppImage）到 `AppData/rollback/backup/`，写 marker `rollback.json{pending:true, launch_count:0}` |
| 更新重启后 | `update_rollback_status` + `update_rollback_note_launch`（计数） |
| 健康确认 | 正常渲染 15s 后 `update_rollback_commit`（删除备份与 marker） |
| 未健康启动 | 下次启动 `launch_count ≥ 2` → 提示 → `update_rollback_restore`（恢复备份 + relaunch；Windows 由 detached helper 代换后重启） |

平台限制：deb/rpm 由包管理器管理，文件级回滚不可行（restore 明确报错，提示重装）。

## 6. 数据安全审计点（无用户数据上传）

1. `check()` 请求体：无。URL 模板只含 `{{target}}/{{arch}}/{{current_version}}`；头只有
   `X-Mellow-Channel` 与 User-Agent。
2. `download()`：按 `latest.json` 的 url 拉取产物，无任何用户数据。
3. 前端/后端无遥测调用；无文档内容进入更新模块。
4. 回归：`updater_safety.rs` 只校验签名，不产生网络外发；应用内更新模块不读取任何
   用户文档（无文件 IO 除自身安装/AppData）。

## 7. 测试与验收

- `cargo test --test updater_safety`（签名/篡改/生产 key/mock 端到端）全绿；
- `cargo test --lib updater`（rollback marker/备份/恢复/计数）全绿；
- `npm run build`（tsc + vite）通过；
- 真机验收（CI/手动）：channel 切换、check → download → install → relaunch、
  模拟新版本崩溃 → 下次启动回滚提示 → 恢复旧版本。

## 8. 已知限制

- endpoints 为占位 URL（`updates.mellow.app`），上线前替换为真实更新服务器；
- macOS 自动更新要求应用已签名+公证（CI secrets）；
- deb/rpm 无文件级回滚（包管理器语义）。
