/**
 * 文档内查找 / 替换（B1-5：⌘F 查找、⌥⌘F/⌘H 替换 —— Typora 深度对标）。
 *
 * 架构（与 vendored MarkEdit 构建共存的关键约束）：
 * - vendored CoreEditor 已装 `search({createPanel: () => 空 span})`（其搜索 UI
 *   在原生层）。`search()` 的 createPanel 字段无法二次提供——searchConfigFacet
 *   的 combineConfig 遇同字段不同值直接抛 "Config merge conflict"，Prec 也绕不开。
 * - 因此本引擎**不传 search() 配置**，改为：
 *   1. 补装 panels()（vendored 未装；openSearchPanel 经 showPanel 渲染面板依赖它，
 *      未装则静默无效）；
 *   2. ViewPlugin 监听 searchPanelOpen 状态：开 → 挂自建 Typora 风格面板到
 *      view.dom 顶部（CM 面板本体是空 span，CSS 隐藏 .cm-panels-bottom）；
 *      关 → 卸载。CM keymap 的 Mod-f、宿主桥的 openFind/openReplace 三路统一。
 *   3. 查询/替换复用 CM searchState：setSearchQuery 驱动高亮（高亮依赖
 *      panel 状态打开），findNext/replaceNext 等命令直接调用。
 * - 宿主 → 引擎桥：`window.__MELLOW_SEARCH_API__`（openFind / openReplace），
 *   供菜单与命令面板经 iframe 调用（install() 时注册）。
 */

import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';

interface EditorViewLike {
  state: unknown;
  dispatch(tr: unknown): void;
  focus(): void;
  dom?: HTMLElement;
}

interface SearchRuntime {
  searchKeymap: Array<Record<string, unknown>>;
  openSearchPanel: (view: unknown) => boolean;
  closeSearchPanel: (view: unknown) => boolean;
  findNext: (view: unknown) => boolean;
  findPrevious: (view: unknown) => boolean;
  replaceNext: (view: unknown) => boolean;
  replaceAll: (view: unknown) => boolean;
  getSearchQuery: (state: unknown) => { search: string; replace?: string; caseSensitive?: boolean; regexp?: boolean };
  searchPanelOpen: (state: unknown) => boolean;
  SearchQuery: new (spec: Record<string, unknown>) => unknown;
  setSearchQuery: { of: (query: unknown) => unknown };
}

interface ViewRuntime {
  keymap: { of: (bindings: unknown[]) => Extension };
  /** panels()：CM 面板容器 extension（search panel 依赖；MarkEdit vendored 未装） */
  panels: () => Extension;
  ViewPlugin: {
    fromClass: (cls: unknown, opts?: Record<string, unknown>) => unknown;
  };
}

export interface MellowSearchApi {
  openFind(): void;
  openReplace(): void;
  findNext(): void;
  findPrevious(): void;
}

// 单编辑器 iframe：模块级视图引用（ViewPlugin 维护）
let activeView: EditorViewLike | null = null;

function requireSearchMod(): SearchRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  return requireFn?.('@codemirror/search') as SearchRuntime;
}

function queryInput(view: EditorViewLike, name: 'search' | 'replace'): HTMLInputElement | null {
  return view.dom?.querySelector<HTMLInputElement>(`.cm-search input[name="${name}"]`) ?? null;
}

function focusField(view: EditorViewLike, name: 'search' | 'replace'): void {
  // 面板挂载发生在 openSearchPanel 的同步 dispatch 内（ViewPlugin.update），
  // rAF 仅作双保险
  requestAnimationFrame(() => {
    const input = queryInput(view, name);
    if (input !== null) {
      input.focus();
      input.select();
    }
  });
}

let styleInjected = false;

function injectPanelStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = [
    // 空占位 span 所在的 bottom 容器：隐藏（Mellow 无其他 bottom 面板）
    '.cm-editor .cm-panels-bottom{display:none}',
    // 自建面板：Typora 风格顶部居中浮动条
    '.cm-editor .cm-search{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:600;display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid rgba(127,127,127,.35);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);background:rgba(245,245,247,.96);backdrop-filter:blur(8px);color:#1d1d1f;font-size:13px}',
    '.cm-editor.cm-dark .cm-search{background:rgba(40,40,42,.96);color:#f5f5f7}',
    '.cm-search .cm-search-row{display:flex;gap:4px;align-items:center;min-width:320px}',
    '.cm-search input{border:1px solid rgba(127,127,127,.35);border-radius:4px;padding:3px 8px;min-width:200px;font:inherit;background:transparent;color:inherit;outline:none;flex:1}',
    '.cm-search input:focus{border-color:#4c8bf5}',
    '.cm-search button{border:none;background:transparent;border-radius:4px;padding:3px 9px;cursor:pointer;color:inherit;font:inherit;line-height:1.2}',
    '.cm-search button:hover{background:rgba(127,127,127,.18)}',
    '.cm-search .cm-search-close{font-size:12px;padding:2px 6px}',
    // 查找选项 toggle（Typora parity：区分大小写 Aa / 正则 .*）
    '.cm-search .cm-search-toggle{padding:3px 6px;font-size:12px;font-family:ui-monospace,monospace;border:1px solid transparent;opacity:.65}',
    '.cm-search .cm-search-toggle[aria-pressed="true"]{background:rgba(76,139,245,.22);border-color:rgba(76,139,245,.6);opacity:1}',
    '.cm-search .cm-search-toggle[aria-pressed="true"]:hover{background:rgba(76,139,245,.32)}',
    '.cm-search input.cm-search-invalid{border-color:#e5484d}',
  ].join('\n');
  document.head.appendChild(style);
}

