/**
 * Menu / Command / Shortcut 单一真源（V4.0 方案 P1-1.1 / P1-1.3 / P1-1.5）。
 *
 * 架构（§7.4 硬规则）：
 *  1. Command ID 只定义一次 —— 菜单条目通过 id 引用前端 CommandRegistry 的命令；
 *  2. 快捷键只定义一次 —— 菜单 accelerator 在本文件的 `shortcut` 三平台字段声明，
 *     `SCHEMA_SHORTCUTS` 派生注入 App.tsx CommandRegistry（键盘与菜单同源）；
 *     仅键盘（无菜单条目/菜单无 accelerator）的快捷键仍留在命令定义处，属补充键位；
 *  3. 菜单顺序由本声明表唯一确定，tests/parity/verify-menu-contract.mjs 做 schema diff；
 *  4. 主题菜单从 Theme Registry 派生 —— schema 只声明 `dynamic: 'themes'` 占位，
 *     `toNativeMenuSpec` 注入 BUILTIN_THEMES；Rust 不含任何主题列表；
 *  5. Check State 由 spec 携带（checkedFrom 在此声明来源），Rust 只做 materialization；
 *  6. Rust menu.rs 降级为平台 Adapter：接收 NativeMenuSpec 递归构建 muda 菜单。
 */

import type { CommandShortcut } from './index';

// ── Schema 声明类型 ──────────────────────────────────────────────

/** OS 预定义菜单项（PredefinedMenuItem，行为由系统提供，只可定制文案）。 */
export type MenuPredefinedKind =
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'
  | 'about' | 'services' | 'hide' | 'hideOthers' | 'showAll' | 'quit';

export interface MenuCommandEntry {
  kind: 'command';
  /** 前端 CommandRegistry 命令 id（点击后经 `mellow-menu-command` 事件分发）。 */
  id: string;
  /** i18n `menu.*` 文案 key（zh/en 双语，见 packages/i18n/src/messages.ts）。 */
  labelKey: string;
  /** 菜单原生 accelerator 三平台（空缺 = 该平台无原生键位，退化为前端 keydown）。 */
  shortcut?: CommandShortcut;
  /** CheckMenuItem 选中态来源（缺省 = 普通 MenuItem）。 */
  checkedFrom?: string;
  /** 仅 macOS 菜单装配（如应用菜单、mac 专属 accelerator 条目）。 */
  macOnly?: boolean;
  /** 仅 Win/Linux 菜单装配（macOS 缺省不显示 —— B1：mac Typora 无「全部关闭」菜单项）。 */
  winLinuxOnly?: boolean;
  /** 仅 debug 构建装配（如 DevTools）。 */
  debugOnly?: boolean;
}

export interface MenuPredefinedEntry {
  kind: 'predefined';
  predefined: MenuPredefinedKind;
  /** OS 预定义项的显示文案（about/services/hide 等可本地化；undo/redo 等同理）。 */
  labelKey?: string;
}

export interface MenuSeparatorEntry {
  kind: 'separator';
}

export interface MenuSubmenuEntry {
  kind: 'submenu';
  id: string;
  labelKey: string;
  entries: MenuEntry[];
}

/** 动态条目：spec 物化时展开。recent-files → 最近文件列表；themes → Theme Registry 派生。 */
export interface MenuDynamicEntry {
  kind: 'dynamic';
  dynamic: 'recent-files' | 'themes';
}

export type MenuEntry = MenuCommandEntry | MenuPredefinedEntry | MenuSeparatorEntry | MenuSubmenuEntry | MenuDynamicEntry;

export interface MenuSchemaRoot {
  id: string;
  labelKey: string;
  macOnly?: boolean;
  entries: MenuEntry[];
}

// ── MENU_SCHEMA：菜单树声明表（顺序 = 三平台最终顺序）────────────

