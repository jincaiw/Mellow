/**
 * i18n —— 国际化（PRD §87/§88/§12：默认简体中文；完整支持 en-US）。
 *
 * 能力：
 * - ICU Message 子集：{var} 插值、plural、select、number、date、嵌套分支、`{{`/`}}` 转义；
 * - plural：zh-CN 恒 other；en-US one/other（规则可扩展）；
 * - date / number：基于 Intl（按 locale 格式化）；
 * - keyboard labels：平台感知（mac ⌘⇧⌥⌃ / win-linux 原样）；
 * - RTL-ready：localeDir() 支持未来 RTL（正式语言 P2）；
 * - completeness：两 locale key 集合一致（100%）检查。
 *
 * 平台约束：零 OS / DOM 依赖（纯函数），可在 node 测试。
 */

export type Locale = 'zh-CN' | 'en-US';
export type LocaleSetting = Locale | 'system';

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALES: readonly Locale[] = ['zh-CN', 'en-US'];

export type Messages = Record<string, string>;
export type MessageCatalog = Record<Locale, Messages>;

// ── ICU 解析 ────────────────────────────────────────────────

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** plural 规则：zh 恒 other；en 仅 one/other（ICU 简表） */
export function pluralRule(locale: Locale, n: number): PluralCategory {
  if (locale === 'en-US') {
    return n === 1 ? 'one' : 'other';
  }
  return 'other';
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(locale: Locale, value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(value instanceof Date ? value : new Date(value));
}

/** 未来 RTL 架构：V1 语言均为 ltr，预留 rtl 语言 */
export function localeDir(locale: string): 'ltr' | 'rtl' {
  return /^(ar|he|fa|ur)(-|$)/i.test(locale) ? 'rtl' : 'ltr';
}

function findClose(template: string, open: number): number {
  let depth = 0;
  for (let i = open + 1; i < template.length; i += 1) {
    const ch = template[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

interface OptionMap {
  [key: string]: string;
}

function parseOptions(source: string): OptionMap {
  const options: OptionMap = {};
  let i = 0;
  while (i < source.length) {
    while (i < source.length && (source[i] === ' ' || source[i] === ',')) i += 1;
    if (i >= source.length) break;
    let key = '';
    while (i < source.length && source[i] !== '{') {
      key += source[i];
      i += 1;
    }
    if (i >= source.length) break;
    const close = findClose(source, i);
    if (close === -1) break;
    options[key.trim()] = source.slice(i + 1, close);
    i = close + 1;
  }
  return options;
}

function evalExpr(expr: string, vars: Record<string, string | number> | undefined, locale: Locale): string {
  const parts = expr.split(',').map((part) => part.trim());
  const [name, type, ...rest] = parts;
  if (name === '') return '';
  if (type === undefined) {
    const value = vars?.[name];
    return value === undefined ? '' : String(value);
  }
  switch (type) {
    case 'number': {
      const value = Number(vars?.[name]);
      return Number.isFinite(value) ? formatNumber(locale, value) : '';
    }
    case 'date': {
      const value = vars?.[name];
      const short: Record<string, Intl.DateTimeFormatOptions> = { short: { year: 'numeric', month: 'numeric', day: 'numeric' }, medium: { year: 'numeric', month: 'short', day: 'numeric' } };
      const fmt = rest[0];
      const options = short[fmt] ?? {};
      return value === undefined ? '' : formatDate(locale, new Date(Number(value)), options);
    }
    case 'plural': {
      const count = Number(vars?.[name]);
      const options = parseOptions(rest.join(','));
      const branch = options[pluralRule(locale, count)] ?? options.other ?? '';
      return parseTemplate(branch.replace(/#/g, formatNumber(locale, count)), { ...vars, count }, locale);
    }
    case 'select': {
      const value = String(vars?.[name] ?? '');
      const options = parseOptions(rest.join(','));
      return parseTemplate(options[value] ?? options.other ?? '', vars, locale);
    }
    default:
      return '';
  }
}

export function formatMessage(template: string, vars?: Record<string, string | number>, locale: Locale = DEFAULT_LOCALE): string {
  return parseTemplate(template, vars, locale);
}

function parseTemplate(template: string, vars: Record<string, string | number> | undefined, locale: Locale): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === '{') {
      if (template[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      const close = findClose(template, i);
      if (close === -1) {
        out += template.slice(i);
        break;
      }
      out += evalExpr(template.slice(i + 1, close), vars, locale);
      i = close + 1;
      continue;
    }
    if (ch === '}' && template[i + 1] === '}') {
      out += '}';
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// ── 键盘标签 ────────────────────────────────────────────────

const MAC_KEYS: Record<string, string> = {
  Cmd: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
};

const MAC_ORDER = ['Shift', 'Ctrl', 'Alt', 'Cmd', 'Option'];

/** 平台感知键盘标签（mac 符号 / win-linux 文本） */
export function keyboardLabel(platform: 'mac' | 'win-linux', shortcut: string): string {
  if (platform === 'win-linux') return shortcut;
  const parts = shortcut.split('+');
  const symbolName = (symbol: string): string => Object.keys(MAC_KEYS).find((key) => MAC_KEYS[key] === symbol) ?? '';
  const mods = parts.slice(0, -1)
    .map((part) => MAC_KEYS[part] ?? part)
    .sort((a, b) => {
      const ai = symbolName(a) === '' ? 99 : MAC_ORDER.indexOf(symbolName(a));
      const bi = symbolName(b) === '' ? 99 : MAC_ORDER.indexOf(symbolName(b));
      return ai - bi;
    });
  const key = parts[parts.length - 1];
  return [...mods, key].join('');
}

// ── Locale 解析 ─────────────────────────────────────────────

/** 系统语言 → Mellow locale（zh 系列 → zh-CN；其余 → en-US） */
export function detectSystemLocale(systemLang?: string): Locale {
  const lang = systemLang ?? (typeof navigator !== 'undefined' ? navigator.language : '');
  return /^zh/i.test(lang) ? 'zh-CN' : 'en-US';
}

/** 设置 → 实际 locale（system = 跟随系统；首次启动默认 zh-CN） */
export function resolveLocale(setting: LocaleSetting, systemLang?: string): Locale {
  return setting === 'system' ? detectSystemLocale(systemLang) : setting;
}

// ── 完整性与 I18n 实例 ─────────────────────────────────────

export interface CompletenessReport {
  complete: boolean;
  missing: Partial<Record<Locale, string[]>>;
}

/** 检查两 locale key 集合完全一致（completeness = 100%） */
export function completenessReport(catalog: MessageCatalog): CompletenessReport {
  const [a, b] = LOCALES;
  const keysA = new Set(Object.keys(catalog[a]));
  const keysB = new Set(Object.keys(catalog[b]));
  const missing: CompletenessReport['missing'] = {};
  const missingInA = [...keysB].filter((key) => !keysA.has(key));
  const missingInB = [...keysA].filter((key) => !keysB.has(key));
  if (missingInA.length > 0) missing[a] = missingInA;
  if (missingInB.length > 0) missing[b] = missingInB;
  return { complete: missingInA.length === 0 && missingInB.length === 0, missing };
}

export interface I18nInstance {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: string, params?: Record<string, string | number>): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
}

export function createI18n(catalog: MessageCatalog, locale: Locale = DEFAULT_LOCALE): I18nInstance {
  let current = locale;
  return {
    get locale(): Locale {
      return current;
    },
    setLocale(next: Locale): void {
      current = next;
    },
    t(key, params) {
      const table = catalog[current] ?? {};
      let template = table[key] ?? catalog['en-US'][key] ?? key;
      if (params) {
        template = formatMessage(template, params, current);
      }
      return template;
    },
    formatNumber(value, options) {
      return formatNumber(current, value, options);
    },
    formatDate(value, options) {
      return formatDate(current, value, options);
    },
  };
}
