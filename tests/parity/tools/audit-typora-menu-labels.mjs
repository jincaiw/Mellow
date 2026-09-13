/**
 * §12 内嵌官方真值的**自审**工具（需本机装有 Typora，不进 CI）。
 *
 * 立此工具的原因（第九轮，2026-09-13）：
 * `verify-menu-contract.mjs` §12 把 Typora 的官方文案**内嵌**在护栏里（CI runner 上不装
 * Typora，无法现读真值）。内嵌的代价是：**没人能保证内嵌值真的来自官方** —— 实测发现
 * 2 条「Typora en」其实是把 Mellow 自己的英文值填进了官方列，护栏于是「自己给自己盖章」，
 * 永远绿：
 *   · `menu.file.saveAll` 官方为 `Save All`（护栏曾写 `Save All Open Files`）
 *   · `menu.quickOpen.open` 官方为 `Open Quickly`（护栏曾写 `Quick Open`）
 *
 * 本工具用本机 Typora 的 `Menu.strings`（Base = 英文 / zh-Hans）反查 §12 的每一条内嵌值，
 * 并顺带扫出「Mellow 菜单文案不在 Typora 词汇表里」的可疑项供人工复核。
 *
 * 用法：
 *   node tests/parity/tools/audit-typora-menu-labels.mjs
 *   TYPORA_RESOURCES=/path/to/Typora.app/Contents/Resources node tests/parity/tools/audit-typora-menu-labels.mjs
 *
 * 退出码：0 = §12 内嵌值全部可在官方表中原样查到；1 = 存在伪造/漂移值。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');
const GUARD = resolve(root, 'tests/parity/verify-menu-contract.mjs');

/** 定位本机 Typora 的 Resources 目录；找不到就明确说明并退出（不算失败）。 */
function findTyporaResources() {
  const candidates = [
    process.env.TYPORA_RESOURCES,
    '/Applications/Typora.app/Contents/Resources',
    join(process.env.HOME ?? '', 'Applications/Typora.app/Contents/Resources'),
  ].filter((p) => typeof p === 'string' && p !== '');
  for (const dir of candidates) {
    if (existsSync(join(dir, 'Base.lproj/Menu.strings'))) return dir;
  }
  return null;
}

/** 用 plutil 把 .strings 转成 JSON（macOS 自带；二进制 plist 需转换后才能解析）。 */
function readStrings(file) {
  const r = spawnSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`plutil 转换失败：${file}\n${r.stderr ?? ''}`);
  return JSON.parse(r.stdout);
}

/** 从护栏源码里抽出 TYPORA_MENU_LABELS 的内嵌真值表。 */
function readEmbeddedContract() {
  const src = readFileSync(GUARD, 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('const TYPORA_MENU_LABELS = [');
  const end = src.indexOf('function checkTyporaMenuLabels');
  if (start === -1 || end === -1) throw new Error('verify-menu-contract.mjs 中未找到 TYPORA_MENU_LABELS');
  const body = src.slice(start, end);
  return [...body.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\]/g)]
    .map((m) => ({ key: m[1], zh: m[2], en: m[3] }));
}

const resources = findTyporaResources();
if (resources === null) {
  console.log('Typora 未安装（未找到 Base.lproj/Menu.strings）—— 本工具需要本机 Typora，跳过。');
  process.exit(0);
}

const officialEn = readStrings(join(resources, 'Base.lproj/Menu.strings'));
const officialZh = readStrings(join(resources, 'zh-Hans.lproj/Menu.strings'));
const enValues = new Set(Object.values(officialEn));
const zhValues = new Set(Object.values(officialZh));

const contract = readEmbeddedContract();
const forged = [];
for (const { key, zh, en } of contract) {
  if (!zhValues.has(zh)) forged.push(`${key}：内嵌 zh「${zh}」在本机 Typora zh-Hans/Menu.strings 中不存在`);
  if (!enValues.has(en)) forged.push(`${key}：内嵌 en「${en}」在本机 Typora Base/Menu.strings 中不存在`);
}

console.log(`Typora 资源：${resources}`);
console.log(`官方 Menu.strings：Base ${Object.keys(officialEn).length} 条 / zh-Hans ${Object.keys(officialZh).length} 条`);
console.log(`§12 内嵌合同：${contract.length} 条\n`);

if (forged.length > 0) {
  throw new Error(`§12 内嵌的官方真值有 ${forged.length} 条在本机 Typora 中查不到（疑似把 Mellow 自己的值当成官方值）：\n  ${forged.join('\n  ')}`);
}

console.log('§12 内嵌真值全部可在本机 Typora 的 Menu.strings 中原样查到。');
