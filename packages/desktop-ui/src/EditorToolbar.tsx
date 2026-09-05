/**
 * E1（Typora 1.14.6 "editor toolbar" 对标）：常驻编辑器工具栏。
 * - View→工具栏（view.toolbar.toggle）开关，状态持久化（Typora 默认隐藏、用户开启）；
 * - 按钮集合 = 既有浮动格式工具栏全集 + U/image/table/orderedList（统一走
 *   CommandRegistry 分发，与菜单/快捷键单一真源一致）；
 * - mousedown preventDefault：点击按钮不抢走编辑器选区焦点。
 */
export interface EditorToolbarButton {
  id: string;
  label: string;
  titleKey: string;
}

export const EDITOR_TOOLBAR_BUTTONS: ReadonlyArray<EditorToolbarButton> = [
  { id: 'paragraph.h2', label: 'H2', titleKey: 'menu.paragraph.h2' },
  { id: 'paragraph.h3', label: 'H3', titleKey: 'menu.paragraph.h3' },
  { id: 'format.bold', label: 'B', titleKey: 'menu.format.bold' },
  { id: 'format.italic', label: 'I', titleKey: 'menu.format.italic' },
  { id: 'format.underline', label: 'U', titleKey: 'menu.format.underline' },
  { id: 'format.strike', label: 'S', titleKey: 'menu.format.strike' },
  { id: 'format.code', label: '</>', titleKey: 'menu.format.code' },
  { id: 'format.link', label: '🔗', titleKey: 'menu.format.link' },
  { id: 'insert.image', label: '🖼', titleKey: 'menu.insert.image' },
  { id: 'format.quote', label: '❝', titleKey: 'menu.format.quote' },
  { id: 'format.orderedList', label: '1.', titleKey: 'menu.format.orderedList' },
  { id: 'format.list', label: '•', titleKey: 'menu.format.list' },
  { id: 'insert.table', label: '▦', titleKey: 'menu.insert.table' },
];

export interface EditorToolbarProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  onCommand: (id: string) => void;
}

export function EditorToolbar({ t, onCommand }: EditorToolbarProps) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label={t('menu.view.toolbar.toggle')}>
      {EDITOR_TOOLBAR_BUTTONS.map((btn) => (
        <button
          key={btn.id}
          type="button"
          className="editor-toolbar-btn"
          title={t(btn.titleKey)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCommand(btn.id)}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
