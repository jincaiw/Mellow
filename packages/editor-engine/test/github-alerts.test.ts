import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { buildGitHubAlertsExtension, parseGitHubAlerts, renderGitHubAlertHtml } from '../src/githubAlerts';
import { setUpEditor, sleep } from './harness';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../../tests/fixtures/alerts', name), 'utf8');

describe('GitHub Style Alerts（PRD §46）', () => {
  test('parser supports NOTE/TIP/IMPORTANT/WARNING/CAUTION and skips code fences', () => {
    const alerts = parseGitHubAlerts(fixture('github-alerts-corpus.md'));
    expect(alerts.map((a) => a.kind)).toEqual(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);
    expect(alerts[0].content).toBe('中文 Note 内容。');
    expect(alerts.some((a) => a.content.includes('代码块'))).toBe(false);
  });

  test('render html uses semantic classes and escapes content', () => {
    const html = renderGitHubAlertHtml({ kind: 'WARNING', content: '<script>x</script>', from: 0, to: 1, source: '> [!WARNING]' });
    expect(html).toContain('mellow-alert-warning');
    expect(html).toContain('WARNING');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  test('idle renders alert widgets, normal blockquote remains source', async () => {
    const view = setUpEditor('> [!NOTE]\n> 中文内容\n\n> 普通引用');
    await sleep();
    expect(view.dom.querySelector('.mellow-alert-note')?.textContent).toContain('中文内容');
    expect(view.dom.textContent).toContain('普通引用');
  });

  test('source reveal: caret inside alert keeps source', async () => {
    const view = setUpEditor('> [!NOTE]\n> 中文内容');
    view.dispatch({ selection: { anchor: 4 } });
    await sleep();
    expect(view.dom.querySelector('.mellow-alert')).toBeNull();
  });

  test('setting can disable GitHub Alerts rendering', async () => {
    const view = new EditorView({
      doc: '> [!NOTE]\n> 中文内容',
      parent: document.body,
      extensions: [buildGitHubAlertsExtension(false, { enabled: false })],
    });
    await sleep();
    expect(view.dom.querySelector('.mellow-alert')).toBeNull();
    expect(view.dom.textContent).toContain('[!NOTE]');
  });
});
