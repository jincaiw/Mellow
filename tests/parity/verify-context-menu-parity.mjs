#!/usr/bin/env node
/**
 * P1-1.7 编辑器右键菜单契约护栏（G4-MENU-07）。
 *
 * 契约来源（最高证据等级：Typora 1.14.9 build 7785 本机实机代码 + 官方语言包）：
 *   - /Applications/Typora.app/Contents/Resources/TypeMark/appsrc/main.js
 *     函数 getMenuItemsForMac() 返回右键条目键序列，按 mdtype 分支：
 *       fences（普通代码块）→ ["|","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete-fences"]
 *       math_block          → ["|","edit","copyMathBlock","download-math","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete"]
 *       fences+md-diagram   → ["|","edit","copy-as-image","download-diagram","code-tools","|","insertParagraphBefore","insertParagraphAfter","delete"]
 *       /^table/            → ["|","table","|","insertParagraphBefore","insertParagraphAfter"]
 *       链接 a/.md-link     → ["openLink","copyLink","|","normal",download]
 *   - .../locales/zh-Hans.lproj/Menu.json 与 en 默认表：条目文案逐字来源
 *       "Copy Code Content" = 复制代码块内容   "Copy as Tex" = 复制为 Tex 代码
 *       "Copy Link Address" = 复制链接地址
 *
 * 本护栏校验三件事：
 *   1. 每个右键条目都经 dispatchCommand（§7.4 硬规则 11 / G4-MENU-07），除登记的例外外不得直连引擎；
 *   2. 每个 dispatchCommand 的 id 必须在 CommandRegistry 里有定义；
 *   3. 每种 kind 的条目序列与 Typora 1.14.9 契约一致。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// 允许注入被测文件路径：mutation 自检（verify-context-menu-guard.mjs）会传临时副本进来。
const APP_TSX = process.argv[2] ?? join(root, 'apps', 'desktop', 'src', 'App.tsx');

const errors = [];
const fail = (msg) => errors.push(msg);

/**
 * Typora 1.14.9 右键条目 → Mellow 命令 id 的映射契约。
 *
 * Typora 把 code-tools / table / Alignment / copyMathBlock 做成子菜单；
 * C1 起 ContextMenu 支持一层子菜单，条目以「展开后的 dispatch 序列」比对——
 * 子菜单父项不 dispatch，子项顺序必须与 Typora 子菜单展开序一致。
 */
const BASE = ['edit.cut', 'edit.copy', 'edit.paste'];

/** code-tools 子菜单展开（code / math / mermaid 共用） */
const CODE_TOOLS = ['paragraph.copyCodeBlock', 'paragraph.autoIndentCodeBlock', 'paragraph.autoIndentSelection'];
const INSERT_PARAGRAPHS = ['paragraph.insertParagraphBefore', 'paragraph.insertParagraphAfter'];

const CTX_CONTRACT = {
  text: { typora: ['normal'], items: [...BASE] },
  link: {
    typora: ['openLink', 'copyLink', '|', 'normal'],
    items: [...BASE, 'format.openLink', 'format.copyLinkUrl', 'format.editLinkUrl', 'format.removeLink'],
  },
  code: {
    typora: ['|', 'code-tools', '|', 'insertParagraphBefore', 'insertParagraphAfter', 'delete-fences'],
    items: [...BASE, ...CODE_TOOLS, ...INSERT_PARAGRAPHS, 'paragraph.deleteFences'],
  },
  math: {
    typora: ['|', 'edit', 'copyMathBlock', 'download-math', 'code-tools', '|', 'insertParagraphBefore', 'insertParagraphAfter', 'delete'],
    items: [...BASE, 'math.copyAsTex', 'math.copyAsMathML', 'math.copyAsImage', 'math.download', ...CODE_TOOLS, ...INSERT_PARAGRAPHS, 'math.deleteBlock'],
  },
  mermaid: {
    typora: ['|', 'edit', 'copy-as-image', 'download-diagram', 'code-tools', '|', 'insertParagraphBefore', 'insertParagraphAfter', 'delete'],
    items: [...BASE, 'mermaid.copyAsImage', 'mermaid.download', ...CODE_TOOLS, ...INSERT_PARAGRAPHS, 'mermaid.deleteBlock'],
  },
  table: {
    typora: ['|', 'table', '|', 'insertParagraphBefore', 'insertParagraphAfter'],
    items: [
      ...BASE,
      'table.addRowAbove', 'table.addRowBelow', 'table.deleteRow',
      'table.addColumnLeft', 'table.addColumnRight', 'table.deleteColumn',
      'table.moveRowUp', 'table.moveRowDown', 'table.moveColumnLeft', 'table.moveColumnRight',
      'table.copyTable', 'table.tidy', 'table.deleteTable',
      'table.alignLeft', 'table.alignCenter', 'table.alignRight', 'table.alignDefault',
    ],
  },
};

