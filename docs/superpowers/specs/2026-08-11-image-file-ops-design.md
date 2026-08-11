# Image File Operations & Asset Management — 设计文档

**日期**：2026-08-11
**状态**：Approved（用户授权 agent 评估并决策，2026-08-11）
**宪法依据**：PRD §53/§54/§56-§58；spec image-workflow §4/§6/§7/§9/§11；spec document-file-safety §8
**计划映射**：T-0205（asset strategy 完成）、T-0405（image batch ops）、T-0508（file op undo 前置）

---

## 1. 目标

实现 Asset 目录体系与图片文件操作，全部操作安全（不破坏原文件、不静默覆盖、可撤销、delete 走回收站）。

## 2. Asset 目录（spec §4 / PRD §53）

支持四种配置：`./assets/`、`./images/`、`./${filename}.assets/`、custom。

- 配置来源（优先级：per-doc > global > 默认 `'assets'`）：
  1. **per-document front matter**：文档顶部 YAML front matter（`---\nasset_dir: images\n---`）——新增纯函数解析器（不依赖完整 YAML 模块，T-0211 落地后替换）
  2. **global 设置**：桌面 shell 下拉选择，localStorage 持久化（Phase 6 Settings 落地前的最小持久化）
  3. 默认 `'assets'`
- 解析产物：`AssetDirConfig`（path.ts 已有 `assets|images|docname|custom` 判别，扩展解析层）

## 3. 引用扫描与 Patch（spec §6/§11）

- `scanImageRefs(text, docDir)`：纯函数，遍历全文提取所有 Image 引用：
  - `{ from, to, src, kind: 'remote'|'local', absolutePath, inAssetDir }`
  - remote = http(s)/data/mailto（data/mailto 不可下载，标记）
- **Patch 原子性**：所有引用替换合并为**单次 CM transaction**（`view.dispatch({ changes })`），编辑器 Undo 一次撤销全部（spec §11 source patch must be undoable）
- 宿主→引擎通道：引擎在 iframe 内注册 `window.__MELLOW_ENGINE_API__ = { applyChanges, refreshImages }`；editor-core `EditorCore.patchChanges(changes)` 转发（**不修改 vendored CoreEditor**，经扩展注册）
- **fs 失败回滚**：执行顺序 = fs ops 全部成功 → 才 patch；任一 fs 失败 → 反向执行已成功的 fs ops，文档零改动

## 4. 文件操作语义（PRD §54 + spec §6/§7）

| 操作 | 语义 | 目标 | 冲突处理 |
|---|---|---|---|
| Move（单图） | fs move + patch 当前引用为相对路径 | 目录选择对话框 | 目标唯一命名（`name-1.ext`） |
| Copy（单图） | fs copy + patch（保留原文件） | 同 Move | 同上 |
| Rename（单图） | fs rename（同目录）+ patch 当前引用 | 新文件名（prompt） | 目标已存在 → 中止报错 |
| Move All | 全部**本地**图片移入 asset 目录 + patch；已在 asset 内跳过；远程跳过并报告 | 文档 asset 目录 | 唯一命名，绝不覆盖 |
| Copy All | 同上但复制保留原文件 | 文档 asset 目录 | 唯一命名 |
| Download Remote | **仅显式命令**（spec §9 无静默下载）；下载到 asset 目录 temp+rename；成功才 patch 为相对路径 | 文档 asset 目录 | 唯一命名 |
| 文档 Rename | 见 §5 | — | 目标已存在 → 中止 |

- 跳过规则：引用无法解析/文件不存在 → 跳过并报告（禁止自动删除 broken 引用，spec §8）
- 报告：`{ moved/copied/downloaded: n, skipped: [{src, reason}], failed: [{src, error}] }`，shell 状态栏展示

## 5. 文档 Rename 联动（spec §6）

1. 用户重命名文档（`note.md` → `renamed.md`）
2. 检测 `note.assets` 目录是否存在
3. 存在 → `showConfirm` 提示"同步重命名资源目录并更新引用？"
   - **确认**：rename 文档 + rename `note.assets` → `renamed.assets` + patch 所有指向旧 asset 目录的引用（单事务）
   - **拒绝**：仅 rename 文档；asset 目录与引用不动（仍指向 `./note.assets/`，路径有效——安全默认）
4. 更新：`setDocumentPath`、外部 watcher 重新监听、undo history 记录
5. 失败回滚：文档 rename 成功但 asset rename 失败 → 回滚文档 rename

