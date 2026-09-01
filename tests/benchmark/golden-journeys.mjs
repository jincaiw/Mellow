#!/usr/bin/env node
/**
 * Golden Journeys runner（PRD §111 Runtime Qualification：V1 必测项）。
 * 每 journey 在 Mellow 与当前已安装 Typora 上执行相同操作序列，记录：
 * 规范判定基线固定为 Typora 1.14.9（build 7785）。Typora 版本不匹配时拒绝执行对照，
 * 防止将其他版本结果误记为正式验收证据。
 * steps / time / errors / unexpected / keyboard-mouse / 平台状态。
 * 输入原语：
 * - Mellow：System Events keystroke（CGEvent 字母被 WKWebView 过滤）+ 空格提交
 * - Typora：activate + CGEvent post-combo（原生 app）+ 空格提交（输入源为拼音时）
 * 验证：保存读回（Cmd+S → 读文件）。源码 ASCII 命令（bold/list/table/undo）不受 IME 影响。
 *
 * 用法：node golden-journeys.mjs --app mellow [--journey 1,6]
 *       node golden-journeys.mjs --app both --close-existing-typora
 *       node golden-journeys.mjs --app mellow --journey 3  # 可选日文兼容性观察
 * Mellow 始终使用 /tmp 下隔离 profile，不读取、清理或关闭用户的真实 Mellow 状态。
 * Typora 没有可验证的隔离 profile；对照运行必须显式允许关闭已有 Typora 进程。
 */
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const HELPER = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/bin/screen-timing';
const MB = process.env.MELLOW_GOLDEN_APP ?? '/Volumes/My-Data/jason.wa/codebase/Mellow/apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app/Contents/MacOS/mellow-desktop';
const TY = '/Applications/Typora.app/Contents/MacOS/Typora';
const TYPORA_EXPECTED_VERSION = '1.14.9';
const WORK = '/tmp/mellow-gj';
const MELLOW_GOLDEN_HOME = join(WORK, 'mellow-home');
mkdirSync(WORK, { recursive: true });

function q(cmd, timeout = 25000) {
  try { return execFileSync('/bin/bash', ['-c', cmd], { encoding: 'utf8', timeout }) || ''; } catch (e) { return String(e.stdout || ''); }
}
function sleep(ms) { const at = Date.now() + ms; while (Date.now() < at) { /* busy */ } }
function combo(mods, key, pid) { try { execFileSync(HELPER, ['post-combo', '--mods', mods, '--key', String(key), '--pid', String(pid)], { encoding: 'utf8', timeout: 15000 }); } catch { /* noop */ } }
function se(script) { try { execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 15000 }); } catch { /* noop */ } }
function activatePid(pid) { se(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`); sleep(500); }

function stopProcess(pid) {
  if (typeof pid !== 'number' || pid <= 0) return;
  try { process.kill(pid, 'SIGTERM'); } catch { /* process already exited */ }
  sleep(300);
}

function appVersion(appBundle) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(appBundle, 'Contents/Info.plist')], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

const KEYCODES = { a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, t: 17, y: 16, u: 32, i: 34, o: 31, p: 35, k: 40, l: 37, n: 45, m: 46, space: 49, enter: 36, tab: 48, esc: 53, left: 123, right: 124, up: 126, down: 125 };

// ---------- app lifecycle ----------
function launchMellow(file) {
  if (!existsSync(MB)) {
    throw new Error(`未找到 Mellow release 可执行文件：${MB}`);
  }
  // Golden Journey 只能清理其自身的 /tmp 测试 profile，绝不触碰用户真实的
  // Application Support、WebKit、Saved State 或运行中的 Mellow 进程。
  rmSync(MELLOW_GOLDEN_HOME, { recursive: true, force: true });
  mkdirSync(MELLOW_GOLDEN_HOME, { recursive: true });
  const profileEnv = { ...process.env, HOME: MELLOW_GOLDEN_HOME, CFFIXED_USER_HOME: MELLOW_GOLDEN_HOME };
  const proc = spawn(MB, [file], { stdio: 'ignore', env: profileEnv });
  sleep(9000);
  activatePid(proc.pid);
  // 注意：不做合成点击。WKWebView 启动时自动持有焦点（WebView 为 first responder，
  // CodeMirror 默认聚焦），SE keystroke / CGEvent 可直达。实测合成鼠标点击（CGEvent
  // mouseDown/post）反而会破坏 WebView 焦点协议，导致后续键盘事件全部丢失
  // （2026-08-19 诊断：focus-type 点击后 keystroke 全部失效，不点击则全部生效）。
  return proc.pid;
}
function launchTypora(file) {
  if (!allowTyporaLifecycle) {
    throw new Error('Typora Journey 会关闭已有 Typora 进程；请显式传入 --close-existing-typora 后重试');
  }
  spawnSync('pkill', ['-x', 'Typora']); sleep(800);
  const proc = spawn(TY, [file], { stdio: 'ignore' });
  sleep(7000);
  activatePid(proc.pid);
  // 2026-08-22 修复：Typora「恢复上次会话」会把 benchmark 旧标签（如 10MB.md）
  // 重开且可能持有焦点 —— 后续 Cmd+A/B/S 会打到恢复标签（j4 假 FAIL、fixture
  // 被 Cmd+S 污染均源于此）。二次 open 使目标文件成为活跃文档。
  q(`open -a Typora '${file.replace(/'/g, "'\\''")}'`);
  sleep(1200);
  activatePid(proc.pid);
  return proc.pid;
}
function stopApp(app, pid) {
  // Typora 仅在 --close-existing-typora 明确授权后才可能由本 runner 启动/关闭。
  stopProcess(pid);
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
  stopApp(app, pid);
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
  stopApp(app, pid);
  return r;
}

