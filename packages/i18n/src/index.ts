/**
 * i18n —— 国际化（PRD §87/§12：默认简体中文，完整支持 en-US）。
 * 契约骨架 + 最小实现；完整 locale 架构属 Phase 6。
 */

export type Locale = 'zh-CN' | 'en-US';

export type MessageKey = string;

export interface Localization {
  locale: Locale;
  t(key: MessageKey, params?: Record<string, string | number>): string;
}

export class I18n implements Localization {
  constructor(
    private readonly messages: Record<Locale, Record<MessageKey, string>>,
    public locale: Locale,
  ) {}

  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  t(key: MessageKey, params?: Record<string, string | number>): string {
    const table = this.messages[this.locale] ?? {};
    let text = table[key] ?? this.messages['en-US'][key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }
}
