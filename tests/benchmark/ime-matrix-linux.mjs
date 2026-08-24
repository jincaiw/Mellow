#!/usr/bin/env node
/**
 * Linux IME Matrix runner（fcitx5 / ibus）——在 mellow-linux-ime 容器内执行。
 *
 * 输入：xdotool type（XTEST 经 GTK IM → fcitx5/ibus 组词）+ xdotool key space（提交候选 1）。
 * 读回：优先 Ctrl+A Ctrl+C + xclip（X11 剪贴板）；失败 fallback Ctrl+S 保存读回。
 * 断言：丢字/重复（输入词出现 1 次）/ caret 连续（两段）/ undo（Ctrl+Z 直至清空，无 corruption）。
 *
 * 用法（容器内）：
 *   node ime-matrix-linux.mjs --im fcitx5 [--scenario paragraph] [--driver xdotool|ydotool]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const DOC = '/tmp/mellow-ime-scenario.md';

function sh(cmd, timeout = 20000) {
  try { return execFileSync('/bin/bash', ['-c', cmd], { encoding: 'utf8', timeout }); } catch { return ''; }
}
function sleep(ms) { const at = Date.now() + ms; while (Date.now() < at) { /* busy */ } }

const args = process.argv.slice(2);
const im = args.find((a) => a.startsWith('--im='))?.split('=')[1] ?? 'fcitx5';
const only = args.find((a) => a.startsWith('--scenario='))?.split('=')[1];
const driver = args.find((a) => a.startsWith('--driver='))?.split('=')[1] ?? 'xdotool';

if (!['xdotool', 'ydotool'].includes(driver)) throw new Error(`Unsupported input driver: ${driver}`);

function xdo(args) { sh(`xdotool ${args}`); }
function ydo(args) { sh(`ydotool ${args}`); }
function combo(combo, ydotoolCodes) {
  if (driver === 'ydotool') { ydo(`key ${ydotoolCodes}`); return; }
  xdo(`key --clearmodifiers ${combo}`);
}

/** 输入拼音音节 + 空格提交（候选 1） */
function typeSyl(syl) {
  if (driver === 'ydotool') ydo(`type --key-delay 80 "${syl}"`);
  else xdo(`type --delay 80 "${syl}"`);
  sleep(500);
  if (driver === 'ydotool') ydo('key 57:1 57:0'); else xdo('key space');
  sleep(700);
}

/**
 * fcitx5 可以按输入上下文记忆当前 IM；因此在文档获得焦点后再次显式选择拼音，
 * 并以 D-Bus 读取实际状态。这样矩阵验证的是“焦点中的编辑器 + 中文输入法”，
 * 而不是仅验证启动阶段的默认 profile。
 */
function ensureFcitxPinyin() {
  if (im !== 'fcitx5') return;
  let current = '';
  // WebKitGTK 创建 InputContext 与窗口 focus 之间有一个异步边界。只在编辑器已被
  // 双击聚焦后重试；没有得到实际 pinyin 状态仍然是失败，而不是降级为原始按键注入。
  for (let attempt = 1; attempt <= 10; attempt++) {
    sh('fcitx5-remote -g Default; fcitx5-remote -o; fcitx5-remote -s pinyin');
    const group = sh('fcitx5-remote -q').trim();
    current = sh('busctl --user call org.fcitx.Fcitx5 /controller org.fcitx.Fcitx.Controller1 CurrentInputMethod');
    console.log(`[ime] focused-current attempt=${attempt} group=${group || 'UNAVAILABLE'} value=${current.trim() || 'UNAVAILABLE'}`);
    if (group === 'Default' && current.includes('pinyin')) return;
    sleep(500);
  }
  if (!current.includes('pinyin')) throw new Error('fcitx5 pinyin is not active for the focused editor');
}

/** 读回：优先剪贴板，fallback 保存读回 */
function readBack(pid) {
  combo('ctrl+a', '29:1 30:1 30:0 29:0');
  sleep(200);
  combo('ctrl+c', '29:1 46:1 46:0 29:0');
  sleep(400);
  const clip = sh('xclip -selection clipboard -o 2>/dev/null').trim();
  // 容器/CI 环境 xclip 连接失败（Could not connect to localhost）→ 走保存读回
  if (clip.length > 0 && !clip.includes('Could not connect') && !clip.includes('Error:')) return clip;
  combo('ctrl+s', '29:1 31:1 31:0 29:0');
  sleep(1500);
  try { return readFileSync(DOC, 'utf8'); } catch { return ''; }
}

