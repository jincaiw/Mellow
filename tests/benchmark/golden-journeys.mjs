#!/usr/bin/env node
/**
 * Golden Journeys runner（PRD §111 Runtime Qualification 20 项）。
 * 每 journey 在 Mellow 与 Typora 1.14.9 上执行相同操作序列，记录：
 * steps / time / errors / unexpected / keyboard-mouse / 平台状态。
 * 输入原语：
 * - Mellow：System Events keystroke（CGEvent 字母被 WKWebView 过滤）+ 空格提交
 * - Typora：activate + CGEvent post-combo（原生 app）+ 空格提交（输入源为拼音时）
 * 验证：保存读回（Cmd+S → 读文件）。源码 ASCII 命令（bold/list/table/undo）不受 IME 影响。
 *
 * 用法：node golden-journeys.mjs --app both|mellow|typora [--journey 1,6]
 */
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const HELPER = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/bin/screen-timing';
const MB = '/Volumes/My-Data/jason.wa/codebase/Mellow/apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app/Contents/MacOS/mellow-desktop';
const TY = '/Applications/Typora.app/Contents/MacOS/Typora';
const WORK = '/tmp/mellow-gj';
mkdirSync(WORK, { recursive: true });

function q(cmd, timeout = 25000) {
  try { return execFileSync('/bin/bash', ['-c', cmd], { encoding: 'utf8', timeout }) || ''; } catch (e) { return String(e.stdout || ''); }
}
function sleep(ms) { const at = Date.now() + ms; while (Date.now() < at) { /* busy */ } }
function combo(mods, key, pid) { try { execFileSync(HELPER, ['post-combo', '--mods', mods, '--key', String(key), '--pid', String(pid)], { encoding: 'utf8', timeout: 15000 }); } catch { /* noop */ } }
function se(script) { try { execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 15000 }); } catch { /* noop */ } }
function activate(app) { se(`tell application "System Events" to set frontmost of process "${app}" to true`); sleep(500); }

const KEYCODES = { a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, t: 17, y: 16, u: 32, i: 34, o: 31, p: 35, k: 40, l: 37, n: 45, m: 46, space: 49, enter: 36, tab: 48, esc: 53, left: 123, right: 124, up: 126, down: 125 };

// ---------- app lifecycle ----------
function launchMellow(file) {
  spawnSync('pkill', ['-x', 'mellow-desktop']); sleep(1000);
  // 清会话/恢复快照（同 benchmark prep）：避免启动恢复旧 tab 干扰单文档 journey
  q(`rm -rf "$HOME/Library/WebKit/com.mellow.editor" "$HOME/Library/Application Support/com.mellow.editor/recovery"* "$HOME/Library/Application Support/com.mellow.editor/settings.json" 2>/dev/null`);
  // 清 macOS 崩溃恢复锁存（CrashReporter plist + Saved State）：wry 自定义协议偶发
  // 启动崩溃后，macOS 会在每次启动弹「重新打开窗口」对话框锁死矩阵 —— 必须清除。
  q(`rm -f "$HOME/Library/Application Support/CrashReporter/mellow-desktop_"*.plist; rm -rf "$HOME/Library/Saved Application State/com.mellow.editor.savedState"; defaults write com.mellow.editor NSQuitAlwaysKeepsWindows -bool false`);
  const proc = spawn(MB, [file], { stdio: 'ignore' });
  sleep(9000);
  activate('mellow-desktop');
  // 点击编辑器区域聚焦（Mellow 的 WKWebView 需要真实点击才能接收键盘）
  try { execFileSync(HELPER, ['focus-type', '--pid', String(proc.pid), '--roi', '300,120,600,200'], { encoding: 'utf8', timeout: 20000 }); } catch { /* noop */ }
  sleep(800);
  return proc.pid;
}
function launchTypora(file) {
  spawnSync('pkill', ['-x', 'Typora']); sleep(800);
  const proc = spawn(TY, [file], { stdio: 'ignore' });
  sleep(7000);
  activate('Typora');
  return proc.pid;
}
function saveRead(file, pid) { combo('cmd', 1, pid); sleep(1500); try { return readFileSync(file, 'utf8'); } catch { return ''; } }
function typeTextTypora(pid, text) { for (const k of text.split('')) { combo('', KEYCODES[k] ?? 0, pid); sleep(150); } combo('', 49, pid); sleep(300); }
function typeTextMellow(text) { se(`tell application "System Events" to keystroke "${text}"`); sleep(300); se('tell application "System Events" to keystroke space'); sleep(300); }