export const MENU_SCHEMA: readonly MenuSchemaRoot[] = [
  // ── 应用菜单（仅 macOS）─────────────────────────────────────
  { id: 'app', labelKey: 'menu.top.mellow', macOnly: true, entries: [
    { kind: 'predefined', predefined: 'about', labelKey: 'menu.top.about' },
    { kind: 'separator' },
    { kind: 'command', id: 'settings.open', labelKey: 'menu.top.settings', shortcut: { mac: 'Cmd+,' } },
    { kind: 'command', id: 'updater.check', labelKey: 'menu.top.checkUpdate' },
    { kind: 'separator' },
    { kind: 'predefined', predefined: 'services', labelKey: 'menu.top.services' },
    { kind: 'separator' },
    { kind: 'predefined', predefined: 'hide', labelKey: 'menu.top.hide' },
    { kind: 'predefined', predefined: 'hideOthers', labelKey: 'menu.top.hideOthers' },
    { kind: 'predefined', predefined: 'showAll', labelKey: 'menu.top.showAll' },
    { kind: 'separator' },
    { kind: 'predefined', predefined: 'quit', labelKey: 'menu.top.quit' },
  ] },

  // ── 文件（§7.2：31 槽位契约）─────────────────────────────────
  { id: 'file', labelKey: 'menu.top.file', entries: [
    // B1（SDI）：⌘N = 新建（新窗口空白文档）；「新建标签页」随多标签能力移除
    { kind: 'command', id: 'file.new', labelKey: 'menu.file.new', shortcut: { mac: 'Cmd+N', winLinux: 'Ctrl+N' } },
    { kind: 'command', id: 'file.newWindow', labelKey: 'menu.file.newWindow', shortcut: { mac: 'Cmd+Shift+N', winLinux: 'Ctrl+Shift+N' } },
    { kind: 'separator' },
    { kind: 'command', id: 'file.open', labelKey: 'menu.file.open', shortcut: { mac: 'Cmd+O', winLinux: 'Ctrl+O' } },
    { kind: 'submenu', id: 'file.recent', labelKey: 'menu.file.recent', entries: [
      // B1（SDI）：tabs.reopenClosed 移除（窗口关闭后状态随之结束；跨窗口重开待
      // Phase 4 窗口注册表落地后按 macOS「Reopen Closed File」真值恢复）
      { kind: 'dynamic', dynamic: 'recent-files' },
      { kind: 'separator' },
      { kind: 'command', id: 'recent.clear', labelKey: 'menu.file.recentClear' },
    ] },
    { kind: 'command', id: 'quickOpen.open', labelKey: 'menu.quickOpen.open', shortcut: { mac: 'Cmd+Shift+O', winLinux: 'Ctrl+P' } },
    { kind: 'command', id: 'workspace.openFolder', labelKey: 'menu.workspace.openFolder' },
    { kind: 'separator' },
    { kind: 'command', id: 'file.info', labelKey: 'menu.file.info' },
    { kind: 'command', id: 'file.revealInFileList', labelKey: 'menu.file.revealInFileList' },
    { kind: 'command', id: 'file.revealInFileTree', labelKey: 'menu.file.revealInFileTree' },
    { kind: 'command', id: 'file.revealInFinder', labelKey: 'menu.file.reveal' },
    { kind: 'separator' },
    { kind: 'command', id: 'file.moveTo', labelKey: 'menu.file.moveTo' },
    { kind: 'command', id: 'file.trash', labelKey: 'menu.file.trash' },
    { kind: 'separator' },
    // B1（SDI）：⌘W = 关闭窗口（mac Typora 真值：File→Close = performClose: 关窗口，非关标签）
    { kind: 'command', id: 'file.closeWindow', labelKey: 'menu.file.closeWindow', shortcut: { mac: 'Cmd+W', winLinux: 'Ctrl+W' } },
    // B1（SDI）：file.closeAll 仅 Win/Linux 保留（macOS Typora 1.14.9 File 菜单无「全部关闭」，
    // 资源中无 Close All 文案/动作 —— sdi-truth-table-v1.md 0.8 行）
    { kind: 'command', id: 'file.closeAll', labelKey: 'menu.file.closeAll', shortcut: { mac: 'Cmd+Alt+W', winLinux: 'Ctrl+Shift+W' }, winLinuxOnly: true },
    { kind: 'separator' },
    { kind: 'command', id: 'file.save', labelKey: 'menu.file.save', shortcut: { mac: 'Cmd+S', winLinux: 'Ctrl+S' } },
    { kind: 'command', id: 'file.saveAs', labelKey: 'menu.file.saveAs', shortcut: { mac: 'Cmd+Shift+S', winLinux: 'Ctrl+Shift+S' } },
    { kind: 'command', id: 'file.saveAll', labelKey: 'menu.file.saveAll', shortcut: { mac: 'Cmd+Alt+S', winLinux: 'Ctrl+Alt+S' } },
    { kind: 'command', id: 'file.reloadFromDisk', labelKey: 'menu.file.reloadFromDisk' },
    { kind: 'separator' },
    { kind: 'command', id: 'file.import', labelKey: 'menu.file.import' },
    { kind: 'submenu', id: 'file.export', labelKey: 'menu.top.export', entries: [
      { kind: 'command', id: 'export.pdf', labelKey: 'menu.export.pdf', shortcut: { mac: 'Ctrl+Cmd+P' } },
      { kind: 'command', id: 'export.html', labelKey: 'menu.export.html' },
      { kind: 'command', id: 'export.htmlPlain', labelKey: 'menu.export.htmlPlain' },
      { kind: 'command', id: 'export.image', labelKey: 'menu.export.image' },
      { kind: 'separator' },
      { kind: 'command', id: 'export.docx', labelKey: 'menu.export.docx' },
      { kind: 'command', id: 'export.odt', labelKey: 'menu.export.odt' },
      { kind: 'command', id: 'export.rtf', labelKey: 'menu.export.rtf' },
      { kind: 'command', id: 'export.epub', labelKey: 'menu.export.epub' },
      { kind: 'command', id: 'export.latex', labelKey: 'menu.export.latex' },
      { kind: 'command', id: 'export.mediawiki', labelKey: 'menu.export.mediawiki' },
      { kind: 'command', id: 'export.rst', labelKey: 'menu.export.rst' },
      { kind: 'command', id: 'export.textile', labelKey: 'menu.export.textile' },
      { kind: 'command', id: 'export.opml', labelKey: 'menu.export.opml' },
      { kind: 'separator' },
      { kind: 'command', id: 'export.repeat', labelKey: 'menu.export.repeat' },
    ] },
    { kind: 'command', id: 'file.pageSetup', labelKey: 'menu.file.pageSetup' },
    { kind: 'command', id: 'file.print', labelKey: 'menu.file.print', shortcut: { mac: 'Cmd+P', winLinux: 'Ctrl+Alt+P' } },
    { kind: 'separator' },
    { kind: 'command', id: 'file.openSnapshotsFolder', labelKey: 'menu.file.openSnapshotsFolder' },
  ] },

  // ── 编辑 ────────────────────────────────────────────────────
  { id: 'edit', labelKey: 'menu.top.edit', entries: [
    { kind: 'predefined', predefined: 'undo', labelKey: 'menu.top.undo' },
    { kind: 'predefined', predefined: 'redo', labelKey: 'menu.top.redo' },
    { kind: 'separator' },
    { kind: 'predefined', predefined: 'cut', labelKey: 'menu.top.cut' },
    { kind: 'predefined', predefined: 'copy', labelKey: 'menu.top.copy' },
    { kind: 'command', id: 'edit.copyImage', labelKey: 'menu.edit.copyImage' },
    { kind: 'predefined', predefined: 'paste', labelKey: 'menu.top.paste' },
    { kind: 'command', id: 'edit.pasteMatchStyle', labelKey: 'menu.edit.pasteMatchStyle', shortcut: { mac: 'Cmd+Alt+Shift+V' } },
    { kind: 'separator' },
    { kind: 'command', id: 'edit.copyPlain', labelKey: 'menu.edit.copyPlain' },
    { kind: 'command', id: 'edit.copyMarkdown', labelKey: 'menu.edit.copyMarkdown', shortcut: { mac: 'Cmd+Shift+C', winLinux: 'Ctrl+Shift+C' } },
    { kind: 'command', id: 'edit.copyHtmlSource', labelKey: 'menu.edit.copyHtmlSource' },
    { kind: 'command', id: 'edit.copyWithoutTheme', labelKey: 'menu.edit.copyWithoutTheme' },
    { kind: 'command', id: 'edit.pastePlain', labelKey: 'menu.edit.pastePlain', shortcut: { mac: 'Cmd+Shift+V', winLinux: 'Ctrl+Shift+V' } },
    { kind: 'separator' },
    { kind: 'submenu', id: 'edit.select', labelKey: 'menu.edit.selectMenu', entries: [
      { kind: 'predefined', predefined: 'selectAll', labelKey: 'menu.top.selectAll' },
      { kind: 'command', id: 'edit.selectParagraph', labelKey: 'menu.edit.selectParagraph', shortcut: { mac: 'Cmd+Alt+P' } },
      { kind: 'command', id: 'edit.selectLine', labelKey: 'menu.edit.selectLine', shortcut: { mac: 'Cmd+L', winLinux: 'Ctrl+L' } },
      { kind: 'command', id: 'edit.selectFormatSpan', labelKey: 'menu.edit.selectFormatSpan', shortcut: { mac: 'Cmd+E', winLinux: 'Ctrl+E' } },
      { kind: 'command', id: 'edit.selectWord', labelKey: 'menu.edit.selectWord', shortcut: { mac: 'Cmd+D', winLinux: 'Ctrl+D' } },
      { kind: 'separator' },
      { kind: 'command', id: 'edit.gotoDocStart', labelKey: 'menu.edit.gotoDocStart', shortcut: { mac: 'Cmd+ArrowUp', winLinux: 'Ctrl+Home' } },
      { kind: 'command', id: 'edit.gotoSelection', labelKey: 'menu.edit.gotoSelection', shortcut: { mac: 'Cmd+J', winLinux: 'Ctrl+J' } },
      { kind: 'command', id: 'edit.gotoDocEnd', labelKey: 'menu.edit.gotoDocEnd', shortcut: { mac: 'Cmd+ArrowDown', winLinux: 'Ctrl+End' } },
      { kind: 'separator' },
      { kind: 'command', id: 'edit.gotoLineStart', labelKey: 'menu.edit.gotoLineStart', shortcut: { mac: 'Ctrl+A', winLinux: 'Home' } },
      { kind: 'command', id: 'edit.gotoLineEnd', labelKey: 'menu.edit.gotoLineEnd', shortcut: { mac: 'Cmd+ArrowRight', winLinux: 'End' } },
    ] },
    { kind: 'command', id: 'edit.moveLineUp', labelKey: 'menu.edit.moveLineUp', shortcut: { mac: 'Alt+ArrowUp', winLinux: 'Alt+ArrowUp' } },
    { kind: 'command', id: 'edit.moveLineDown', labelKey: 'menu.edit.moveLineDown', shortcut: { mac: 'Alt+ArrowDown', winLinux: 'Alt+ArrowDown' } },
    { kind: 'submenu', id: 'edit.deleteRange', labelKey: 'menu.edit.deleteRangeMenu', entries: [
      { kind: 'command', id: 'edit.deleteParagraph', labelKey: 'menu.edit.deleteParagraph', shortcut: { mac: 'Cmd+Alt+Shift+P', winLinux: 'Ctrl+Alt+Shift+P' } },
      { kind: 'command', id: 'edit.deleteLine', labelKey: 'menu.edit.deleteLine', shortcut: { mac: 'Shift+Cmd+Backspace', winLinux: 'Ctrl+Shift+Backspace' } },
      { kind: 'command', id: 'edit.deleteFormatSpan', labelKey: 'menu.edit.deleteFormatSpan', shortcut: { mac: 'Cmd+Alt+Shift+E', winLinux: 'Ctrl+Alt+Shift+E' } },
      { kind: 'command', id: 'edit.deleteWord', labelKey: 'menu.edit.deleteWord', shortcut: { mac: 'Shift+Cmd+D', winLinux: 'Ctrl+Shift+D' } },
    ] },
    { kind: 'separator' },
    { kind: 'submenu', id: 'edit.spell', labelKey: 'menu.edit.spellMenu', entries: [
      { kind: 'command', id: 'edit.spellcheck.toggle', labelKey: 'menu.edit.spellcheck', checkedFrom: 'spellcheck' },
    ] },
    { kind: 'submenu', id: 'edit.replace', labelKey: 'menu.edit.replaceMenu', entries: [
      { kind: 'command', id: 'edit.smartPunctuation.toggle', labelKey: 'menu.edit.smartPunctuation', checkedFrom: 'smartPunct' },
    ] },
    // C2：行结束符 / 空白（Typora 编辑菜单对齐）
    { kind: 'submenu', id: 'edit.eol', labelKey: 'menu.edit.eolMenu', entries: [
      { kind: 'command', id: 'edit.eol.lf', labelKey: 'menu.edit.eolLf' },
      { kind: 'command', id: 'edit.eol.crlf', labelKey: 'menu.edit.eolCrlf' },
    ] },
    { kind: 'command', id: 'edit.trimTrailingSpaces', labelKey: 'menu.edit.trimTrailing' },
    { kind: 'submenu', id: 'edit.find', labelKey: 'menu.top.find', entries: [
      { kind: 'command', id: 'search.find', labelKey: 'menu.search.find', shortcut: { mac: 'Cmd+F', winLinux: 'Ctrl+F' } },
      { kind: 'command', id: 'search.findNext', labelKey: 'menu.search.findNext', shortcut: { mac: 'Cmd+G', winLinux: 'Ctrl+G' } },
      { kind: 'command', id: 'search.findPrevious', labelKey: 'menu.search.findPrevious', shortcut: { mac: 'Cmd+Shift+G', winLinux: 'Ctrl+Shift+G' } },
      { kind: 'separator' },
      { kind: 'command', id: 'search.replace', labelKey: 'menu.search.replace', shortcut: { mac: 'Cmd+Alt+F', winLinux: 'Ctrl+H' } },
    ] },
  ] },

  // ── 段落 ────────────────────────────────────────────────────
  { id: 'paragraph', labelKey: 'menu.top.paragraph', entries: [
    { kind: 'command', id: 'paragraph.h1', labelKey: 'menu.paragraph.h1', shortcut: { mac: 'Cmd+1', winLinux: 'Ctrl+1' } },
    { kind: 'command', id: 'paragraph.h2', labelKey: 'menu.paragraph.h2', shortcut: { mac: 'Cmd+2', winLinux: 'Ctrl+2' } },
    { kind: 'command', id: 'paragraph.h3', labelKey: 'menu.paragraph.h3', shortcut: { mac: 'Cmd+3', winLinux: 'Ctrl+3' } },
    { kind: 'command', id: 'paragraph.h4', labelKey: 'menu.paragraph.h4', shortcut: { mac: 'Cmd+4', winLinux: 'Ctrl+4' } },
    { kind: 'command', id: 'paragraph.h5', labelKey: 'menu.paragraph.h5', shortcut: { mac: 'Cmd+5', winLinux: 'Ctrl+5' } },
    { kind: 'command', id: 'paragraph.h6', labelKey: 'menu.paragraph.h6', shortcut: { mac: 'Cmd+6', winLinux: 'Ctrl+6' } },
    { kind: 'separator' },
    { kind: 'command', id: 'paragraph.normal', labelKey: 'menu.paragraph.normal', shortcut: { mac: 'Cmd+0', winLinux: 'Ctrl+0' } },
    { kind: 'separator' },
    { kind: 'command', id: 'paragraph.headingUp', labelKey: 'menu.paragraph.headingUp', shortcut: { mac: 'Cmd+=', winLinux: 'Ctrl+=' } },
    { kind: 'command', id: 'paragraph.headingDown', labelKey: 'menu.paragraph.headingDown', shortcut: { mac: 'Cmd+-', winLinux: 'Ctrl+-' } },
    { kind: 'separator' },
    { kind: 'submenu', id: 'paragraph.table', labelKey: 'menu.insert.table', entries: [
      { kind: 'command', id: 'insert.table', labelKey: 'menu.insert.table', shortcut: { mac: 'Cmd+Alt+T', winLinux: 'Ctrl+T' } },
      { kind: 'separator' },
      { kind: 'command', id: 'table.addRowAbove', labelKey: 'menu.table.addRowAbove' },
      { kind: 'command', id: 'table.addRowBelow', labelKey: 'menu.table.addRowBelow' },
      { kind: 'separator' },
      { kind: 'command', id: 'table.addColumnLeft', labelKey: 'menu.table.addColumnLeft' },
      { kind: 'command', id: 'table.addColumnRight', labelKey: 'menu.table.addColumnRight' },
      { kind: 'separator' },
      { kind: 'command', id: 'table.moveRowUp', labelKey: 'menu.table.moveRowUp' },
      { kind: 'command', id: 'table.moveRowDown', labelKey: 'menu.table.moveRowDown' },
      { kind: 'command', id: 'table.moveColumnLeft', labelKey: 'menu.table.moveColumnLeft' },
      { kind: 'command', id: 'table.moveColumnRight', labelKey: 'menu.table.moveColumnRight' },
      { kind: 'separator' },
      { kind: 'command', id: 'table.deleteRow', labelKey: 'menu.table.deleteRow' },
      { kind: 'command', id: 'table.deleteColumn', labelKey: 'menu.table.deleteColumn' },
      { kind: 'separator' },
      { kind: 'command', id: 'table.copyTable', labelKey: 'menu.table.copyTable' },
      { kind: 'command', id: 'table.tidy', labelKey: 'menu.table.tidy' },
      // C2：对齐子菜单（Typora table 子菜单的 Alignment）
      { kind: 'submenu', id: 'paragraph.tableAlign', labelKey: 'menu.table.alignMenu', entries: [
        { kind: 'command', id: 'table.alignLeft', labelKey: 'menu.table.alignLeft' },
        { kind: 'command', id: 'table.alignCenter', labelKey: 'menu.table.alignCenter' },
        { kind: 'command', id: 'table.alignRight', labelKey: 'menu.table.alignRight' },
        { kind: 'command', id: 'table.alignDefault', labelKey: 'menu.table.alignDefault' },
      ] },
      { kind: 'separator' },
      { kind: 'command', id: 'table.deleteTable', labelKey: 'menu.table.deleteTable' },
    ] },
    { kind: 'command', id: 'format.mathBlock', labelKey: 'menu.format.mathBlock', shortcut: { mac: 'Cmd+Alt+B', winLinux: 'Ctrl+Shift+M' } },
    { kind: 'command', id: 'format.codeBlock', labelKey: 'menu.format.codeBlock', shortcut: { mac: 'Cmd+Alt+C', winLinux: 'Ctrl+Shift+K' } },
    { kind: 'submenu', id: 'paragraph.codeTools', labelKey: 'menu.paragraph.codeToolsMenu', entries: [
      { kind: 'command', id: 'paragraph.copyCodeBlock', labelKey: 'menu.paragraph.copyCodeBlock' },
      { kind: 'command', id: 'paragraph.autoIndentCodeBlock', labelKey: 'menu.paragraph.autoIndentCodeBlock' },
      { kind: 'command', id: 'paragraph.autoIndentSelection', labelKey: 'menu.paragraph.autoIndentSelection' },
    ] },
    { kind: 'submenu', id: 'paragraph.alert', labelKey: 'menu.insert.alertMenu', entries: [
      { kind: 'command', id: 'alert.note', labelKey: 'menu.alert.note' },
      { kind: 'command', id: 'alert.tip', labelKey: 'menu.alert.tip' },
      { kind: 'command', id: 'alert.important', labelKey: 'menu.alert.important' },
      { kind: 'command', id: 'alert.warning', labelKey: 'menu.alert.warning' },
      { kind: 'command', id: 'alert.caution', labelKey: 'menu.alert.caution' },
    ] },
    { kind: 'command', id: 'format.quote', labelKey: 'menu.format.quote', shortcut: { mac: 'Cmd+Alt+Q', winLinux: 'Ctrl+Shift+Q' } },
    { kind: 'separator' },
    { kind: 'command', id: 'format.orderedList', labelKey: 'menu.format.orderedList', shortcut: { mac: 'Cmd+Alt+O', winLinux: 'Ctrl+Shift+[' } },
    { kind: 'command', id: 'format.list', labelKey: 'menu.format.list', shortcut: { mac: 'Cmd+Alt+U', winLinux: 'Ctrl+Shift+]' } },
    { kind: 'command', id: 'format.taskList', labelKey: 'menu.format.taskList', shortcut: { mac: 'Cmd+Alt+X', winLinux: 'Ctrl+Alt+X' } },
    { kind: 'command', id: 'paragraph.taskToggle', labelKey: 'menu.paragraph.taskToggle', shortcut: { mac: 'Ctrl+X', winLinux: 'Ctrl+Shift+X' } },
    { kind: 'submenu', id: 'paragraph.indent', labelKey: 'menu.paragraph.indentMenu', entries: [
      { kind: 'command', id: 'paragraph.indentMore', labelKey: 'menu.paragraph.indentMore', shortcut: { mac: 'Cmd+]', winLinux: 'Ctrl+]' } },
      { kind: 'command', id: 'paragraph.indentLess', labelKey: 'menu.paragraph.indentLess', shortcut: { mac: 'Cmd+[', winLinux: 'Ctrl+[' } },
    ] },
    { kind: 'separator' },
    { kind: 'command', id: 'paragraph.insertAbove', labelKey: 'menu.paragraph.insertAbove' },
    { kind: 'command', id: 'paragraph.insertBelow', labelKey: 'menu.paragraph.insertBelow' },
    { kind: 'separator' },
    // C2：链接引用迁入段落菜单（Typora 1.14.9 Paragraph → Link Reference 位置）
    { kind: 'command', id: 'format.referenceLink', labelKey: 'menu.format.referenceLink', shortcut: { mac: 'Cmd+Alt+L', winLinux: 'Ctrl+Alt+L' } },
    { kind: 'command', id: 'paragraph.footnote', labelKey: 'menu.paragraph.footnote', shortcut: { mac: 'Cmd+Alt+R', winLinux: 'Ctrl+Alt+R' } },
    { kind: 'command', id: 'paragraph.horizontalRule', labelKey: 'menu.paragraph.horizontalRule', shortcut: { mac: 'Cmd+Alt+-', winLinux: 'Ctrl+Alt+-' } },
    { kind: 'command', id: 'insert.toc', labelKey: 'menu.paragraph.toc' },
    { kind: 'command', id: 'paragraph.yamlFrontMatter', labelKey: 'menu.paragraph.yamlFrontMatter' },
    { kind: 'separator' },
    // Slash 命令入口（Mellow 更优保留）：插入类命令同时保留原始 Command ID 分发
    { kind: 'command', id: 'insert.heading', labelKey: 'menu.insert.heading' },
    { kind: 'command', id: 'insert.list', labelKey: 'menu.insert.list' },
    { kind: 'command', id: 'insert.task', labelKey: 'menu.insert.task' },
    { kind: 'command', id: 'insert.quote', labelKey: 'menu.insert.quote' },
    { kind: 'command', id: 'insert.code', labelKey: 'menu.insert.code' },
    { kind: 'command', id: 'insert.math', labelKey: 'menu.insert.math' },
    { kind: 'command', id: 'insert.mermaid', labelKey: 'menu.insert.mermaid' },
    // E5（D 类收敛）：insert.alert 与段落菜单「警告框」子菜单 alert.note 语义完全
    // 重复，insert.table 与上方表格子菜单重复挂载 —— 均从菜单移除；命令保留
    // （slash 触发与 palette 分发不受影响）。
  ] },

  // ── 格式 ────────────────────────────────────────────────────
  { id: 'format', labelKey: 'menu.top.format', entries: [
    { kind: 'command', id: 'format.bold', labelKey: 'menu.format.bold', shortcut: { mac: 'Cmd+B', winLinux: 'Ctrl+B' } },
    { kind: 'command', id: 'format.italic', labelKey: 'menu.format.italic', shortcut: { mac: 'Cmd+I', winLinux: 'Ctrl+I' } },
    { kind: 'command', id: 'format.underline', labelKey: 'menu.format.underline', shortcut: { mac: 'Cmd+U', winLinux: 'Ctrl+U' } },
    { kind: 'command', id: 'format.code', labelKey: 'menu.format.code', shortcut: { mac: 'Ctrl+`', winLinux: 'Ctrl+Shift+`' } },
    { kind: 'command', id: 'format.strike', labelKey: 'menu.format.strike', shortcut: { mac: 'Ctrl+Shift+`', winLinux: 'Alt+Shift+5' } },
    { kind: 'command', id: 'format.comment', labelKey: 'menu.format.comment', shortcut: { mac: 'Ctrl+-', winLinux: 'Ctrl+Alt+Shift+-' } },
    { kind: 'command', id: 'format.highlight', labelKey: 'menu.format.highlight' },
    { kind: 'command', id: 'format.sup', labelKey: 'menu.format.sup' },
    { kind: 'command', id: 'format.sub', labelKey: 'menu.format.sub' },
    { kind: 'separator' },
    { kind: 'command', id: 'format.link', labelKey: 'menu.format.link', shortcut: { mac: 'Cmd+K', winLinux: 'Ctrl+K' } },
    { kind: 'submenu', id: 'format.linkOps', labelKey: 'menu.format.linkOpsMenu', entries: [
      { kind: 'command', id: 'format.openLink', labelKey: 'menu.format.openLink' },
      { kind: 'command', id: 'format.copyLinkUrl', labelKey: 'menu.format.copyLinkUrl' },
    ] },
    { kind: 'separator' },
    { kind: 'command', id: 'insert.image', labelKey: 'menu.insert.image', shortcut: { mac: 'Cmd+Ctrl+I', winLinux: 'Ctrl+Shift+I' } },
    { kind: 'command', id: 'format.clear', labelKey: 'menu.format.clear', shortcut: { mac: 'Cmd+\\', winLinux: 'Ctrl+\\' } },
    { kind: 'submenu', id: 'format.image', labelKey: 'menu.format.imageMenu', entries: [
      { kind: 'command', id: 'image.uploadAll', labelKey: 'menu.image.uploadAll' },
      { kind: 'command', id: 'image.downloadRemote', labelKey: 'menu.image.downloadRemote' },
      { kind: 'command', id: 'image.moveAll', labelKey: 'menu.image.moveAll' },
      { kind: 'command', id: 'image.copyAll', labelKey: 'menu.image.copyAll' },
    ] },
  ] },

  // ── 显示（Typora「显示」菜单）───────────────────────────────
  { id: 'view', labelKey: 'menu.top.view', entries: [
    { kind: 'command', id: 'commandPalette.open', labelKey: 'menu.commandPalette.open', shortcut: { mac: 'Cmd+Shift+P', winLinux: 'Ctrl+Shift+P' } },
    { kind: 'separator' },
    { kind: 'command', id: 'view.source.toggle', labelKey: 'menu.view.source.toggle', shortcut: { mac: 'Cmd+/', winLinux: 'Ctrl+/' } },
    // E6a：Typora 1.14.9「Readonly Mode」（dump toggleReadonlyMode:）
    { kind: 'command', id: 'view.readonly.toggle', labelKey: 'menu.view.readonly.toggle' },
    { kind: 'separator' },
    { kind: 'command', id: 'view.focus.cycle', labelKey: 'menu.view.focus.cycle', shortcut: { mac: 'F8', winLinux: 'F8' } },
    { kind: 'command', id: 'view.typewriter.cycle', labelKey: 'menu.view.typewriter.cycle', shortcut: { mac: 'F9', winLinux: 'F9' } },
    { kind: 'command', id: 'view.toolbar.toggle', labelKey: 'menu.view.toolbar.toggle' },
    { kind: 'command', id: 'view.wordCount', labelKey: 'menu.view.wordCount' },
    { kind: 'separator' },
    { kind: 'command', id: 'view.sidebar.toggle', labelKey: 'menu.view.sidebarToggle', shortcut: { mac: 'Cmd+Shift+L', winLinux: 'Ctrl+Shift+L' } },
    { kind: 'command', id: 'view.sidebar.outline', labelKey: 'menu.view.sidebarOutline', shortcut: { mac: 'Ctrl+Cmd+1', winLinux: 'Ctrl+Shift+1' } },
    { kind: 'command', id: 'view.sidebar.fileTree', labelKey: 'menu.view.sidebarFileTree', shortcut: { mac: 'Ctrl+Cmd+3', winLinux: 'Ctrl+Shift+3' } },
    { kind: 'command', id: 'search.global', labelKey: 'menu.view.search', shortcut: { mac: 'Cmd+Shift+F', winLinux: 'Ctrl+Shift+F' } },
    { kind: 'separator' },
    { kind: 'command', id: 'view.zoomReset', labelKey: 'menu.view.zoomReset', shortcut: { mac: 'Cmd+Shift+0', winLinux: 'Ctrl+Shift+0' } },
    { kind: 'command', id: 'view.zoomIn', labelKey: 'menu.view.zoomIn', shortcut: { mac: 'Cmd+Shift+=', winLinux: 'Ctrl+Shift+=' } },
    { kind: 'command', id: 'view.zoomOut', labelKey: 'menu.view.zoomOut', shortcut: { mac: 'Cmd+Shift+-', winLinux: 'Ctrl+Shift+-' } },
    { kind: 'separator' },
    { kind: 'command', id: 'window.alwaysOnTop', labelKey: 'menu.view.alwaysOnTop' },
    { kind: 'separator' },
    { kind: 'command', id: 'reader.open', labelKey: 'menu.reader.open' },
    { kind: 'command', id: 'window.fullscreen', labelKey: 'menu.window.fullscreen', shortcut: { mac: 'Ctrl+Cmd+F', winLinux: 'F11' } },
    { kind: 'command', id: 'view.devtools', labelKey: 'menu.view.devtools', debugOnly: true },
  ] },

  // ── 主题（P1-1.5：从 Theme Registry 派生，schema 只留 dynamic 占位）──
  { id: 'theme', labelKey: 'menu.top.theme', entries: [
    { kind: 'dynamic', dynamic: 'themes' },
    { kind: 'separator' },
    { kind: 'command', id: 'theme.mode.system', labelKey: 'menu.theme.system', checkedFrom: 'themeModeSystem' },
    // V4 §7.3：Open Theme Folder / User CSS 放 separator 后（Typora 主题机制对标）
    { kind: 'command', id: 'theme.openFolder', labelKey: 'menu.theme.openFolder' },
    { kind: 'command', id: 'file.openUserCss', labelKey: 'menu.theme.openUserCss' },
  ] },

  // ── 窗口（B3，第四轮：仅 macOS —— Typora Windows/Linux 顶层菜单无「窗口」，
  // 最小化/还原由系统标题栏控制按钮承担。
  // B1（SDI）：tabs.prev/next 移除 —— macOS Typora「显示上一个/下一个标签页」为系统
  // NSWindow tabbing 运行时注入项，非菜单常驻槽位（sdi-truth-table-v1.md 0.9 行））─────────
  { id: 'window', labelKey: 'menu.top.window', macOnly: true, entries: [
    { kind: 'command', id: 'window.minimize', labelKey: 'menu.window.minimize', shortcut: { mac: 'Cmd+M', winLinux: 'Ctrl+M' } },
    { kind: 'command', id: 'window.maximizeToggle', labelKey: 'menu.window.maximizeToggle' },
  ] },

  // ── 帮助 ────────────────────────────────────────────────────
  { id: 'help', labelKey: 'menu.top.help', entries: [
    { kind: 'command', id: 'help.quickStart', labelKey: 'menu.help.quickStart' },
    { kind: 'command', id: 'help.markdownReference', labelKey: 'menu.help.markdownReference' },
    { kind: 'command', id: 'help.cheatsheet', labelKey: 'menu.help.cheatsheet' },
    { kind: 'command', id: 'help.feedback', labelKey: 'menu.help.feedback' },
  ] },
];

