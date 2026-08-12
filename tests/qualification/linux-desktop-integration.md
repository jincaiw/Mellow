# Linux Desktop Integration Qualification

> 对应实现：`apps/desktop/src-tauri/Cargo.toml`（tauri-plugin-dialog `xdg-portal`）、
> `tauri.conf.json`（bundle.fileAssociations / bundle.linux.deb / publisher）。
> 平台约束：本清单在真实 Linux（GNOME / KDE / Wayland / X11）上手动执行；
> 自动化无法覆盖桌面环境集成。

## 1. XDG / MIME（安装后）

| 检查项 | 通过标准 | 命令 |
|---|---|---|
| .desktop 安装 | `/usr/share/applications/mellow*.desktop` 存在 | `ls /usr/share/applications \| grep -i mellow` |
| MIME 关联 | desktop 文件含 `MimeType=text/markdown;text/x-markdown;`（由 fileAssociations 生成） | `grep MimeType /usr/share/applications/mellow*.desktop` |
| 默认应用 | Markdown 默认打开方式可选 Mellow | `xdg-mime query default text/markdown` |
| 图标/名称 | `Name=...` / `Icon=...` 正常 | `desktop-file-validate /usr/share/applications/mellow*.desktop` |

## 2. GNOME

- 文件管理器（Files/Nautilus）中 `.md` 文件 → 右键 → Open With 出现 Mellow；
- 设置 → 默认应用 → 文本编辑器可设为 Mellow；
- Wayland 会话下窗口缩放、拖拽文件到 Mellow 打开正常。

## 3. KDE

- Dolphin 中 `.md` 右键 → Open With → Mellow；
- System Settings → Default Applications → Text Editor 可设 Mellow；
- KDE 全局菜单/快捷键无冲突（`Ctrl+T` 保留给 Table，不抢占）。

## 4. Portal（xdg-desktop-portal）

- 启动时桌面环境提供 `xdg-desktop-portal-gnome` / `-kde` 后端；
- 打开/保存/目录对话框为桌面环境原生外观（portal 会话）；
- `dbus-run-session` 下 `GtkFileChooserNative` 行为回退正常（无 portal 时 rfd 降级）。

## 5. File Dialog

- 文件 → 打开…（对话框可多选过滤 `.md`）；
- 保存 / 另存为；
- 打开文件夹（File Tree root）；
- 取消返回 `canceled`，不崩溃。

## 6. Trash（回收站）

- File Tree 右键 → 移到回收站 → 文件出现在桌面环境回收站（GNOME Trash / KDE Trash）；
- 回收站中还原后路径正确（trash crate 遵循 freedesktop trash spec）。

## 7. Open With

- 文件树右键 → 在文件管理器中显示（xdg-open / 文件管理器定位）；
- 图片右键 → 用系统应用打开（`OpenerService.openPath`）；
- 外部 URL 打开（`openUrl`）。

## 8. fcitx5 / ibus 不受影响（回归检查）

> 原则：Mellow 不修改任何 GTK IM context / 输入法配置；Web 层 composition 跟踪
> 独立于系统 IM。以下为回归检查：

- [ ] 启动前设置 `GTK_IM_MODULE=fcitx5`，输入中文：候选窗跟随光标、不抖动、不遮挡；
- [ ] 切换 ibus（`GTK_IM_MODULE=ibus`）重复上述检查；
- [ ] 输入法候选窗出现/消失不改变 caret 位置；
- [ ] 候选窗打开时快捷键（如 `Ctrl+Shift+P` 命令面板）不误触发；
- [ ] 编辑器内连续中文输入 30 字以上，composition 事件正常、Undo 为整句一次；
- [ ] Wayland 与 X11 两种会话各跑一遍。

## 9. 回归基线

- 本机（macOS）验证：`cargo check`（xdg-portal 依赖跨平台编译通过）、`cargo test`；
- Linux 构建需在 Linux CI/机器执行 `tauri build`（deb / AppImage / rpm）后跑本清单；
- 禁止 Linux Editor fork：本清单不涉及任何 editor-core / editor-engine 改动。
