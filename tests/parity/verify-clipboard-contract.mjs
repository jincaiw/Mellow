/**
 * Clipboard 契约护栏（2026-10-05，审计 §4.72）。
 *
 * 立此条的原因（实测）：
 * `clipboard-smart-paste-spec` §3 声明了 6 级粘贴优先级 —— 其中
 * **2 = image/file payload**、**3 = TSV**、**4 = HTML rich content**。
 * 而实现把优先级 **2** 放在 `image/input.ts` 的**独立** `paste` eventHandler 里，
 * 3 / 4 / 5 放在 `smartPaste.ts` 的**另一个**处理器里 ——
 * ⇒ **两者谁赢，完全由 `packages/editor-engine/src/index.ts` 的扩展注册顺序决定**。
 *
 * 实测该顺序是 `buildSmartPasteExtension()`（行 272）**先于** `buildImageExtensions()`（行 279）
 * ⇒ **与 §3 的「2 高于 3 / 4」相反**：剪贴板同时含富文本与图片时（典型：从浏览器「复制图片」），
 * `handleSmartPaste()` 的 HTML 分支先命中并返回 `true` ⇒ 图片被转成远程 `![](src)`，
 * **不走**「复制到资源目录 / 上传」的图片管线。
 *
 * 为什么别的东西没发现它：`smart-paste.test.ts` 的「paste priority 链」测试**只覆盖链内**
 * （已钉住 3 > 4、4 > 5），**没有任何判据覆盖「两个处理器之间」的顺序**。
 *
 * ⚠️ **本护栏不裁定该冲突**（裁决在 `ADR-0030`，且需一手证据：真实剪贴板在「复制图片」时带哪些 MIME）。
 * 它的作用是**让冲突不会静默漂移**：把「有效顺序」从 `index.ts` **现算**出来，
 * 与 spec §3 的「**有效顺序（机器可读）**」行**双向**比对 ——
 * 改注册顺序而不改 spec ⇒ 失败；改 spec 而不改代码 ⇒ 同样失败。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const SPEC = 'docs/specs/clipboard-smart-paste-spec.md';
const ENGINE_INDEX = 'packages/editor-engine/src/index.ts';
const MARK = '有效顺序（机器可读）';

/**
 * 从引擎扩展注册表**现算**两个 paste 处理器的先后（不硬编码顺序 —— 硬编码就等于没判）。
 * 判定与 canary **共用**本函数。
 */
function effectiveOrder(src) {
  const smart = src.indexOf('buildSmartPasteExtension()');
  const image = src.indexOf('buildImageExtensions()');
  if (smart < 0 || image < 0) return null;
  return smart < image ? 'smartPaste-before-image' : 'image-before-smartPaste';
}

/** 从 spec 的机器可读行取声明顺序。判定与 canary **共用**本函数。 */
function declaredOrder(src) {
  const line = src.split('\n').find((l) => l.includes(MARK));
  if (line === undefined) return null;
  const m = /`([a-zA-Z-]+)`/.exec(line);
  return m === null ? null : m[1];
}

const indexSrc = read(ENGINE_INDEX);
const specSrc = read(SPEC);
const actual = effectiveOrder(indexSrc);
const declared = declaredOrder(specSrc);

if (actual === null) {
  fail(`无法从 ${ENGINE_INDEX} 现算 paste 处理器顺序（找不到 buildSmartPasteExtension() / `
    + 'buildImageExtensions()）—— 判据锚点漂移，别静默跳过');
}
if (declared === null) {
  fail(`${SPEC} 缺少「${MARK}」行（或该行没有反引号包裹的顺序值）—— `
    + 'paste 优先级的**有效顺序**必须有声明处，否则 spec §3 与实现的冲突会静默漂移');
}
if (actual !== null && declared !== null && actual !== declared) {
  fail(`${SPEC} 声明「有效顺序」= ${declared}，而 ${ENGINE_INDEX} 现算为 ${actual}`
    + ' —— spec §3 的优先级与实现的注册顺序不一致（见 ADR-0030）；'
    + '改了一处必须改另一处，**不得**让该冲突静默漂移');
}

// canary：四个方向（判定与 canary 共用 effectiveOrder / declaredOrder）
{
  const smartFirst = 'a\n    buildSmartPasteExtension(),\n    buildImageExtensions(),\n';
  const imageFirst = 'a\n    buildImageExtensions(),\n    buildSmartPasteExtension(),\n';
  if (effectiveOrder(smartFirst) !== 'smartPaste-before-image') {
    errors.push('clipboard 契约护栏 canary 失效：smartPaste 在前未被识别');
  }
  if (effectiveOrder(imageFirst) !== 'image-before-smartPaste') {
    errors.push('clipboard 契约护栏 canary 失效：image 在前未被识别');
  }
  if (effectiveOrder('a\n') !== null) {
    errors.push('clipboard 契约护栏 canary 过宽：两个锚点都缺失时不应返回顺序');
  }
  if (declaredOrder(`> **${MARK}**：\`image-before-smartPaste\``) !== 'image-before-smartPaste') {
    errors.push('clipboard 契约护栏 canary 失效：spec 的机器可读行未被解析');
  }
  if (declaredOrder('> 没有锚点的一行 `x`') !== null) {
    errors.push('clipboard 契约护栏 canary 过宽：缺少锚点却仍被解析');
  }
}

if (errors.length > 0) {
  throw new Error(`Clipboard contract violations:\n  ${errors.join('\n  ')}`);
}
console.log(
  `Clipboard contract: paste 处理器的**有效顺序**与 spec §3 的声明一致（现算 = ${actual}）；`
  + '该顺序决定 §3 优先级 2 与 3/4 的胜负（冲突本身待 ADR-0030 裁决）',
);
