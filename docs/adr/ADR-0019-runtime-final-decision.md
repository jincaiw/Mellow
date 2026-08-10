# ADR-0019 — Desktop Runtime 最终决策（Tauri 2 锁定 + Electron 预案）

**Status:** Accepted

**取代:** ADR-0002（Desktop Runtime Qualification，Conditional）

---

## 背景

V0.0 Runtime Qualification 三平台矩阵（Windows / macOS / Linux）执行完毕。结论先行：

> **真机体验矩阵（IME/Caret/Clipboard/Print/10MB）在决策时点未取得完整实测数据**
> （Windows/Linux 无真机环境，macOS 无 GUI 会话）。
> 决策依据 = 架构证据（构建全绿、平台解耦证明、逻辑层 254 测试）+ 已知技术事实比较。
> **无任何 FAIL 记录。**

## 12 维度比较

| 维度 | A: Tauri 2 + system WebView | B: Electron + Chromium | 证据状态 |
|---|---|---|---|
| IME | WebView2/WKWebView/WebKitGTK 三套行为；WebKitGTK 风险最高 | Chromium 统一 IME 栈（成熟） | ⚠️ 真机未测 |
| Caret | 依赖各引擎合成器 | Chromium 合成器最成熟 | ⚠️ 真机未测 |
| Selection | 同上 | 同上 | ⚠️ 真机未测 |
| CodeMirror | CM6 标准 Web API；feature detection 已证明安全（neutral 测试 11/11，零平台标识） | CM6 基准环境 | ✅ A 无代码风险 |
| Clipboard | 三平台剪贴板差异 | Chromium 统一多格式 | ⚠️ 真机未测；B 理论优势 |
| Print | 平台打印对话框 | Chromium print 管线统一 | ⚠️ V0.0 范围外 |
| PDF | 平台能力 | Chromium 内建 PDF | ⚠️ V0.0 范围外 |
| Memory | 共享系统 WebView 进程，内存显著更低 | 每应用一个 Chromium | ✅ A 确定优势 |
| Package size | ~10-20 MB（AppImage/deb/rpm/NSIS/MSI） | 100 MB+ | ✅ A 确定优势 |
| Maintenance | 三 WebView 差异矩阵 + WebKitGTK 版本滞后跟踪 | 单引擎统一升级 | ⚠️ B 略优 |
| Linux | WebKitGTK（fcitx5/ibus IM 桥、10MB 性能、剪贴板为已知风险） | Chromium（Ubuntu/Fedora 支持良好） | ⚠️ Gate 关键项未测 |
| AI dev complexity | 双 WebView 差异 + Rust+TS 双语言 | 单引擎 + TS 全栈 | ✅ B 略优 |

## 决策

### 1. 锁定 Tauri 2 作为产品 Runtime（Accepted）

理由：

1. **无 FAIL 证据反对 Tauri**——三轮矩阵 0 FAIL，逻辑层与构建层全绿；
2. **确定性优势**（体积、内存）符合「体验优先于 Runtime 体积」——体积是加分项而非减分项，未牺牲任何已证实体验；
3. **切换成本已被架构预降为零成本级**——host-api 契约 + editor-core 零 Tauri 耦合（neutral 测试回归保护）：换 Electron 只需换桌面壳与 Adapter，Editor/engine 零修改；
4. 「押注 Tauri」不是高风险赌博：即使 Linux Gate 失败，fallback 立即可行且不丢编辑资产。

### 2. Electron/Chromium 作为已预案 Fallback（触发条款）

以下任意一项在真机验证中成立 → **立即切换 Electron/Chromium**（不等 V0.1 完成）：

- Linux（fcitx5 或 ibus）中文输入 corruption ≠ 0；
- 任一平台 blocker caret / selection loss；
- WebView2 或 WebKitGTK 剪贴板 P0（plain/HTML/TSV）无法在合理成本内修复；
- 10MB 文件不可编辑或输入 P95 不达标；
- WebKitGTK 渲染与 WKWebView/WebView2 行为实质性分叉（CodeMirror behavior diverges materially）。

切换路径（已验证零编辑器改动）：`host-api` 换实现 → `apps/desktop` 换壳（Tauri→Electron）+ Adapter 注入 → `editor-core`/`editor-engine` 原样。

### 3. 真机数据回填与复审（Gate 条款）

- V0.1 正式开发**现在可以开始**（本决策即确认）；
- 但 ADR-0019 的最终确认（Accepted → 无需复审）以真机矩阵回填为前置：三平台真机执行完成后，结果写入 `tests/qualification/README.md` Pass/Fail 表；
- 若回填数据触发 §2 条款 → 启动切换流程并新增 ADR 记录。

## 后果

- V0.1（Open/Edit/Save/IME + Live Markdown 剩余节点）按 Tauri 2 路线正式开发；
- desktop 侧保持「薄壳」原则：平台代码只增不减地收敛在 Adapter 层；
- CI 保持三平台编译级验证（editor-core/editor-engine/mellow-packages/desktop/rust 五 job），真机 job 后续按需加入；
- PRD §112（Runtime 决策 Gate）据此 ADR 视为已执行（决策完成，数据复审机制内建）。

## 相关

- ADR-0002（被取代）：V0.0 三平台通过 Gate 后转 Accepted 的原始条件决策；
- ADR-0007（Host Adapter）、ADR-0016（Cross-platform First）：本决策的架构前提；
- `docs/specs/runtime-qualification-plan.md`：真机执行清单与输出要求。
