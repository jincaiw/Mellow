# Auto Update Gate — 记录

> 对应 `docs/specs/auto-update-spec.md`、PRD §125-127、ADR-0009（数据安全优先）。

## 结论

| 要求 | 结果 |
|---|---|
| signed update | ✅ 生产签名 + 内嵌公钥校验（updater_safety + 真机 E2E） |
| verify package | ✅ 篡改产物拒绝（测试）；下载后校验通过才可安装（真机 E2E） |
| release channel | ✅ stable（默认）/ beta（`X-Mellow-Channel` 头，真机验证 stable 头） |
| update check | ✅ 启动 4s 后自动检查 + 命令面板「检查更新」 |
| download | ✅ 真机 E2E：点击「立即更新」→ /artifact 下载 |
| restart | ✅ install() + relaunch()（流程接线；真机未点重启以避免安装 mock 载荷） |
| rollback strategy | ✅ 更新前备份 + 健康确认 + launch 计数 + 恢复（单元测试 + 真机备份验证） |
| 不得自动上传用户数据 | ✅ 真机抓包：请求仅含版本/平台/渠道元数据，无文档/用户数据 |

## 自动化测试

```sh
cd apps/desktop/src-tauri
cargo test --lib updater     # 5 项：marker/备份/恢复/计数/提交
cargo test --test updater_safety  # 4 项：fixture 签名 / 篡改拒绝 / 生产 pubkey 合法 / mock 端到端
```

全绿：lib 37 + file_safety_corpus 16 + updater_safety 4 = 57 项 Rust 测试通过；
`npm run build`（tsc + vite）通过。

## 真机 E2E（macOS，mock 更新服务器）

1. 用生产私钥签名 mock 产物；mock 服务器提供 latest.json（v99.0.0）。
2. 以本地 endpoint 构建应用 → 启动 → 服务器收到：

   ```text
   REQ GET /darwin/aarch64/0.1.0  channel=stable  ua=tauri-plugin-updater/2.10.1
   ```
   仅版本/平台/渠道元数据 —— **无任何用户数据**。
3. AX 点击「立即更新」→ 服务器收到 `/artifact` 下载；AppData 生成
   `rollback/backup/mellow-desktop` + `rollback.json{pending:true, previous_version:"0.1.0"}`。
4. UI 到达「下载完成，重启后安装 / 重启并安装」——该状态仅在插件**生产签名校验通过**后到达
   （signed update + verify package 全链路真机验证）。
5. 未点击「重启并安装」（避免把 mock 载荷装进 dev 二进制）；install+relaunch 为插件标准路径。

## 产物清单

- `apps/desktop/src-tauri/src/updater.rs`：rollback 管理器（备份/恢复/健康确认/launch 计数）
- `apps/desktop/src-tauri/tests/updater_safety.rs`：签名/篡改/生产 key/mock 端到端
- `apps/desktop/src/host/updater.ts`：前端更新服务（check/download/install/relaunch/rollback）
- `apps/desktop/src/App.tsx`：启动检查、横幅 UI、回滚提示、命令「检查更新」
- `packages/settings`：updater 设置（channel stable/beta、启动检查）
- `packages/i18n`：zh/en 更新相关文案
- `tests/fixtures/updater/`：TEST-ONLY 密钥与签名夹具
- `docs/specs/auto-update-spec.md`：规范

## 已知限制

- endpoints 为占位 URL（`updates.mellow.app`），上线前替换为真实服务器；
- macOS 自动更新要求签名+公证（CI secrets）；
- deb/rpm 无文件级回滚（包管理器语义）；
- Windows 回滚走 detached helper（未真机验证，需 Windows runner）。