// ── 派生数据 ────────────────────────────────────────────────────

/** 遍历 schema 收集 command 条目（含动态 themes 的生成 id 由调用方注册，不在此列）。 */
function* walkCommandEntries(entries: readonly MenuEntry[]): Generator<MenuCommandEntry> {
  for (const entry of entries) {
    if (entry.kind === 'command') yield entry;
    if (entry.kind === 'submenu') yield* walkCommandEntries(entry.entries);
  }
}

/** schema 覆盖的全部命令 id（静态 command 条目；不含 recent.file::* / theme.apply.* 动态项）。 */
export const SCHEMA_COMMAND_IDS: ReadonlySet<string> = new Set(
  MENU_SCHEMA.flatMap((root) => [...walkCommandEntries(root.entries)].map((e) => e.id)),
);

const entriesWithShortcut = MENU_SCHEMA
  .flatMap((root) => [...walkCommandEntries(root.entries)])
  .filter((entry): entry is MenuCommandEntry & { shortcut: CommandShortcut } => entry.shortcut !== undefined);

/** 快捷键单一真源派生（§7.4 硬规则 2）：schema 中声明了 accelerator 的命令 →
 * CommandRegistry 注入映射。仅此表中的 id 允许在 App.tsx 出现 `shortcut:` 注入，
 * 不允许内联重复声明（guard 校验）。 */
