/**
 * 拼写检查作用域（批次 A38 / ADR-0038 C）：`editor.spellcheckForCodeAndLink`。
 *
 * Typora 偏好 `spellcheckForCodeAndLink`（默认 false）决定代码/链接内是否标拼写错误。
 * Mellow 现状 = **无条件排除**（行内码 `inlineCodeAttrs.ts` 的 `spellcheck=false`；
 * 块级码由 vendored `code.ts` 的 `codeBlockStyle` wrapper 承担）。本模块把「排除」
 * 变成**可开关**，且**默认关 ⇒ 行为与开关引入前逐字一致**：
 *
 * - **行内码**（`inlineCodeAttrs.ts` 消费本模块状态）：开关开 ⇒ 标记属性**省略**
 *   `spellcheck` ⇒ 继承 `cm-content` 的有效拼写态（含大文件强制关、全局关 ⇒ 自然不检查，
 *   所以这里只需要「不再主动排除」）。⚠️ 不得改动 `INLINE_CODE_ATTRIBUTES` 字面量本身
 *   —— `verify-parity-ledger.mjs` 的 INLINE↔BLOCK 属性相等守卫比对**字面量**。
 * - **块级码**（本模块的 ViewPlugin 同步 `.cm-md-codeBlockWrapper` DOM 属性）：
 *   vendored wrapper 的字面量属性 `spellcheck:'false'` 不动（同一守卫 + UPSTREAM 取向），
 *   开=覆盖为 `'true'`，关=恢复 `'false'`。生效值同时受**全局**拼写开关约束
 *   （`isUserSpellcheck()`）⇒ 全局关时代码块也不得被强制打开。
 * - **链接**：Mellow 从未对链接设过拼写排除（实测 `Link` 标记无任何 spellcheck 属性），
 *   Typora 该键的「Link」半在 Mellow 里天然成立 ⇒ 无需动作（如实登记于 ADR-0038 施工说明）。
 *
 * 通道与 `codeLineNumbers.ts` 同模式：模块级状态 + version + 空 dispatch 强制重算；
 * 宿主经 iframe `window.__MELLOW_SPELLCHECK_SCOPE__` 注入（EditorCore 方法名对齐
 * `__MELLOW_SPELLCHECK__` 一族）。
 */

import type { Extension } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { isUserSpellcheck } from './largeFile';

/** 块级代码 wrapper 的 class（vendored `code.ts` codeBlockStyle 的唯一锚点） */
const CODE_BLOCK_WRAPPER_CLASS = 'cm-md-codeBlockWrapper';

let enabled = false;
let version = 0;
const activeViews = new Set<EditorView>();

export function setSpellcheckForCodeAndLink(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  version += 1;
  for (const view of activeViews) {
    view.dispatch({ effects: [] });
  }
}

export function isSpellcheckForCodeAndLink(): boolean {
  return enabled;
}

/** 状态版本号：切换时 +1，消费方（inlineCodeAttrs / 本模块插件）据此触发重算 */
export function spellcheckScopeVersion(): number {
  return version;
}

/** 宿主 → iframe 通道（A38） */
export interface SpellcheckScopeApi {
  set(v: boolean): void;
  get(): boolean;
}

export function installSpellcheckScopeApi(): void {
  (window as unknown as { __MELLOW_SPELLCHECK_SCOPE__?: SpellcheckScopeApi }).__MELLOW_SPELLCHECK_SCOPE__ = {
    set: setSpellcheckForCodeAndLink,
    get: isSpellcheckForCodeAndLink,
  };
}

/**
 * 块级码拼写作用域同步（纯函数，可单测）：给定开关与全局拼写态，返回 wrapper 的
 * `spellcheck` 属性值。
 * - 开关关 ⇒ 恒 `'false'`（= vendored 字面量，现状不变）；
 * - 开关开 ⇒ 跟随**全局**用户拼写偏好（全局关时不得在代码块里私自打开拼写）。
 */
export function blockWrapperSpellcheckAttr(scopeEnabled: boolean, userSpellcheck: boolean): 'true' | 'false' {
  return scopeEnabled && userSpellcheck ? 'true' : 'false';
}

/** 构建块级码 wrapper 的 DOM 属性同步扩展（ViewPlugin，跟踪 view 供 set 触发重算） */
export function buildSpellcheckScopeExtension(): Extension {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const { ViewPlugin } = requireFn('@codemirror/view') as typeof import('@codemirror/view');

  const syncBlockWrappers = (view: EditorView): void => {
    const attr = blockWrapperSpellcheckAttr(enabled, isUserSpellcheck());
    const wrappers = view.dom.querySelectorAll(`.${CODE_BLOCK_WRAPPER_CLASS}`);
    wrappers.forEach((el) => {
      if (el.getAttribute('spellcheck') !== attr) {
        el.setAttribute('spellcheck', attr);
      }
    });
  };

  return ViewPlugin.fromClass(
    class SpellcheckScopePlugin {
      private watchedVersion = spellcheckScopeVersion();

      constructor(readonly view: EditorView) {
        activeViews.add(view);
        syncBlockWrappers(view);
      }

      update(_update: ViewUpdate): void {
        // vendored BlockWrapper 在重渲染时会重建 DOM 并带回字面量 spellcheck='false'
        // （docChanged 后新增/重建的代码块尤其如此）⇒ 每次 update 都轻量幂等同步。
        if (spellcheckScopeVersion() !== this.watchedVersion) this.watchedVersion = spellcheckScopeVersion();
        syncBlockWrappers(_update.view);
      }

      destroy(): void {
        activeViews.delete(this.view);
      }
    },
  );
}
