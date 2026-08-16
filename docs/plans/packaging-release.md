# Mellow 打包与发布手册（三平台正式 Packaging）

对应 PRD §125（Windows）/ §126（macOS）/ §127（Linux）、§81（File Association）。

## 1. 版本一致性

单一事实源：`apps/desktop/src-tauri/tauri.conf.json` 的 `version`。

同步到 `package.json` 与 `src-tauri/Cargo.toml`：

```sh
cd apps/desktop
node scripts/sync-version.mjs
```

当前版本：**0.1.0**（三处一致）。发布新版本：改 `tauri.conf.json` → 跑 sync → 打 tag。

## 2. 产物矩阵

| 平台 | 产物 | 打包目标 | 生成环境 |
|---|---|---|---|
| Windows | MSI（WiX）、NSIS EXE | `msi, nsis` | windows-latest（CI） |
| macOS | .app + DMG（Signed + Notarized） | `app, dmg` | macos-latest（CI，需 Apple 凭据） |
| Linux | AppImage、deb、rpm | `appimage, deb, rpm` | ubuntu-latest（CI） |

## 3. 构建方式

### 3.1 CI（正式发布，推荐）

```sh
# 推送标签触发（自动建 Draft Release）：
git tag v0.1.0 && git push origin v0.1.0
# 或手动触发：GitHub Actions → Release Packaging → Run workflow
```

见 `.github/workflows/release.yml`。

### 3.2 本地 macOS 验证构建（本机可用）

```sh
cd apps/desktop
TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/mellow.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<key-password>" \
npx tauri build --debug --bundles app,dmg
```

> 本机只有 Apple Development 证书（无 Developer ID）→ 产物为 ad-hoc/未公证；
> 正式 Signed + Notarized 必须在 CI（配置 `APPLE_*` secrets）完成。

## 4. 签名与公证（macOS）

CI 需要以下 secrets（tauri-action 自动导入证书、签名、公证）：

| Secret | 说明 |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application 证书（base64 的 .p12） |
| `APPLE_CERTIFICATE_PASSWORD` | 证书密码 |
| `APPLE_SIGNING_IDENTITY` | 签名身份，如 `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | notarytool 凭据 |

公证配置（tauri.conf.json）：`hardenedRuntime: true` + `entitlements.plist`
（WKWebView JIT 所需三项 entitlement）。

## 5. Updater（自动更新元数据）

- 插件：`tauri-plugin-updater`（已注册 + `updater:default` capability）。
- 签名密钥对：`npx tauri signer generate -w <path>`（私钥**禁止入库**）。
  - 公钥已写入 `tauri.conf.json → plugins.updater.pubkey`。
  - 私钥内容 → CI secret `TAURI_SIGNING_PRIVATE_KEY`；
    密码 → `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
  - 本机开发密钥位于 `~/.tauri/mellow.key`（repo 外）。
- `createUpdaterArtifacts: true`：构建产物附带 `.sig` 与 `latest.json`。
- endpoints：`https://updates.mellow.app/{{target}}/{{arch}}/{{current_version}}`
  —— 正式上线前必须替换为真实更新服务器地址。
- 发布更新：把新版本的 `latest.json` + `.sig` + 安装包发布到 endpoints 指向的服务器。

## 6. License / Third Party Notices / Locale

| 项 | 位置 | 打包落点 |
|---|---|---|
| License | `LICENSE`（MIT） | `bundle.licenseFile` → deb copyright / NSIS 许可页 / MSI / DMG EULA |
| SPDX 标识 | `bundle.license: "MIT"` | deb/rpm 元数据 |
| Third Party Notices | `THIRD_PARTY_NOTICES.md` | `bundle.resources`（map 形式）→ 应用 Resources |
| Locale | `packages/i18n`（构建进前端） | 应用内 i18n |
| macOS 系统语言 | `src-tauri/Info.plist`（自动合并） | Info.plist → CFBundleLocalizations（zh-Hans/en） |
| NSIS 安装器语言 | `languages: [SimpChinese, English]` | 安装器多语言 |
| WiX/MSI 语言 | `language: zh-CN` | MSI |

> ⚠️ Tauri 2.11 bundler 已知问题：`bundle.macOS.infoPlist` **配置键**与 fileAssociations
> 同时使用时会把 Info.plist 写坏（内容变成 fileAssociations 的 JSON）。规避：
> 只放 `src-tauri/Info.plist` 文件、**不要**配置 `infoPlist` 键（tauri 会自动合并该文件）。
> 另：`licenseFile` 会使 DMG 内嵌 EULA（attach 需接受许可，自动化 attach 受 GUI 会话限制）。

## 7. 文件关联

`bundle.fileAssociations`：`md` / `markdown` → `text/markdown`，Role `Editor`。

- macOS：Info.plist `CFBundleDocumentTypes`（自动生成）；
- Windows：注册表关联（安装器写入）；
- Linux：desktop 文件 MimeType（deb/rpm/AppImage）。
- 安装器**只提供**「设为 Markdown 默认应用」能力，不强制篡改关联（PRD §81）。

## 8. 安装 / 升级 / 卸载验证矩阵

| 平台 | clean install | upgrade install | uninstall |
|---|---|---|---|
| Windows MSI | msiexec /i | msiexec 升级（upgradeCode 固定） | msiexec /x |
| Windows NSIS | 双击 EXE（currentUser） | 覆盖安装 | 控制面板/卸载程序 |
| macOS DMG | 拖入 Applications | 覆盖 .app | 删除 .app |
| Linux deb | apt install ./x.deb | apt install 新版本 | apt remove |
| Linux rpm | rpm -i | rpm -U | rpm -e |
| Linux AppImage | 赋可执行直接运行 | 替换文件 | 删除文件 |

验证脚本：`tests/qualification/run-packaging-smoke.sh`（macOS 本机可执行；
Windows/Linux 在 CI 对应 runner 或真机执行）。

## 9. 发布清单（Release Checklist）

1. `node scripts/sync-version.mjs` → 三处版本一致；
2. `npm run build` + `cargo test --lib --test file_safety_corpus` 全绿；
3. 推 `v*` 标签 → CI 三平台打包；
4. 检查产物：MSI/NSIS/EXE、DMG（公证状态 `spctl`）、AppImage/deb/rpm；
5. 每平台真机验证 clean / upgrade / uninstall + 文件关联 + 版本显示；
6. 更新 `latest.json` 到更新服务器（若有自动更新需求）；
7. Draft Release 审核后发布。
