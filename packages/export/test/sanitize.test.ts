/**
 * HTML Export 安全输出（raw HTML 白名单）测试 —— PRD §48。
 *
 * ⚠️ **覆盖边界如实声明**：
 * - 本文件是**行为**测试（代表性样本 + 安全向量），**不是**完整性锁。
 *   「编辑器白名单 ⊆ 导出白名单」的**逐标签完整性**由静态护栏
 *   `tests/parity/verify-parity-ledger.mjs` 机械锁定（它从两侧源码解析集合并比对），
 *   因为在这里硬编码 41 个标签会制造**第三份副本**（改一处不同步另两处）。
 * - 立此文件的原因（2026-10-06，审计 §4.83）：`sanitizeOutput`（`rawHtml: true` 的**默认**路径）
 *   此前**零测试覆盖** —— 只有 `rawHtml: false` 的转义路径被测过。
 *   而实测该白名单**已经漂移**：编辑器 41 个标签里的 `kbd` 不在导出白名单里
 *   ⇒ `<kbd>` 在编辑器/Reader 渲染成按键样式，导出时被 `discard`（**去标签保文本**）剥成纯文本。
 */

import { sanitizeOutput, createSanitizeOptions, getSanitizeOptions } from '../src/html/sanitize';

describe('HTML Export safe output（PRD §48）', () => {
  test('编辑器白名单里的 kbd 必须保留（2026-10-06 修复的漂移点）', () => {
    // 编辑器/Reader 的 safeHtml 白名单含 KBD；导出侧曾漏抄 ⇒ 同一段 HTML 两处结果不同。
    expect(sanitizeOutput('<kbd>Ctrl</kbd>')).toContain('<kbd>Ctrl</kbd>');
  });

  test('常见行内/块级标签保留（PRD §48「common inline tags」/「block tags」抽样）', () => {
    const html = '<p>a <strong>b</strong> <em>c</em> <code>d</code> <del>e</del> '
      + '<sub>f</sub> <sup>g</sup> <abbr title="t">h</abbr> <span>i</span></p>'
      + '<blockquote>q</blockquote><ul><li>l</li></ul><details><summary>s</summary>x</details>';
    const out = sanitizeOutput(html);
    for (const tag of ['strong', 'em', 'code', 'del', 'sub', 'sup', 'abbr', 'span',
      'blockquote', 'ul', 'li', 'details', 'summary']) {
      expect(out).toContain(`<${tag}`);
    }
  });

  test('video / audio / iframe 保留，且 iframe 强制 sandbox（PRD §48）', () => {
    const out = sanitizeOutput(
      '<video src="v.mp4" controls></video><audio src="a.mp3"></audio>'
      + '<iframe src="https://example.com/e"></iframe>',
    );
    expect(out).toContain('<video');
    expect(out).toContain('<audio');
    expect(out).toContain('<iframe');
    expect(out).toMatch(/<iframe[^>]*sandbox/);
  });

  test('no script：script / object / form / style 被剥（PRD §48）', () => {
    const out = sanitizeOutput(
      '<script>alert(1)</script><object data="x">O</object><form><input></form><style>*{}</style>',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<style');
    // script/style 属 sanitize-html 的 `nonTextTags` ⇒ **连同文本内容一起丢弃**
    //（与普通被剥标签的 `discard`「去标签保文本」不同，故这里能断言内容也消失）
    expect(out).not.toContain('alert(1)');
  });

  test('input 是**有意放行**的导出产物（task list 复选框），但属性被限制', () => {
    // ⚠️ 这条记录一处**有意的差异**：`input` 不在编辑器/Reader 白名单里，
    // 而在导出白名单里（`- [x]` → `<input type="checkbox">`）。
    // ⇒ 因此本文件的其余断言**不得**把 `input` 当作「应被剥的标签」。
    expect(sanitizeOutput('<input type="checkbox" checked disabled>')).toContain('<input');
    // 但事件属性仍必须被剥（属性白名单只放行 type/checked/disabled）
    const out = sanitizeOutput('<input type="checkbox" onclick="x()">');
    expect(out).not.toContain('onclick');
  });

  test('no inline events：on* 属性被剥（PRD §48）', () => {
    const out = sanitizeOutput('<p onclick="x()" onmouseover="y()">ok</p>');
    expect(out).toContain('<p>ok</p>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
  });

  test('no JavaScript URL：href/src 的 javascript: 协议被剥（PRD §48）', () => {
    const out = sanitizeOutput('<a href="javascript:alert(1)">x</a><img src="javascript:alert(2)">');
    expect(out).not.toContain('javascript:');
  });

  test('style 属性被剥（不在属性白名单里）', () => {
    const out = sanitizeOutput('<p style="color:red">ok</p>');
    expect(out).toContain('<p>ok</p>');
    expect(out).not.toContain('style=');
  });

  test('a[target=_blank] 强制补 rel="noopener noreferrer"', () => {
    const out = sanitizeOutput('<a href="https://x.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  test('discard 语义：被剥标签的**文本内容保留**（不是整段丢弃）', () => {
    // 这条把「漂移的影响面」写死：kbd 漏抄时不会丢字，只会**丢样式**。
    const out = sanitizeOutput('<p>a</p><kbd>Ctrl</kbd><object>OBJ</object>');
    expect(out).toContain('Ctrl');
    expect(out).toContain('OBJ');
  });

  test('配置是缓存的单例，且 createSanitizeOptions 与 getSanitizeOptions 同源', () => {
    // 若 getSanitizeOptions 返回的不是 createSanitizeOptions 的产物，
    // 单测覆盖的配置与运行时用的配置就会分叉（「测的不是跑的那份」）。
    const fresh = createSanitizeOptions();
    const cached = getSanitizeOptions();
    expect(cached).toBe(getSanitizeOptions());
    expect(cached.allowedTags).toEqual(fresh.allowedTags);
    expect(cached.allowedSchemes).toEqual(fresh.allowedSchemes);
    expect(cached.allowedAttributes).toEqual(fresh.allowedAttributes);
  });
});