function launch(doc, im) {
  // 按 PID 精确终止旧实例（避免 pkill -f 匹配外层 bash -c 命令行 → 误杀父进程）
  const oldPid = sh('cat /tmp/mellow.pid 2>/dev/null').trim();
  if (oldPid) { spawnSync('kill', [oldPid]); }
  sleep(800);
  writeFileSync(DOC, doc);
  const env = `DISPLAY=:99 XDG_RUNTIME_DIR=/tmp/runtime-root GTK_IM_MODULE=${im === 'ibus' ? 'ibus' : 'fcitx'} QT_IM_MODULE=${im === 'ibus' ? 'ibus' : 'fcitx'} XMODIFIERS=@im=${im === 'ibus' ? 'ibus' : 'fcitx'} LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe WEBKIT_FORCE_SANDBOX=0`;
  sh(`cd /mellow && ${env} nohup ./apps/desktop/src-tauri/target/release/mellow-desktop ${DOC} > /tmp/mellow.log 2>&1 & echo $! > /tmp/mellow.pid`);
  sleep(15000); // 等待 WebView + iframe 编辑器就绪
  const pid = sh('cat /tmp/mellow.pid').trim();
  // 启动诊断：只匹配可见主窗口（10x10 的 mellow-desktop 辅助窗口被 --onlyvisible 过滤）
  sh('xdotool search --onlyvisible --name Mellow 2>/dev/null | head -1 > /tmp/mellow-win-id.txt');
  const winId = sh('cat /tmp/mellow-win-id.txt').trim();
  console.log(`[boot] pid=${pid} window=${winId || 'NOT_FOUND'}`);
  if (winId) {
    sh(`xdotool windowactivate --sync ${winId} 2>/dev/null; xdotool windowfocus --sync ${winId} 2>/dev/null`);
  }
  return pid;
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

const results = [];
for (const sc of SCENARIOS) {
  if (only && !only.split(',').includes(sc.id)) continue;
  const pid = launch(sc.doc, im);
  sleep(1500);
  // 聚焦编辑器：激活主窗口 + 双击编辑器内容区（600,250 位于 1200x775 主窗口内）
  const wid = sh('cat /tmp/mellow-win-id.txt').trim();
  if (wid) {
    sh(`xdotool windowactivate --sync ${wid} 2>/dev/null; xdotool windowfocus --sync ${wid} 2>/dev/null`);
    sh(`xdotool mousemove 600 250 click 1`);
    sleep(1000);
    sh(`xdotool mousemove 600 250 click 1`);
    sleep(1200);
  }
  ensureFcitxPinyin();
  for (const s of SEG1) typeSyl(s);
  for (const s of SEG2) typeSyl(s);
  const text = readBack(pid);
  const r = { im, scenario: sc.id, got: text.replace(/\n/g, '⏎') };
  const count = text.split(EXPECT).length - 1;
  r.pass = count === 1;
  if (!r.pass) r.reason = count === 0 ? `未包含 ${EXPECT}` : `重复 ${count} 次`;
  // undo 直至清空
  for (let i = 0; i < 12; i++) {
    combo('ctrl+z', '29:1 44:1 44:0 29:0');
    sleep(900);
    const t = readBack(pid);
    if (!t.includes('你') && !t.includes('中')) break;
  }
  const afterUndo = readBack(pid);
  r.undoOk = !afterUndo.includes('你') && !afterUndo.includes('中');
  if (!r.undoOk) r.undoReason = `undo 后仍有中文: ${JSON.stringify(afterUndo)}`;
  // 按 PID 终止（避免 pkill -f 匹配外层 bash -c → SIGTERM 143）
  spawnSync('kill', [pid]);
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${im}/${sc.id}: got=${JSON.stringify(r.got)}${r.reason ? ' | ' + r.reason : ''}${r.undoOk ? ' | undo ok' : ' | undo FAIL'}`);
}
const pass = results.filter((r) => r.pass && r.undoOk !== false).length;
console.log(`\n${pass}/${results.length} 场景通过（${im}）`);
process.exit(pass === results.length ? 0 : 1);
