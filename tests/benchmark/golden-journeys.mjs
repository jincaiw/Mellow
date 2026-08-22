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
  // 注意：不做合成点击。WKWebView 启动时自动持有焦点（WebView 为 first responder，
  // CodeMirror 默认聚焦），SE keystroke / CGEvent 可直达。实测合成鼠标点击（CGEvent
  // mouseDown/post）反而会破坏 WebView 焦点协议，导致后续键盘事件全部丢失
  // （2026-08-19 诊断：focus-type 点击后 keystroke 全部失效，不点击则全部生效）。
  return proc.pid;
}
function launchTypora(file) {
  spawnSync('pkill', ['-x', 'Typora']); sleep(800);
  const proc = spawn(TY, [file], { stdio: 'ignore' });
  sleep(7000);
  activate('Typora');
  // 2026-08-22 修复：Typora「恢复上次会话」会把 benchmark 旧标签（如 10MB.md）
  // 重开且可能持有焦点 —— 后续 Cmd+A/B/S 会打到恢复标签（j4 假 FAIL、fixture
  // 被 Cmd+S 污染均源于此）。二次 open 使目标文件成为活跃文档。
  q(`open -a Typora '${file.replace(/'/g, "'\\''")}'`);
  sleep(1200);
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
  // 前置：切换输入源到简体拼音（SCIM ITABC），结束后切回 ABC。
  // select-input 用 Carbon TISSelectInputSource（Ctrl+Space 只能在布局间切换，到不了 IME）。
  const SELINPUT = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/bin/select-input';
  try { execFileSync(SELINPUT, ['com.apple.inputmethod.SCIM.ITABC'], { timeout: 5000 }); } catch { /* noop */ }
  sleep(600);
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
  // 恢复 ABC（后续 journey 的 ASCII 输入不受 IME 影响）
  try { execFileSync(SELINPUT, ['com.apple.keylayout.ABC'], { timeout: 5000 }); } catch { /* noop */ }
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j3_japanese(app, file) {
  const r = record('3. Japanese IME');
  // 前置：切换输入源到日文罗马字（Kotoeri Romaji，master-plan G12）。
  // 未启用时 SKIP（系统设置 → 键盘 → 输入源 → 添加「日文 - 罗马字」后重跑），
  // 不算 FAIL —— 环境缺输入源 ≠ 功能缺陷。
  const SELINPUT = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/bin/select-input';
  let imeOk = true;
  try { execFileSync(SELINPUT, ['com.apple.inputmethod.Kotoeri.Romaji'], { timeout: 5000 }); } catch { imeOk = false; }
  if (!imeOk) {
    r.result = 'SKIP';
    r.platform.macOS = 'NOT TESTED';
    r.errors.push('日文输入源未启用（系统设置 → 键盘 → 输入源 → 添加「日文-罗马字」后重跑）');
    return r;
  }
  sleep(600);
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  // 罗马字 "konnichiwa" → Kotoeri 实时候选 こんにちは（marked text），Enter 提交
  if (app === 'mellow') {
    se('tell application "System Events" to keystroke "konnichiwa"'); sleep(800);
    se('tell application "System Events" to keystroke return'); r.steps.push('罗马字 konnichiwa + Enter'); r.input.keyboard.push('SE 罗马字组字+提交');
  } else {
    for (const k of 'konnichiwa'.split('')) { combo('', KEYCODES[k], pid); sleep(150); }
    combo('', 36, pid); r.steps.push('罗马字 konnichiwa + Enter'); r.input.keyboard.push('CGEvent 罗马字组字+提交');
  }
  sleep(900);
  combo('cmd', 1, pid); r.timeMs.save = Date.now() - t0;
  sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('こんにちは') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`读回不含「こんにちは」: ${JSON.stringify(text)}`);
  // 恢复 ABC
  try { execFileSync(SELINPUT, ['com.apple.keylayout.ABC'], { timeout: 5000 }); } catch { /* noop */ }
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j4_selection_bold(app, file) {
  const r = record('4+6. selection + bold');
  // 每 app 独立 seed：Mellow 保存 **text** 后，Typora 的 Cmd+B 是 toggle 语义
  // 会把它还原成 text（同文件接力 = 假 FAIL）。两个 app 必须各自从 'text' 开始。
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
  if (app === 'typora') {
    combo('', 36, pid); // Typora 打开文件后光标在文档末尾（行尾）
  } else {
    // Mellow 打开文件后光标在文档开头（行首）—— 先 Cmd+→ 移到行尾再 Enter，
    // 否则 Enter 会在行首拆行（"\n- item"）而非延续列表
    combo('cmd', 124, pid); sleep(400);
    se('tell application "System Events" to keystroke return');
  }
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
  // Tab 移到下一单元格（不改源码）。不做合成点击（会破坏 WebView 焦点）：
  // Mellow 光标默认在文档开头（表格首格），Tab 由 table keymap 捕获导航。
  if (app === 'typora') {
    // Typora 光标在文档末尾 —— 先 Cmd+↑ 回到文档首行，使 Tab 落在表格内
    combo('cmd', 126, pid); sleep(400);
  }
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
  // undo 事务粒度：SE keystroke "abc" 与 space 分属不同 undo 事务（输入间隔产生
  // 新分组），Typora 行为相同。按 4 次覆盖 a/b/c/space 最坏分组。
  for (let i = 0; i < 4; i++) { combo('cmd', 6, pid); sleep(350); }
  r.steps.push('Cmd+Z ×4'); sleep(800);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = !text.includes('abc') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`undo 后仍有 abc: ${JSON.stringify(text)}`);
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

async function j17_10mb(app) {
  const r = record('17. 10 MB');
  // Hermetic：fixture 拷贝到临时目录再打开 —— 2026-08-22 事故：Typora 会话恢复
  // 会重开上次 benchmark 打开过的 fixtures/10MB.md 标签，后续 journey 的 Cmd+S
  // 会把自动化输入写回 fixture（污染测试语料）。拷贝件被写不影响语料库。
  const SRC = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/fixtures/10MB.md';
  const file = join(WORK, '10MB.md');
  const big = readFileSync(SRC, 'utf8');
  if (big.length < 5 * 1024 * 1024) {
    r.result = 'FAIL';
    r.errors.push(`fixture 异常（${big.length} 字节 < 5MB，疑似被污染；用 generate-fixtures.mjs 重新生成）`);
    return r;
  }
  writeFileSync(file, big);
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  // 轮询「稳定渲染」。ready 判定 = OCR 内容验证（窗口截屏 OCR 出 fixture 首行
  // 关键词 entity —— 2026-08-22 起本机 SCK 窗口捕获流间歇故障：probe 假稳定 +
  // detectChange 无帧，snap 直接失败；OCR 通道独立于 SCK 流且直证「文档已渲染」）。
  // SCK startup-probe 仍尝试执行，仅取 loadMs 参考值（成功与否不影响 ready）。
  // Mellow 传 --no-click：合成点击会破坏 WKWebView 焦点（见 launchMellow 注释）；
  // Typora（原生 app）保留点击聚焦。
  let ready = false;
  for (let i = 0; i < 20 && !ready; i++) {
    try {
      const probeArgs = ['startup-probe', '--pid', String(pid), '--roi', '200,100,600,200', '--timeout', '4000'];
      if (app === 'mellow') probeArgs.push('--no-click');
      const out = execFileSync(HELPER, probeArgs, { encoding: 'utf8', timeout: 10000 });
      const parsed = JSON.parse(out.split('\n').filter((l) => l.trim().startsWith('{')).pop());
      if (parsed.ok && r.timeMs.editable === undefined) r.timeMs.editable = parsed.loadMs ?? null;
    } catch { /* noop */ }
    ready = ocrWindowContains(pid, 'entity');
    if (!ready) sleep(1500);
  }
  r.timeMs.total = Date.now() - t0;
  r.result = ready ? 'PASS' : 'FAIL';
  if (!ready) {
    // Typora 已知行为：>10MB 文件弹「该文件过大，无法在 Typora 中呈现」拒渲染。
    // 如实记录 FAIL（对照数据），并标注根因 —— Mellow 正常渲染 10MB = 优于 Typora。
    const lastShot = join(WORK, 'j17-window.png');
    const lastOcr = q(`'${join(HELPER, '..', 'ocr')}' '${lastShot}' 2>/dev/null`);
    if (lastOcr.includes('过大')) {
      r.errors.push('Typora 拒渲染 >10MB 文件（该文件过大，无法呈现）—— 产品行为；Mellow 正常渲染 = 优');
    } else {
      r.errors.push('10MB 打开后 30s 内未检测到稳定渲染（OCR 未见 fixture 首行）');
    }
  }
  spawnSync('pkill', ['-x', app === 'typora' ? 'Typora' : 'mellow-desktop']);
  return r;
}

/** 窗口 OCR 内容验证：激活进程 → AX 取窗口 bounds → 截屏 → OCR 含 needle */
function ocrWindowContains(pid, needle) {
  try {
    se(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`);
    const bounds = q(`osascript -e 'tell application "System Events" to tell (first process whose unix id is ${pid}) to get {position, size} of window 1'`).trim();
    const m = bounds.match(/(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    const shot = join(WORK, 'j17-window.png');
    q(`screencapture -x -R${m[1]},${m[2]},${m[3]},${m[4]} '${shot}'`);
    const text = q(`'${join(HELPER, '..', 'ocr')}' '${shot}' 2>/dev/null`);
    return text.includes(needle);
  } catch { return false; }
}

const JOURNEYS = {
  1: j1_latin, 2: j2_chinese, 3: j3_japanese, 4: j4_selection_bold, 7: j7_list, 8: j8_table, 9: j9_math, 10: j10_mermaid, 15: j15_undo, 17: j17_10mb,
};

const args = process.argv.slice(2);
/** 支持 --app=x 与 --app x 两种格式 */
function flagArg(name) {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq !== undefined) return eq.split('=')[1];
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < args.length) return args[i + 1];
  return undefined;
}
const appFilter = flagArg('app') ?? 'both';
const journeyFilter = flagArg('journey');

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
for (const r of results) console.log(`${r.result ?? '?'} ${r.journey} [${r.platform?.macOS}]`);
