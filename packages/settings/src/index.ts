/**
 * Settings schema（One Settings Model，PRD §531；T-0605 Settings）。
 *
 * - 共享 schema：desktop UI 与 extension 共用同一份设置定义；
 * - live apply where safe：requiresRestart 默认 false，App 层负责 apply（命令或宿主 handler）；
 * - searchable P1：schema 已含 labelKey（可检索），UI 搜索 P1；
 * - AI 页面：**不提供**（2026-09-30 审计移除）。此前 SettingsPanel 会在 aiEnabled 时追加
 *   一个「AI」分类，其唯一控件 `ai.panel` 既无消费者（applyCommand 无对应 case）
 *   又持久化 `mellow.ai.panel` —— 与 PRD §122「无任何持久化 AI 状态」相悖，且是个
 *   点了没反应的开关。AI 相关入口现由 `extensions` 分类的 action 承载（storageKey 为空）。
 *
 * 平台约束：纯数据 + 纯函数（localStorage 读写），零 OS 依赖。
 */

export type SettingsSectionId = 'general' | 'editor' | 'markdown' | 'files' | 'image' | 'appearance' | 'export' | 'shortcuts' | 'extensions' | 'advanced';

export type SettingType = 'toggle' | 'select' | 'number' | 'text' | 'action';

export interface SettingOption {
  value: string;
  labelKey: string;
}

export interface SettingDefinition {
  /** 唯一 id，如 'editor.fontSize' */
  id: string;
  /** i18n label key（settings.*） */
  labelKey: string;
  type: SettingType;
  /** localStorage key（无则该项不持久化，如 action） */
  storageKey: string;
  defaultValue: string | number | boolean;
  options?: SettingOption[];
  min?: number;
  max?: number;
  step?: number;
  /** live apply：App 侧执行的命令 id（统一 Command Registry）或宿主 handler 名 */
  applyCommand?: string;
  /** 说明文案 i18n key（可选） */
  descriptionKey?: string;
  /** 默认 false = live apply（不要求重启） */
  requiresRestart?: boolean;
}

export interface SettingsSection {
  id: SettingsSectionId;
  labelKey: string;
  settings: SettingDefinition[];
}

/**
 * 排版默认值**单一真源**（V7-W2.2，修复 G7-SHELL-03）。
 *
 * 历史缺陷：同一组默认值散落三处且互相矛盾 ——
 *   fontSize     settings 16 / iframe 初始 17（CoreEditor 上游值）❌
 *   lineHeight   settings 1.6 / App 回落 1.65 / Reader CSS 回落 1.65 ❌
 *   writingWidth settings '860' / App 回落 820 / Reader CSS 820px ❌
 * 现以本常量为唯一声明处；`SETTINGS_SECTIONS` 的 defaultValue、App 启动/apply 回落、
 * Reader CSS 变量回落值全部引用此处，禁止再各自硬编码。
 * 数值依据：Typora 真机 html font-size = 16px（见 archive/typora-parity-v5-truth-table.md）。
 *
 * 注意：必须声明在 `SETTINGS_SECTIONS` **之前** —— 该表在模块顶层求值，`const` 无提升。
 */
