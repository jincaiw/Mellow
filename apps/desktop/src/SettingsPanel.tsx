/**
 * Settings 面板（T-0605 Settings；desktop-ui-design-spec §12）。
 *
 * 结构：左栏一级分类（180–220px）+ 右内容（max 720px）。
 * - settings schema shared（packages/settings）：UI 只按 schema 渲染，不复制定义；
 * - live apply where safe：值修改即持久化并调用 apply 回调（不要求重启）；
 * - searchable：搜索跨分类按 labelKey 过滤（P1，desktop-ui-design-spec §12）；
 * - AI 页面默认不存在：仅当 aiEnabled（AI extension 启用）时追加「AI」分类。
 */

import { useEffect, useState } from 'react';
import { SETTINGS_SECTIONS } from '../../../packages/settings/src';
import type { SettingDefinition, SettingsSection } from '../../../packages/settings/src';
import type { ThemeSettings } from '../../../packages/themes/src';

export interface SettingsPanelProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  onClose: () => void;
  applySetting: (def: SettingDefinition, value: string | number | boolean) => void;
  /** 当前语言设置（用于 select 高亮） */
  currentLanguage: string;
  /** 当前主题（用于 select 高亮） */
  themeSettings: ThemeSettings;
  /** AI extension 是否启用（默认 false → AI 分类不出现） */
  aiEnabled: boolean;
  /** 快捷键列表（分类「快捷键」；P2-2.6 起支持点击录制自定义键位） */
  shortcuts: Array<{ id: string; title: string; shortcut?: string }>;
  /** P2-2.6 录制回调：accelerator = null 表示恢复 schema 默认键位 */
  onShortcutChange?: (commandId: string, accelerator: string | null) => void;
}

/** P2-2.6 可编辑快捷键列表：点击键位进入录制态（capture-phase keydown 捕获组合键）；
 *  Esc 取消录制；Backspace/Delete 恢复默认；无修饰键的单击不生效（防止覆盖文本输入键）。 */
