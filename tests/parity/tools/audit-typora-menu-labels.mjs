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
 * 本工具用本机 Typora 的三层真源反查 §12 的每一条内嵌值（§4.360 起）：
 *   ① Menu.strings（Base = 英文 / zh-Hans）—— 原生 nib 标题的本地化表；
 *   ② appsrc TypeMark/locales/<locale>/Menu.json —— frame.js 覆盖层（含 … 增补规则）；
 *   ③ tests/benchmark/fixtures/typora-live-menu-1149-display.txt —— 实机 AX dump 基线
 *     （仅当 ①② 均无第一手文本、如导出子菜单的格式名时兜底；不在该基线里即判伪造）。
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

// ── §4.360 显示层三层真源 ─────────────────────────────────────────────
// Menu.strings 只是**本地化表**（key = nib 标题），不是显示层。实机显示值来自三层叠加：
//   ① Menu.strings 值（原生 nib 标题被本地化的结果）；
//   ② appsrc locales/*/Menu.json（frame.js 用其覆盖/追加；函数 m 在 appsrc 键以 … 结尾
//      时把本地化值重新加上 … ⇒ 「另存为」显示成「保存为…/另存为…」一类漂移）；
//   ③ 实机 AX dump（三层之外无第一手文本的项，如导出子菜单 PDF/HTML/… 格式名 ——
//      appsrc 内部 key、非本地化字符串）。
// 本工具把 ①② 作为可机检证据；仅 ③ 支撑的值必须进 DISPLAY_LAYER（下方），
// 每条附实机 dump 出处，防止把 Mellow 自己的文案伪装成「实机值」。
function readAppsrcMenu(locale) {
  const p = join(resources, 'TypeMark/locales', locale, 'Menu.json');
  if (!existsSync(p)) return { values: new Set(), keys: new Set() };
  const d = JSON.parse(readFileSync(p, 'utf8'));
  const values = new Set();
  (function walk(o) {
    if (o instanceof Array) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    else if (typeof o === 'string') values.add(o);
  })(d);
  return { values, keys: new Set(Object.keys(d)) };
}
const appsrcZh = readAppsrcMenu('zh-Hans.lproj');
const appsrcEn = readAppsrcMenu('Base.lproj');
const stripEllipsis = (v) => (v.endsWith('…') ? v.slice(0, -1) : v);

// 仅由实机 AX dump（③ 层）支撑的显示值。逐条核对基线：
// tests/benchmark/fixtures/typora-live-menu-1149-display.txt（2026-11-07 实机 dump，
// 见审计 §4.360）。新增条目必须先在该文件里原样可查到，否则视为伪造。
const DISPLAY_LAYER_LIVE_DUMP = join(root, 'tests/benchmark/fixtures/typora-live-menu-1149-display.txt');
const liveDump = existsSync(DISPLAY_LAYER_LIVE_DUMP) ? readFileSync(DISPLAY_LAYER_LIVE_DUMP, 'utf8') : null;

/** 一条内嵌值是否可在 ①②③ 任一层原样查到（含 … 增补规则）。 */
function foundInLayer(val, stringsVals, appsrc, isZh) {
  const bare = stripEllipsis(val);
  if (stringsVals.has(val) || stringsVals.has(bare)) return true;
  if (appsrc.values.has(val) || appsrc.values.has(bare)) return true;
  // frame.js 增补规则：Menu.strings 的**键**（nib 标题）以 … 结尾且其本地化值 = bare ⇒ 显示 val
  const table = isZh ? officialZh : officialEn;
  for (const [k, v] of Object.entries(table)) {
    if (k.endsWith('…') && stripEllipsis(k) === bare && v === bare) return true;
  }
  // appsrc 键（英文原形）命中 en 层
  if (!isZh && (appsrc.keys.has(bare) || appsrc.keys.has(val))) return true;
  return false;
}

const contract = readEmbeddedContract();
const forged = [];
for (const { key, zh, en } of contract) {
  const checks = [
    ['zh', zh, zhValues, appsrcZh, true],
    ['en', en, enValues, appsrcEn, false],
  ];
  for (const [lang, val, svals, asrc, isZh] of checks) {
    if (foundInLayer(val, svals, asrc, isZh)) continue;
    // ③ 层兜底：值必须能在实机 dump 基线里原样查到
    if (liveDump !== null && liveDump.includes(val)) {
      console.log(`  [display-layer ③] ${key}/${lang}「${val}」：仅实机 AX dump 支撑（已核对基线）`);
      continue;
    }
    forged.push(`${key}：内嵌 ${lang}「${val}」在本机 Typora Menu.strings / appsrc Menu.json / 实机 dump 基线中均不存在`);
  }
}

console.log(`Typora 资源：${resources}`);
console.log(`官方 Menu.strings：Base ${Object.keys(officialEn).length} 条 / zh-Hans ${Object.keys(officialZh).length} 条`);
console.log(`§12 内嵌合同：${contract.length} 条\n`);

if (forged.length > 0) {
  throw new Error(`§12 内嵌的官方真值有 ${forged.length} 条在本机 Typora 中查不到（疑似把 Mellow 自己的值当成官方值）：\n  ${forged.join('\n  ')}`);
}

console.log(`§12 内嵌真值全部可在三层真源（Menu.strings / appsrc Menu.json / 实机 dump 基线）中查到。${liveDump === null ? '（⚠️ 实机 dump 基线缺失，③ 层兜底不可用）' : ''}`);
