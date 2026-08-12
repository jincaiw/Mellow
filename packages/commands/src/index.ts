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
