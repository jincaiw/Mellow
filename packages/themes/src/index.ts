/**
 * Theme Engine（T-0601 / T-0602）。
 *
 * - 内置 6 主题：Mellow Light / Mellow Dark / Paper / Git Light / Git Dark / Newsprint
 *   （通用主题名，非 Typora 专有文件；色板原创/通用，禁止复制 Typora 专有主题文件）；
 * - CSS variables：每个主题定义一套 --mellow-* token（桌面 chrome 与 Reader 共用）；
 * - theme CSS：主题可附带主题专属 CSS（衬线字体/特殊背景等）；
 * - System / 独立 Light/Dark：settings 支持 mode=system（跟随 prefers-color-scheme）
 *   或 mode=light/dark，并分别记忆 lightThemeId / darkThemeId；
 * - user CSS architecture：桌面层加载 appData/user.css 并注入（优先级最高），见 App 集成。
 *
 * 平台约束：本包零 OS / DOM 依赖（纯数据 + 纯函数），可在 node 测试。
 */

export type ThemeKind = 'light' | 'dark';

export interface MellowTheme {
  id: string;
  /** 显示名（zh 优先；en 次之） */
  name: string;
  kind: ThemeKind;
  /** CSS 变量 token 集（key 含 `--` 前缀，可直接 setProperty） */
  variables: Record<string, string>;
  /** 主题专属 CSS（空字符串 = 无） */
  themeCss: string;
  /** 编辑器内容区映射（CoreEditor webModules.config.setTheme 的 name） */
  editorTheme: string;
  /** 主题级编辑器内容字体（单个族名，如 'Georgia'；用户显式 fontFamily 设置优先于此） */
  editorFontFamily?: string;
}

export interface ThemeSettings {
  /** system = 跟随系统亮暗；light/dark = 手动指定亮暗 */
  mode: 'system' | 'light' | 'dark';
  /** 亮色槽（mode=system 且系统亮 / mode=light 时生效） */
  lightThemeId: string;
  /** 暗色槽（mode=system 且系统暗 / mode=dark 时生效） */
  darkThemeId: string;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'system',
  lightThemeId: 'mellow-light',
  darkThemeId: 'mellow-dark',
};

const LIGHT_BASE: Record<string, string> = {
  '--mellow-bg': '#ffffff',
  '--mellow-bg-elevated': '#ffffff',
  '--mellow-bg-subtle': '#fbfbfb',
  '--mellow-bg-hover': '#f0f0f0',
  '--mellow-fg': '#222222',
  '--mellow-fg-subtle': '#666666',
  '--mellow-fg-muted': '#757575',
  '--mellow-border': '#e2e2e2',
  '--mellow-border-strong': '#d0d0d0',
  '--mellow-accent': '#3563d6',
  '--mellow-accent-fg': '#ffffff',
  '--mellow-selection': '#e9eefb',
  '--mellow-tab-underline': '#3563d6',
  '--mellow-danger': '#d33',
  '--mellow-danger-bg': '#fdecea',
  '--mellow-danger-border': '#e6b8b0',
  '--mellow-danger-btn': '#d8a098',
  '--mellow-warning-bg': '#fff8e1',
  '--mellow-warning-border': '#e6d9a8',
  '--mellow-warning-fg': '#8a6d00',
  '--mellow-warning-btn': '#d0c48f',
  '--mellow-link': '#0366d6',
  '--mellow-code-bg': '#f6f8fa',
  '--mellow-code-border': '#e1e4e8',
  '--mellow-mark': '#ffe066',
  '--mellow-mark-current': '#ffb300',
  '--mellow-focus-ring': '#3563d6',
  '--mellow-toolbar-bg': 'rgba(30, 30, 30, 0.92)',
  '--mellow-toolbar-fg': '#f5f5f5',
  '--mellow-shadow': 'rgba(0, 0, 0, 0.18)',
  '--mellow-mermaid-bg': '#fcfcfc',
  '--mellow-mermaid-border': '#d0d0d0',
  '--mellow-alert-note-bg': '#f0f6ff',
  '--mellow-alert-note-border': '#b6d4fe',
  '--mellow-alert-note-fg': '#0a4da3',
  '--mellow-alert-tip-bg': '#e8f8ee',
  '--mellow-alert-tip-border': '#a8e6bc',
  '--mellow-alert-tip-fg': '#0c5d2f',
  '--mellow-alert-important-bg': '#f3e8fd',
  '--mellow-alert-important-border': '#d0a6f0',
  '--mellow-alert-important-fg': '#5c2d91',
  '--mellow-alert-warning-bg': '#fff7e0',
  '--mellow-alert-warning-border': '#f0cf86',
  '--mellow-alert-warning-fg': '#7a4d00',
  '--mellow-alert-caution-bg': '#ffecec',
  '--mellow-alert-caution-border': '#f3a6a6',
  '--mellow-alert-caution-fg': '#8a1a1a',
};

