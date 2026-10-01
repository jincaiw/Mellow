/**
 * V5：Markdown 排版 token 桥。
 *
 * 编辑器运行在独立 iframe（独立 document），宿主的 --mellow-* 变量不会自动继承。
 * 宿主（App.tsx applyTheme）经 EditorCore.setMdTokens() → 本桥把 --mellow-md-* token
 * 批量写入 iframe documentElement，供 engine 扩展 theme（wysiwygBlocks 等）消费。
 *
 * token 默认值 = Typora Github 主题真值（docs/plans/archive/typora-parity-v5-truth-table.md §3），
 * 未注入 token 时 fallback 也保持该观感。
 */

export const MD_TOKEN_DEFAULTS: Record<string, string> = {
  '--mellow-md-fg': '#333333',
  '--mellow-md-heading-border': '#eeeeee',
  '--mellow-md-quote-border': '#dfe2e5',
  '--mellow-md-quote-fg': '#777777',
  '--mellow-md-inline-code-bg': '#f3f4f4',
  '--mellow-md-code-bg': '#f8f8f8',
  '--mellow-md-code-border': '#e7eaed',
  '--mellow-md-metablock-bg': '#f7f7f7',
  '--mellow-md-metablock-fg': '#777777',
  '--mellow-md-hr': '#e7e7e7',
  // V6-P1：Typora 蓝（github.css 新版 a 真值）
  '--mellow-md-link': '#0969da',
  '--mellow-md-table-border': '#dfe2e5',
  '--mellow-md-table-head-bg': '#f8f8f8',
  // 列表圆点色（`plugin.ts` 的 `MARKER_BULLET_CLASS::before` 消费）。
  // 2026-10-01 补入：此前 `plugin.ts` 写了 `var(--mellow-md-list-bullet, #8b949e)`，
  // 但本表与主题基表**都没有这个键** → 恒取 fallback，且因为前缀是 `md-`
  // 能过 `setTokenProperties` 的过滤，护栏按**前缀**分类时看不见它（登记后消除该盲区）。
  // 真值说明：Typora **没有**独立的列表圆点色（`themes/*.css` 与 `style/base.css`
  // 均无 `::marker` 规则，圆点继承正文 `color`）→ 本值为 **Mellow 自选灰阶（参数原创）**，
  // 取 GitHub 系 muted 灰；亮色沿用原 fallback 值以做到**零视觉变化**。
  '--mellow-md-list-bullet': '#8b949e',
  // V8（ADR-0027 Q1=A1）：浮动面板表面（表格工具栏 / Resize 弹层）—— 亮色沿用原硬编码值。
  '--mellow-md-panel-bg': 'rgba(255, 255, 255, 0.92)',
  '--mellow-md-panel-fg': '#333333',
  '--mellow-md-panel-border': '#dddddd',
  '--mellow-md-panel-active': '#cfe3ff',
};

export interface MdTokensBridge {
  set: (tokens: Record<string, string>) => void;
}

/** localStorage 兜底键（桥未就绪时 engine 安装时自读，覆盖宿主先于 engine 注入的时序） */
export const MD_TOKENS_STORAGE_KEY = 'mellow.md.tokens';

function setTokenProperties(tokens: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('--mellow-md-')) {
      root.style.setProperty(key, value);
    }
  }
}

/** 安装桥（engine install 时调用一次；幂等；先从 localStorage 兜底恢复上次注入） */
export function installMdTokensBridge(): void {
  const win = window as unknown as { __MELLOW_THEME_TOKENS__?: MdTokensBridge };
  try {
    const raw = localStorage.getItem(MD_TOKENS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (typeof parsed === 'object' && parsed !== null) setTokenProperties(parsed);
    }
  } catch {
    /* 忽略 */
  }
  if (win.__MELLOW_THEME_TOKENS__ !== undefined) return;
  win.__MELLOW_THEME_TOKENS__ = {
    set: (tokens: Record<string, string>) => {
      setTokenProperties(tokens);
      try {
        localStorage.setItem(MD_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
      } catch {
        /* 忽略 */
      }
    },
  };
}

/** 应用 token（未提供的键回落默认值，保证未接桥/新主题也有完整观感） */
export function applyMdTokens(variables: Record<string, string> | undefined): void {
  const merged: Record<string, string> = { ...MD_TOKEN_DEFAULTS };
  if (variables !== undefined) {
    for (const [key, value] of Object.entries(variables)) {
      if (key.startsWith('--mellow-md-')) merged[key] = value;
    }
  }
  const win = window as unknown as { __MELLOW_THEME_TOKENS__?: MdTokensBridge };
  win.__MELLOW_THEME_TOKENS__?.set(merged);
}