export const SCHEMA_SHORTCUTS: ReadonlyMap<string, CommandShortcut> = new Map(
  entriesWithShortcut.map((entry) => [entry.id, entry.shortcut]),
);

// ── NativeMenuSpec：可序列化 spec（Rust materialization 输入）────

export interface NativeMenuCommandItem {
  type: 'command';
  id: string;
  label: string;
  accel?: string;
  checked?: boolean;
}

export interface NativeMenuPredefinedItem {
  type: 'predefined';
  predefined: MenuPredefinedKind;
  label?: string;
}

export interface NativeMenuSeparatorItem {
  type: 'separator';
}

export interface NativeMenuSubmenuItem {
  type: 'submenu';
  label: string;
  items: NativeMenuItem[];
}

export type NativeMenuItem = NativeMenuCommandItem | NativeMenuPredefinedItem | NativeMenuSeparatorItem | NativeMenuSubmenuItem;

export interface NativeMenuRoot {
  id: string;
  label: string;
  items: NativeMenuItem[];
}

export interface NativeMenuSpec {
  menus: NativeMenuRoot[];
}

export interface NativeMenuSpecInput {
  /** 目标平台（决定 accelerator 选择与 macOnly 过滤）。 */
  platform: 'mac' | 'win-linux';
  /** debug 构建（决定 debugOnly 条目装配）。 */
  debug: boolean;
  /** i18n 翻译函数（labelKey → 文案；由调用方传入，保持本包零 i18n 依赖）。 */
  translate: (key: string) => string;
  /** 最近文件路径列表（动态 recent-files 展开；每项生成 recent.file::<path> 菜单项）。 */
  recentFiles?: string[];
  /** Theme Registry 派生（P1-1.5：BUILTIN_THEMES 注入）。 */
  themes?: ReadonlyArray<{ id: string; name: string }>;
  /** 当前生效主题 id（主题 radio 选中态）。 */
  activeThemeId?: string;
  /** 主题模式 light | dark | system（「跟随系统」勾选态）。 */
  themeMode?: string;
  /** 拼写检查勾选态（「键入时检查拼写」）。 */
  spellcheck?: boolean;
  /** 智能标点勾选态（「替换 → 智能标点」）。 */
  smartPunct?: boolean;
  /** P2-2.6 用户自定义键位 override（Settings 录制；schema 仍是默认值唯一真源，
   *  override 仅在 materialization 边界覆盖同平台字段；空串 = 已清除）。 */
  shortcutOverrides?: Readonly<Record<string, { mac?: string; winLinux?: string }>>;
}

