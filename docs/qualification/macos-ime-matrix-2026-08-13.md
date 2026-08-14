# macOS IME Matrix（2026-08-13）

对应：`docs/specs/ime-test-plan.md`（macOS：系统简体拼音 / 五笔）。

## 环境与方法

- 本机：Apple M4 / macOS 26.6.1；**简体拼音（SCIM ITABC）已启用**；**五笔未启用**。
- 输入原语（实测确定）：System Events `keystroke`（CGEvent 合成字母键被 WKWebView 过滤，无法到达编辑器 iframe；SE keystroke 为可行管道）+ `keystroke space`（提交候选 1）+ `keystroke "z" using {command down}`（undo）。
- 验证原语：**保存读回**（Cmd+S → 读文件；WebView 剪贴板复制被手势限制、AX input 值不可读，保存读回为唯一可靠精确读回）。
- 每音节独立空格提交（候选 1 稳定性已校准：ni→你 hao→好 zhong→中 wen→文）。
- 场景级重试 ≤3 次（SE keystroke 偶发不可达）+ 前台锁定。

## 文档类 8 场景（简体拼音）—— 全部 PASS

| 场景 | 输入 | 丢字 | 重复 | Caret 连续 | Undo 完整可撤销 |
|---|---|---|---|---|---|
| paragraph | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| heading（`# `） | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| format（`**bold**`） | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| list（`- item`） | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| table | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| code（```` ``` ````） | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| math（`$x+1$`） | 你好中文 | ✅ | ✅ | ✅ | ✅ |
| link | 你好中文 | ✅ | ✅ | ✅ | ✅ |

> 结果：`tests/benchmark/ime-matrix.mjs`（`node ime-matrix.mjs`）→ 8/8 PASS。
> Undo 语义：CM6 每 composition 事务需 2 次 undo（内容单调递减，无乱码/重复——无 corruption）。

## UI 类 4 场景 —— NOT TESTED（自动化读回不可用，需人工）

| 场景 | 状态 | 阻塞 |
|---|---|---|
| search（侧边栏全局搜索 input） | NOT TESTED | WebView input 文本读回不可用（剪贴板手势限制 / AX input 值不可读） |
| slash（slash 菜单） | NOT TESTED | 同上 + 交互序列复杂 |
| palette（命令面板） | NOT TESTED | 同上 |
| rename（重命名 input） | NOT TESTED | 同上（需文件树右键序列） |

## 五笔 —— NOT TESTED

系统未启用五笔（当前输入源仅 ABC / 简体拼音 / CharacterPalette）。启用路径：系统设置 → 键盘 → 文本输入 → 编辑 → 添加「五笔」，启用后重跑本 Matrix（runner 音节表需按五笔编码重校准）。

## 过程中修复的回归（blocker）

- **回归**：extension-api 集成（0c3e638）将扩展命令 spread + `extensionVersion` 依赖注入 CommandRegistry effect，导致 **Cmd+S / 菜单 dispatch 失效**（保存不写盘）——二分为 extension 提交引入（20c2dbd 正常 / 0c3e638 失败）。
- **修复**（`bd01cee`）：`runExtensionCommand` 提升为组件级 useCallback；扩展命令改为 enable 后经 `__MELLOW_COMMANDS__.register` 增量注册（不重建 effect）；移除 `extensionVersion` 依赖。
- **验证**：Cmd+S 保存 mtime 变化恢复；IME Matrix 8/8 场景基于修复后构建全量通过。

## Gate 结论

- 简体拼音（文档类全部 Markdown node）：**无丢字 / 无重复 / 无 caret blocker / 无 undo corruption**（8 场景 × 4 项断言，重试机制下全部通过）。
- UI 类 input 与五笔：**未覆盖**（工具链限制 + 输入法未启用）→ 完整 Release Gate 需人工在真机执行后回填。