async function j3_japanese(app, file) {
  const r = record('3. Japanese IME');
  // 前置：切换输入源到日文罗马字（Kotoeri Romaji，master-plan G12）。
  // ID 演进：macOS ≤13 为 com.apple.inputmethod.Kotoeri.Romaji；
  // macOS 14+ 实测（26.6 TIS 列表）为 com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese。
  // 两者都不可用时 SKIP（系统设置 → 键盘 → 输入源 → 添加「日文-罗马字」后重跑），
  // 不算 FAIL —— 环境缺输入源 ≠ 功能缺陷。
  const SELINPUT = '/Volumes/My-Data/jason.wa/codebase/Mellow/tests/benchmark/bin/select-input';
  const JP_IDS = ['com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese', 'com.apple.inputmethod.Kotoeri.Romaji'];
  let imeOk = true;
  let jpId = null;
  for (const id of JP_IDS) {
    try { execFileSync(SELINPUT, [id], { timeout: 5000 }); jpId = id; break; } catch { /* try next */ }
  }
  if (jpId === null) imeOk = false;
  if (!imeOk) {
    r.result = 'SKIP';
    r.platform.macOS = 'NOT TESTED';
    r.errors.push('日文输入源未启用（系统设置 → 键盘 → 输入源 → 添加「日文-罗马字」后重跑）');
    return r;
  }
  sleep(600);
  const pid = app === 'typora' ? launchTypora(file) : launchMellow(file);
  const t0 = Date.now();
  // 罗马字 "nihongo" → にほんご / 日本語（macOS 26 JapaneseIM 实时候选首选汉字；
  // 判定准则 = IME 组字提交成功（平假名或汉字转换任一），非词典选择 —— journey
  // 验证 marked text 经编辑器的完整性与提交，2026-08-22 实测 "konnichiwa" 为
  // 字面转换 こんにちわ（正字 こんにちは 拼作 konnichiha），故选无歧义词 nihongo）
  if (app === 'mellow') {
    // 日文 IME 需要逐键接收罗马字以持续维护 marked text；把整串作为一次
    // System Events keystroke 会在 macOS 中偶发只留下换行，不代表真实键盘路径。
    for (const key of 'nihongo') { se(`tell application "System Events" to keystroke "${key}"`); sleep(150); }
    sleep(800);
    se('tell application "System Events" to key code 36'); r.steps.push('逐键罗马字 nihongo + Enter'); r.input.keyboard.push('逐键 SE 罗马字组字+提交');
  } else {
    for (const k of 'nihongo'.split('')) { combo('', KEYCODES[k], pid); sleep(150); }
    combo('', 36, pid); r.steps.push('罗马字 nihongo + Enter'); r.input.keyboard.push('CGEvent 罗马字组字+提交');
  }
  sleep(900);
  combo('cmd', 1, pid); r.timeMs.save = Date.now() - t0;
  sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('にほんご') || text.includes('日本語') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`读回不含「にほんご/日本語」: ${JSON.stringify(text)}`);
  // 恢复 ABC
  try { execFileSync(SELINPUT, ['com.apple.keylayout.ABC'], { timeout: 5000 }); } catch { /* noop */ }
  stopApp(app, pid);
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
  stopApp(app, pid);
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
  stopApp(app, pid);
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
  } else {
    // Mellow 打开文件后 caret 位于 offset 0，即首个 `|` 之前，而不是首个
    // 单元格内容。Tab 在 Markdown 标记前应交回默认缩进；先右移到 `a` 内才是
    // spec §5「Tab next cell」的真实前置条件。
    combo('', 124, pid); sleep(150);
    combo('', 124, pid); sleep(300);
  }
  // WKWebView 将进程级 CGEvent Tab 作为 TextInput 注入，绕过 DOM keydown；
  // 用 System Events 的常规键盘路径模拟真实用户按键，才能验证 CM 表格 keymap。
  if (app === 'mellow') se('tell application "System Events" to key code 48');
  else combo('', 48, pid);
  r.steps.push('Tab 下一单元格'); r.timeMs.nav = Date.now() - t0;
  sleep(500);
  combo('cmd', 1, pid); sleep(1500);
  const text = readFileSync(file, 'utf8');
  r.result = text.includes('| a | b |') ? 'PASS' : 'FAIL';
  if (r.result === 'FAIL') r.errors.push(`table fidelity 读回: ${JSON.stringify(text)}`);
  r.unexpected.push(text !== '| a | b |\n|---|---|\n| 1 | 2 |' ? 'Tab 导航改变了源码' : '无');
  stopApp(app, pid);
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
  stopApp(app, pid);
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
  stopApp(app, pid);
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
  stopApp(app, pid);
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
  // 只看到首行不等于「可编辑」。Mellow 必须完成一次真实键入、Cmd+S 与磁盘
  // 读回，才能作为 10MB Gate 的原生证据；测试文件为 /tmp 拷贝，允许写入。
  let editSaved = false;
  if (ready && app === 'mellow') {
    const before = readFileSync(file, 'utf8');
    const editStart = Date.now();
    // 大文件加载后 iframe 不保证保留初始焦点。CGEvent 点击会破坏 WKWebView 的
    // TextInput 焦点协议；这里改用 System Events 的真实鼠标与键盘路径。
    // 防御性折叠任何启动期残留选区；箭头键本身不修改 Markdown 源码。
    focusAndTypeMellow(pid, 'z');
    sleep(400);
    const saved = saveRead(file, pid);
    r.timeMs.editSave = Date.now() - editStart;
    editSaved = saved.length === before.length + 1;
    if (!editSaved) {
      r.errors.push(`10MB 编辑/保存读回异常：before=${before.length}, after=${saved.length}`);
    }
  }
  r.result = ready && (app !== 'mellow' || editSaved) ? 'PASS' : 'FAIL';
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
  stopApp(app, pid);
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

