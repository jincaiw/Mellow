/** @jest-environment jsdom */
/**
 * Security Review H1 回归：Reader 原始 HTML 净化（DOM 白名单）。
 * 覆盖实体编码绕过 / data: / 事件属性 / 危险协议 / 嵌套 / 允许标签保留。
 */
import { renderReaderHtml } from '../src/reader';

function blockHtml(raw: string): string {
  // 原始 HTML 块经 renderReaderHtml 的 sanitizeHtml 管道
  return renderReaderHtml(`para\n\n${raw}\n\nend`).html;
}

describe('Reader sanitizeHtml — Security Review H1', () => {
  test('实体编码的 javascript: 被拒绝（H1 绕过路径）', () => {
    const out = blockHtml('<a href="java&#115;cript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).not.toContain('&#115;cript:');
    expect(out).toContain('>x</a>');
    // href 被剥离：链接保留文本但无危险地址
    expect(out).not.toMatch(/<a[^>]*href=/);
  });

  test('javascript: / vbscript: / data: 协议一律拒绝', () => {
    for (const bad of ['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>1</script>', 'JaVaScRiPt:alert(1)']) {
      const out = blockHtml(`<a href="${bad}">x</a>`);
      expect(out).not.toMatch(/<a[^>]*href=/);
      expect(out).toContain('>x</a>');
    }
  });

  test('on* 事件属性、style、srcdoc 被剥离', () => {
    const out = blockHtml('<img src="https://ok.test/a.png" onerror="alert(1)" style="background:url(evil)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('style=');
    const iframe = blockHtml('<iframe srcdoc="<script>x</script>" src="https://ok.test"></iframe>');
    expect(iframe).not.toContain('srcdoc');
    expect(iframe).toContain('sandbox');
  });

  test('script / style / object / embed 标签被移除', () => {
    const out = blockHtml('<script>alert(1)</script><style>x{}</style><object data="x"></object><embed src="y"><p>keep</p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
    expect(out).toContain('<p>keep</p>');
  });

  test('允许的标签与安全属性保留；未知属性剥离', () => {
    const out = blockHtml('<p title="ok" onclick="x()" custom="y">hi <strong>bold</strong></p>');
    expect(out).toContain('<p title="ok"');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('custom');
    expect(out).toContain('<strong>bold</strong>');
  });

  test('合法 https / 相对链接保留', () => {
    const out = blockHtml('<a href="https://example.com/a?x=1&amp;y=2">link</a> <a href="/rel">rel</a>');
    expect(out).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(out).toContain('href="/rel"');
  });

  test('原始 HTML 块中的脚本不产生可执行输出', () => {
    const out = blockHtml('<script>window.__pwned__ = 1</script>');
    expect(out).not.toContain('__pwned__');
    expect(out).not.toContain('<script');
  });
});

// 2026-09-30 追加：既有 7 例已覆盖「实体编码 / data: / 事件属性 / 危险协议 / 嵌套 / 允许标签保留」。
// 本组只补**当时未覆盖的变体** + 一条**与编辑器白名单一致性**的回归。
describe('Reader sanitizeHtml — 追加变体（2026-09-30）', () => {
  test('实体编码的另两种写法：十六进制 与 无分号（仅十进制 &#115; 曾被覆盖）', () => {
    for (const raw of ['java&#x73;cript:alert(1)', 'javascript&#58;alert(1)']) {
      const out = blockHtml(`<a href="${raw}">x</a>`);
      expect(out).not.toMatch(/<a[^>]*href=/);
      expect(out).toContain('>x</a>');
    }
  });

  test('非白名单标签 form / input 被移除（既有用例只覆盖 script/style/object/embed）', () => {
    expect(blockHtml('<form><input value="x"></form>')).not.toContain('<form');
    expect(blockHtml('<form><input value="x"></form>')).not.toContain('<input');
  });

  test('mailto: 属合法协议，必须保留（正向对照，防「一律剥光」也算过）', () => {
    expect(blockHtml('<a href="mailto:a@b.c">m</a>')).toContain('href="mailto:a@b.c"');
  });

  test('IFRAME 的 sandbox 是**空串**（既有用例只断言「含 sandbox」）', () => {
    expect(blockHtml('<iframe src="https://evil.test"></iframe>')).toContain('sandbox=""');
  });

  // ★ 与 editor-engine 的 ALLOWED_TAGS 一致性：两侧曾差一个 KBD →
  // 同一段 <kbd> 在编辑器里保留、在 Reader 里被剥掉（屏幕上看不出原因）。
  // 白名单**逐项一致**另由 tests/parity/verify-parity-ledger.mjs 锁。
  test('★ <kbd> 必须保留（与 editor-engine 的 ALLOWED_TAGS 一致；曾差一个 KBD）', () => {
    expect(blockHtml('<p>按 <kbd>Cmd</kbd> 保存</p>')).toContain('<kbd>Cmd</kbd>');
  });
});
