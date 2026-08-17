#!/usr/bin/env node
/**
 * Linux IME Matrix runner（fcitx5 / ibus）——在 mellow-linux-ime 容器内执行。
 *
 * 输入：xdotool type（XTEST 经 GTK IM → fcitx5/ibus 组词）+ xdotool key space（提交候选 1）。
 * 读回：优先 Ctrl+A Ctrl+C + xclip（X11 剪贴板）；失败 fallback Ctrl+S 保存读回。
 * 断言：丢字/重复（输入词出现 1 次）/ caret 连续（两段）/ undo（Ctrl+Z 直至清空，无 corruption）。
 *
 * 用法（容器内）：
 *   node ime-matrix-linux.mjs --im fcitx5 [--scenario paragraph]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const DOC = '/tmp/mellow-ime-scenario.md';

function sh(cmd, timeout = 20000) {
  try { return execFileSync('/bin/bash', ['-c', cmd], { encoding: 'utf8', timeout }); } catch { return ''; }
}
function sleep(ms) { const at = Date.now() + ms; while (Date.now() < at) { /* busy */ } }

function xdo(args) { sh(`xdotool ${args}`); }

/** 输入拼音音节 + 空格提交（候选 1） */
function typeSyl(syl) {
  xdo(`type --delay 80 "${syl}"`);
  sleep(500);
  xdo('key space');
  sleep(700);
}

/** 读回：优先剪贴板，fallback 保存读回 */
function readBack(pid) {
  xdo('key --clearmodifiers ctrl+a');
  sleep(200);
  xdo('key --clearmodifiers ctrl+c');
  sleep(400);
  const clip = sh('xclip -selection clipboard -o 2>/dev/null').trim();
  // 容器/CI 环境 xclip 连接失败（Could not connect to localhost）→ 走保存读回
  if (clip.length > 0 && !clip.includes('Could not connect') && !clip.includes('Error:')) return clip;
  xdo('key --clearmodifiers ctrl+s');
  sleep(1500);
  try { return readFileSync(DOC, 'utf8'); } catch { return ''; }
}

function launch(doc, im) {
  spawnSync('pkill', ['-f', 'mellow-desktop']);
  sleep(800);
  writeFileSync(DOC, doc);
  const env = `DISPLAY=:99 XDG_RUNTIME_DIR=/tmp/runtime-root GTK_IM_MODULE=${im === 'ibus' ? 'ibus' : 'fcitx'} QT_IM_MODULE=${im === 'ibus' ? 'ibus' : 'fcitx'} XMODIFIERS=@im=${im === 'ibus' ? 'ibus' : 'fcitx'}`;
  sh(`cd /mellow && ${env} nohup ./apps/desktop/src-tauri/target/release/mellow-desktop ${DOC} > /tmp/mellow.log 2>&1 & echo $! > /tmp/mellow.pid`);
  sleep(8000);
  return sh('cat /tmp/mellow.pid').trim();
}

const SEG1 = ['ni', 'hao'];
const SEG2 = ['zhong', 'wen'];
const EXPECT = '你好中文';

const SCENARIOS = [
  { id: 'paragraph', doc: '' },
  { id: 'heading', doc: '# ' },
  { id: 'format', doc: '**bold**' },
  { id: 'list', doc: '- item' },
  { id: 'table', doc: '| a | b |\n|---|---|\n| 1 | 2 |' },
  { id: 'code', doc: '```\ncode\n```' },
  { id: 'math', doc: '$x+1$' },
  { id: 'link', doc: '[label](https://example.com)' },
];

const args = process.argv.slice(2);
const im = args.find((a) => a.startsWith('--im='))?.split('=')[1] ?? 'fcitx5';
const only = args.find((a) => a.startsWith('--scenario='))?.split('=')[1];

const results = [];
for (const sc of SCENARIOS) {
  if (only && !only.split(',').includes(sc.id)) continue;
  const pid = launch(sc.doc, im);
  sleep(1500);
  // 聚焦编辑器：点击窗口中央
  xdo(`search --name Mellow windowactivate --sync 2>/dev/null; mousemove 600 350 click 1`);
  sleep(1200);
  for (const s of SEG1) typeSyl(s);
  for (const s of SEG2) typeSyl(s);
  const text = readBack(pid);
  const r = { im, scenario: sc.id, got: text.replace(/\n/g, '⏎') };
  const count = text.split(EXPECT).length - 1;
  r.pass = count === 1;
  if (!r.pass) r.reason = count === 0 ? `未包含 ${EXPECT}` : `重复 ${count} 次`;
  // undo 直至清空
  for (let i = 0; i < 12; i++) {
    xdo('key --clearmodifiers ctrl+z');
    sleep(900);
    const t = readBack(pid);
    if (!t.includes('你') && !t.includes('中')) break;
  }
  const afterUndo = readBack(pid);
  r.undoOk = !afterUndo.includes('你') && !afterUndo.includes('中');
  if (!r.undoOk) r.undoReason = `undo 后仍有中文: ${JSON.stringify(afterUndo)}`;
  spawnSync('pkill', ['-f', 'mellow-desktop']);
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${im}/${sc.id}: got=${JSON.stringify(r.got)}${r.reason ? ' | ' + r.reason : ''}${r.undoOk ? ' | undo ok' : ' | undo FAIL'}`);
}
const pass = results.filter((r) => r.pass && r.undoOk !== false).length;
console.log(`\n${pass}/${results.length} 场景通过（${im}）`);
process.exit(pass === results.length ? 0 : 1);