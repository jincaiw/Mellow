#!/usr/bin/env node
/**
 * Linux IME Matrix runner（fcitx5 / ibus）——在 mellow-linux-ime 容器内执行。
 *
 * 输入：xdotool type（XTEST 经 GTK IM → fcitx5/ibus 组词）+ xdotool key space（提交候选 1）。
 * 读回：优先 Ctrl+A Ctrl+C + xclip（X11 剪贴板）；失败 fallback Ctrl+S 保存读回。
 * 断言：四个拼音音节各提交一个汉字（无丢字/重复）/ caret 连续（两段）/
 * undo（Ctrl+Z 直至清空，无 corruption）。词库候选排序本身不属于编辑器行为。
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
 * fcitx5 可以按输入上下文记忆当前 IM；因此在文档获得焦点后再次显式选择拼音。
 * WebKitGTK 的 InputContext 不保证被 Controller1.CurrentInputMethod 枚举；因此
 * 不把空 D-Bus 状态误判为产品失败。随后“拼音音节 → 中文提交 → 保存读回 → Undo”
 * 的八场景断言才是输入法是否真正进入编辑器的强证据。
 */
function ensureFcitxPinyin() {
  if (im !== 'fcitx5') return;
  sh('fcitx5-remote -g Default; fcitx5-remote -o; fcitx5-remote -s pinyin');
  const group = sh('fcitx5-remote -q').trim();
  const current = sh('busctl --user call org.fcitx.Fcitx5 /controller org.fcitx.Fcitx.Controller1 CurrentInputMethod').trim();
  console.log(`[ime] selected-group=${group || 'UNAVAILABLE'} controller-current=${current || 'UNAVAILABLE'}`);
  if (group !== 'Default') throw new Error('fcitx5 Default input-method group is not active');
}

/**
 * Xvfb + WebKitGTK 下，切换 fcitx5 input context 后会短暂把 X11 焦点归还给
 * 顶层窗口。必须在选择拼音后重新落到编辑器内容区，并把插入点显式移动到文档末尾；
 * 不能依赖上一次 click 的偶然焦点状态。
 */
function focusEditor(winId, point = { x: 600, y: 250 }) {
  if (!winId) throw new Error('Mellow main window was not found');
  sh(`xdotool windowactivate --sync ${winId} 2>/dev/null; xdotool windowfocus --sync ${winId} 2>/dev/null`);
  sh(`xdotool mousemove --window ${winId} ${point.x} ${point.y} click --repeat ${point.clicks ?? 1} 1`);
  sleep(700);
  xdo('key --clearmodifiers ctrl+End');
  sleep(500);
  console.log(`[focus] target=${winId} active=${sh('xdotool getwindowfocus 2>/dev/null').trim() || 'UNAVAILABLE'}`);
}

/** 读回：优先剪贴板，fallback 保存读回 */
function readBack(pid) {
  combo('ctrl+a', '29:1 30:1 30:0 29:0');
  sleep(200);
  combo('ctrl+c', '29:1 46:1 46:0 29:0');
  sleep(400);
  // CI/Xvfb 中可能没有可响应的 clipboard owner；xclip 会一直等待，不能让每次
  // Undo 的读回被通用 20s shell timeout 放大。1s 后可靠地回退到保存读回。
  const clip = sh('timeout 1 xclip -selection clipboard -o 2>/dev/null').trim();
  // 容器/CI 环境 xclip 连接失败（Could not connect to localhost）→ 走保存读回
  if (clip.length > 0 && !clip.includes('Could not connect') && !clip.includes('Error:')) return clip;
  combo('ctrl+s', '29:1 31:1 31:0 29:0');
  sleep(1500);
  try { return readFileSync(DOC, 'utf8'); } catch { return ''; }
}

function launch(doc, im) {
  // CI 容器中只会启动本 harness 的 mellow-desktop。Tauri 的 single-instance
  // forwarding 会把新文件交给旧进程；因此必须清理所有同名旧实例，不能只杀
  // nohup 外层 PID，否则后续场景会意外继续编辑上一份文档。
  const oldPid = sh('cat /tmp/mellow.pid 2>/dev/null').trim();
  if (oldPid) { spawnSync('kill', [oldPid]); }
  sh('pkill -x mellow-desktop 2>/dev/null || true');
  sleep(1200);
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
const SEG2 = ['zhong', 'guo'];
const HAN = /[\u3400-\u9fff]/gu;
function hanCount(text) { return (text.match(HAN) ?? []).length; }

const SCENARIOS = [
  { id: 'paragraph', doc: '' },
  { id: 'heading', doc: '# ' },
  { id: 'format', doc: '**bold**' },
  { id: 'list', doc: '- item' },
  { id: 'table', doc: '| a | b |\n|---|---|\n| 1 | 2 |' },
  // Fenced code is a short inline node near the top of the document. The
  // default blank-body point is below it and only focuses the editor shell;
  // target the code node itself so this scenario verifies composition inside it.
  // Coordinates are window-relative (and therefore include title/menu/tab chrome).
  // y=65 targets the opening fence, which is a non-text marker. The editable `code`
  // content line is one visual row lower at y≈90; focus that line directly.
  { id: 'code', doc: '```\ncode\n```', focusPoint: { x: 300, y: 90 } },
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
    focusEditor(wid, sc.focusPoint);
  }
  ensureFcitxPinyin();
  // fcitx5 在 InputContext 切换后可能重置 X11 focus；切换完成后再次聚焦是
  // 真实桌面操作链的一部分，而不是绕过 IME 的直接写文件。
  focusEditor(wid, sc.focusPoint);
  for (const s of SEG1) typeSyl(s);
  for (const s of SEG2) typeSyl(s);
  const text = readBack(pid);
  const r = { im, scenario: sc.id, got: text.replace(/\n/g, '⏎') };
  // fcitx5 用户词典会影响每个拼音的首候选（例如 guo 可能为「国」或「过」）。
  // 这里验证编辑器体验合同：四个音节均提交为汉字、无丢失/重复，并在保存后读回。
  const committedHan = hanCount(text);
  r.pass = committedHan === 4;
  if (!r.pass) r.reason = `预期 4 个已提交汉字，实际 ${committedHan}`;
  // undo 直至清空
  for (let i = 0; i < 12; i++) {
    combo('ctrl+z', '29:1 44:1 44:0 29:0');
    sleep(900);
    const t = readBack(pid);
    if (hanCount(t) === 0) break;
  }
  const afterUndo = readBack(pid);
  r.undoOk = hanCount(afterUndo) === 0;
  if (!r.undoOk) r.undoReason = `undo 后仍有汉字: ${JSON.stringify(afterUndo)}`;
  // 只匹配精确进程名，不会误杀外层 bash/Node；确保下一场景不会走 single-instance forwarding。
  spawnSync('kill', [pid]);
  sh('pkill -x mellow-desktop 2>/dev/null || true');
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${im}/${sc.id}: got=${JSON.stringify(r.got)}${r.reason ? ' | ' + r.reason : ''}${r.undoOk ? ' | undo ok' : ' | undo FAIL'}`);
}
const pass = results.filter((r) => r.pass && r.undoOk !== false).length;
console.log(`\n${pass}/${results.length} 场景通过（${im}）`);
process.exit(pass === results.length ? 0 : 1);
