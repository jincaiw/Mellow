#!/usr/bin/env node
/**
 * generate-typora-menu-dump.mjs —— 生成 Typora 规范基线菜单/键位 dump。
 *
 * 产物：tests/benchmark/fixtures/typora-menu-dump.txt（gitignore 生成物）
 * 消费方：tests/parity/verify-parity-ledger.mjs（P0-BASELINE-002 / P0-MENU-001 的证据）
 *
 * 证据来源（全部取自本机真实安装的 Typora，不做任何臆测补全）：
 *   1. /Applications/Typora.app/Contents/Info.plist      —— 版本与 build 号
 *   2. Contents/Resources/zh-Hans.lproj/Menu.strings     —— 简体中文菜单文案真源
 *   3. Contents/Resources/Base.lproj/MainMenu.nib        —— 菜单标题 / 键位 / action 选择器
 *   4. Contents/Resources/TypeMark/appsrc/window/frame.js—— 编辑器键位映射（CodeMirror keymap）
 *
 * 若本机不存在 Typora，脚本仍会产出文件，但内容标记为 UNVERIFIED，
 * 以免 verify-parity-ledger.mjs 因「证据文件缺失」而失败。
 * 注意：UNVERIFIED dump 不构成任何验收通过证据——P0-MENU-001 的
 * requiredEvidence 含 macos/windows/linux/ux-gate，缺真机 dump 时不可标 PASS-E。
 *
 * 用法：node tests/benchmark/generate-typora-menu-dump.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(root, 'tests/benchmark/fixtures/typora-menu-dump.txt');
// 可用 MELLOW_TYPORA_APP 覆盖（测试用）；生产恒为 macOS 安装路径。
const TYPORA = process.env.MELLOW_TYPORA_APP ?? '/Applications/Typora.app';

const NORMATIVE_VERSION = '1.14.9';

/** NIBArchive 使用的 varint：MSB=1 表示末字节，值累加 (v << 7) | (byte & 0x7f)。 */
function readVarint(buf, offset) {
  let value = 0;
  let i = offset;
  while (i < buf.length) {
    const byte = buf[i];
    value = (value << 7) | (byte & 0x7f);
    i += 1;
    if (byte & 0x80) break;
  }
  return [value, i];
}

/** 扫描 nib，按文件顺序提取所有 Pascal 串（长度前缀 varint + ASCII 内容）。 */
function extractNibStrings(buf) {
  const strings = [];
  for (let offset = 0; offset < buf.length - 2; ) {
    const [length, body] = readVarint(buf, offset);
    if (length < 1 || length > 60 || body + length > buf.length) {
      offset += 1;
      continue;
    }
    let ok = true;
    let text = '';
    for (let i = 0; i < length; i += 1) {
      const byte = buf[body + i];
      if (byte < 0x20 || byte > 0x7e) {
        ok = false;
        break;
      }
      text += String.fromCharCode(byte);
    }
    if (ok && /[A-Za-z]/.test(text)) {
      strings.push({ offset, text });
      offset = body + length;
      continue;
    }
    offset += 1;
  }
  return strings;
}

