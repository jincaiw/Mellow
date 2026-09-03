/**
 * Cheatsheet（Typora 深度对标 ⑪）—— Markdown 语法 + 快捷键速查面板。
 *
 * 打开方式：帮助菜单「Markdown 速查表」/ 命令面板（help.cheatsheet）。
 * 快捷键全量从 Command Registry 派生（P1-1.6，经 SCHEMA_SHORTCUTS 注入的单一真源）：
 * 行声明 commandId 后不再持有静态键位串，防止与 schema 漂移。
 * 仅无命令背书的说明性行（撤销/重做、切换主题）保留文字描述。
 * 双语数据内联（zh/en 成对），跟随 App 当前 locale 显示。
 */

import { useCallback, useEffect } from 'react';

export interface CheatsheetProps {
  open: boolean;
  locale: 'zh-CN' | 'en-US';
  /** 来自 Command Registry 的当前平台快捷键（menuSchema 单一真源派生）。 */
  shortcuts: Record<string, string | undefined>;
  onClose: () => void;
}

interface Row {
  zh: string;
  en: string;
  /** 示例（等宽字体展示） */
  sample?: string;
  /** Command Registry 命令 id：快捷键从 registry 派生（唯一合法来源） */
  commandId?: string;
  /** 仅限无命令背书的说明性行；有 commandId 的行禁止使用（P1-1.6 防漂移） */
  staticHint?: string;
}

interface Section {
  zh: string;
  en: string;
  rows: Row[];
}

const SECTIONS: Section[] = [
  {
    zh: '标题',
    en: 'Headings',
    rows: [
      { zh: '一级标题', en: 'Heading 1', sample: '# 标题', commandId: 'paragraph.h1' },
      { zh: '二级标题', en: 'Heading 2', sample: '## 标题', commandId: 'paragraph.h2' },
      { zh: '三级标题', en: 'Heading 3', sample: '### 标题', commandId: 'paragraph.h3' },
      { zh: '四级标题', en: 'Heading 4', sample: '#### 标题', commandId: 'paragraph.h4' },
      { zh: '五级标题', en: 'Heading 5', sample: '##### 标题', commandId: 'paragraph.h5' },
      { zh: '六级标题', en: 'Heading 6', sample: '###### 标题', commandId: 'paragraph.h6' },
      { zh: '段落', en: 'Paragraph', sample: '—', commandId: 'paragraph.normal' },
    ],
  },
  {
    zh: '行内格式',
    en: 'Inline Format',
    rows: [
      { zh: '粗体', en: 'Bold', sample: '**粗体**', commandId: 'format.bold' },
      { zh: '斜体', en: 'Italic', sample: '*斜体*', commandId: 'format.italic' },
      { zh: '删除线', en: 'Strikethrough', sample: '~~删除~~', commandId: 'format.strike' },
      { zh: '高亮', en: 'Highlight', sample: '==高亮==', commandId: 'format.highlight' },
      { zh: '上标', en: 'Superscript', sample: 'x^2^', commandId: 'format.sup' },
      { zh: '下标', en: 'Subscript', sample: 'H~2~O', commandId: 'format.sub' },
      { zh: '行内代码', en: 'Inline Code', sample: '`code`', commandId: 'format.code' },
    ],
  },
  {
    zh: '链接与引用',
    en: 'Links & References',
    rows: [
      { zh: '链接', en: 'Link', sample: '[文字](https://…)', commandId: 'format.link' },
      { zh: '图片', en: 'Image', sample: '![alt](img.png)', commandId: 'insert.image' },
      { zh: 'Wikilink', en: 'Wikilink', sample: '[[另一篇文档]]' },
      { zh: '脚注', en: 'Footnote', sample: '文字[^1]', commandId: 'paragraph.footnote' },
      { zh: '引用', en: 'Blockquote', sample: '> 引用', commandId: 'format.quote' },
    ],
  },
  {
    zh: '块级结构',
    en: 'Block Structure',
    rows: [
      { zh: '代码围栏', en: 'Code Fence', sample: '```js', commandId: 'format.codeBlock' },
      { zh: '表格', en: 'Table', sample: '| a | b |', commandId: 'insert.table' },
      { zh: '任务列表', en: 'Task List', sample: '- [ ] 待办', commandId: 'format.taskList' },
      { zh: '无序列表', en: 'Unordered List', sample: '- 项目', commandId: 'format.list' },
      { zh: '有序列表', en: 'Ordered List', sample: '1. 项目', commandId: 'format.orderedList' },
      { zh: 'YAML 元数据', en: 'YAML Front Matter', sample: '---', commandId: 'paragraph.yamlFrontMatter' },
    ],
  },
  {
    zh: '常用快捷键',
    en: 'Shortcuts',
    rows: [
      { zh: '命令面板', en: 'Command Palette', commandId: 'commandPalette.open' },
      { zh: '快速打开', en: 'Quick Open', commandId: 'quickOpen.open' },
      { zh: '全局搜索', en: 'Global Search', commandId: 'search.global' },
      { zh: '查找', en: 'Find', commandId: 'search.find' },
      { zh: '替换', en: 'Replace', commandId: 'search.replace' },
      { zh: '保存', en: 'Save', commandId: 'file.save' },
      { zh: '源码模式', en: 'Source Mode', commandId: 'view.source.toggle' },
      { zh: '专注模式', en: 'Focus Mode', commandId: 'view.focus.cycle' },
      { zh: '打字机模式', en: 'Typewriter Mode', commandId: 'view.typewriter.cycle' },
      { zh: '切换侧边栏', en: 'Toggle Sidebar', commandId: 'view.sidebar.toggle' },
      { zh: '撤销 / 重做', en: 'Undo / Redo', staticHint: 'Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z' },
      { zh: '切换主题', en: 'Switch Theme', staticHint: '设置 → 主题' },
    ],
  },
];

export default function Cheatsheet({ open, locale, shortcuts, onClose }: CheatsheetProps) {
  const isZh = locale === 'zh-CN';

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onKeyDown]);

  if (!open) return null;

  return (
    <div className="cheatsheet-backdrop" onMouseDown={onClose}>
      <div className="cheatsheet-panel" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cheatsheet-header">
          <span className="cheatsheet-title">{isZh ? 'Markdown 速查表' : 'Markdown Cheatsheet'}</span>
          <button type="button" className="cheatsheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="cheatsheet-body">
          {SECTIONS.map((section) => (
            <section key={section.zh} className="cheatsheet-section">
              <h3 className="cheatsheet-section-title">{isZh ? section.zh : section.en}</h3>
              <table className="cheatsheet-table">
                <tbody>
                  {section.rows.map((row) => {
                    // P1-1.6：有 commandId 的行快捷键只从 registry 取（单一真源），
                    // 无命令背书的行才允许 staticHint 说明文字。
                    const shortcutText = row.commandId !== undefined ? shortcuts[row.commandId] : row.staticHint;
                    return (
                      <tr key={row.zh + row.en}>
                        <td className="cheatsheet-label">{isZh ? row.zh : row.en}</td>
                        <td className="cheatsheet-sample">{row.sample !== undefined && <code>{row.sample}</code>}</td>
                        <td className="cheatsheet-shortcut">{shortcutText !== undefined && shortcutText !== '' && <kbd>{shortcutText}</kbd>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
