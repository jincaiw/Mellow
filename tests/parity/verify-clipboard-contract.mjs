/**
 * Clipboard 契约护栏（2026-10-05 建立；同日按 ADR-0030 裁决改写）。
 *
 * ## 背景（为什么要有这条）
 *
 * `clipboard-smart-paste-spec` §3 声明了 6 级粘贴优先级 —— 其中
 * **2 = image/file payload** 高于 **3 = TSV** / **4 = HTML rich content**。
 * 而实现把它拆到了**两个独立**的 `paste` eventHandler 里：
 * 优先级 2 在 `image/input.ts`，3/4/5 在 `smartPaste.ts`。
 * CodeMirror 按**扩展注册顺序**调用、**首个返回 `true` 者胜** ——
 * 而 `packages/editor-engine/src/index.ts` 把 `buildSmartPasteExtension()`（行 272）
 * 排在 `buildImageExtensions()`（行 279）**之前**
 * ⇒ **两者都命中时 HTML 先赢，与 §3 相反**（剪贴板同时含富文本与图片时，图片被转成远程 `![](src)`）。
 *
 * ## 前提变更（2026-10-05，ADR-0030 裁决 = A3）
 *
 * 本条护栏**首版**锁的是「spec 声明的**有效顺序** ⇄ `index.ts` 现算的注册顺序」——
 * 它让冲突**不会静默漂移**，但**不裁定**冲突。
 * ADR-0030 裁决为 **A3：把顺序决策收敛到 `handleSmartPaste` 内的一处显式判断**
 * （有图片 payload 则**让位**），于是「谁优先」**不再依赖注册顺序** ⇒ 首版的前提消失。
 *
 * 故本条护栏现在锁的是**更强的不变量**：
 * **§3 优先级 2 必须在代码里被显式落实**（`hasImagePayload(data)` → `return false`），
 * 且 spec 的「落实方式（机器可读）」行必须与之**双向一致**：
 * 去掉显式让位 ⇒ 现算值变回 `order-dependent` ⇒ 与声明不符 ⇒ 失败。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const SPEC = 'docs/specs/clipboard-smart-paste-spec.md';
const SMART_PASTE = 'packages/editor-engine/src/smartPaste.ts';
const ENGINE_INDEX = 'packages/editor-engine/src/index.ts';
const MARK = '优先级 2 的落实方式（机器可读）';

/**
 * 从 `smartPaste.ts` **现算**优先级 2 的落实方式（不硬编码结论）。
 * 判定与 canary **共用**本函数。
 */
function enforcementFromSource(src) {
  // 显式让位：读到「有图片 payload」后立刻 `return false`（交给图片处理器）。
  return /hasImagePayload\(data\)[\s\S]{0,120}?return false;/.test(src)
    ? 'payload-yield-explicit'
    : 'order-dependent';
}

/** 从 spec 的机器可读行取声明值。判定与 canary **共用**本函数。 */
function enforcementFromSpec(src) {
  const line = src.split('\n').find((l) => l.includes(MARK));
  if (line === undefined) return null;
  const m = /`([a-z-]+)`/.exec(line);
  return m === null ? null : m[1];
}

const smartSrc = read(SMART_PASTE);
const specSrc = read(SPEC);
const computed = enforcementFromSource(smartSrc);
const declared = enforcementFromSpec(specSrc);

if (declared === null) {
  fail(`${SPEC} 缺少「${MARK}」行（或该行没有反引号包裹的值）—— `
    + '§3 优先级 2 的**落实方式**必须有声明处，否则「它靠注册顺序还是靠显式判断」会静默漂移');
}
if (computed !== declared) {
  fail(`${SPEC} 声明 §3 优先级 2 的落实方式 = ${declared}，而 ${SMART_PASTE} 现算为 ${computed}`
    + ' —— 显式让位若被移除，优先级就会退回「由扩展注册顺序决定」（ADR-0030 已裁决不采用该形态）');
}

// 附加事实（不作判据，只做可见性）：注册顺序仍是 3/4/5 的处理器在前 ——
// A3 之后它**不再承载语义**，但读者需要知道这件事，否则会误以为顺序无关紧要。
const engineSrc = read(ENGINE_INDEX);
const lineOf = (needle) => {
  const at = engineSrc.indexOf(needle);
  return at < 0 ? null : engineSrc.slice(0, at).split('\n').length;
};
const smartLine = lineOf('buildSmartPasteExtension()');
const imageLine = lineOf('buildImageExtensions()');
if (smartLine === null || imageLine === null) {
  fail(`${ENGINE_INDEX} 找不到 buildSmartPasteExtension() / buildImageExtensions() —— 锚点漂移`);
}

// canary：四个方向（判定与 canary 共用两个解析函数）
{
  const withYield = 'if (hasImagePayload(data)) {\n    return false;\n  }';
  const withoutYield = 'if (data === null) {\n    return false;\n  }';
  if (enforcementFromSource(withYield) !== 'payload-yield-explicit') {
    errors.push('clipboard 契约护栏 canary 失效：显式让位未被识别');
  }
  if (enforcementFromSource(withoutYield) !== 'order-dependent') {
    errors.push('clipboard 契约护栏 canary 失效：缺少显式让位时未判为 order-dependent');
  }
  if (enforcementFromSpec(`> **${MARK}**：\`payload-yield-explicit\``) !== 'payload-yield-explicit') {
    errors.push('clipboard 契约护栏 canary 失效：spec 的机器可读行未被解析');
  }
  if (enforcementFromSpec('> 没有锚点的一行 `payload-yield-explicit`') !== null) {
    errors.push('clipboard 契约护栏 canary 过宽：缺少锚点却仍被解析');
  }
}

if (errors.length > 0) {
  throw new Error(`Clipboard contract violations:\n  ${errors.join('\n  ')}`);
}
console.log(
  `Clipboard contract: §3 优先级 2（image payload）的落实方式 = ${computed}`
  + `（与 spec 声明一致）；显式让位使该优先级**不依赖扩展注册顺序**`
  + `（注册顺序现为 smartPaste@L${smartLine} / image@L${imageLine}，已不承载语义）`,
);