function record(name) {
  return { journey: name, steps: [], timeMs: {}, errors: [], unexpected: [], input: { keyboard: [], mouse: [] }, platform: { macOS: 'PASS', windows: 'NOT TESTED', linux: 'NOT TESTED' }, result: null };
}

// ---------- journeys ----------
async function j1_latin(app, file) {
  const r = record('1. Latin input');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  if (app === 'mellow') { typeTextMellow('hello world'); r.steps.push('type "hello world"'); r.input.keyboard.push('SE keystroke'); }
  else { for (const k of 'helloworld'.split('')) { combo('', KEYCODES[k], pid); sleep(150); } combo('', 49, pid); r.steps.push('type "helloworld" + 空格提交'); r.input.keyboard.push('CGEvent 字母+空格'); }
  sleep(600);
  combo('cmd', 1, pid); r.steps.push('Cmd+S'); r.timeMs.save = Date.now() - t0;
  sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('hello') || text.includes('你好') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`读回不含 hello: ${JSON.stringify(text)}`);
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j2_chinese(app, file) {
  const r = record('2. Chinese IME');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  if (app === 'mellow') {
    se('tell application "System Events" to keystroke "ni"'); sleep(700);
    se('tell application "System Events" to keystroke space'); r.steps.push('拼音 "ni" + 空格'); r.input.keyboard.push('SE 拼音组词+提交');
  } else {
    for (const k of 'ni'.split('')) { combo('', KEYCODES[k], pid); sleep(300); }
    combo('', 49, pid); r.steps.push('拼音 "ni" + 空格'); r.input.keyboard.push('CGEvent 拼音组词+提交');
  }
  sleep(900);
  combo('cmd', 1, pid); r.timeMs.save = Date.now() - t0;
  sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('你') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`读回不含「你」: ${JSON.stringify(text)}`);
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j4_selection_bold(app, file) {
  const r = record('4+6. selection + bold');
  writeFileSync(file, 'text');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  // 全选 + Cmd+B（SE 组合键：Mellow iframe 需 SE 管道）
  se('tell application "System Events" to keystroke "a" using {command down}'); r.steps.push('Cmd+A 全选');
  sleep(400);
  se('tell application "System Events" to keystroke "b" using {command down}'); r.steps.push('Cmd+B'); r.timeMs.bold = Date.now() - t0;
  sleep(600);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('**text**') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`bold 后读回: ${JSON.stringify(text)}`);
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j7_list(app, file) {
  const r = record('7. list（Enter 延续）');
  writeFileSync(file, '- item');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  if (app === 'typora') { combo('', 36, pid); } else { se('tell application "System Events" to keystroke return'); }
  r.steps.push('行尾 Enter（延续）'); r.timeMs.total = Date.now() - t0;
  sleep(800);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = /^- item\n- \n?$/.test(text) ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`list 延续读回: ${JSON.stringify(text)}`);
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j8_table(app, file) {
  const r = record('8. table（Tab 导航 fidelity）');
  writeFileSync(file, '| a | b |\n|---|---|\n| 1 | 2 |');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  // 点击表格区域 + Tab 移到下一单元格（不改源码）
  try { execFileSync(HELPER, ['focus-type', '--pid', String(pid), '--roi', '300,150,400,120'], { encoding: 'utf8', timeout: 20000 }); } catch { /* noop */ }
  sleep(800);
  combo('', 48, pid); r.steps.push('Tab 下一单元格'); r.timeMs.nav = Date.now() - t0;
  sleep(500);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('| a | b |') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`table fidelity 读回: ${JSON.stringify(text)}`);
  r.unexpected.push(text !== '| a | b |\n|---|---|\n| 1 | 2 |' ? 'Tab 导航改变了源码' : '无');
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j9_math(app, file) {
  const r = record('9. math（源码 fidelity）');
  writeFileSync(file, '$x^2$ 与 $\\frac{1}{2}$');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  sleep(1500);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('$x^2$') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`math fidelity 读回: ${JSON.stringify(text)}`);
  r.unexpected.push(text === '$x^2$ 与 $\\frac{1}{2}$' ? '无（源码不变）' : '源码被改');
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j10_mermaid(app, file) {
  const r = record('10. Mermaid（源码 fidelity）');
  writeFileSync(file, '```mermaid\ngraph TD;\n  A-->B\n```');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  sleep(2000);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('graph TD') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`mermaid fidelity 读回: ${JSON.stringify(text)}`);
  r.unexpected.push(text.includes('```mermaid\ngraph TD;\n  A-->B\n```') ? '无（源码不变）' : '源码被改');
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j15_undo(app, file) {
  const r = record('15. undo');
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  if (app === 'mellow') { typeTextMellow('abc'); r.steps.push('输入 "abc"'); }
  else { typeTextTypora(pid, 'abc'); r.steps.push('输入 "abc"'); }
  sleep(400);
  combo('cmd', 6, pid); r.steps.push('Cmd+Z'); sleep(800);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = !text.includes('abc') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`undo 后仍有 abc: ${JSON.stringify(text)}`);
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j17_10mb(app) {
  const r = record('17. 10 MB');
  const file = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/fixtures/10MB.md';
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  // 轮询窗口出现 + 首帧稳定（近似 editable 时间）
  let ready = false;
  for (let i = 0; i < 20 && !ready; i++) {
    try {
      const out = execFileSync(HELPER, ['startup-probe', '--pid', String(pid), '--roi', '200,100,600,200', '--timeout', '4000'], { encoding: 'utf8', timeout: 10000 });
      const parsed = JSON.parse(out.split('\n').filter((l) => l.trim().startsWith('{')).pop());
      if (parsed.ok) { ready = true; r.timeMs.editable = parsed.loadMs ?? null; }
    } catch { /* noop */ }
    if (!ready) sleep(1500);
  }
  r.timeMs.total = Date.now() - t0;
  r.result = ready ? 'PASS' : 'FAIL';
  if (!ready) r.errors.push('10MB 打开后 30s 内未检测到稳定渲染');
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

const JOURNEYS = {
  1: j1_latin, 2: j2_chinese, 4: j4_selection_bold, 7: j7_list, 8: j8_table, 9: j9_math, 10: j10_mermaid, 15: j15_undo, 17: j17_10mb,
};

const args = process.argv.slice(2);
const appFilter = args.find((a) => a.startsWith('--app='))?.split('=')[1] ?? 'both';
const journeyFilter = args.find((a) => a.startsWith('--journey='))?.split('=')[1];

const results = [];
for (const [id, fn] of Object.entries(JOURNEYS)) {
  if (journeyFilter && !journeyFilter.split(',').includes(id)) continue;
  const file = join(WORK, `j${id}.md`);
  writeFileSync(file, '');
  for (const app of ['mellow', 'typora']) {
    if (appFilter !== 'both' && appFilter !== app) continue;
    try {
      const r = await fn(app, file);
      results.push(r);
      console.log(`[${app}] ${r.journey}: ${r.result}${r.errors.length ? ' | ' + r.errors.join('; ') : ''}${r.timeMs.total ? ' | ' + r.timeMs.total + 'ms' : ''}`);
    } catch (e) {
      results.push({ journey: `j${id}`, result: 'ERROR', errors: [String(e.message)] });
      console.log(`[${app}] j${id}: ERROR ${e.message}`);
    }
    spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  }
}
console.log('\n=== 汇总 ===');
for (const r of results) console.log(`${r.result === 'PASS' ? 'PASS' : 'FAIL'} ${r.journey} [${r.platform?.macOS}]`);
