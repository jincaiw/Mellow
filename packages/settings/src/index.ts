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

export type SettingsSectionId = 'general' | 'editor' | 'markdown' | 'file' | 'image' | 'appearance' | 'export' | 'shortcuts' | 'extensions' | 'advanced' | 'updater';

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
      { id: 'general.language', labelKey: 'settings.general.language', type: 'select', storageKey: 'mellow.locale', defaultValue: 'zh-CN',
        options: [
          { value: 'zh-CN', labelKey: 'settings.language.zh' },
          { value: 'en-US', labelKey: 'settings.language.en' },
          { value: 'system', labelKey: 'settings.language.system' },
        ], applyCommand: 'locale.set.system' },
    ],
  },
  {
    id: 'editor',
    labelKey: 'settings.editor',
    settings: [
      { id: 'editor.fontSize', labelKey: 'settings.editor.fontSize', type: 'number', storageKey: 'mellow.editor.fontSize', defaultValue: 17, min: 10, max: 32, step: 1, applyCommand: 'settings.editorConfig' },
      { id: 'editor.lineNumbers', labelKey: 'settings.editor.lineNumbers', type: 'toggle', storageKey: 'mellow.editor.lineNumbers', defaultValue: false, applyCommand: 'settings.editorConfig' },
      { id: 'editor.lineWrapping', labelKey: 'settings.editor.lineWrapping', type: 'toggle', storageKey: 'mellow.editor.lineWrapping', defaultValue: true, applyCommand: 'settings.editorConfig' },
      { id: 'editor.typewriter', labelKey: 'settings.editor.typewriter', type: 'toggle', storageKey: 'mellow.editor.typewriter', defaultValue: false, applyCommand: 'view.typewriter.on' },
      { id: 'editor.focusMode', labelKey: 'settings.editor.focusMode', type: 'select', storageKey: 'mellow.editor.focusMode', defaultValue: 'off',
        options: [
          { value: 'off', labelKey: 'settings.focus.off' },
          { value: 'line', labelKey: 'settings.focus.line' },
          { value: 'paragraph', labelKey: 'settings.focus.paragraph' },
        ], applyCommand: 'view.focus.off' },
      { id: 'editor.toolbar', labelKey: 'settings.editor.toolbar', type: 'toggle', storageKey: 'mellow.selectionToolbar.enabled', defaultValue: true, applyCommand: 'view.toolbar.on' },
    ],
  },
  {
    id: 'markdown',
    labelKey: 'settings.markdown',
    settings: [
      { id: 'markdown.slashCommands', labelKey: 'settings.markdown.slashCommands', type: 'toggle', storageKey: 'mellow.slashCommands.enabled', defaultValue: true, applyCommand: 'slash.toggleEnabled' },
    ],
  },
  {
    id: 'file',
    labelKey: 'settings.file',
    settings: [
      { id: 'file.showHidden', labelKey: 'settings.file.showHidden', type: 'toggle', storageKey: 'mellow.fileTree.showHidden', defaultValue: false, applyCommand: 'settings.fileTreeOptions' },
      { id: 'file.showNonMarkdown', labelKey: 'settings.file.showNonMarkdown', type: 'toggle', storageKey: 'mellow.fileTree.showNonMarkdown', defaultValue: false, applyCommand: 'settings.fileTreeOptions' },
      { id: 'file.autosave', labelKey: 'settings.file.autosave', type: 'toggle', storageKey: 'mellow.file.autosave', defaultValue: true, applyCommand: 'settings.autosave' },
    ],
  },
  {
    id: 'image',
    labelKey: 'settings.image',
    settings: [
      { id: 'image.assetDir', labelKey: 'settings.image.assetDir', type: 'text', storageKey: 'mellow.assetDir', defaultValue: 'assets', applyCommand: 'settings.image.assetDir' },
      { id: 'image.loadRemote', labelKey: 'settings.image.loadRemote', type: 'toggle', storageKey: 'mellow.image.loadRemote', defaultValue: false, descriptionKey: 'settings.image.loadRemoteDesc' },
    ],
  },
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    settings: [
      { id: 'appearance.theme', labelKey: 'settings.appearance.theme', type: 'select', storageKey: 'mellow.theme.settings', defaultValue: 'mellow-light', applyCommand: 'theme.apply.mellow-light' },
      { id: 'appearance.statusbar', labelKey: 'settings.appearance.statusbar', type: 'toggle', storageKey: 'mellow.statusbar.visible', defaultValue: true, applyCommand: 'settings.statusbar' },
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
      { id: 'export.placeholder', labelKey: 'settings.export.placeholder', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.export.placeholderDesc' },
    ],
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    settings: [
      { id: 'shortcuts.list', labelKey: 'settings.shortcuts.list', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.shortcuts.listDesc' },
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
  {
    id: 'updater',
    labelKey: 'settings.updater.label',
    settings: [
      { id: 'updater.channel', labelKey: 'settings.updater.channel', type: 'select', storageKey: 'mellow.updater.channel', defaultValue: 'stable',
        options: [
          { value: 'stable', labelKey: 'settings.updater.channel.stable' },
          { value: 'beta', labelKey: 'settings.updater.channel.beta' },
        ], descriptionKey: 'settings.updater.channelDesc' },
      { id: 'updater.checkOnStartup', labelKey: 'settings.updater.checkOnStartup', type: 'toggle', storageKey: 'mellow.updater.checkOnStartup', defaultValue: true },
      { id: 'updater.checkNow', labelKey: 'settings.updater.checkNow', type: 'action', storageKey: '', defaultValue: '', descriptionKey: 'settings.updater.checkNowDesc' },
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