export const TYPOGRAPHY_DEFAULTS = {
  /** 正文字号（px）；100% 缩放基准。 */
  fontSize: 16,
  /** 正文行高（无单位倍率）。 */
  lineHeight: 1.6,
  /** 写作限宽（px；'auto' 语义为通栏，由设置项表达）。 */
  writingWidth: 860,
} as const;

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    labelKey: 'settings.general',
    settings: [
      { id: 'general.reopenLast', labelKey: 'settings.general.reopenLast', type: 'toggle', storageKey: 'mellow.general.reopenLast', defaultValue: true, applyCommand: 'settings.reopenLast' },
      { id: 'general.language', labelKey: 'settings.general.language', type: 'select', storageKey: 'mellow.locale', defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', labelKey: 'settings.language.zh' },
          { value: 'en-US', labelKey: 'settings.language.en' },
          { value: 'system', labelKey: 'settings.language.system' },
        ], applyCommand: 'locale.set.system' },
      // P2-2.6 updater 归位：独立 updater 一级分类不符合 Typora 一级导航合同，
      // 条目并入「通用」（Typora 自动更新位于偏好设置首页区域）。
      { id: 'general.updater.channel', labelKey: 'settings.updater.channel', type: 'select', storageKey: 'mellow.updater.channel', defaultValue: 'stable',
        options: [
          { value: 'stable', labelKey: 'settings.updater.channel.stable' },
          { value: 'beta', labelKey: 'settings.updater.channel.beta' },
        ], descriptionKey: 'settings.updater.channelDesc' },
      { id: 'general.updater.checkOnStartup', labelKey: 'settings.updater.checkOnStartup', type: 'toggle', storageKey: 'mellow.updater.checkOnStartup', defaultValue: true },
      // V5.1 对齐 anySSH autoUpdate：开启后检查到新版本静默下载安装并重启
      //（安装前仍走 rollback 备份 + 签名校验；dev/便携构建由前端守卫拦截）
      { id: 'general.updater.autoInstall', labelKey: 'settings.updater.autoInstall', type: 'toggle', storageKey: 'mellow.updater.autoInstall', defaultValue: false, descriptionKey: 'settings.updater.autoInstallDesc' },
      { id: 'general.updater.checkNow', labelKey: 'settings.updater.checkNow', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.updater.checkNowDesc', applyCommand: 'updater.check' },
    ],
  },
  {
    id: 'editor',
    labelKey: 'settings.editor',
    settings: [
      { id: 'editor.fontSize', labelKey: 'settings.editor.fontSize', type: 'number', storageKey: 'mellow.editor.fontSize', defaultValue: TYPOGRAPHY_DEFAULTS.fontSize, min: 10, max: 32, step: 1, applyCommand: 'settings.editorConfig', descriptionKey: 'settings.editor.fontSizeDesc' },
      // B3-1 字体族（Typora parity：偏好设置选 font family；CoreEditor setFontFace live apply）
      { id: 'editor.fontFamily', labelKey: 'settings.editor.fontFamily', type: 'select', storageKey: 'mellow.editor.fontFamily', defaultValue: 'system-ui',
        options: [
          { value: 'system-ui', labelKey: 'settings.fontFamily.system' },
          { value: 'PingFang SC', labelKey: 'settings.fontFamily.pingfang' },
          { value: 'Hiragino Sans GB', labelKey: 'settings.fontFamily.hiragino' },
          { value: 'Microsoft YaHei', labelKey: 'settings.fontFamily.yahei' },
          { value: 'Songti SC', labelKey: 'settings.fontFamily.songti' },
          { value: 'ui-monospace', labelKey: 'settings.fontFamily.mono' },
        ], applyCommand: 'settings.editorConfig' },
      { id: 'editor.lineNumbers', labelKey: 'settings.editor.lineNumbers', type: 'toggle', storageKey: 'mellow.editor.lineNumbers', defaultValue: false, applyCommand: 'settings.editorConfig' },
      // E4（§5.1 合同兑现）：Source 模式行号独立开关（Typora 源码模式默认显示行号）
      { id: 'editor.sourceLineNumbers', labelKey: 'settings.editor.sourceLineNumbers', type: 'toggle', storageKey: 'mellow.editor.sourceLineNumbers', defaultValue: true, applyCommand: 'settings.editorConfig' },
      { id: 'editor.lineWrapping', labelKey: 'settings.editor.lineWrapping', type: 'toggle', storageKey: 'mellow.editor.lineWrapping', defaultValue: true, applyCommand: 'settings.editorConfig' },
      // V7-W6（G7-EDIT-12）：Typora 1.14.9「匹配括号和引号」（配置键 `noPairingMatch`，
      // 默认 false 即默认**开启**配对）。此前 Mellow 把 autoCharacterPairs 写死为 true 且无 UI
      // → 用户无法关闭自动配对。同时控制选区包裹 / 行内代码等 Markdown 字符辅助。
      { id: 'editor.autoPair', labelKey: 'settings.editor.autoPair', type: 'toggle', storageKey: 'mellow.editor.autoPair', defaultValue: true, descriptionKey: 'settings.editor.autoPairDesc', applyCommand: 'settings.editorConfig' },
      // Typora `autoPairExtendSymbol` /「匹配 Markdown 字符」，默认 false；独立于括号/引号配对。
      { id: 'editor.markdownSyntaxPairs', labelKey: 'settings.editor.markdownSyntaxPairs', type: 'toggle', storageKey: 'mellow.editor.markdownSyntaxPairs', defaultValue: false, descriptionKey: 'settings.editor.markdownSyntaxPairsDesc', applyCommand: 'settings.editorConfig' },
      // V7-W6（G7-EDIT-13）：Typora「默认缩进」（`indentSize` 默认 2 空格）与「使用Tab」（`indentByTab` 默认 false）。
      // ⚠️ 实测（2026-09-14，Playwright 真机探针）：引擎的 `indentUnit` facet 在 Mellow **无任何消费方**
      //   —— 设成 2/4 空格或制表符，Tab 与列表续写行为**完全一致** → 用 `setIndentUnit` 会做出**空开关**。
      //   真正的控制点是 `tabKeyBehavior`（`modules/indentation/index.ts` 的 Tab 处理分支），
      //   引擎已支持 2/4 空格/Tab，而 Mellow 从未调用 → 一直落到默认 `insertTab`（插入**裸制表符**，
      //   行首制表符在 CommonMark 里是缩进代码块，属真实隐患）。
      //   默认取 Typora 的 2 空格（`indentSize: 2` + `indentByTab: false`）。
      { id: 'editor.tabBehavior', labelKey: 'settings.editor.tabBehavior', type: 'select', storageKey: 'mellow.editor.tabBehavior', defaultValue: 'twoSpaces', descriptionKey: 'settings.editor.tabBehaviorDesc', applyCommand: 'settings.editorConfig',
        options: [
          { value: 'twoSpaces', labelKey: 'settings.tabBehavior.twoSpaces' },
          { value: 'fourSpaces', labelKey: 'settings.tabBehavior.fourSpaces' },
          { value: 'tab', labelKey: 'settings.tabBehavior.tab' },
        ] },
      // V7-W6（G7-EDIT-15）：Typora「首行缩进」（`indentFirstLine`，默认 false）。
      // CoreEditor 的 Markdown 文档结构已能区分 Paragraph；设置通过 CSS class 注入首行 text-indent。
      { id: 'editor.firstLineIndent', labelKey: 'settings.editor.firstLineIndent', type: 'toggle', storageKey: 'mellow.editor.firstLineIndent', defaultValue: false, descriptionKey: 'settings.editor.firstLineIndentDesc', applyCommand: 'settings.editorConfig' },
      // 2026-09-30：Typora「双指缩放」（原生菜单项 `toggleAllowMagnification:`，配置键 `allowMagnification`）。
      // 默认 **false**（保守：不改变现有行为）—— Typora 该键的默认态**未能从一手证据确认**
      // （用户 plist 无该键；MainMenu.nib / 二进制未暴露初始 state），故取关闭。
      { id: 'editor.allowMagnification', labelKey: 'settings.editor.allowMagnification', type: 'toggle', storageKey: 'mellow.editor.allowMagnification', defaultValue: false, descriptionKey: 'settings.editor.allowMagnificationDesc', applyCommand: 'settings.editorConfig' },
      // 拼写检查（D1-1：Typora 编辑→拼写和语法「键入时检查」；大文件模式引擎侧强制关闭）
      { id: 'editor.spellcheck', labelKey: 'settings.editor.spellcheck', type: 'toggle', storageKey: 'mellow.editor.spellcheck', defaultValue: true, descriptionKey: 'settings.editor.spellcheckDesc', applyCommand: 'settings.spellcheck' },
      // 智能标点（master-plan R2-1：Typora 编辑→替换「智能引号/破折号」；默认关闭）
      { id: 'editor.smartPunctuation', labelKey: 'settings.editor.smartPunctuation', type: 'toggle', storageKey: 'mellow.editor.smartPunctuation', defaultValue: false, descriptionKey: 'settings.editor.smartPunctuationDesc', applyCommand: 'settings.smartPunctuation' },
      // Cmd/Ctrl+滚轮缩放（Typora 偏好→通用；实际字号仍走 editor.fontSize 单一真源）
      { id: 'editor.cmdWheelZoom', labelKey: 'settings.editor.cmdWheelZoom', type: 'toggle', storageKey: 'mellow.editor.cmdWheelZoom', defaultValue: true, descriptionKey: 'settings.editor.cmdWheelZoomDesc' },
      { id: 'editor.typewriter', labelKey: 'settings.editor.typewriter', type: 'toggle', storageKey: 'mellow.editor.typewriter', defaultValue: false, applyCommand: 'view.typewriter.on' },
      { id: 'editor.focusMode', labelKey: 'settings.editor.focusMode', type: 'select', storageKey: 'mellow.editor.focusMode', defaultValue: 'off',
        options: [
          { value: 'off', labelKey: 'settings.focus.off' },
          { value: 'line', labelKey: 'settings.focus.line' },
          { value: 'paragraph', labelKey: 'settings.focus.paragraph' },
        ], applyCommand: 'view.focus.off' },
      { id: 'editor.writingWidth', labelKey: 'settings.editor.writingWidth', type: 'select', storageKey: 'mellow.editor.writingWidth', defaultValue: String(TYPOGRAPHY_DEFAULTS.writingWidth),
        options: [
          { value: '680', labelKey: 'settings.writingWidth.680' },
          { value: '860', labelKey: 'settings.writingWidth.860' },
          { value: '980', labelKey: 'settings.writingWidth.980' },
          { value: 'auto', labelKey: 'settings.writingWidth.auto' },
        ], applyCommand: 'settings.writingWidth' },
      { id: 'editor.lineHeight', labelKey: 'settings.editor.lineHeight', type: 'number', storageKey: 'mellow.editor.lineHeight', defaultValue: TYPOGRAPHY_DEFAULTS.lineHeight, min: 1.2, max: 2.2, step: 0.05, applyCommand: 'settings.lineHeight' },
    ],
  },
  {
    id: 'markdown',
    labelKey: 'settings.markdown',
    settings: [
      { id: 'markdown.slashCommands', labelKey: 'settings.markdown.slashCommands', type: 'toggle', storageKey: 'mellow.slashCommands.enabled', defaultValue: true, applyCommand: 'slash.toggleEnabled' },
      // 语法特性开关（PRD §94）：bundle loader 读取 mellow.engine.features（JSON）
      { id: 'markdown.highlight', labelKey: 'settings.markdown.highlight', type: 'toggle', storageKey: 'mellow.engine.features.highlight', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.supSub', labelKey: 'settings.markdown.supSub', type: 'toggle', storageKey: 'mellow.engine.features.supSub', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.emoji', labelKey: 'settings.markdown.emoji', type: 'toggle', storageKey: 'mellow.engine.features.emoji', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.alerts', labelKey: 'settings.markdown.alerts', type: 'toggle', storageKey: 'mellow.engine.features.alerts', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.math', labelKey: 'settings.markdown.math', type: 'toggle', storageKey: 'mellow.engine.features.math', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.mermaid', labelKey: 'settings.markdown.mermaid', type: 'toggle', storageKey: 'mellow.engine.features.mermaid', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.toc', labelKey: 'settings.markdown.toc', type: 'toggle', storageKey: 'mellow.engine.features.toc', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.footnote', labelKey: 'settings.markdown.footnote', type: 'toggle', storageKey: 'mellow.engine.features.footnote', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.wikilink', labelKey: 'settings.markdown.wikilink', type: 'toggle', storageKey: 'mellow.engine.features.wikilink', defaultValue: true, applyCommand: 'settings.engineFeature' },
      { id: 'markdown.html', labelKey: 'settings.markdown.html', type: 'toggle', storageKey: 'mellow.engine.features.html', defaultValue: true, applyCommand: 'settings.engineFeature' },
      // 代码块行号（Typora 偏好→Markdown；live apply，无需重载编辑器）
      // V7-W6（G7-EDIT-17）：Typora「代码块缩进宽度」`codeIndentSize`（默认 **4**）。
      // 与正文缩进（`indentSize`，默认 2）是**两个独立偏好** —— Mellow 此前只有一个
      // `editor.tabBehavior` 兼管，实测代码块内按 Tab 得到正文宽度（2 而非 Typora 的 4）。
      { id: 'editor.codeIndentSize', labelKey: 'settings.editor.codeIndentSize', type: 'number', storageKey: 'mellow.editor.codeIndentSize', defaultValue: 4, min: 1, max: 16, step: 1, applyCommand: 'settings.editorConfig', descriptionKey: 'settings.editor.codeIndentSizeDesc' },
      { id: 'markdown.codeLineNumbers', labelKey: 'settings.markdown.codeLineNumbers', type: 'toggle', storageKey: 'mellow.editor.codeLineNumbers', defaultValue: false, applyCommand: 'settings.codeLineNumbers' },
      // V7-W6（G7-EDIT-16）：Typora「默认的代码块语言」（配置键 `defaultCodeLang`，默认**空串** = 不自动添加）。
      // 生效通道 = Typora `defaultCodeLangOption` 位掩码的 **Code 位**（值 1，即 Typora 默认）：
      // 只在**输入 Markdown 反引号**展开代码块时套用（菜单插入通道对应 Menu 位 = 2，未实装，见方案）。
      { id: 'markdown.defaultCodeLang', labelKey: 'settings.markdown.defaultCodeLang', type: 'text', storageKey: 'mellow.editor.defaultCodeLang', defaultValue: '', applyCommand: 'settings.editorConfig', descriptionKey: 'settings.markdown.defaultCodeLangDesc' },
      { id: 'markdown.yaml', labelKey: 'settings.markdown.yaml', type: 'toggle', storageKey: 'mellow.engine.features.yaml', defaultValue: true, applyCommand: 'settings.engineFeature' },
      // 2026-09-30：Typora「目录显示的标题层数」（Panel.strings；默认 6 = 全部层级）。
      // 对齐「大纲里最多显示到第 N 级标题」；值经 applySetting 写入 React state 后，
      // buildOutline 的 maxLevel 选项生效并重算大纲（改设置**必须**能触发重算，见审计 §4.25 的反例）。
      { id: 'markdown.outlineMaxLevel', labelKey: 'settings.markdown.outlineMaxLevel', type: 'select', storageKey: 'mellow.outline.maxLevel', defaultValue: '6',
        options: [
          { value: '1', labelKey: 'settings.outlineLevel.1' },
          { value: '2', labelKey: 'settings.outlineLevel.2' },
          { value: '3', labelKey: 'settings.outlineLevel.3' },
          { value: '4', labelKey: 'settings.outlineLevel.4' },
          { value: '5', labelKey: 'settings.outlineLevel.5' },
          { value: '6', labelKey: 'settings.outlineLevel.6' },
        ], applyCommand: 'settings.outlineMaxLevel', descriptionKey: 'settings.markdown.outlineMaxLevelDesc' },
    ],
  },
  {
    // P2-2.6 file id 归一：一级导航对齐 Typora「文件 / Files」复数 id（storageKey 保持
    // 既有值不变，避免用户已持久化设置丢失）。
    id: 'files',
    labelKey: 'settings.file',
    settings: [
      { id: 'files.showHidden', labelKey: 'settings.file.showHidden', type: 'toggle', storageKey: 'mellow.fileTree.showHidden', defaultValue: false, applyCommand: 'settings.fileTreeOptions' },
      { id: 'files.showNonMarkdown', labelKey: 'settings.file.showNonMarkdown', type: 'toggle', storageKey: 'mellow.fileTree.showNonMarkdown', defaultValue: false, applyCommand: 'settings.fileTreeOptions' },
      // V7-W3.6（G7-SIDE-06）：Typora 1.14 的「自定义显示 / 隐藏规则」——
      // 官方原文「custom rules to show/hide files」；Mellow 用 glob 列表表达
      // （`shouldShowEntry` 的 includeGlobs / excludeGlobs），逗号或换行分隔。
      { id: 'files.includeGlobs', labelKey: 'settings.file.includeGlobs', type: 'text', storageKey: 'mellow.fileTree.includeGlobs', defaultValue: '', descriptionKey: 'settings.file.includeGlobsDesc', applyCommand: 'settings.fileTreeOptions' },
      { id: 'files.excludeGlobs', labelKey: 'settings.file.excludeGlobs', type: 'text', storageKey: 'mellow.fileTree.excludeGlobs', defaultValue: '', descriptionKey: 'settings.file.excludeGlobsDesc', applyCommand: 'settings.fileTreeOptions' },
      { id: 'files.autosave', labelKey: 'settings.file.autosave', type: 'toggle', storageKey: 'mellow.file.autosave', defaultValue: true, applyCommand: 'settings.autosave' },
      // V7-W5（G7-FEAT-03）：定时保存间隔（分钟）。Typora Win/Linux 默认 5 分钟，但只在
      // conf/conf.user.json 的 `autoSaveTimer` 中可改、GUI 不可达；Mellow 暴露为设置项 = B。
      { id: 'files.autosaveTimer', labelKey: 'settings.file.autosaveTimer', type: 'text', storageKey: 'mellow.file.autosaveTimer', defaultValue: '5', descriptionKey: 'settings.file.autosaveTimerDesc', applyCommand: 'settings.autosaveTimer' },
      // V7-W6（G7-FEAT-12）：Typora「保存时在文末添加空行」（配置键 `preferFinalNewline`，默认 false）。
      // 语义 = **缺失时追加**（跟随文档当前 EOL），**从不删除**已有换行；故默认关闭时对既有行为零影响。
      // 无 applyCommand：它在**保存时**读取（handleSave / handleSaveAs），无需 live apply。
      { id: 'files.finalNewline', labelKey: 'settings.file.finalNewline', type: 'toggle', storageKey: 'mellow.file.finalNewline', defaultValue: false, descriptionKey: 'settings.file.finalNewlineDesc' },
      // 2026-10-07（审计 §4.134）：Typora 面板组 **"When drop file / folder into Typora"** 的三行（`w.v rows` 表格）：
      //   `["When drop folder",                options:{"":"Open in Typora",   link:"Insert Folder Link"}]`
      //   `["When drop markdown file",         options:{"":"Open in Typora",   link:"Insert File Link"}]`
      //   `["When drop files that can be imported", options:{"":"Import File", link:"Insert File Link"}]`
      //   `value: this.getValue(<key>)` 且**默认都是 `""`**（未设 ⇒ 第一项）⇒ **打开 / 打开 / 导入**。
      // 决策表（`File.onDropFile`）的逐字转写见 `packages/app-core/src/dropAction.ts`（含单测，全行覆盖）。
      // 无 applyCommand —— 拖放时读取（同 `files.finalNewline` 的「读时生效」模式）。
      { id: 'files.dropFolderAction', labelKey: 'settings.file.dropFolderAction', type: 'select', storageKey: 'mellow.drop.folderAction', defaultValue: 'open',
        options: [
          { value: 'open', labelKey: 'settings.file.drop.openInTypora' },
          { value: 'link', labelKey: 'settings.file.drop.insertFolderLink' },
        ], descriptionKey: 'settings.file.dropDesc' },
      { id: 'files.dropFileAction', labelKey: 'settings.file.dropFileAction', type: 'select', storageKey: 'mellow.drop.fileAction', defaultValue: 'open',
        options: [
          { value: 'open', labelKey: 'settings.file.drop.openInTypora' },
          { value: 'link', labelKey: 'settings.file.drop.insertFileLink' },
        ], descriptionKey: 'settings.file.dropDesc' },
      { id: 'files.dropImportAction', labelKey: 'settings.file.dropImportAction', type: 'select', storageKey: 'mellow.drop.importAction', defaultValue: 'import',
        options: [
          { value: 'import', labelKey: 'settings.file.drop.importFile' },
          { value: 'link', labelKey: 'settings.file.drop.insertFileLink' },
        ], descriptionKey: 'settings.file.dropDesc' },
      // 2026-10-07（审计 §4.129）：Typora「Default Line Ending」。
      // 【一手证据】面板键 `line_ending_crlf`（**仅非 macOS 显示**：`window.isMac ? null : …`），
      //   标题 `title:"Default Line Ending"`、hint `"Line ending for new file"`、
      //   选项 `{false:"LF (Unix Style)", true:"CRLF (Windows Style)"}`。
      // 【跨层链路（本轮查清）】面板键 `line_ending_crlf` → **原生侧**
      //   （实测：`strings -a Contents/MacOS/Typora` **含** `line_ending_crlf`、**不含** `preferCRLF`）
      //   → 持久化成**字符串设置** `end-of-line`（`"crlf"` / `"lf"`）
      //   → JS 侧 `preferCRLF()` 读取（`var e = this.getSetting("end-of-line") || ""; return e.length ? "crlf" == e.toLowerCase() : File.option.preferCRLF`）
      //   → 回落 `File.option.preferCRLF`（`DEFAULT_OPTIONS` 里的布尔）。
      //   ⇒ 它与矩阵里的 `preferCRLF` 是**同一件事的两层**，不是重复计数。
      // 【默认】`preferCRLF:!1`（LF）+ 面板未设时 `!!getValue(...) === false` ⇒ **默认 LF**。
      //   Mellow 此前在新建文档处硬编码 `eol: '\n'` ⇒ 本项**默认行为不变**。
      // 【作用域】只影响**新建**文档；打开已有文件时行尾来自文件自身（`detectEol`），不受本项影响
      //   —— 与 Typora 的 `decideLineEnding`（文档含 `\r\n` 即 CRLF，否则用偏好）同向。
      // 无 applyCommand —— 在**新建文档时**读取（同 `files.finalNewline` 的「读时生效」模式）。
      { id: 'files.newFileLineEnding', labelKey: 'settings.file.newFileLineEnding', type: 'select', storageKey: 'mellow.file.newFileLineEnding', defaultValue: 'lf',
        options: [
          { value: 'lf', labelKey: 'settings.file.newFileLineEnding.lf' },
          { value: 'crlf', labelKey: 'settings.file.newFileLineEnding.crlf' },
        ], descriptionKey: 'settings.file.newFileLineEndingDesc' },
      // 2026-10-07（审计 §4.145）：Typora **文件搜索面板**的两个选项。
      // 【一手证据】`main.js` 的文件搜索项类：
      //   `this.caseSensitive=File.option.fileSearchCaseSensitive, this.wholeWord=File.option.fileSearchWholeWord,`
      //   `this.useRegexp=File.option.fileSearchUseRegexp`；两个按钮的 `mousedown` 分别
      //   `JSBridge.putSetting("fileSearchCaseSensitive", …)` / `putSetting("fileSearchWholeWord", …)`
      //   ⇒ **Typora 会持久化**（`DEFAULT_OPTIONS` 里默认都是 `!1` = false）。
      //   ⚠️ 这两个键**不在** Typora 偏好面板里（面板键抽取 0 命中）⇒ 是**面板状态**，不是 Preferences 项。
      // 【Mellow 现状】侧栏搜索面板**已有**这两个复选框（`App.tsx` 的 `searchCase` / `searchWholeWord`），
      //   但此前是 `useState(false)` **字面量** ⇒ 重启即回默认（矩阵原判「选项未暴露」是**错的**）。
      //   本项把它们接到设置（**默认 false ⇒ 默认行为不变**）。
      // ⚠️ 带 `applyCommand`（与「读时生效」的那些不同）：设置页与**侧栏面板复选框**是同一个值的
      //   两个入口 ⇒ 在设置页改完必须**同步面板 state**，否则两处显示会分叉（面板的 checkbox 由 state 驱动）。
      { id: 'files.searchCaseSensitive', labelKey: 'settings.file.searchCaseSensitive', type: 'toggle', storageKey: 'mellow.file.searchCaseSensitive', defaultValue: false, descriptionKey: 'settings.file.searchCaseSensitiveDesc', applyCommand: 'settings.searchOptions' },
      { id: 'files.searchWholeWord', labelKey: 'settings.file.searchWholeWord', type: 'toggle', storageKey: 'mellow.file.searchWholeWord', defaultValue: false, descriptionKey: 'settings.file.searchWholeWordDesc', applyCommand: 'settings.searchOptions' },
    ],
  },
  {
    id: 'image',
    labelKey: 'settings.image',
    settings: [
      { id: 'image.assetDir', labelKey: 'settings.image.assetDir', type: 'text', storageKey: 'mellow.assetDir', defaultValue: 'assets', applyCommand: 'settings.image.assetDir' },
      // 2026-10-07（审计 §4.139）：Typora 的 `allowImageMove`（`DEFAULT_OPTIONS`，**默认 true**，非面板键）。
      // 语义 = 「允许移动图片」（Typora 侧由**菜单/原生**消费：实测 JS 树里只有默认值表那一处）。
      // Mellow 的对应物 = 两个命令入口 `image.move`（移动到…）/ `image.moveAll`（全部移到 asset 目录）
      // ⇒ 关闭时**禁用这两个命令并给出状态提示**（不静默无反应）。
      // ⚠️ Mellow 的图片 widget **不参与拖拽**（`image/widget.ts` 里 `img.draggable = false`）⇒ 无「未门控的拖拽路径」。
      // 默认 true ⇒ **默认行为不变**。
      { id: 'image.allowMove', labelKey: 'settings.image.allowMove', type: 'toggle', storageKey: 'mellow.image.allowMove', defaultValue: true, descriptionKey: 'settings.image.allowMoveDesc' },
      // 2026-10-07（审计 §4.139）：Typora 的 `allow_image_upload`（面板 label
      // **"Allow upload images automatically based on YAML settings"**，zh **「允许根据 YAML 设置自动上传图片」**）。
      // Mellow 的对应物 = `__MELLOW_IMAGE_UPLOAD__` 注入（`App.tsx` 的图床上传服务）
      // ⇒ 关闭时**不注入** ⇒ engine 的 `uploadImages` 返回全 null ⇒ 回退本地插入（等价 `upload: 'never'`）。
      // 默认 true ⇒ **默认行为不变**。
      // 2026-10-07（审计 §4.142）：Typora 的 `applyImageMoveForWeb`（**默认 false**）。
      // 语义：插入**远端图**时，是否把它**下载到 asset 目录**并改写 src 为本地相对路径。
      // Mellow 的对应物 = `ImageHost.shouldDownloadRemoteImages()`（宿主读本设置，engine 不读存储）
      // + bridge 的 `download` 方法（复用 `fs::download_remote_impl`，与「下载远程到 asset 目录」命令同一实现）。
      // **默认 false ⇒ 默认行为不变**（仍是直插 URL）。
      { id: 'image.downloadRemote', labelKey: 'settings.image.downloadRemote', type: 'toggle', storageKey: 'mellow.image.downloadRemote', defaultValue: false, descriptionKey: 'settings.image.downloadRemoteDesc' },
      { id: 'image.allowUpload', labelKey: 'settings.image.allowUpload', type: 'toggle', storageKey: 'mellow.image.allowUpload', defaultValue: true, descriptionKey: 'settings.image.allowUploadDesc' },
      // V6-P1 1.2.6：默认自动加载远程图片（Typora 行为）；引擎读 '0' 为关（默认开）
      { id: 'image.loadRemote', labelKey: 'settings.image.loadRemote', type: 'toggle', storageKey: 'mellow.image.loadRemote', defaultValue: true, descriptionKey: 'settings.image.loadRemoteDesc' },
      { id: 'image.uploadService', labelKey: 'settings.image.uploadService', type: 'select', storageKey: 'mellow.image.uploadService', defaultValue: 'none',
        options: [
          { value: 'none', labelKey: 'settings.image.upload.none' },
          { value: 'picgo-http', labelKey: 'settings.image.upload.picgoHttp' },
          { value: 'picgo-cli', labelKey: 'settings.image.upload.picgoCli' },
          { value: 'custom-command', labelKey: 'settings.image.upload.customCommand' },
        ], descriptionKey: 'settings.image.uploadServiceDesc' },
      { id: 'image.uploadHttpUrl', labelKey: 'settings.image.uploadHttpUrl', type: 'text', storageKey: 'mellow.image.uploadHttpUrl', defaultValue: 'http://127.0.0.1:36677/upload', descriptionKey: 'settings.image.uploadHttpUrlDesc' },
      { id: 'image.uploadCommand', labelKey: 'settings.image.uploadCommand', type: 'text', storageKey: 'mellow.image.uploadCommand', defaultValue: '', descriptionKey: 'settings.image.uploadCommandDesc' },
    ],
  },
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    settings: [
      { id: 'appearance.theme', labelKey: 'settings.appearance.theme', type: 'select', storageKey: 'mellow.theme.settings', defaultValue: 'mellow-light', applyCommand: 'theme.apply.mellow-light' },
      // 主题文件夹入口（Typora 偏好→外观→打开主题文件夹；复用 file.openUserCss 命令）
      { id: 'appearance.openThemeFolder', labelKey: 'settings.appearance.openThemeFolder', type: 'action', storageKey: '', defaultValue: '', applyCommand: 'file.openUserCss' },
      { id: 'appearance.statusbar', labelKey: 'settings.appearance.statusbar', type: 'toggle', storageKey: 'mellow.statusbar.visible', defaultValue: false, applyCommand: 'settings.statusbar' },
      // V7-W2.4（D-B = ①）：浮动编辑器工具栏开关。
      // Typora 1.14 What's New 原文：「You can now enable the float toolbar from menubar
      // → View → Toolbar or from Settings → Appearance」—— 故本项归属「外观」而非「编辑器」，
      // 且与 View → 工具栏（view.toolbar.toggle）同源（storageKey 相同）。
      { id: 'appearance.toolbar', labelKey: 'settings.appearance.toolbar', type: 'toggle', storageKey: 'mellow.selectionToolbar.enabled', defaultValue: true, applyCommand: 'settings.toolbar' },
      // V7-W2.6（G7-SHELL-06）：macOS 字数可见性。
      // Typora 官方：「For macOS version, the word count are shown when user hover on the
      // titlebar. To "always" show it, please enable this option in Preferences Panel →
      // Appearance section.」Mellow 的 macOS 窗口用原生标题栏（装饰在 webview 之外），
      // 原生栏 hover 事件不进入 webview，无法在 Web 层实现 hover 显隐；因此实现 Typora
      // 同样提供的「始终显示」选项（把字数并入窗口标题），hover 行为登记为 D（需 tao
      // 暴露原生 titlebar tracking）。
      { id: 'appearance.wordCount', labelKey: 'settings.appearance.wordCount', type: 'toggle', storageKey: 'mellow.appearance.wordCount', defaultValue: false, descriptionKey: 'settings.appearance.wordCountDesc', applyCommand: 'settings.wordCount' },
      { id: 'appearance.sidebarMode', labelKey: 'settings.appearance.sidebar', type: 'select', storageKey: 'mellow.sidebar.mode', defaultValue: 'files',
        options: [
          { value: 'files', labelKey: 'settings.sidebar.files' },
          // V7-W2.4 附带修复：Articles（文档列表）已在 W1.5 实装为第四种侧栏模式，
          // 但本选项表仍停在三种模式 → 用户无法把「文档列表」设为默认视图。
          { value: 'fileList', labelKey: 'settings.sidebar.articles' },
          { value: 'outline', labelKey: 'settings.sidebar.outline' },
          { value: 'search', labelKey: 'settings.sidebar.search' },
        ], applyCommand: 'settings.sidebarMode' },
    ],
  },
  {
    id: 'export',
    labelKey: 'settings.export',
    settings: [
      // 图片导出（PRD §74：PNG/JPEG/width/quality/long-image protection）
      { id: 'export.image.format', labelKey: 'settings.export.image.format', type: 'select', storageKey: 'mellow.export.image.format', defaultValue: 'png',
        options: [
          { value: 'png', labelKey: 'settings.export.image.png' },
          { value: 'jpeg', labelKey: 'settings.export.image.jpeg' },
        ], descriptionKey: 'settings.export.image.formatDesc' },
      { id: 'export.image.width', labelKey: 'settings.export.image.width', type: 'number', storageKey: 'mellow.export.image.width', defaultValue: 800, min: 200, max: 4096, step: 10, descriptionKey: 'settings.export.image.widthDesc' },
      // 2026-09-30：Typora 图片导出的 `imageFontSize`（**Typora 默认 24px**）。
      // ⚠️ Mellow 既有默认是 16（`BODY_SIZE`）—— **本项刻意保持 16 不动**：
      // 改成 24 会改变所有既有图片导出的输出（面积 1.5× 放大，更易触及长图保护上限），
      // 需视觉/真机确认后再定；此处只**提供可配置能力**，让用户可自行对齐 Typora。
      { id: 'export.image.fontSize', labelKey: 'settings.export.image.fontSize', type: 'number', storageKey: 'mellow.export.image.fontSize', defaultValue: 16, min: 8, max: 48, step: 1, descriptionKey: 'settings.export.image.fontSizeDesc' },
      // 2026-10-06（ADR-0033 **Q = A2**）：Typora 该组的**另一半** —— radio `Use theme font size`。
      // ⚠️ Mellow 的图片导出是 **canvas 渲染（显式 fontFamily）**，**没有主题 CSS 通道**
      // ⇒ Typora 的 `fontSize = void 0`（交给主题 CSS）**不可直接照搬**。
      // 取**最接近且可控**的等价物 = 跟随**编辑器字号**（`editor.fontSize`）。
      // ⚠️ 这是**有意的差异**（非 Typora 等价）⇒ 已在 ADR-0033 写明，须登记 D。
      // **默认 `custom` ⇒ 既有行为不变**（仍走 `export.image.fontSize`，缺省 16）。
      { id: 'export.image.fontSizeMode', labelKey: 'settings.export.image.fontSizeMode', type: 'select', storageKey: 'mellow.export.image.fontSizeMode', defaultValue: 'custom',
        options: [
          { value: 'custom', labelKey: 'settings.export.image.fontSizeMode.custom' },
          { value: 'followEditor', labelKey: 'settings.export.image.fontSizeMode.followEditor' },
        ], descriptionKey: 'settings.export.image.fontSizeModeDesc' },
      { id: 'export.image.quality', labelKey: 'settings.export.image.quality', type: 'number', storageKey: 'mellow.export.image.quality', defaultValue: 0.92, min: 0.1, max: 1, step: 0.02, descriptionKey: 'settings.export.image.qualityDesc' },
      // V7-W6（G7-FEAT-13）：Typora「导出时保留单换行符」（配置键 `preLinebreakOnExport`，默认 false）。
      // 背景：Mellow 的 Enter 产**单个 `\n`**（G7-EDIT-07），而 CommonMark 把段内单换行渲染为空格
      // → 不开启时「编辑器里看到的换行在导出件里消失」。同时作用于 HTML 与 PDF 两条导出管线。
      // 无 applyCommand —— 导出时读取。
      { id: 'export.preserveLineBreaks', labelKey: 'settings.export.preserveLineBreaks', type: 'toggle', storageKey: 'mellow.export.preserveLineBreaks', defaultValue: false, descriptionKey: 'settings.export.preserveLineBreaksDesc' },
      // 2026-10-07（审计 §4.127）：Typora 的 `pandocPath`（`File.option.pandocPath || "pandoc"`）。
      // 【为什么需要它】Rust 侧此前只做**裸 PATH 查找**（`Command::new("pandoc")`），而
      // **macOS 的 GUI 应用不继承 shell 的 PATH** —— Finder/Dock 启动时进程 PATH 只有
      // `/usr/bin:/bin:/usr/sbin:/sbin`（实测 `launchctl getenv PATH` 为空），而 Homebrew 装在
      // `/opt/homebrew/bin` ⇒ **用户明明装了 pandoc，却被告知「需要安装 Pandoc 才能导出该格式」**。
      // ⚠️ 该缺陷**在 dev 里测不出来**（从终端启动会继承 shell 的 PATH）。
      // 本项提供 Typora 同款的**显式指定**；Rust 侧另有**常见安装位置兜底**（见 `pandoc_candidates`）。
      // 空串 = 不指定（走 PATH + 兜底），与 Typora 默认一致 ⇒ **默认行为不变**。
      // 无 applyCommand —— 导出/导入时读取（同 `export.preserveLineBreaks`）。
      { id: 'export.pandocPath', labelKey: 'settings.export.pandocPath', type: 'text', storageKey: 'mellow.export.pandocPath', defaultValue: '', descriptionKey: 'settings.export.pandocPathDesc' },
      // 2026-10-07（审计 §4.133）：Typora「Default Folder for Exported File」。
      // 【一手证据】面板组 `title:"Default Folder for Exported File"`、
      //   `options:{"":"Auto", same:"Same folder with current file", custom:"Custom location"}`、
      //   `value: n.exportFolder || ""` ⇒ **默认 `""` = Auto**；仅当 `"custom"` 时才渲染 `customExportPath` 文本框。
      // 【精确语义】`main.js` 建议导出路径 `d()` 的优先级（本轮逐字读出）：
      //   ① 显式 `t.path` → ② `File.option.lastSaveLocation`（**高于本项**；Mellow 未实现「记住上次保存位置」，见审计）
      //   → ③ `"same"` ⇒ `u()` = **当前文件所在目录**
      //   → ④ `"custom"` ⇒ `customExportPath || window._options.documentsPath`
      //   → ⑤ **Auto** ⇒ `File.mountFolder_`（**打开的工作区文件夹**），无则**只给文件名**（不指定目录）。
      // ⚠️ **§4.132 的映射有误，本轮更正**：当时把 Auto 实现成「当前文件所在目录」——
      //   那其实是 **`same`** 档；Auto 应当是**工作区根目录**（Mellow 的 `fileTreeRoot` 与之对应：
      //   打开文件夹 = 该文件夹；打开单文件 = 其父目录，见 `autoLoadParentFolder`）。
      // 【默认】`auto` ⇒ 落点 = `fileTreeRoot`；无则**不指定**（与 Typora 的兜底一致）。
      { id: 'export.folder', labelKey: 'settings.export.folder', type: 'select', storageKey: 'mellow.export.folder', defaultValue: 'auto',
        options: [
          { value: 'auto', labelKey: 'settings.export.folder.auto' },
          { value: 'same', labelKey: 'settings.export.folder.same' },
          { value: 'custom', labelKey: 'settings.export.folder.custom' },
        ], descriptionKey: 'settings.export.folderDesc' },
      // 仅当 `export.folder === 'custom'` 时生效（与 Typora 面板的渲染条件一致）。
      { id: 'export.customPath', labelKey: 'settings.export.customPath', type: 'text', storageKey: 'mellow.export.customPath', defaultValue: '', descriptionKey: 'settings.export.customPathDesc' },
    ],
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    settings: [
      // P2-2.6 action 接通既有命令（搜索可达且真实可用）
      { id: 'shortcuts.list', labelKey: 'settings.shortcuts.list', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.shortcuts.listDesc', applyCommand: 'help.cheatsheet' },
    ],
  },
  {
    id: 'extensions',
    labelKey: 'settings.extensions',
    settings: [
      // action 型**必须绑定命令**（否则渲染出的「打开」按钮点了没反应）——
      // 2026-09-30 审计：此二项此前无 applyCommand，是**死按钮**，已补。
      // 仍满足 PRD §122：storageKey 为空 = 不持久化任何 AI / 插件状态。
      { id: 'extensions.ai', labelKey: 'settings.extensions.ai', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.extensions.aiDesc', applyCommand: 'extensions.list' },
      { id: 'extensions.plugins', labelKey: 'settings.extensions.plugins', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.extensions.pluginsDesc', applyCommand: 'commandPalette.open' },
    ],
  },
  {
    id: 'advanced',
    labelKey: 'settings.advanced',
    settings: [
      // 启动期设置：值由 App 在启动时**直接读 storageKey**（App.tsx 的 windowBounds 判定），
      // 没有 live-apply 分支 —— 故**不声明 applyCommand**（声明了却无 case 是死引用，
      // 会让人以为「改了立刻生效」）。2026-09-30 审计删除该死引用。
      { id: 'advanced.windowBounds', labelKey: 'settings.advanced.windowBounds', type: 'toggle', storageKey: 'mellow.advanced.windowBounds', defaultValue: true },
      // 入口型 action（与 appearance.openThemeFolder 同范式）：打开 appData/user.css。
      // 2026-09-30 审计：原为 `type: 'text'` 且 storageKey 为空 —— 输入的值写进 localStorage
      // 的空键、无人消费，是个「打了字没处去」的死输入框，已改为 action。
      { id: 'advanced.userCss', labelKey: 'settings.advanced.userCss', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.advanced.userCssDesc', applyCommand: 'file.openUserCss' },
    ],
  },
];

const settingMap = new Map<string, SettingDefinition>();
for (const section of SETTINGS_SECTIONS) {
  for (const setting of section.settings) {
    settingMap.set(setting.id, setting);
  }
}

export function settingById(id: string): SettingDefinition | undefined {
  return settingMap.get(id);
}

export function sectionById(id: SettingsSectionId): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((section) => section.id === id);
}

/** 从 localStorage 读取（无存储 → defaultValue）；storageKey 为空（action）返回 defaultValue */
export function readSetting(def: SettingDefinition): string | number | boolean {
  if (def.storageKey === '') return def.defaultValue;
  try {
    const raw = localStorage.getItem(def.storageKey);
    if (raw === null) return def.defaultValue;
    if (def.type === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : def.defaultValue;
    }
    if (def.type === 'toggle') return raw === '1' || raw === 'true';
    return raw;
  } catch {
    return def.defaultValue;
  }
}

/** 写入 localStorage（toggle → '1'/'0'；number → String；其余原样） */
export function writeSetting(def: SettingDefinition, value: string | number | boolean): void {
  if (def.storageKey === '') return;
  let raw: string;
  if (typeof value === 'boolean') raw = value ? '1' : '0';
  else raw = String(value);
  localStorage.setItem(def.storageKey, raw);
}

/**
 * 恢复默认（Typora 偏好面板「重置高级设置」的对标，2026-09-30）。
 *
 * 语义：
 * - **删除键**而非写入 `defaultValue` —— 未设置的键读时自然回落 `defaultValue`；
 *   删除还能顺带清掉「将来默认值变更后残留的旧值」（写入会把旧默认值**固化**下来）；
 * - **跳过 `storageKey === ''` 的入口型 action** —— 它们没有值，且 `apply` 会触发
 *   副作用（打开主题文件夹 / 速查表 / 检查更新 / 扩展列表 / 命令面板）；
 * - `apply` 由宿主提供，且宿主**必须复用与控件 onChange 完全相同的路径** ——
 *   这样「恢复默认后行为正确」与「手动逐项改回默认值行为正确」是同一件事，
 *   无需另建一条 live-apply 路径（**少一条路径就少一处将来会漂移的地方**）；
 * - 对**没有 live-apply** 的设置（启动期读取项，如 `advanced.windowBounds`），
 *   删除键同样正确 —— 下次读取即回落默认值。
 *
 * **不覆盖**快捷键自定义（`SHORTCUT_OVERRIDES_KEY`）：那是独立的 override 层，
 * 且已有**逐项**恢复（录制态按 Backspace/Delete）。调用方应在文案里说明这一点。
 *
 * 返回被重置的设置项数（供状态栏反馈与测试断言）。
 */
export function restoreAllSettingsDefaults(
  apply: (def: SettingDefinition, value: string | number | boolean) => void,
): number {
  let n = 0;
  for (const section of SETTINGS_SECTIONS) {
    for (const def of section.settings) {
      if (def.storageKey === '') continue;
      try {
        localStorage.removeItem(def.storageKey);
      } catch {
        /* 隐私模式等：忽略，仍继续 apply（读时会回落默认值） */
      }
      apply(def, def.defaultValue);
      n += 1;
    }
  }
  return n;
}

// ── P2-2.6 快捷键自定义 override 层 ─────────────────────────────────
// 单一真源不变：menuSchema 仍是键位默认值唯一来源（§7.4 硬规则 2）；用户在 Settings
// 录制的自定义键位存为 override，仅在装配边界生效（App registry 注入 / native menu spec）。
export const SHORTCUT_OVERRIDES_KEY = 'mellow.shortcuts.overrides';

export interface ShortcutOverrideEntry {
  mac?: string;
  winLinux?: string;
}

export type ShortcutOverrideMap = Record<string, ShortcutOverrideEntry>;

/** 读取用户自定义键位（损坏/非法 JSON → 空表，等同无 override） */
export function readShortcutOverrides(): ShortcutOverrideMap {
  try {
    const raw = localStorage.getItem(SHORTCUT_OVERRIDES_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: ShortcutOverrideMap = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id !== 'string' || id === '' || typeof entry !== 'object' || entry === null) continue;
      const rec = entry as Record<string, unknown>;
      const mac = typeof rec.mac === 'string' ? rec.mac : undefined;
      const winLinux = typeof rec.winLinux === 'string' ? rec.winLinux : undefined;
      if (mac !== undefined || winLinux !== undefined) result[id] = { ...(mac !== undefined ? { mac } : {}), ...(winLinux !== undefined ? { winLinux } : {}) };
    }
    return result;
  } catch {
    return {};
  }
}

/** 持久化用户自定义键位 */
export function writeShortcutOverrides(map: ShortcutOverrideMap): void {
  localStorage.setItem(SHORTCUT_OVERRIDES_KEY, JSON.stringify(map));
}