const DARK_BASE: Record<string, string> = {
  ...LIGHT_BASE,
  '--mellow-bg': '#1e1e1e',
  '--mellow-bg-elevated': '#252526',
  '--mellow-bg-subtle': '#2a2a2b',
  '--mellow-bg-hover': '#333333',
  '--mellow-fg': '#e6e6e6',
  '--mellow-fg-subtle': '#b0b0b0',
  '--mellow-fg-muted': '#8a8a8a',
  '--mellow-border': '#3a3a3a',
  '--mellow-border-strong': '#4a4a4a',
  '--mellow-accent': '#6d94ff',
  '--mellow-selection': '#3a4a6b',
  '--mellow-tab-underline': '#6d94ff',
  '--mellow-danger': '#ff7b72',
  '--mellow-danger-bg': '#3d2321',
  '--mellow-danger-border': '#6e3a36',
  '--mellow-danger-btn': '#8a4a44',
  '--mellow-warning-bg': '#3d3520',
  '--mellow-warning-border': '#6e5f30',
  '--mellow-warning-fg': '#d4b96a',
  '--mellow-warning-btn': '#8a7a3f',
  '--mellow-link': '#79b8ff',
  '--mellow-code-bg': '#262a2e',
  '--mellow-code-border': '#3a4046',
  '--mellow-mark': '#7a6a1a',
  '--mellow-mark-current': '#9a7a1a',
  '--mellow-focus-ring': '#6d94ff',
  '--mellow-toolbar-bg': 'rgba(40, 40, 42, 0.95)',
  '--mellow-mermaid-bg': '#262626',
  '--mellow-mermaid-border': '#3d3d3d',
  '--mellow-alert-note-bg': '#16283d',
  '--mellow-alert-note-border': '#2a4a6e',
  '--mellow-alert-note-fg': '#7ab3e8',
  '--mellow-alert-tip-bg': '#14301f',
  '--mellow-alert-tip-border': '#2a5238',
  '--mellow-alert-tip-fg': '#6fc48a',
  '--mellow-alert-important-bg': '#2d1d3d',
  '--mellow-alert-important-border': '#4a3260',
  '--mellow-alert-important-fg': '#c08ae8',
  '--mellow-alert-warning-bg': '#332a12',
  '--mellow-alert-warning-border': '#5c4d22',
  '--mellow-alert-warning-fg': '#d4b96a',
  '--mellow-alert-caution-bg': '#361b1b',
  '--mellow-alert-caution-border': '#5c3030',
  '--mellow-alert-caution-fg': '#f0a0a0',
};