// 查找选项会话记忆：面板每次打开重建 DOM，开关状态跨开合保留（Typora 行为）
const lastQueryOptions: { caseSensitive: boolean; regexp: boolean } = {
  caseSensitive: false,
  regexp: false,
};

/** 自建查找/替换面板 DOM（挂载于 view.dom 顶部；状态由 ViewPlugin 管理）。 */
function buildMellowSearchPanelDom(view: EditorViewLike): HTMLElement {
  injectPanelStyle();
  const searchMod = requireSearchMod();

  const dom = document.createElement('div');
  dom.className = 'cm-search';

  const makeRow = (): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'cm-search-row';
    return row;
  };

  // 查找行
  const findRow = makeRow();
  const findInput = document.createElement('input');
  findInput.name = 'search';
  findInput.placeholder = '查找';
  findInput.setAttribute('aria-label', '查找');
  const prevBtn = document.createElement('button');
  prevBtn.name = 'prev';
  prevBtn.textContent = '↑';
  prevBtn.title = '上一个 (Shift+Enter)';
  const nextBtn = document.createElement('button');
  nextBtn.name = 'next';
  nextBtn.textContent = '↓';
  nextBtn.title = '下一个 (Enter)';

  // 查找选项 toggle（Typora parity：区分大小写 / 正则表达式）
  const caseBtn = document.createElement('button');
  caseBtn.className = 'cm-search-toggle';
  caseBtn.name = 'caseSensitive';
  caseBtn.textContent = 'Aa';
  caseBtn.title = '区分大小写';
  caseBtn.setAttribute('aria-pressed', 'false');
  const regexBtn = document.createElement('button');
  regexBtn.className = 'cm-search-toggle';
  regexBtn.name = 'regexp';
  regexBtn.textContent = '.*';
  regexBtn.title = '正则表达式';
  regexBtn.setAttribute('aria-pressed', 'false');

  findRow.append(findInput, caseBtn, regexBtn, prevBtn, nextBtn);

  // 替换行
  const replaceRow = makeRow();
  const replaceInput = document.createElement('input');
  replaceInput.name = 'replace';
  replaceInput.placeholder = '替换';
  replaceInput.setAttribute('aria-label', '替换');
  const replaceBtn = document.createElement('button');
  replaceBtn.name = 'replaceNext';
  replaceBtn.textContent = '替换';
  const replaceAllBtn = document.createElement('button');
  replaceAllBtn.name = 'replaceAll';
  replaceAllBtn.textContent = '全部';
  replaceRow.append(replaceInput, replaceBtn, replaceAllBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cm-search-close';
  closeBtn.name = 'close';
  closeBtn.textContent = '✕';
  closeBtn.title = '关闭 (Esc)';
  findRow.append(closeBtn);

  dom.append(findRow, replaceRow);

  // 初始值：openSearchPanel 已 dispatch 默认 query（含选中文本）；
  // 大小写/正则开关取会话记忆（openSearchPanel 每次重置为默认，不作为来源）
  try {
    const spec = searchMod.getSearchQuery(view.state);
    findInput.value = spec.search;
    if (spec.replace !== undefined) replaceInput.value = spec.replace;
  } catch { /* state 未就绪时忽略 */ }
  caseBtn.setAttribute('aria-pressed', String(lastQueryOptions.caseSensitive));
  regexBtn.setAttribute('aria-pressed', String(lastQueryOptions.regexp));

  /** 正则合法性预检：非法模式不提交 query，输入框标红 */
  const validateRegex = (): boolean => {
    if (!lastQueryOptions.regexp || findInput.value === '') {
      findInput.classList.remove('cm-search-invalid');
      return true;
    }
    try {
      void new RegExp(findInput.value);
      findInput.classList.remove('cm-search-invalid');
      return true;
    } catch {
      findInput.classList.add('cm-search-invalid');
      return false;
    }
  };

  const commitQuery = (): void => {
    if (!validateRegex()) return;
    view.dispatch({
      effects: searchMod.setSearchQuery.of(
        new searchMod.SearchQuery({
          search: findInput.value,
          replace: replaceInput.value,
          caseSensitive: lastQueryOptions.caseSensitive,
          regexp: lastQueryOptions.regexp,
        }),
      ),
    } as unknown);
  };

  findInput.addEventListener('input', commitQuery);
  replaceInput.addEventListener('input', commitQuery);
  caseBtn.addEventListener('click', () => {
    lastQueryOptions.caseSensitive = !lastQueryOptions.caseSensitive;
    caseBtn.setAttribute('aria-pressed', String(lastQueryOptions.caseSensitive));
    commitQuery();
  });
  regexBtn.addEventListener('click', () => {
    lastQueryOptions.regexp = !lastQueryOptions.regexp;
    regexBtn.setAttribute('aria-pressed', String(lastQueryOptions.regexp));
    commitQuery();
    if (lastQueryOptions.regexp) findInput.focus();
  });
  // 会话记忆含非默认开关时，打开即同步到 CM query（否则 toggle 前高亮按默认匹配）
  if (lastQueryOptions.caseSensitive || lastQueryOptions.regexp) commitQuery();
  nextBtn.addEventListener('click', () => { searchMod.findNext(view); });
  prevBtn.addEventListener('click', () => { searchMod.findPrevious(view); });
  replaceBtn.addEventListener('click', () => { searchMod.replaceNext(view); });
  replaceAllBtn.addEventListener('click', () => { searchMod.replaceAll(view); });

  const close = (): void => {
    searchMod.closeSearchPanel(view);
    view.focus();
  };
  closeBtn.addEventListener('click', close);

  dom.addEventListener('keydown', (event) => {
    const kev = event as KeyboardEvent;
    if (kev.key === 'Escape') {
      kev.preventDefault();
      close();
    } else if (kev.key === 'Enter') {
      kev.preventDefault();
      if (kev.target === findInput) {
        if (kev.shiftKey) searchMod.findPrevious(view);
        else searchMod.findNext(view);
      } else if (kev.target === replaceInput) {
        searchMod.replaceNext(view);
      }
    }
  });

  return dom;
}