/** checkedFrom 来源 → 当前勾选值解析。 */
function resolveChecked(checkedFrom: string, input: NativeMenuSpecInput): boolean {
  if (checkedFrom === 'spellcheck') return input.spellcheck ?? true;
  if (checkedFrom === 'smartPunct') return input.smartPunct ?? false;
  if (checkedFrom === 'themeModeSystem') return input.themeMode === 'system';
  if (checkedFrom.startsWith('activeTheme:')) return input.activeThemeId === checkedFrom.slice('activeTheme:'.length);
  return false;
}

function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function buildItems(entries: readonly MenuEntry[], input: NativeMenuSpecInput): NativeMenuItem[] {
  const items: NativeMenuItem[] = [];
  for (const entry of entries) {
    if (entry.kind === 'separator') {
      items.push({ type: 'separator' });
      continue;
    }
    if (entry.kind === 'dynamic') {
      if (entry.dynamic === 'recent-files') {
        // 有文件才展开分隔线 + 文件项（与旧 menu.rs 行为一致；无文件时仅剩静态项）
        for (const path of input.recentFiles ?? []) {
          items.push({ type: 'command', id: `recent.file::${path}`, label: basenameOf(path) });
        }
      } else {
        // P1-1.5：主题菜单从 Theme Registry 派生（radio；label 用主题名）
        for (const theme of input.themes ?? []) {
          items.push({
            type: 'command',
            id: `theme.apply.${theme.id}`,
            label: theme.name,
            checked: input.activeThemeId === theme.id,
          });
        }
      }
      continue;
    }
    if (entry.kind === 'submenu') {
      items.push({ type: 'submenu', label: input.translate(entry.labelKey), items: buildItems(entry.entries, input) });
      continue;
    }
    // predefined 条目不做平台/debug 过滤（app 菜单整体 macOnly 已在顶层处理）
    if (entry.kind === 'predefined') {
      items.push({ type: 'predefined', predefined: entry.predefined, label: entry.labelKey === undefined ? undefined : input.translate(entry.labelKey) });
      continue;
    }
    if (entry.macOnly && input.platform !== 'mac') continue;
    if (entry.winLinuxOnly && input.platform === 'mac') continue;
    if (entry.debugOnly && !input.debug) continue;
    // P2-2.6：用户 override 优先于 schema 默认键位（仅覆盖当前平台字段；空串 = 清除）
    const override = input.shortcutOverrides?.[entry.id];
    const accel = input.platform === 'mac'
      ? (override?.mac ?? entry.shortcut?.mac)
      : (override?.winLinux ?? entry.shortcut?.winLinux);
    items.push({
      type: 'command',
      id: entry.id,
      label: input.translate(entry.labelKey),
      ...(accel !== undefined && accel !== '' ? { accel } : {}),
      ...(entry.checkedFrom !== undefined ? { checked: resolveChecked(entry.checkedFrom, input) } : {}),
    });
  }
  return items;
}

/** MENU_SCHEMA + 运行时状态 → 可序列化 spec（Rust set_menu_spec 输入）。 */
export function toNativeMenuSpec(input: NativeMenuSpecInput): NativeMenuSpec {
  return {
    menus: MENU_SCHEMA
      .filter((root) => !(root.macOnly && input.platform !== 'mac'))
      .map((root) => ({ id: root.id, label: input.translate(root.labelKey), items: buildItems(root.entries, input) })),
  };
}
