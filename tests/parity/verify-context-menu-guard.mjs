#!/usr/bin/env node
/**
 * 右键菜单护栏的护栏（mutation testing）。
 *
 * 上一版菜单护栏的经验：护栏"全绿"本身不构成证据。这里向 handleEditorContextMenu 注入
 * 已知缺陷，断言 verify-context-menu-parity.mjs **必须拒绝**。任何一条注入没被拦下，
 * 说明护栏存在盲区，整个 P1-1.7 的验收结论随之失效。
 */

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_TSX = join(root, 'apps', 'desktop', 'src', 'App.tsx');
const GUARD = join(root, 'tests', 'parity', 'verify-context-menu-parity.mjs');

const original = readFileSync(APP_TSX, 'utf8');

/** 每个用例：把 source 改成带缺陷的版本；护栏必须返回非 0 */
const CASES = [
  {
    name: '基础条目丢掉 Paste（Typora 右键始终有剪切/拷贝/粘贴）',
    mutate: (s) => s.replace(
      `{ label: t('contextmenu.editorPaste'), onClick: run('edit.paste') },`,
      ``,
    ),
  },
  {
    name: '基础条目顺序漂移（Copy 排到 Cut 前面）',
    mutate: (s) => s
      .replace(`{ label: t('contextmenu.editorCut'), enabled: req.hasSelection, onClick: run('edit.cut') },`, `@@C@@`)
      .replace(`{ label: t('contextmenu.editorCopy'), enabled: req.hasSelection, onClick: run('edit.copy') },`,
               `{ label: t('contextmenu.editorCut'), enabled: req.hasSelection, onClick: run('edit.cut') },`)
      .replace(`@@C@@`, `{ label: t('contextmenu.editorCopy'), enabled: req.hasSelection, onClick: run('edit.copy') },`),
  },
  {
    name: '链接右键丢掉「复制链接地址」（Typora 序列 openLink→copyLink）',
    mutate: (s) => s.replace(
      `        { label: t('contextmenu.editorCopyLink'), onClick: run('format.copyLinkUrl') },\n`,
      ``,
    ),
  },
  {
    name: '代码块右键凭空加一条 Typora 不存在的源码复制项',
    mutate: (s) => s.replace(
      `          { label: t('contextmenu.codeCopyContent'), onClick: run('paragraph.copyCodeBlock') },`,
      `          { label: t('contextmenu.codeCopyContent'), onClick: run('paragraph.copyCodeBlock') },\n          { label: t('contextmenu.mermaidCopySource'), onClick: run('mermaid.copySource') },`,
    ),
  },
  {
    name: '公式块右键换回自造文案「复制公式源码」而非 Typora 的「复制为 Tex 代码」',
    mutate: (s) => s.replace(`run('math.copyAsTex')`, `run('math.copySource')`),
  },
  {
    name: '表格右键条目缺失（删掉删除表格）',
    mutate: (s) => s.replace(
      `            { label: t('contextmenu.tableDeleteTable'), onClick: run('table.deleteTable') },\n`,
      ``,
    ),
  },
  {
    name: '表格右键条目顺序漂移（删除行移到最前）',
    mutate: (s) => s
      .replace(`            { label: t('contextmenu.tableAddRowAbove'), onClick: run('table.addRowAbove') },`, `@@A@@`)
      .replace(`            { label: t('contextmenu.tableDeleteRow'), onClick: run('table.deleteRow') },`,
               `            { label: t('contextmenu.tableAddRowAbove'), onClick: run('table.addRowAbove') },`)
      .replace(`@@A@@`, `            { label: t('contextmenu.tableDeleteRow'), onClick: run('table.deleteRow') },`),
  },
  {
    name: '对齐子菜单缺失（删掉居中对齐）',
    mutate: (s) => s.replace(
      `            { label: t('contextmenu.tableAlignCenter'), onClick: run('table.alignCenter') },\n`,
      ``,
    ),
  },
  {
    name: 'mermaid 渲染导出缺失（删掉复制为图片）',
    mutate: (s) => s.replace(
      `        { label: t('contextmenu.mermaidCopyAsImage'), onClick: run('mermaid.copyAsImage') },\n`,
      ``,
    ),
  },
  {
    name: '右键条目绕过 dispatchCommand 直连引擎（违反 G4-MENU-07）',
    mutate: (s) => s.replace(
      `{ label: t('contextmenu.editorPaste'), onClick: run('edit.paste') },`,
      `{ label: t('contextmenu.editorPaste'), onClick: () => { const f = containerRef.current?.querySelector('iframe'); (f?.contentWindow as unknown as { __MELLOW_CONTEXT_ACTIONS__?: { paste?: () => void } } | null)?.__MELLOW_CONTEXT_ACTIONS__?.paste?.(); } },`,
    ),
  },
  {
    name: 'dispatch 一个 Registry 里不存在的命令 id',
    mutate: (s) => s.replace(`run('table.tidy')`, `run('table.tidyAll')`),
  },
  {
    name: '新增未登记的块级分支（凭空造 typora 没有的 kind）',
    mutate: (s) => s.replace(
      `    if (req.kind === 'table') {`,
      `    if (req.kind === 'graph') {\n      items.push({ label: 'x', onClick: run('table.copyTable') });\n    }\n    if (req.kind === 'table') {`,
    ),
  },
];

function runGuard(file) {
  try {
    execFileSync(process.execPath, [GUARD, file], { stdio: 'pipe' });
    return { rejected: false };
  } catch (err) {
    return { rejected: true, msg: String(err.stderr ?? '').trim().split('\n').slice(0, 3).join(' | ') };
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'mellow-ctx-guard-'));
const probe = join(tmp, 'App.tsx');
const failures = [];

try {
  // 基线必须是绿的，否则后面的注入结果无从判断
  writeFileSync(probe, original);
  const baseline = runGuard(probe);
  if (baseline.rejected) {
    failures.push(`基线本应通过却失败：${baseline.msg}`);
  } else {
    process.stdout.write('       · baseline green\n');
  }

  for (const c of CASES) {
    const mutated = c.mutate(original);
    if (mutated === original) {
      failures.push(`用例「${c.name}」的注入没有生效（锚点已漂移，护栏在自欺欺人）`);
      continue;
    }
    writeFileSync(probe, mutated);
    const r = runGuard(probe);
    if (r.rejected) {
      process.stdout.write(`       · rejected: ${c.name}\n`);
    } else {
      failures.push(`注入未被拒绝: ${c.name}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
  process.stderr.write('Context menu contract guard: FAILED\n');
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}

process.stdout.write(`Context menu contract guard: baseline green + ${CASES.length} injected defects all rejected\n`);