export const BUILTIN_THEMES: MellowTheme[] = [
  {
    id: 'mellow-light',
    name: 'Mellow Light',
    kind: 'light',
    variables: LIGHT_BASE,
    themeCss: '',
    editorTheme: 'minimal-light',
  },
  {
    id: 'mellow-dark',
    name: 'Mellow Dark',
    kind: 'dark',
    variables: DARK_BASE,
    themeCss: '',
    editorTheme: 'minimal-dark',
  },
  {
    id: 'paper',
    name: 'Paper',
    kind: 'light',
    variables: {
      ...LIGHT_BASE,
      '--mellow-bg': '#fdfaf3',
      '--mellow-bg-elevated': '#fefcf7',
      '--mellow-bg-subtle': '#f8f4ea',
      '--mellow-bg-hover': '#f1ece0',
      '--mellow-fg': '#3a3a34',
      '--mellow-border': '#e4ddcc',
      '--mellow-border-strong': '#cfc6ae',
      '--mellow-selection': '#eee7d6',
      '--mellow-code-bg': '#f4efe3',
      '--mellow-toolbar-bg': 'rgba(250, 246, 236, 0.96)',
      // B3-2 衬线文学风（Typora Pixyll 方向）：Reader/渲染区衬线字体栈
      '--mellow-content-font': "Georgia, 'Songti SC', 'Noto Serif SC', 'Times New Roman', serif",
    },
    themeCss: '',
    editorTheme: 'solarized-light',
    // B3-2 主题级编辑器衬线（单个族名；用户 fontFamily 显式设置优先）
    editorFontFamily: 'Georgia',
  },
  {
    id: 'git-light',
    name: 'Git Light',
    kind: 'light',
    variables: {
      ...LIGHT_BASE,
      '--mellow-bg': '#ffffff',
      '--mellow-bg-subtle': '#f6f8fa',
      '--mellow-bg-hover': '#f3f4f6',
      '--mellow-border': '#d0d7de',
      '--mellow-border-strong': '#afb8c1',
      '--mellow-accent': '#0969da',
      '--mellow-tab-underline': '#0969da',
      '--mellow-selection': '#ddf4ff',
      '--mellow-code-bg': '#f6f8fa',
      '--mellow-code-border': '#d0d7de',
    },
    themeCss: '',
    editorTheme: 'github-light',
  },
  {
    id: 'git-dark',
    name: 'Git Dark',
    kind: 'dark',
    variables: {
      ...DARK_BASE,
      '--mellow-bg': '#0d1117',
      '--mellow-bg-elevated': '#161b22',
      '--mellow-bg-subtle': '#010409',
      '--mellow-bg-hover': '#21262d',
      '--mellow-fg': '#c9d1d9',
      '--mellow-fg-subtle': '#8b949e',
      '--mellow-fg-muted': '#6e7681',
      '--mellow-border': '#30363d',
      '--mellow-border-strong': '#444c56',
      '--mellow-accent': '#58a6ff',
      '--mellow-tab-underline': '#58a6ff',
      '--mellow-selection': '#1f3d5a',
      '--mellow-code-bg': '#161b22',
      '--mellow-code-border': '#30363d',
    },
    themeCss: '',
    editorTheme: 'github-dark',
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    kind: 'light',
    variables: {
      ...LIGHT_BASE,
      '--mellow-bg': '#f4ecd8',
      '--mellow-bg-elevated': '#faf3e3',
      '--mellow-bg-subtle': '#efe5cd',
      '--mellow-bg-hover': '#e8dcc0',
      '--mellow-fg': '#433321',
      '--mellow-fg-subtle': '#6b5a43',
      '--mellow-border': '#d9c9a8',
      '--mellow-border-strong': '#bfab85',
      '--mellow-accent': '#8a6d3b',
      '--mellow-tab-underline': '#8a6d3b',
      '--mellow-selection': '#e2d3b0',
      '--mellow-code-bg': '#efe5cd',
      '--mellow-code-border': '#d9c9a8',
      // B3-2 报纸感（Typora Newsprint 方向）：衬线正文
      '--mellow-content-font': "Georgia, 'Songti SC', 'Noto Serif SC', 'Times New Roman', serif",
    },
    // B3-2 报纸排版细节：标题衬线粗体 + h1/h2 下边框（对齐 Typora Newsprint 视觉，参数原创）
    themeCss: [
      "[data-theme='newsprint'] .mellow-reader h1,",
      "[data-theme='newsprint'] .mellow-reader h2 {",
      "  border-bottom: 2px solid var(--mellow-border-strong);",
      "  padding-bottom: 0.25em;",
      '}',
      "[data-theme='newsprint'] .mellow-reader h1 { letter-spacing: 0.02em; }",
      "[data-theme='newsprint'] .mellow-reader blockquote {",
      '  border-left: 3px solid var(--mellow-border-strong);',
      '}',
    ].join('\n'),
    editorTheme: 'winter-is-coming-light',
    editorFontFamily: 'Georgia',
  },
];

const themeMap = new Map(BUILTIN_THEMES.map((t) => [t.id, t]));

export function themeById(id: string): MellowTheme | undefined {
  return themeMap.get(id);
}

/** 解析最终生效主题（纯函数；systemPrefersDark 由宿主提供） */
export function resolveActiveTheme(settings: ThemeSettings, systemPrefersDark: boolean): MellowTheme {
  const preferDark = settings.mode === 'dark' || (settings.mode === 'system' && systemPrefersDark);
  const id = preferDark ? settings.darkThemeId : settings.lightThemeId;
  const theme = themeMap.get(id);
  if (theme !== undefined) return theme;
  return themeById(preferDark ? DEFAULT_THEME_SETTINGS.darkThemeId : DEFAULT_THEME_SETTINGS.lightThemeId) as MellowTheme;
}
