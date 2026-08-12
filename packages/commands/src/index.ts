/**
 * Unified Command Registry（PRD T-0309）。
 * 所有入口（Menu / Shortcut / Command Palette / Slash / Context Menu / Plugin）只能 dispatch Command，
 * 不在 UI 层重复实现业务逻辑。
 */

export type CommandSource = 'menu' | 'shortcut' | 'command-palette' | 'slash' | 'context-menu' | 'plugin';
export type CommandPlatform = 'mac' | 'win-linux';
export type CommandCategory = 'file' | 'edit' | 'view' | 'insert' | 'format' | 'search' | 'navigation' | 'workspace' | 'image' | 'system' | string;
export type LocaleCode = 'zh' | 'en' | string;

export interface LocalizedTitle {
  zh: string;
  en: string;
  [locale: string]: string;
}

export interface CommandShortcut {
  mac?: string;
  winLinux?: string;
}

export interface CommandAvailabilityContext {
  scope: 'global' | 'workspace' | 'document' | 'selection' | 'target';
  [key: string]: unknown;
}

export interface CommandContext {
  source: CommandSource;
  platform: CommandPlatform;
  locale: LocaleCode;
  documentPath: string | null;
  workspaceRoot: string | null;
  hasSelection: boolean;
  targetPath?: string | null;
  payload?: unknown;
}

export interface Command {
  id: string;
  localizedTitle: LocalizedTitle;
  /** Backward-compatible alias for older callers/tests. Prefer localizedTitle. */
  title?: LocalizedTitle;
  category: CommandCategory;
  shortcut?: CommandShortcut;
  enabled: (context: CommandContext) => boolean;
  execute: (context: CommandContext) => Promise<void> | void;
  context: CommandAvailabilityContext;
}

export interface RegisterOptions {
  source?: Extract<CommandSource, 'plugin'>;
  replace?: boolean;
}

export function createCommandContext(input: Partial<CommandContext> & { source: CommandSource }): CommandContext {
  return {
    source: input.source,
    platform: input.platform ?? 'win-linux',
    locale: input.locale ?? 'zh',
    documentPath: input.documentPath ?? null,
    workspaceRoot: input.workspaceRoot ?? null,
    hasSelection: input.hasSelection ?? false,
    targetPath: input.targetPath ?? null,
    payload: input.payload,
  };
}

const ORDER = ['Ctrl', 'Cmd', 'Alt', 'Shift'];

export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'control' || lower === 'ctrl') return 'Ctrl';
      if (lower === 'command' || lower === 'cmd' || lower === 'meta') return 'Cmd';
      if (lower === 'option' || lower === 'alt') return 'Alt';
      if (lower === 'shift') return 'Shift';
      return part.length === 1 ? part.toUpperCase() : part;
    });
  const mods = parts.filter((part) => ORDER.includes(part)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const keys = parts.filter((part) => !ORDER.includes(part));
  return [...mods, ...keys].join('+');
}

export function titleFor(command: Command, locale: LocaleCode): string {
  return command.localizedTitle[locale] ?? command.localizedTitle.zh ?? command.localizedTitle.en ?? command.id;
}

const PINYIN_INITIALS: Record<string, string> = {
  全: 'q', 局: 'j', 搜: 's', 索: 's', 保: 'b', 存: 'c', 新: 'x', 建: 'j', 打: 'd', 开: 'k', 命: 'm', 令: 'l', 面: 'm', 板: 'b', 文: 'w', 件: 'j', 夹: 'j', 关: 'g', 闭: 'b', 重: 'c', 名: 'm', 移: 'y', 动: 'd', 复: 'f', 制: 'z', 撤: 'c', 销: 'x', 路: 'l', 径: 'j', 大: 'd', 纲: 'g', 标: 'b', 签: 'q', 页: 'y', 右: 'y', 侧: 'c', 回: 'h', 收: 's', 站: 'z', 快: 'k', 速: 's'
};

function initials(value: string): string {
  return Array.from(value).map((ch) => PINYIN_INITIALS[ch] ?? (/[a-z0-9]/i.test(ch) ? ch[0].toLowerCase() : '')).join('');
}