export function buildDocumentSearchExtension(): Extension {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const searchMod = requireFn('@codemirror/search') as SearchRuntime;
  const viewMod = requireFn('@codemirror/view') as ViewRuntime;

  const openReplace = (view: unknown): boolean => {
    const v = view as EditorViewLike;
    searchMod.openSearchPanel(v);
    focusField(v, 'replace');
    return true;
  };

  const keymap = [
    ...searchMod.searchKeymap,
    { key: 'Mod-h', run: openReplace, scope: 'editor search-panel' },
  ];

  // 面板宿主：searchPanelOpen 状态开 → 挂自建面板；关 → 卸载。
  // Mod-f（CM keymap）/ 桥 openFind / openReplace 全部经 searchPanelOpen 收敛。
  const viewPlugin = viewMod.ViewPlugin.fromClass(
    class SearchPanelHost {
      private panel: HTMLElement | null = null;

      constructor(view: unknown) {
        activeView = view as EditorViewLike;
        this.sync(null, view as EditorViewLike);
      }

      update(update: ViewUpdate): void {
        this.sync(update.startState as unknown, update.view as EditorViewLike);
      }

      private sync(_startState: unknown, view: EditorViewLike): void {
        const isOpen = searchMod.searchPanelOpen(view.state);
        if (isOpen && this.panel === null) {
          this.panel = buildMellowSearchPanelDom(view);
          view.dom?.appendChild(this.panel);
          const input = this.panel.querySelector<HTMLInputElement>('input[name="search"]');
          if (input !== null) {
            input.focus();
            input.select();
          }
        } else if (!isOpen && this.panel !== null) {
          this.panel.remove();
          this.panel = null;
        }
      }

      destroy(): void {
        if (this.panel !== null) {
          this.panel.remove();
          this.panel = null;
        }
        activeView = null;
      }
    },
    {},
  );

  return [
    viewMod.panels(),
    viewMod.keymap.of(keymap),
    viewPlugin as Extension,
  ];
}

/** 注册宿主 → 引擎搜索桥（install() 调用） */
export function installSearchApi(): void {
  const api: MellowSearchApi = {
    openFind: () => {
      if (activeView === null) return;
      const searchMod = requireSearchMod();
      searchMod.openSearchPanel(activeView);
      focusField(activeView, 'search');
    },
    openReplace: () => {
      if (activeView === null) return;
      const searchMod = requireSearchMod();
      searchMod.openSearchPanel(activeView);
      focusField(activeView, 'replace');
    },
    findNext: () => {
      if (activeView === null) return;
      const searchMod = requireSearchMod();
      searchMod.findNext(activeView);
    },
    findPrevious: () => {
      if (activeView === null) return;
      const searchMod = requireSearchMod();
      searchMod.findPrevious(activeView);
    },
  };
  (window as unknown as { __MELLOW_SEARCH_API__?: MellowSearchApi }).__MELLOW_SEARCH_API__ = api;
}
