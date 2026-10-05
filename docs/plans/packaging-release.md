# Mellow 打包与发布手册（三平台正式 Packaging）

对应 PRD §125（Windows）/ §126（macOS）/ §127（Linux）、§81（File Association）。

> **状态说明（2026-10-06 复核）**：本文件是 **P3 手册**（怎么做），**不是状态真值源**。
> 发布**状态**（当前是 pre-release 还是正式发布、`releases/latest` 指向谁）以
> **ADR-0031** 与 `.github/workflows/release.yml` 为准；**版本号**以
> `apps/desktop/src-tauri/tauri.conf.json` 为准。
> ⚠️ **本文件不得再写死版本号**（原文曾写「当前版本 0.1.0」，而实际已到 1.5.x —— 见审计 §4.88）。

## 1. 版本一致性

单一事实源：`apps/desktop/src-tauri/tauri.conf.json` 的 `version`。

同步到 `package.json` 与 `src-tauri/Cargo.toml`：

```sh
cd apps/desktop
node scripts/sync-version.mjs
```

⚠️ **升版是 4 处，不是 3 处**：`sync-version.mjs` 只同步
`tauri.conf.json` / `package.json` / `Cargo.toml` —— **`src-tauri/Cargo.lock` 需要自己改**
（`mellow-desktop` 的 `version` 字段）。改完用 `cargo check --locked` 验证。
漏改 `Cargo.lock` 会让 `--locked` 构建失败（或产物版本元数据不一致）。

发布新版本：改 `tauri.conf.json` → 跑 sync → **手改 `Cargo.lock`** → `cargo check --locked` → 按 §9 顺序发版。

## 2. 产物矩阵

| 平台 | 产物 | 打包目标 | 生成环境 |
|---|---|---|---|
| Windows | MSI（WiX）、NSIS EXE | `msi, nsis` | windows-latest（CI） |
| macOS | .app + DMG（**有 Apple 凭据时**签名 + 公证；**当前无凭据 ⇒ 未签名、未公证**） | `app, dmg` | macos-latest（CI，需 Apple 凭据） |
| Linux | AppImage、deb、rpm | `appimage, deb, rpm` | ubuntu-latest（CI） |

## 3. 构建方式

### 3.1 CI（正式发布，推荐）

```sh
# 推送标签触发（自动建 Release；finalize 在**断言三平台制品齐全**后**自动发布**为正式发布，ADR-0031）：
git tag v<版本> && git push origin v<版本>
# 或手动触发：GitHub Actions → Release Packaging → Run workflow
```

> **2026-10-05 更正**：原文写「自动建 **Draft** Release」—— 那是 finalize 只标 `prerelease` 时代的描述。
> 自 **ADR-0031** 起，finalize 会 `prerelease=false` + `make_latest=true` + `draft=false` **一步发布到位**；
> 制品断言不通过则**保持 Draft**（失败安全）。**不再需要人工 `gh release edit --draft=false`。**

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
- endpoints：`https://github.com/jincaiw/Mellow/releases/latest/download/latest.json`
  （GitHub Releases 静态 JSON，插件按 `platforms` 键匹配目标；v1.5.2 起，替换占位域名 updates.mellow.app）。
- **发布更新 = 发一个 Release**：`latest.json` + `.sig` + 安装包由 **release 流水线自动产出并挂到该 Release**，
  endpoints 指向的正是「最新 Release 的 latest.json」。
  ⚠️ **不需要、也不存在另一台更新服务器**（原文写「发布到 endpoints 指向的服务器」会让人去找一台不存在的机器 —— 审计 §4.88）。

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

> ⚠️ **顺序不能颠倒**（2026-10-06 复核修正）：
> ① 升版 4 处 → ② `npm run parity` → ③ **先推 `main` 等 CI 全绿** → ④ 再推 `v<版本>` 标签（**标签才触发 Release**）。

1. 改 `tauri.conf.json` 的 `version` → `node scripts/sync-version.mjs` → **手改 `src-tauri/Cargo.lock`**
   → `cargo check --locked`（**4 处**，见 §1）；
2. `npm run parity` 全绿（含 19 个护栏 + vendored CoreEditor 的 lint/jest）；
   - ⚠️ **不要用 `npm run build` 作为「渲染层构建」的验证**：`apps/desktop` 的 `build`
     script 只做 `build-editor-bundle + tsc + vite`，**不构建各包 `dist`** ⇒
     会把**旧引擎**打进包（真实事故：`inputLatency.ts` 6 天未进产物，且**无任何报错**）。
     本地要重建渲染层链，走 **`bash apps/desktop/scripts/build-local.sh`**；
     CI / `release.yml` 都已先跑各包构建，**只有本地临时路径会漏**；
   - Rust 侧：`cargo test --lib --test file_safety_corpus` 全绿；
3. **先推 `main` 等 CI 全绿**（`gh run watch <id> --exit-status`），**再**推 `v*` 标签 → 触发三平台打包；
4. 检查产物：MSI/NSIS/EXE、DMG（公证状态 `spctl`）、AppImage/deb/rpm；
5. 每平台真机验证 clean / upgrade / uninstall + 文件关联 + 版本显示；
6. **发布更新**：无需额外动作 —— `finalize` 会把 `latest.json` + `.sig` + 安装包一并挂到该 Release
   （endpoints 指向的就是「最新 Release 的 latest.json」，见 §5）；
7. **无需人工发布**：`finalize` 在**断言 7 个关键制品齐全 + 总数 ≥ 15** 通过后
   `draft=false` + `prerelease=false` + `make_latest=true` **一步到位**（ADR-0031）。
   ⚠️ 原文写「Draft Release 审核后发布」——**那是旧流程**，且与本文件 §3.1 的 2026-10-05 更正**自相矛盾**（审计 §4.88）。
   若 `finalize` 停在 Draft，说明**构建真的不齐**，先查制品，**不要**手工改 draft 状态掩盖它。

> **如实声明（每次发版都要对外说明）**：**macOS 产物未签名未公证**（无 Apple 凭据）⇒
> 首开遇 Gatekeeper 警告；且 **`PASS-E = 0/50`、未闭环 9 项**（全部阻塞于人工 UX Gate / 真机证据）
> —— **发布状态的变更 ≠ 完成度的变更**。
