/**
 * Settings schema（One Settings Model，PRD §531；T-0605 Settings）。
 *
 * - 共享 schema：desktop UI 与 extension 共用同一份设置定义；
 * - live apply where safe：requiresRestart 默认 false，App 层负责 apply（命令或宿主 handler）；
 * - searchable P1：schema 已含 labelKey（可检索），UI 搜索 P1；
 * - AI 页面：默认不存在，AI extension 启用后出现（见 extensions 分类 / App 检测）。
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
      { id: 'general.updater.checkNow', labelKey: 'settings.updater.checkNow', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.updater.checkNowDesc', applyCommand: 'updater.check' },
    ],
  },
  {
    id: 'editor',
    labelKey: 'settings.editor',
    settings: [
      { id: 'editor.fontSize', labelKey: 'settings.editor.fontSize', type: 'number', storageKey: 'mellow.editor.fontSize', defaultValue: 16, min: 10, max: 32, step: 1, applyCommand: 'settings.editorConfig', descriptionKey: 'settings.editor.fontSizeDesc' },
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
      { id: 'editor.toolbar', labelKey: 'settings.editor.toolbar', type: 'toggle', storageKey: 'mellow.selectionToolbar.enabled', defaultValue: true, applyCommand: 'view.toolbar.on' },
      { id: 'editor.writingWidth', labelKey: 'settings.editor.writingWidth', type: 'select', storageKey: 'mellow.editor.writingWidth', defaultValue: '860',
        options: [
          { value: '680', labelKey: 'settings.writingWidth.680' },
          { value: '860', labelKey: 'settings.writingWidth.860' },
          { value: '980', labelKey: 'settings.writingWidth.980' },
          { value: 'auto', labelKey: 'settings.writingWidth.auto' },
        ], applyCommand: 'settings.writingWidth' },
      { id: 'editor.lineHeight', labelKey: 'settings.editor.lineHeight', type: 'number', storageKey: 'mellow.editor.lineHeight', defaultValue: 1.6, min: 1.2, max: 2.2, step: 0.05, applyCommand: 'settings.lineHeight' },
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
      { id: 'markdown.codeLineNumbers', labelKey: 'settings.markdown.codeLineNumbers', type: 'toggle', storageKey: 'mellow.editor.codeLineNumbers', defaultValue: false, applyCommand: 'settings.codeLineNumbers' },
      { id: 'markdown.yaml', labelKey: 'settings.markdown.yaml', type: 'toggle', storageKey: 'mellow.engine.features.yaml', defaultValue: true, applyCommand: 'settings.engineFeature' },
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
      { id: 'files.autosave', labelKey: 'settings.file.autosave', type: 'toggle', storageKey: 'mellow.file.autosave', defaultValue: true, applyCommand: 'settings.autosave' },
    ],
  },
  {
    id: 'image',
    labelKey: 'settings.image',
    settings: [
      { id: 'image.assetDir', labelKey: 'settings.image.assetDir', type: 'text', storageKey: 'mellow.assetDir', defaultValue: 'assets', applyCommand: 'settings.image.assetDir' },
      { id: 'image.loadRemote', labelKey: 'settings.image.loadRemote', type: 'toggle', storageKey: 'mellow.image.loadRemote', defaultValue: false, descriptionKey: 'settings.image.loadRemoteDesc' },
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
      { id: 'appearance.openThemeFolder', labelKey: 'settings.appearance.openThemeFolder', type: 'action', storageKey: 'mellow.appearance.openThemeFolder', defaultValue: '', applyCommand: 'file.openUserCss' },
      { id: 'appearance.statusbar', labelKey: 'settings.appearance.statusbar', type: 'toggle', storageKey: 'mellow.statusbar.visible', defaultValue: false, applyCommand: 'settings.statusbar' },
      { id: 'appearance.sidebarMode', labelKey: 'settings.appearance.sidebar', type: 'select', storageKey: 'mellow.sidebar.mode', defaultValue: 'files',
        options: [
          { value: 'files', labelKey: 'settings.sidebar.files' },
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
      { id: 'export.image.quality', labelKey: 'settings.export.image.quality', type: 'number', storageKey: 'mellow.export.image.quality', defaultValue: 0.92, min: 0.1, max: 1, step: 0.02, descriptionKey: 'settings.export.image.qualityDesc' },
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
      { id: 'extensions.ai', labelKey: 'settings.extensions.ai', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.extensions.aiDesc' },
      { id: 'extensions.plugins', labelKey: 'settings.extensions.plugins', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.extensions.pluginsDesc' },
    ],
  },
  {
    id: 'advanced',
    labelKey: 'settings.advanced',
    settings: [
      { id: 'advanced.windowBounds', labelKey: 'settings.advanced.windowBounds', type: 'toggle', storageKey: 'mellow.advanced.windowBounds', defaultValue: true, applyCommand: 'settings.windowBounds' },
      { id: 'advanced.userCss', labelKey: 'settings.advanced.userCss', type: 'text', storageKey: '', defaultValue: '', descriptionKey: 'settings.advanced.userCssDesc' },
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
