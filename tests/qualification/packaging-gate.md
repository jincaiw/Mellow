# 三平台 Packaging Gate — 记录

> 对应 PRD §125（Windows MSI/NSIS）/ §126（macOS Signed+Notarized+DMG）/ §127（Linux
> AppImage/deb/rpm）、§81（File Association）。操作手册见 `docs/plans/packaging-release.md`。

## 结论

| 平台 | 产物 | 本机（macOS arm64）验证 | CI（三平台） |
|---|---|---|---|
| Windows | MSI + NSIS EXE | 配置就绪（bundler 目标声明） | ✅ 流水线就绪（未触发） |
| macOS | Signed + Notarized + DMG | ✅ app + DMG 构建 + 内容校验 + 安装烟测 | ✅ 流水线就绪（需 Apple secrets） |
| Linux | AppImage + deb + rpm | 配置就绪 | ✅ 流水线就绪（未触发） |

**版本一致性：0.1.0**（tauri.conf.json / Cargo.toml / package.json / bundle 元数据 四处一致）。

## 本机已验证（macOS）

```sh
cd apps/desktop
TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/mellow.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<password>" \
npx tauri build --debug --bundles app,dmg
bash tests/qualification/run-packaging-smoke.sh
```

产物（debug）：

- `Mellow.app`（CFBundleExecutable = mellow-desktop）
- `Mellow_0.1.0_aarch64.dmg`（校验和 VALID + imageinfo 正常；含 EULA）
- `Mellow.app.tar.gz` + `.sig`（updater 签名产物）

烟测结果（run-packaging-smoke.sh）：

| 检查 | 结果 |
|---|---|
| bundle id / version（com.mellow.editor / 0.1.0） | ✅ |
| 文件关联 CFBundleDocumentTypes（md/markdown, Editor, Default） | ✅ |
| 系统语言 CFBundleLocalizations（zh-Hans / en） | ✅ |
| 图标 icon.icns | ✅ |
| Third Party Notices 随应用分发 | ✅ |
| codesign（ad-hoc；正式签名在 CI） | ✅ |
| clean install → 启动 | ✅ |
| upgrade install（覆盖 .app）→ 启动 | ✅ |
| uninstall（删除 .app） | ✅ |
| DMG 校验和 / imageinfo | ✅ |
| DMG attach（EULA 对话框依赖 GUI 会话） | ⚠️ WARN（环境限制，非产物问题） |

## 配置与元数据清单

| 要求 | 实现 |
|---|---|
| version consistent | `scripts/sync-version.mjs`：tauri.conf.json 为单一事实源 → Cargo.toml/package.json |
| icon | `scripts/generate-icon.mjs`（品牌色 #3563d6 + "M"）→ `tauri icon` 全平台图标集 |
| file association | md/markdown → text/markdown，role Editor，rank Default（三平台由 Tauri 生成） |
| updater metadata | tauri-plugin-updater + `updater:default` capability + pubkey（tauri.conf.json）+ createUpdaterArtifacts + .sig 签名 |
| license | `LICENSE`（MIT）+ `bundle.license` + `bundle.licenseFile`（deb copyright / NSIS / MSI / DMG EULA） |
| third party notices | `THIRD_PARTY_NOTICES.md` → `bundle.resources`（map 形式）→ 应用 Resources |
| locale files | 应用内 i18n（packages/i18n → dist）+ Info.plist CFBundleLocalizations + NSIS 双语 + MSI zh-CN |
| clean install | NSIS currentUser / MSI / DMG 拖入 Applications / deb/rpm/AppImage |
| upgrade install | MSI upgradeCode 固定 / NSIS 覆盖 / .app 覆盖 / rpm -U / apt upgrade |
| uninstall | NSIS 卸载器 / MSI / 删除 .app / dpkg -r / rpm -e |

## 已知事项（非阻塞）

1. **macOS Signed + Notarized 必须在 CI**：本机仅有 Apple Development 证书；正式
   Developer ID 签名 + 公证走 `.github/workflows/release.yml`（`APPLE_*` secrets）。
2. **Windows/Linux 产物必须在对应 runner 构建**：release.yml 已就绪（windows-latest /
   ubuntu-latest），本机无法产出 MSI/NSIS/deb/rpm/AppImage。
3. **tauri 2.11 bundler 已知问题**：`bundle.macOS.infoPlist` 配置键会写坏 Info.plist；
   已规避（只用文件自动合并，见 packaging-release.md）。
4. **DMG EULA**（来自 licenseFile）使自动化 attach 受 GUI 会话限制；正式分发无碍。
5. **updater endpoints 为占位 URL**（updates.mellow.app）——正式上线前替换为真实更新服务器；
   私钥 `~/.tauri/mellow.key` 在 repo 外，CI 需配置 `TAURI_SIGNING_PRIVATE_KEY` secret。
6. Windows 代码签名为可选（提供 `WINDOWS_CERTIFICATE*` secrets 时启用）。

## 后续动作

1. 推 `v0.1.0` 标签触发三平台 CI 打包，验证三平台产物 + 真机安装矩阵。
2. 配置 Apple Developer / updater 服务器 /（可选）Windows 证书 secrets。
3. 真机回填 Windows/Linux clean/upgrade/uninstall 结果到本记录。
