/**
 * Readonly Mode（E6a：Typora 1.14.9 toggleReadonlyMode: 对标）。
 *
 * - 宿主（view.readonly.toggle 命令）经 iframe window.__MELLOW_READONLY_API__ 调用；
 * - EditorView.editable + EditorState.readOnly Compartment 动态切换：
 *   只读时禁输入/编辑，保留选择、复制、滚动；
 * - .mellow-readonly class 供 shell 呈现视觉状态（光标语义不变）。
 */
import type { Extension } from '@codemirror/state';

interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Compartment: typeof import('@codemirror/state').Compartment;
  EditorState: typeof import('@codemirror/state').EditorState;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') throw new Error('[mellow-editor-engine] window.require is not available');
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  return { EditorView: view.EditorView, ViewPlugin: view.ViewPlugin, Compartment: state.Compartment, EditorState: state.EditorState };
}

type ReadonlyView = {
  dispatch: (t: { effects: unknown }) => void;
  dom: HTMLElement;
};

let readonlyMode = false;
const trackedViews = new Set<ReadonlyView>();
/** buildReadonlyExtension 注入：对全部已跟踪视图按当前状态重配置 editable Compartment */
let reconfigureAll: (() => void) | null = null;

/** 当前是否只读（单窗口单文档语义，全局状态） */
export function isReadonlyMode(): boolean {
  return readonlyMode;
}

/** 构建 Readonly 扩展（editable Compartment + 视图生命周期跟踪） */
export function buildReadonlyExtension(): Extension {
  const cm = resolveCm();
  const comp = new cm.Compartment();

  const apply = (view: ReadonlyView, readonly: boolean): void => {
    try {
      view.dispatch({
        effects: comp.reconfigure([
          cm.EditorView.editable.of(!readonly),
          cm.EditorState.readOnly.of(readonly) as unknown as Extension,
        ]),
      });
    } catch {
      // 视图已销毁等场景：跳过（单视图失败不阻断其余视图）
    }
    view.dom.classList.toggle('mellow-readonly', readonly);
  };
  reconfigureAll = (): void => {
    for (const view of trackedViews) apply(view, readonlyMode);
  };

  const plugin = cm.ViewPlugin.fromClass(
    class ReadonlyPlugin {
      constructor(readonly view: import('@codemirror/view').EditorView) {
        trackedViews.add(view as unknown as ReadonlyView);
        // 构造期禁止 dispatch（CM update 进行中，reconfigure 会抛错破坏视图初始化）；
        // editable 初始值已按 readonlyMode 构建。视觉 class 必须在 CM 完成主题类名
        // 应用之后写（requestMeasure.write 恰在 update 收尾执行），否则会被抹掉；
        // setReadonlyMode 的事务路径由 update() 同步。
        view.requestMeasure({
          read: () => 0,
          write: () => { view.dom.classList.toggle('mellow-readonly', readonlyMode); },
        });
      }
      update(): void {
        this.view.dom.classList.toggle('mellow-readonly', readonlyMode);
      }
      destroy(): void {
        trackedViews.delete(this.view as unknown as ReadonlyView);
      }
    },
  );
  const theme = cm.EditorView.theme({
    '&.mellow-readonly .cm-content': { cursor: 'default' },
    '&.mellow-readonly .cm-cursor': { display: 'none' },
  });
  return [comp.of([cm.EditorView.editable.of(!readonlyMode), cm.EditorState.readOnly.of(readonlyMode) as unknown as Extension]), plugin, theme];
}

/** 切换只读（对全部已跟踪视图重配置） */
export function setReadonlyMode(enabled: boolean): void {
  readonlyMode = enabled;
  reconfigureAll?.();
}

/** 宿主桥：iframe window.__MELLOW_READONLY_API__ */
export function installReadonlyApi(): void {
  (window as unknown as { __MELLOW_READONLY_API__?: { set: (on: boolean) => void; toggle: () => boolean; isActive: () => boolean } }).__MELLOW_READONLY_API__ = {
    set: (on: boolean) => setReadonlyMode(on),
    toggle: () => {
      setReadonlyMode(!readonlyMode);
      return readonlyMode;
    },
    isActive: () => readonlyMode,
  };
}
