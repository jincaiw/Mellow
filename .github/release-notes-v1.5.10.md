# Mellow v1.5.10

## 本次发布

- G7-EDIT-08：图片右键支持「在浏览器中打开图片」，远程 URL 与本地路径分别走安全的 OpenerService。
- G7-EDIT-08：支持「刷新所有数学公式」，通过无文本变更 transaction 触发数学组件重建，不影响 Markdown、Undo 或 Source Fidelity。
- G7-EDIT-08：任务列表右键支持 Task Status（标记为已完成 / 未完成），只修改 checkbox marker 的单个字符。
- G7-EDIT-08：右键菜单补齐 Block Styles、Inline Styles、List Styles / Remove Block 分组，复用既有命令。
- G7-FEAT-08：完整支持 `typora-root-url` 的读取、写入与 HTML 导出图片内联。
- G7-MENU-14：清除最近项增加文档、历史文件夹/文件、历史与固定项的作用域选择。
- G7-EDIT-10：应用内确认/输入对话框完成迁移，桌面 UI 不再使用 `window.confirm` / `window.prompt`。
- 偏好矩阵完成 84 项三层审计：存在性、默认值、实际行为，`unverified=0`。

## 验证

- `npm run parity`：通过。
- editor-engine、app-core、desktop TypeScript 检查：通过。
- 相关 Jest 测试：通过。
- GitHub Actions CI：以 main 分支提交结果为准。

## 发布范围说明

本版本作为 **pre-release** 发布：Release Gate 仍有依赖真实 Windows/Linux 设备或额外 host-api 能力的项目，尚未满足 PASS-E 稳定版结论。macOS 本机与 CI 可执行门禁已通过；真实设备闭环完成后再转为稳定版 Latest。
