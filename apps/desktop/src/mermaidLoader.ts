/**
 * 宿主侧 Mermaid 11 装载器（desktop Adapter 层）。
 *
 * 背景（审计 §4.363）：`editor-engine` 只消费 `window.mermaid` /
 * `__MELLOW_MERMAID_LOADER__`，仓库内此前**没有任何一处注入** ⇒ 即便用户在
 * 偏好里打开 `markdown.mermaid`，图文块也只会落到 `.mellow-mermaid-error`。
 * 引擎保持零依赖（与 KaTeX 同一分工：宿主提供渲染能力，引擎只消费结果），
 * 库的加载放在 desktop Adapter 层，按需动态 import。
 *
 * 主题：引擎每次 render 前会 `initialize({ startOnLoad:false, securityLevel:'strict' })`，
 * 且 `setSiteConfig` 会以该次选项重算 theme ⇒ 在 loader 返回的代理对象上补
 * 当前亮/暗主题，避免暗色界面里出现白底图表。
 */

/** mermaid 11 宿主 API 的最小契约（引擎只用 initialize / render）。 */
export interface MermaidApi {
  initialize?: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
}

let apiPromise: Promise<MermaidApi> | null = null;

/** 与 App 的 `root.dataset.colorScheme` 同一信号（light | dark）。 */
function currentMermaidTheme(): 'default' | 'dark' {
  try {
    return document.documentElement.dataset.colorScheme === 'dark' ? 'dark' : 'default';
  } catch {
    return 'default';
  }
}

/**
 * 按需加载 Mermaid 11，并返回给引擎的稳定代理：
 * - 引擎的 `initialize` 选项被保留，但 theme 由宿主按当前界面亮暗补齐；
 * - 失败时清空缓存，允许下次渲染重试（网络/资源瞬时失败）。
 */
export async function loadMermaid(): Promise<MermaidApi> {
  if (apiPromise === null) {
    apiPromise = import('mermaid')
      .then((mod) => {
        const candidate = (mod as { default?: unknown }).default ?? mod;
        const api = candidate as MermaidApi;
        if (typeof api.render !== 'function') {
          throw new Error('mermaid module does not expose render()');
        }
        return api;
      })
      .catch((error) => {
        apiPromise = null;
        throw error;
      });
  }
  const mermaid = await apiPromise;
  return {
    initialize: (config) => {
      mermaid.initialize?.({ ...config, theme: currentMermaidTheme() });
    },
    render: (id, source) => mermaid.render(id, source),
  };
}
