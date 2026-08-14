# Extension API 架构

对应：PRD §119-121（Extension API / Permissions / Safe Mode）、ADR-0013（最小权限模型）。

## 1. 目的与范围

V1 建立扩展系统的**基础架构**：

- **无 Marketplace**：扩展经程序化 / 本地注册（`register + setup`）；
- **默认最小权限**（PRD §120）：扩展必须显式声明权限，未声明即拒绝（运行时门卫，非类型承诺）；
- **核心 Typora parity 功能全部内建**，第三方扩展只做增值——扩展系统 P0 架构 / P1 产品，不阻塞核心；
- Safe Mode（PRD §121）：`mellow --safe-mode` 禁用 extensions / user CSS / AI / custom process。

## 2. 分层

| 层 | 位置 | 职责 |
|---|---|---|
| 契约 | `packages/extension-api/` | Manifest / 8 类型贡献点 / 9 权限 / 门面 API（零依赖纯类型+纯函数） |
| 运行时 | `packages/app-core/src/extensions/` | ExtensionRegistry：register/list/enable/disable/unload + 贡献点分发 + **运行时权限门卫** |
| 宿主装配 | `apps/desktop/src/extensions/` | desktop 能力适配（fs/clipboard/notification）+ Safe Mode + 命令面板入口 |

依赖方向（遵守 AGENTS.md 包依赖规则）：`app-core → extension-api`，`desktop → app-core + extension-api`；extension-api 零依赖。

## 3. 类型与权限（PRD §119-120）

**8 类型**：`editor / theme / command / imageUploader / exporter / sidebar / renderer / ai`。

**9 权限**：`document.read / document.write / workspace.read / workspace.write / network / clipboard / process / keychain / notification`。

**权限 → 门面 API**：

| 权限 | API | V1 状态 |
|---|---|---|
| document.read | `getText / getSelection / getCursor` | ✅（getSelection 依赖编辑器契约扩展，暂返回 null） |
| document.write | `insertText / replaceSelection` | ✅ |
| workspace.read | `listFiles / readFile` | ✅（代理 FileService） |
| workspace.write | `writeFile / mkdir / delete`（delete=回收站语义，PRD §57） | ✅ |
| network | `fetch` | ⛔ 契约就绪，宿主默认不接线（默认无需联网） |
| clipboard | `readText / writeText` | ✅（navigator.clipboard） |
| process | `exec` | ⛔ 高危权限：V1 一律拒绝（`not-implemented`） |
| keychain | `get / set / delete` | ⛔ 高危权限：V1 一律拒绝（desktop 无实现） |
| notification | `show` | ✅（Web Notification） |

**门卫规则**（`permissions.ts` + `context.ts`）：

1. 每个门面方法**调用时**检查 `hasPermission(manifest.permissions, p)`——未声明 → 抛 `permission-denied`；
2. 高危权限（`process`/`keychain`，`RESTRICTED_PERMISSIONS`）→ 抛 `not-implemented`（V1 无显式授权流程）；
3. `validateManifest`：id（反向域名）/ version（semver）/ type / permissions 白名单。

## 4. 生命周期

```
register(manifest, setup)          # 校验 → 存记录（enabled=false）
enable(id)                         # Safe Mode 检查 → buildExtensionContext（权限门面）→ setup(ctx)
                                   #   setup 成功 → enabled=true，contributions 可聚合
                                   #   setup 抛错 → enabled=false + setupError
disable(id) / unload(id)
setSafeMode(on)                    # PRD §121：Safe Mode 下 enable 拒绝
```

`setup(ctx)` 填充 `ctx.contributions.*`（可变对象）；宿主经 `registry.collect(key)` 按类型聚合已启用扩展的贡献点。

## 5. 8 类型贡献点与宿主接线现状（V1）

| 类型 | 贡献点 | 宿主接线 |
|---|---|---|
| Command | `contributions.commands: CommandContribution[]` | ✅ 命令面板（category=extension），执行时按 manifest 构建受限上下文 |
| Theme | `contributions.theme`（themes 包子集） | 契约就绪（registry 承载），themes 包消费待接 |
| Editor | `contributions.editor`（CM6 Extension，宿主校验） | 契约就绪，注入 editor-engine 待接 |
| Image Uploader | `contributions.imageUploader` | 契约就绪（宿主暂不消费，无副作用） |
| Exporter | `contributions.exporter` | 契约就绪 |
| Sidebar | `contributions.sidebar`（render(container, ctx)） | 契约就绪 |
| Renderer | `contributions.renderer` | 契约就绪 |
| AI | `contributions.ai` | 契约就绪；**默认 Off**（`context.ai === null`，PRD §122） |

## 6. 安全

- 扩展运行在主 webview 上下文 → **权限门卫在运行时**（非类型承诺），每个门面方法独立校验；
- `process`/`keychain`/`network` 三个敏感权限 V1 默认拒绝（与 security-review 的纵深防御一致）；
- Safe Mode 一键禁用全部扩展（PRD §121）；
- V1 无 Marketplace → 无第三方代码供应链面；扩展来源 = 程序化注册（用户/宿主显式安装）。

## 7. 示例

`apps/desktop/src/extensions/examples/hello-command.ts`：

- manifest 声明 `document.read + document.write`（最小权限）；
- setup 填充 `contributions.commands`（一条命令）；
- App.tsx 启动时 register + enable；
- 命令面板出现「扩展：插入问候」，执行 → `document.insertText('Hello from Mellow Extension!')`（经运行时门卫）。

命令面板 `extensions.list` 显示全部已注册扩展（名称 / id / 版本 / 启用状态 / setupError）。

## 8. 迭代计划（V1 后）

1. Editor/Theme 贡献点接入宿主（editor-engine / themes 消费）；
2. `document.getSelection` 完整选区（编辑器契约扩展）；
3. network 宿主代理（用户显式授权 + 超时）；
4. 扩展安装（本地目录扫描 + manifest 校验 + 生命周期持久化）；
5. process/keychain 的显式授权流程；
6. AI 开关（PRD §122）。