/** 以窗口实际位置定位正文中心，走 WKWebView 可识别的 System Events 输入通路。 */
function focusAndTypeMellow(pid, text) {
  const bounds = q(`osascript -e 'tell application "System Events" to tell (first process whose unix id is ${pid}) to get {position, size} of window 1'`).trim();
  const m = bounds.match(/(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) throw new Error('无法读取 Mellow 窗口坐标');
  const x = Math.round(Number(m[1]) + Number(m[3]) * 0.5);
  const y = Math.round(Number(m[2]) + Number(m[4]) * 0.55);
  execFileSync('osascript', ['-e', `tell application "System Events"
    set frontmost of (first process whose unix id is ${pid}) to true
    delay 0.2
    click at {${x}, ${y}}
    delay 0.2
    key code 124
    keystroke "${text}"
  end tell`], { encoding: 'utf8', timeout: 15000 });
}

// V1 的语言支持范围仅为 English 与简体中文。日文 IME 仍可通过
// `--journey=3` 手动运行以观察兼容性，但绝不参与默认 Gate。
const REQUIRED_JOURNEYS = {
  1: j1_latin, 2: j2_chinese, 4: j4_selection_bold, 7: j7_list, 8: j8_table, 9: j9_math, 10: j10_mermaid, 15: j15_undo, 17: j17_10mb,
};
const OPTIONAL_COMPATIBILITY_JOURNEYS = { 3: j3_japanese };

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
const allowTyporaLifecycle = args.includes('--close-existing-typora');
const JOURNEYS = journeyFilter
  ? { ...REQUIRED_JOURNEYS, ...OPTIONAL_COMPATIBILITY_JOURNEYS }
  : REQUIRED_JOURNEYS;

if ((appFilter === 'both' || appFilter === 'typora')) {
  const actual = appVersion('/Applications/Typora.app');
  if (actual !== TYPORA_EXPECTED_VERSION) {
    throw new Error(`Typora 验收基线必须为 ${TYPORA_EXPECTED_VERSION}（build 7785）；当前检测到 ${actual ?? '未安装'}。`);
  }
  console.log(`Typora baseline: ${actual}（build 7785）`);
}

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
      const timings = Object.entries(r.timeMs).map(([name, ms]) => `${name}=${ms}ms`).join(', ');
      console.log(`[${app}] ${r.journey}: ${r.result}${r.errors.length ? ' | ' + r.errors.join('; ') : ''}${timings ? ' | ' + timings : ''}`);
    } catch (e) {
      results.push({ journey: `j${id}`, result: 'ERROR', errors: [String(e.message)] });
      console.log(`[${app}] j${id}: ERROR ${e.message}`);
    }
  }
}
console.log('\n=== 汇总 ===');
for (const r of results) console.log(`${r.result ?? '?'} ${r.journey} [${r.platform?.macOS}]`);