/** 从 frame.js 提取 CodeMirror keymap 中的键位绑定。 */
function extractKeymaps(source) {
  const groups = [];
  // 形如 Xo.pcDefault={...} / Xo.macDefault={...} / Xo.emacsy={...}
  const groupRe = /([A-Za-z_$][\w$]*)\.(pcDefault|macDefault|emacsy|basic|default)\s*=\s*\{/g;
  let match;
  while ((match = groupRe.exec(source)) !== null) {
    let depth = 0;
    let i = groupRe.lastIndex - 1;
    const start = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(start + 1, i);
    const bindings = {};
    const pairRe = /"((?:(?:Shift|Ctrl|Alt|Cmd)-)+[^"]{1,24})"\s*:\s*"([^"]{1,48})"/g;
    let pair;
    while ((pair = pairRe.exec(body)) !== null) bindings[pair[1]] = pair[2];
    if (Object.keys(bindings).length > 0) groups.push({ name: match[2], bindings });
  }
  return groups;
}

function plistRead(key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, `${TYPORA}/Contents/Info.plist`], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function stringsToMap() {
  const file = `${TYPORA}/Contents/Resources/zh-Hans.lproj/Menu.strings`;
  if (!existsSync(file)) return null;
  // UTF-16LE .strings（旧式 "key" = "value"; 格式），这里做宽松解析
  const raw = readFileSync(file).toString('utf16le').replace(/^﻿/, '');
  const map = new Map();
  const re = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    map.set(m[1].replace(/\\"/g, '"'), m[2].replace(/\\"/g, '"'));
  }
  return map;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

const lines = [];
const push = (text = '') => lines.push(text);

push('# Typora Menu Dump（Mellow Typora parity 规范基线证据）');
push('# 本文件为生成产物，由 tests/benchmark/generate-typora-menu-dump.mjs 生成，请勿手改。');
push('');

if (!existsSync(TYPORA)) {
  // 本机无 Typora（如 CI runner）：若仓库已含真机提取入库的 EXTRACTED 基线，保持不动，
  // 让菜单契约护栏直接校验入库基线（不重写、不产生 GENERATED_AT 噪音）；
  // 仅当基线缺失或非 EXTRACTED 时才写 UNVERIFIED 占位（护栏将按设计失败）。
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (/^# Typora Menu Dump/m.test(existing) && /^STATUS: EXTRACTED$/m.test(existing)) {
    console.log(`typora-menu-dump.txt: 保留入库 EXTRACTED 基线（本机无 ${TYPORA}，不重写）→ ${OUT}`);
    process.exit(0);
  }
  push(`STATUS: UNVERIFIED`);
  push(`REASON: 本机未找到 ${TYPORA}，无法提取真机菜单数据。`);
  push('');
  push('本文件仅为满足 evidence 文件存在性检查。任何 P0 项在缺少真机 dump 的情况下');
  push('不得标记为 PASS-E / PASS-BETTER。');
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  console.log(`typora-menu-dump.txt: UNVERIFIED（未找到 ${TYPORA}）→ ${OUT}`);
  process.exit(0);
}

const version = plistRead('CFBundleShortVersionString');
const build = plistRead('CFBundleVersion');
const nibPath = `${TYPORA}/Contents/Resources/Base.lproj/MainMenu.nib`;
const jsPath = `${TYPORA}/Contents/Resources/TypeMark/appsrc/window/frame.js`;

push(`STATUS: EXTRACTED`);
push(`SOURCE_APP: ${TYPORA}`);
push(`SOURCE_VERSION: ${version ?? 'unknown'}`);
push(`SOURCE_BUILD: ${build ?? 'unknown'}`);
push(`NORMATIVE_MATCH: ${version === NORMATIVE_VERSION ? 'yes' : `NO (规范基线为 ${NORMATIVE_VERSION})`}`);
push(`GENERATED_AT: ${new Date().toISOString()}`);
push('');
push('## 证据来源与校验和');
for (const [label, path] of [
  ['Info.plist', `${TYPORA}/Contents/Info.plist`],
  ['Menu.strings(zh-Hans)', `${TYPORA}/Contents/Resources/zh-Hans.lproj/Menu.strings`],
  ['MainMenu.nib', nibPath],
  ['frame.js', jsPath],
]) {
  push(`- ${label}: sha256:${existsSync(path) ? sha256(path) : 'MISSING'}`);
}
push('');

// ── 1. 编辑器键位映射（真实发布代码）──────────────────────
if (existsSync(jsPath)) {
  const keymaps = extractKeymaps(readFileSync(jsPath, 'utf8'));
  push('## 1. 编辑器键位映射（frame.js / CodeMirror keymap，实机代码提取）');
  push('');
  for (const group of keymaps) {
    push(`### keymap.${group.name}`);
    for (const key of Object.keys(group.bindings).sort()) {
      push(`  ${key} => ${group.bindings[key]}`);
    }
    push('');
  }
}

// ── 2. 中文菜单文案（真实本地化资源）──────────────────────
const labelMap = stringsToMap();
if (labelMap && labelMap.size > 0) {
  push('## 2. 简体中文菜单文案（zh-Hans.lproj/Menu.strings，实机资源提取）');
  push('');
  for (const key of [...labelMap.keys()].sort()) {
    push(`  ${key} => ${labelMap.get(key)}`);
  }
  push('');
}

// ── 3. 菜单标题 / 键位 / action（MainMenu.nib 字符串区，文件顺序）──
if (existsSync(nibPath)) {
  const nib = readFileSync(nibPath);
  const strings = extractNibStrings(nib);
  push('## 3. MainMenu.nib 字符串清单（按文件偏移顺序）');
  push('');
  push('说明：nib 序列化按对象顺序写入，故本清单近似反映菜单顺序；');
  push('      但层级关系需完整解析 NIBArchive 对象图才能确定，此处不做推测。');
  push('      单字符条目为键位（keyEquivalent），`:` 结尾条目为 action selector。');
  push('');
  for (const entry of strings) {
    push(`  ${entry.offset}\t${entry.text}`);
  }
  push('');
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(
  `typora-menu-dump.txt: EXTRACTED from Typora ${version} (${build}); ${lines.length} lines → ${OUT}`
);