function fuzzyScore(candidate: string, query: string): number | null {
  const q = Array.from(query.trim().toLowerCase());
  if (q.length === 0) return 1;
  const c = Array.from(candidate.toLowerCase());
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < c.length && qi < q.length; i += 1) {
    if (c[i] === q[qi]) {
      streak += 1;
      score += 10 + streak * 2;
      if (i === 0 || ['.', ':', '-', ' ', '/'].includes(c[i - 1])) score += 5;
      qi += 1;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score - c.length * 0.04 : null;
}

export interface CommandPaletteItem {
  command: Pick<Command, 'id'> & Partial<Command>;
  title: string;
  enabled: boolean;
  score: number;
  recentRank?: number;
}

export function commandPaletteSearch(commands: Command[], query: string, context: CommandContext, locale: LocaleCode, recentIds: string[] = []): CommandPaletteItem[] {
  const recent = new Map(recentIds.map((id, index) => [id, index]));
  return commands
    .flatMap((command): CommandPaletteItem[] => {
      const title = titleFor(command, locale);
      const haystacks = [title, command.id, command.category, initials(title)].filter(Boolean);
      const scores = haystacks.map((h) => fuzzyScore(h, query)).filter((v): v is number => v !== null);
      if (scores.length === 0) return [];
      const recentRank = recent.get(command.id);
      const score = Math.max(...scores) + (recentRank === undefined ? 0 : 80 - recentRank * 3);
      return [{ command, title, enabled: command.enabled(context), score, recentRank }];
    })
    .sort((a, b) => b.score - a.score || Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title));
}

export class CommandPaletteModel {
  selectedIndex = 0;
  navigate(items: CommandPaletteItem[], key: 'up' | 'down' | 'enter'): { selectedIndex: number; commandId?: string } {
    if (items.length === 0) {
      this.selectedIndex = 0;
      return { selectedIndex: 0 };
    }
    if (key === 'down') this.selectedIndex = Math.min(items.length - 1, this.selectedIndex + 1);
    if (key === 'up') this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    if (key === 'enter') {
      const item = items[this.selectedIndex];
      if (item?.enabled) return { selectedIndex: this.selectedIndex, commandId: item.command.id };
      const next = items.findIndex((candidate, index) => index >= this.selectedIndex && candidate.enabled);
      if (next >= 0) {
        this.selectedIndex = next;
        return { selectedIndex: next, commandId: items[next].command.id };
      }
    }
    return { selectedIndex: this.selectedIndex };
  }
}

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Omit<Command, 'localizedTitle'> & { localizedTitle?: LocalizedTitle; title?: LocalizedTitle }, options: RegisterOptions = {}): void {
    if (!command.id.trim()) throw new Error('Command id is required');
    const localizedTitle = command.localizedTitle ?? command.title;
    if (localizedTitle === undefined) throw new Error(`Command ${command.id} requires localized title`);
    if (!command.category) throw new Error(`Command ${command.id} requires category`);
    if (typeof command.enabled !== 'function') throw new Error(`Command ${command.id} requires enabled`);
    if (typeof command.execute !== 'function') throw new Error(`Command ${command.id} requires execute`);
    if (command.context === undefined) throw new Error(`Command ${command.id} requires context`);
    if (this.commands.has(command.id) && !options.replace) throw new Error(`Duplicate command id: ${command.id}`);
    this.commands.set(command.id, { ...command, localizedTitle });
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  enabled(context: CommandContext): Command[] {
    return this.all().filter((command) => command.enabled(context));
  }

  findByShortcut(shortcut: string, platform: CommandPlatform): Command | undefined {
    const normalized = normalizeShortcut(shortcut);
    return this.all().find((command) => {
      const candidate = platform === 'mac' ? command.shortcut?.mac : command.shortcut?.winLinux;
      return candidate !== undefined && normalizeShortcut(candidate) === normalized;
    });
  }

  async dispatch(id: string, context: CommandContext): Promise<boolean> {
    const command = this.commands.get(id);
    if (command === undefined) return false;
    if (!command.enabled(context)) return false;
    await command.execute(context);
    return true;
  }

  /** Backward-compatible alias. */
  async run(id: string, context: CommandContext): Promise<boolean> {
    return this.dispatch(id, context);
  }
}

export interface CommandEntryPoint {
  source: CommandSource;
  dispatch(id: string, context?: Partial<CommandContext>): Promise<boolean>;
}

export function createCommandEntryPoint(registry: CommandRegistry, source: CommandSource, baseContext: () => Omit<CommandContext, 'source'>): CommandEntryPoint {
  return {
    source,
    dispatch: (id, context = {}) => registry.dispatch(id, { ...baseContext(), ...context, source }),
  };
}