/**
 * 允许不经过 dispatchCommand 的条目（直连引擎/应用逻辑）。
 * 每条都必须写明理由，且随 P1-1.x 单一真源改造逐步清空。
 */
const DIRECT_CALL_EXCEPTIONS = [
  { kind: 'wikilink', why: '打开 [[wikilink]] 需解析目标文件，尚无对应 command id（P1-1.3 后迁入 registry）' },
  { kind: 'image', why: '图片 4 项走 handleImageAction（打开/显示/复制路径/重命名），尚无对应 command id（P1-1.3 后迁入 registry）' },
];

/** 直连例外的 kind 不参与命令序列比对（因为条目不经过 dispatchCommand），但仍受「例外过期」检测约束。 */
const EXCEPTION_KINDS = new Set(DIRECT_CALL_EXCEPTIONS.map((e) => e.kind));

// ---------------------------------------------------------------- 解析

function extractHandler(source) {
  const start = source.indexOf('const handleEditorContextMenu = useCallback(');
  if (start < 0) return null;
  // 到 useCallback 的闭合依赖数组为止
  const end = source.indexOf('}, [dispatchCommand', start);
  return end < 0 ? null : source.slice(start, end);
}

/** 抽出每个 `if (req.kind === '<kind>')` 块内 push 的条目 */
function parseKindBlocks(handler) {
  const blocks = new Map();
  const re = /if \(req\.kind === '(\w+)'(?:[^)]*?)\) \{([\s\S]*?)\n    \}/g;
  let m;
  while ((m = re.exec(handler)) !== null) {
    const [, kind, body] = m;
    const ids = [...body.matchAll(/run\('([^']+)'\)/g)].map((x) => x[1]);
    // 直连条目 = 所有 onClick: 减去经 run( 派发的（C1：image 分支用 img('op') 帮助函数）
    const allOnClick = (body.match(/onClick:/g) ?? []).length;
    const viaRun = (body.match(/onClick: run\(/g) ?? []).length;
    blocks.set(kind, { ids, direct: allOnClick - viaRun });
  }
  return blocks;
}

function parseBaseItems(handler) {
  const start = handler.indexOf('const items: ContextMenuEntry[] = [');
  const end = handler.indexOf('];', start);
  const body = handler.slice(start, end);
  return [...body.matchAll(/run\('([^']+)'\)/g)].map((x) => x[1]);
}

function parseRegistryIds(source) {
  return new Set([...source.matchAll(/id: '([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]));
}

// ---------------------------------------------------------------- 校验

const source = readFileSync(APP_TSX, 'utf8');
const handler = extractHandler(source);

if (handler === null) {
  fail('无法定位 handleEditorContextMenu；护栏失效（解析锚点变更，请同步更新本脚本）');
} else {
  const base = parseBaseItems(handler);
  const blocks = parseKindBlocks(handler);
  const registryIds = parseRegistryIds(source);

  // 1) 基础条目
  if (base.join(',') !== BASE.join(',')) {
    fail(`基础右键条目与 Typora 不一致：期望 [${BASE.join(', ')}]，实际 [${base.join(', ')}]`);
  }

  // 2) 每种 kind 的条目序列
  for (const [kind, contract] of Object.entries(CTX_CONTRACT)) {
    if (kind === 'text') continue;
    const got = blocks.get(kind);
    if (got === undefined) {
      if (contract.notImplemented === true) {
        process.stdout.write(`       · kind='${kind}' 已登记为未实现缺口（Typora 条目: ${contract.typora.join(', ')}）\n`);
        continue;
      }
      fail(`缺少 req.kind === '${kind}' 分支（Typora 1.14.9 有对应块级右键条目：${contract.typora.join(', ')}）`);
      continue;
    }
    if (contract.notImplemented === true) {
      fail(
        `kind='${kind}' 已登记为未实现缺口，但代码里出现了该分支——契约现已生效，请移除 notImplemented 并核对条目序列。`,
      );
    }
    const actual = [...base, ...got.ids];
    const expected = contract.items;
    if (actual.join(',') !== expected.join(',')) {
      fail(
        `kind='${kind}' 条目序列与 Typora 1.14.9 不一致\n` +
        `      Typora 原始键序列: [${contract.typora.join(', ')}]\n` +
        `      期望: [${expected.join(', ')}]\n` +
        `      实际: [${actual.join(', ')}]`,
      );
    }
    if (contract.missing !== undefined) {
      process.stdout.write(`       · kind='${kind}' 尚未对齐的 Typora 条目: ${contract.missing.join(', ')}\n`);
    }
  }

  // 3) 未登记的 kind 分支（直连例外已单独登记，不在此重复报）
  for (const kind of blocks.keys()) {
    if (!(kind in CTX_CONTRACT) && !EXCEPTION_KINDS.has(kind)) {
      fail(`出现未登记的 req.kind === '${kind}' 分支；Typora 1.14.9 无此块级右键条目，请先补证据或登记为 B 类增强`);
    }
  }

  // 4) 直连引擎的例外必须是登记过的
  for (const [kind, info] of blocks) {
    if (info.direct > 0 && !EXCEPTION_KINDS.has(kind)) {
      fail(
        `kind='${kind}' 有 ${info.direct} 个条目直连引擎，违反 §7.4 硬规则 11（Context Menu 必须走 dispatchCommand）。` +
        `若为 Typora 确有而 registry 暂无命令的项，请在 DIRECT_CALL_EXCEPTIONS 登记并说明收敛计划。`,
      );
    }
  }
  // 例外若已清空则提示移除（防止例外永久驻留）
  for (const { kind } of DIRECT_CALL_EXCEPTIONS) {
    const info = blocks.get(kind);
    if (info !== undefined && info.direct === 0) {
      fail(`DIRECT_CALL_EXCEPTIONS 中 kind='${kind}' 已无直连调用，例外已过期，请移除登记`);
    }
  }

  // 5) 所有 dispatchCommand 的 id 必须在 registry 内
  const allIds = new Set([...base, ...[...blocks.values()].flatMap((b) => b.ids)]);
  for (const id of allIds) {
    if (!registryIds.has(id)) {
      fail(`右键菜单 dispatch 的命令 '${id}' 在 CommandRegistry 中不存在`);
    }
  }
}

// ---------------------------------------------------------------- 输出

if (errors.length > 0) {
  process.stderr.write('Editor context menu contract: FAILED\n');
  for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
  process.exit(1);
}

const kinds = Object.keys(CTX_CONTRACT).filter((k) => k !== 'text');
process.stdout.write(
  `Editor context menu contract: ${kinds.length} block kinds match Typora 1.14.9 getMenuItemsForMac ` +
  `(all items dispatch through CommandRegistry; ${DIRECT_CALL_EXCEPTIONS.length} tracked direct-call exceptions)\n`,
);