## 6. 文件操作安全（document-file-safety §8 + PRD §57/§58）

- **delete → 系统回收站**（`trash` crate：macOS Finder / Windows Recycle Bin / Linux trash spec），永不永久删除（PRD §57）
- **move**：同设备 `fs::rename`（原子）；跨设备 copy→temp→rename→verify→删源（源文件在目标落盘并校验后才删除）
- **唯一命名**：`uniqueName(dir, name)` → `name` / `name-1.ext` / `name-2.ext`…，绝不覆盖已有文件
- **undo（PRD §58）**：`FileOpHistory` 记录反向操作（rename→rename back、move→move back、copy→remove copy、mkdir→rmdir 仅当本次创建）；toast `已移动 note.md [撤销]`
  - trash **不入应用内 undo**：系统回收站即安全网（spec §11 "where safe"；跨平台回收站恢复不可靠，应用内 trash-undo 归 T-0508）

## 7. 组件与分层

```
editor-engine/src/image/    纯逻辑 + 注入（jest 可测，零平台 API）
  scan.ts       引用扫描
  assetConfig.ts  front matter / global 配置解析
  ops.ts        操作计划纯函数（move/copy/rename/moveAll/copyAll/downloadRemote）
  engineApi.ts   __MELLOW_ENGINE_API__ 注册（applyChanges 单事务 / refreshImages）
  widget.ts     + 悬停操作条（经宿主注入 __MELLOW_IMAGE_ACTIONS__ 分发；无 handler 不显示）

editor-core     EditorCore.patchChanges/refreshImages（转发 iframe，不碰 vendored）

app-core        编排（注入 EditorBridge + FileService + DialogService）
  imageFileOps.ts  执行计划：fs 顺序执行 → 单事务 patch → 回滚 → undo 记录 → 报告
  documentRename.ts 文档 rename + asset 联动
  fileOpHistory.ts  undo 栈

host-api        FileService + move/trash/remove/download + 实现 rename/readDir
                DialogService + showDirectory

desktop          Adapter 层（唯一平台代码）
  Rust: move_file（跨设备）/trash/remove_file/read_dir/download_remote/pick_folder
  fileServices.ts 接线；App.tsx（重命名/批量按钮、asset 选择器、toast+撤销、actions 注入）
```

## 8. 依赖新增（Rust）

- `trash = "5"`：跨平台回收站
- `ureq = "2"`：远程图片下载（默认 rustls TLS，超时 15s，follow redirects）

## 9. 测试计划

- **editor-engine**：scan（本地/远程/中文/空格/#/%/位置）、assetConfig（front matter 优先级/缺省/custom）、ops（四种批量+单图计划、唯一命名、跳过规则、远程分类）、engineApi（applyChanges 单事务）
- **app-core**：imageFileOps（执行顺序/失败回滚/patch 单事务/undo 记录/报告）、documentRename（有 assets 确认/拒绝/无 assets/目标冲突回滚）、fileOpHistory（反向执行/空栈）
- **host-api**：mock 新契约
- **Rust**：move 同盘+跨设备 fallback（模拟 EXDEV）、trash、remove、read_dir、download（本地 TcpListener 起临时 HTTP server）
- **desktop**：tsc + bundle 构建通过

## 10. 明确不做（YAGNI）

- Upload All / Upload Selected（P1，spec §7）
- unused image cleanup / image manager（P1）
- trash 应用内 undo（归 T-0508）
- 完整 YAML front matter 模块（T-0211）
- 右键菜单基础设施（Phase 3）

## 11. 实现偏差记录（2026-08-11）

- **i18n 文案未接入**：V0.0 shell 新 UI 文案使用中文字面量（与既有 App.tsx 一致）；i18n 体系归 Phase 6（T-0603/0604）
- **文本输入对话框**：Rename 输入用 `window.prompt`（Tauri 无原生文本输入对话框；V0.0 可接受）；确认对话框用 tauri-plugin-dialog 原生 `confirm`
- **既有缺陷修复**：`build-editor-bundle.mjs` copyEngine 只复制顶层 .js，`dist/image/`、`dist/table/` 子模块从未部署到 public（desktop 运行时引擎子模块 404）——本次改为递归复制，同时修复了此旧缺陷
- **delete 契约保留**：`FileService.delete` 保留（PRD §57 语义 = 回收站），新增 `trash`/`remove` 分工：trash = 用户删除；remove = 内部清理（撤销副本）
