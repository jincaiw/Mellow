/**
 * commands —— 命令注册与执行（PRD §99 Command Palette 的基础）。
 * 契约骨架；命令注册表集中管理键盘/菜单/命令面板语义。
 */

export interface CommandContext {
  documentPath: string | null;
  hasSelection: boolean;
}

export interface Command {
  id: string;
  title: string;
  /** 快捷键语义（平台无关，如 'Mod-B'；适配层映射 Cmd/Ctrl） */
  shortcut?: string;
  run(context: CommandContext): Promise<void> | void;
  enabled?(context: CommandContext): boolean;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()];
  }

  async run(id: string, context: CommandContext): Promise<boolean> {
    const command = this.commands.get(id);
    if (command === undefined) return false;
    if (command.enabled !== undefined && !command.enabled(context)) return false;
    await command.run(context);
    return true;
  }
}