function ShortcutList({ t, shortcuts, onShortcutChange }: {
  t: (key: string) => string;
  shortcuts: Array<{ id: string; title: string; shortcut?: string }>;
  onShortcutChange?: (commandId: string, accelerator: string | null) => void;
}) {
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    if (recordingId === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecordingId(null);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        onShortcutChange?.(recordingId, null);
        setRecordingId(null);
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
      // 物理键位归一（与 dispatchShortcut 的 code 优先策略一致；布局无关）
      const normalizedKey = event.code.startsWith('Key') ? event.code.slice(3)
        : event.code.startsWith('Digit') ? event.code.slice(5)
        : event.key.length === 1 ? event.key.toUpperCase()
        : event.key;
      const parts = [event.ctrlKey ? 'Ctrl' : '', event.metaKey ? 'Cmd' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', normalizedKey].filter(Boolean).join('+');
      onShortcutChange?.(recordingId, parts);
      setRecordingId(null);
    };
    // capture-phase：抢在 App 全局 keydown（bubble）前消费，避免录制时误触发命令
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recordingId, onShortcutChange]);

  return (
    <div className="settings-shortcuts">
      {shortcuts.map((item) => (
        <div key={item.id} className="settings-row">
          <span className="settings-row-label">{item.title}</span>
          <button
            type="button"
            className={`settings-shortcut-edit${recordingId === item.id ? ' recording' : ''}`}
            onClick={() => setRecordingId(item.id)}
            title={t('settings.shortcuts.editHint')}
            aria-label={`${item.title}: ${t('settings.shortcuts.editHint')}`}
          >
            {recordingId === item.id ? t('settings.shortcuts.recording') : (item.shortcut !== undefined && item.shortcut !== '' ? item.shortcut : t('settings.shortcuts.none'))}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SettingsPanel(props: SettingsPanelProps) {
  const { t, onClose, applySetting, currentLanguage, themeSettings, aiEnabled, shortcuts, onShortcutChange } = props;
  const [active, setActive] = useState<SettingsSection['id']>('general');
  const [query, setQuery] = useState('');

  const sections: SettingsSection[] = aiEnabled
    ? [...SETTINGS_SECTIONS, {
        id: 'ai' as SettingsSection['id'],
        labelKey: 'settings.ai',
        settings: [
          { id: 'ai.panel', labelKey: 'settings.ai.panel', type: 'toggle', storageKey: 'mellow.ai.panel', defaultValue: true, applyCommand: 'settings.aiPanel' },
        ],
      }]
    : SETTINGS_SECTIONS;

  const section = sections.find((s) => s.id === active) ?? sections[0];

  // 设置搜索（P1）：跨分类按 labelKey 过滤
  const q = query.trim().toLowerCase();
  const searchMode = q.length > 0;
  const searchResults = searchMode
    ? sections.flatMap((s) =>
        s.settings
          .filter((def) => t(def.labelKey).toLowerCase().includes(q))
          .map((def) => ({ section: s, def })),
      )
    : [];

  const readValue = (def: SettingDefinition): string | number | boolean => {
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
  };

  const renderControl = (def: SettingDefinition, value: string | number | boolean) => {
    const onChange = (next: string | number | boolean): void => {
      try {
        localStorage.setItem(def.storageKey, typeof next === 'boolean' ? (next ? '1' : '0') : String(next));
      } catch {
        /* 忽略 */
      }
      applySetting(def, next);
    };
    switch (def.type) {
      case 'toggle':
        return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
      case 'number':
        return (
          <input
            type="number"
            min={def.min}
            max={def.max}
            step={def.step}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        );
      case 'select': {
        // 特殊：language / theme 从应用 state 取当前值
        let selected = String(value);
        if (def.id === 'general.language') selected = currentLanguage;
        if (def.id === 'appearance.theme') selected = `${themeSettings.mode}:${themeSettings.mode === 'system' ? (themeSettings.darkThemeId ?? themeSettings.lightThemeId) : (themeSettings.mode === 'dark' ? themeSettings.darkThemeId : themeSettings.lightThemeId)}`;
        return (
          <select value={selected} onChange={(e) => onChange(e.target.value)}>
            {def.options?.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        );
      }
      case 'text':
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'action':
        // 动作型设置（如「打开主题文件夹」）：按钮触发 applyCommand，不持久化
        return (
          <button type="button" className="settings-action-button" onClick={() => applySetting(def, true)}>
            {t('settings.action.open')}
          </button>
        );
      default:
        return <span className="settings-action-hint">—</span>;
    }
  };

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <span className="settings-title">{t('settings.title')}</span>
          <input
            className="settings-search"
            type="search"
            placeholder={t('settings.search')}
            aria-label={t('settings.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="settings-close" onClick={onClose} title={t('settings.close')}>✕</button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label={t('settings.navLabel')}>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item ${s.id === section.id ? 'active' : ''}`}
                onClick={() => setActive(s.id)}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {searchMode ? (
              <>
                <h2 className="settings-section-title">{t('settings.searchResults', { n: searchResults.length })}</h2>
                {searchResults.map(({ section: s, def }) => (
                  <div key={def.id} className="settings-row">
                    <span className="settings-row-label">{t(def.labelKey)}</span>
                    <span className="settings-row-value settings-shortcut">{t(s.labelKey)}</span>
                  </div>
                ))}
                {searchResults.length === 0 && <div className="settings-empty">{t('settings.noResults')}</div>}
              </>
            ) : (
              <>
                <h2 className="settings-section-title">{t(section.labelKey)}</h2>
                {section.id === 'shortcuts' && (
                  <ShortcutList t={t} shortcuts={shortcuts} onShortcutChange={onShortcutChange} />
                )}
                {section.settings.map((def) => (
                  <div key={def.id} className="settings-row">
                    <span className="settings-row-label">{t(def.labelKey)}</span>
                    <span className="settings-row-control">{renderControl(def, readValue(def))}</span>
                    {def.descriptionKey !== undefined && (
                      <span className="settings-row-desc">{t(def.descriptionKey)}</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
