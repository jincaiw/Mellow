/**
 * F3（第四轮，Typora 桌面 Tab 惯例）：Tabbar 「＋」新建钮 / 双击空白新建 / 中键关闭。
 * 无 @testing-library/react 依赖，用 react-dom/client + act 原生渲染。
 */
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Tabbar } from '../src/Tabbar';
import type { DocumentTab } from '../../app-core/src';

const t = (key: string): string => {
  const map: Record<string, string> = {
    'tabbar.label': 'Tabs',
    'tabbar.newTab': 'New Document',
    'tab.close.label': 'Close',
    'msg.unsavedDoc': 'Untitled',
  };
  return map[key] ?? key;
};

const makeTab = (id: string, title: string): DocumentTab => ({
  id, path: null, title, content: '', dirty: false, documentId: id, revision: 0,
  encoding: 'utf-8', eol: '\n', diskState: null,
});

const DROP = (): void => undefined;

// jsdom 无 scrollIntoView（Tabbar active 滚动 useRef effect）
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = (() => undefined) as never;
}

function fire(node: Element, type: string, init: MouseEventInit = {}): void {
  node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('Tabbar F3 interactions', () => {
  let onNewTab: jest.Mock;
  let onClose: jest.Mock;
  let onSelect: jest.Mock;
  let host: HTMLDivElement;
  let root: Root;

  const mount = (tabs: DocumentTab[]): HTMLElement => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <Tabbar tabs={tabs} activeTabId="a" t={t} onSelect={onSelect} onClose={onClose} onDropTab={DROP} onNewTab={onNewTab} />,
      );
    });
    return host;
  };

  const unmount = (): void => {
    act(() => { root.unmount(); });
    host.remove();
  };

  beforeEach(() => {
    onNewTab = jest.fn();
    onClose = jest.fn();
    onSelect = jest.fn();
  });

  test('「＋」按钮触发 onNewTab', () => {
    const hostEl = mount([makeTab('a', 'A')]);
    const btn = hostEl.querySelector('.tab-new') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    act(() => { fire(btn, 'click'); });
    expect(onNewTab).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  test('双击 tabbar 空白触发 onNewTab；双击 tab 本体不触发', () => {
    const hostEl = mount([makeTab('a', 'A')]);
    const nav = hostEl.querySelector('.tabbar') as HTMLElement;
    act(() => { fire(nav, 'dblclick'); });
    expect(onNewTab).toHaveBeenCalledTimes(1);

    const tabEl = hostEl.querySelector('.tab') as HTMLElement;
    act(() => { fire(tabEl, 'dblclick'); });
    expect(onNewTab).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('中键点击 tab 关闭对应 tab（左键仍为选择）', () => {
    const hostEl = mount([makeTab('a', 'A'), makeTab('b', 'B')]);
    const tabB = hostEl.querySelectorAll('.tab')[1] as HTMLButtonElement;
    act(() => { fire(tabB, 'auxclick', { button: 1 }); });
    expect(onClose).toHaveBeenCalledWith('b');

    const tabA = hostEl.querySelectorAll('.tab')[0] as HTMLButtonElement;
    act(() => { fire(tabA, 'click', { button: 0 }); });
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
