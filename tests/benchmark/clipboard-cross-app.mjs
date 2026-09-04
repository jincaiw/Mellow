#!/usr/bin/env node
/**
 * clipboard-cross-app — G4-EDIT-05 跨应用剪贴板真机自动化（macOS，本机可执行部分）。
 *
 * 对应 docs/specs/clipboard-smart-paste-spec.md §2/§8、V4 §P5「Clipboard 跨应用矩阵」。
 * 手动矩阵（tests/qualification/clipboard-copy-cross-app.md）中「系统纯文本编辑器」
 * 一列由本脚本自动化：目标应用 = TextEdit（macOS 自带，纯文本语义）。
 *
 * Journeys：
 *   C1 rich-copy-mime          Mellow 正常复制 → `clipboard info` 必须含 «class HTML»（多 MIME 表示）
 *   C2 copy-markdown→TextEdit  Cmd+Shift+C 复制为 Markdown → TextEdit 粘贴保存 → 文件读回逐字符等于 Markdown 源
 *   C3 TextEdit→Mellow 粘贴    TextEdit 纯文本复制 → Mellow Cmd+Shift+V 粘贴纯文本 → 保存读回逐字符一致
 *
 * 实现约束（2026-09-04 实测）：
 * - WorkBuddy 宿主对 System Events / TextEdit 的 Apple Events 无 TCC 授权（-10004），
 *   故全部输入走 screen-timing helper 的 CGEvent post-combo（Accessibility 已授权）；
 * - 窗口激活用 `open -a <app>`（AppKit activate，非 Apple Events）；
 * - 读回全部走文件（TextEdit Cmd+S / Mellow Cmd+S），不用 AppleScript 读 UI；
 * - 不做任何文本键入到 Mellow（CGEvent 字母被 WKWebView 过滤，文档经启动参数预写）。
 *
 * 安全：
 * - Mellow 使用 /tmp 隔离 profile（不触碰用户真实 Application Support / WebKit / 运行中进程）；
 * - TextEdit 仅操作脚本自建的 /tmp 文档，结束前 Cmd+W 关闭该文档；仅当 TextEdit 原本
 *   未运行时才在结束时退出进程（绝不影响用户已打开的文档）。
 *
 * 用法：node tests/benchmark/clipboard-cross-app.mjs
 * 输出：tests/benchmark/results/<ts>-clipboard-cross-app.json + 控制台 ✅/❌
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HELPER, RESULTS_DIR, checkPerms, inputSourceIsEnglish, sleep } from './perf-common.mjs';

const MB = process.env.MELLOW_GOLDEN_APP ?? '/Volumes/My-Data/jason.wa/codebase/Mellow/apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app/Contents/MacOS/mellow-desktop';
const APP = '/Volumes/My-Data/jason.wa/codebase/Mellow/apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app';
const WORK = '/tmp/mellow-clip';
const HOME = join(WORK, 'mellow-home');
const DOC = join(WORK, 'work.md');
const NOTE = join(WORK, 'note.txt');
const MARKDOWN_SOURCE = 'Hello **bold** world';
const PLAIN_FROM_TEXTEDIT = 'Pasted from TextEdit plain';
// 与 golden-journeys 同一张 virtual keycode 表（US 布局）
const KEYCODES = { a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, t: 17, y: 16, u: 32, i: 34, o: 31, p: 35, k: 40, l: 37, n: 45, m: 46, space: 49, enter: 36, tab: 48, esc: 53, left: 123, right: 124, up: 126, down: 125, delete: 51 };

function sh(cmd, timeout = 20000) {
  try { return execFileSync('/bin/bash', ['-c', cmd], { encoding: 'utf8', timeout }) || ''; } catch (e) { return String(e.stdout ?? ''); }
}
function combo(mods, key, pid = 0) {
  try { execFileSync(HELPER, ['post-combo', '--mods', mods, '--key', String(key), '--pid', String(pid)], { encoding: 'utf8', timeout: 15000 }); } catch { /* noop */ }
}
function typeCEvent(text, pid) {
  for (const ch of text) {
    if (ch === ' ') combo('', KEYCODES.space, pid);
    else combo('', KEYCODES[ch.toLowerCase()] ?? 0, pid);
    sleep(60);
  }
}
function activateMellow() { sh(`open -a "${APP}"`); sleep(800); }
function texteditPid() {
  try { return parseInt(sh('pgrep -x TextEdit').trim().split('\n')[0], 10); } catch { return 0; }
}
const results = [];
function record(id, ok, detail = '') {
  results.push({ id, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

function launchMellow(file) {
  if (!existsSync(MB)) throw new Error(`未找到 Mellow release 可执行文件：${MB}（先 tauri build）`);
  rmSync(HOME, { recursive: true, force: true });
  mkdirSync(HOME, { recursive: true });
  const env = { ...process.env, HOME, CFFIXED_USER_HOME: HOME };
  const proc = spawn(MB, [file], { stdio: 'ignore', env });
  sleep(9000);
  activateMellow();
  return proc;
}

async function main() {
  if (process.platform !== 'darwin') {
    console.error('仅支持 macOS 真机（Windows/Linux 走 CI / self-hosted runner，见 D8）');
    process.exit(2);
  }
  checkPerms();
  if (!inputSourceIsEnglish()) {
    console.error('输入源非英文：为防 IME 干扰拒绝执行（切到 ABC 后重试）');
    process.exit(2);
  }
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  writeFileSync(DOC, `${MARKDOWN_SOURCE}\n`, 'utf8');
  writeFileSync(NOTE, '', 'utf8');

  const teRunningBefore = texteditPid() > 0;
  let mellow = null;
  try {
    mellow = launchMellow(DOC);

    // C1：正常复制 → 剪贴板必须携带 HTML 富文本表示
    combo('cmd', KEYCODES.a, mellow.pid); sleep(400);
    combo('cmd', KEYCODES.c, mellow.pid); sleep(700);
    const clipInfo = sh('osascript -e "clipboard info"');
    record('C1 rich-copy-mime', clipInfo.includes('«class HTML»') || clipInfo.includes('HTML'),
      clipInfo.split(',')[0]?.trim() ?? '');

    // C2：复制为 Markdown（Cmd+Shift+C）→ TextEdit 粘贴 → Cmd+S 保存 → 文件读回
    combo('cmd,shift', KEYCODES.c, mellow.pid); sleep(700);
    sh(`open -a TextEdit "${NOTE}"`); sleep(2500);
    const tePid = texteditPid();
    if (!tePid) throw new Error('TextEdit 未启动');
    combo('cmd', KEYCODES.v, tePid); sleep(800);
    combo('cmd', KEYCODES.s, tePid); sleep(1200);
    const noteText = (readFileSync(NOTE, 'utf8') ?? '').replace(/\n+$/, '');
    record('C2 copy-markdown-to-TextEdit', noteText === MARKDOWN_SOURCE, JSON.stringify(noteText));

    // C3：TextEdit 输入纯文本 → 复制 → Mellow 粘贴纯文本（Cmd+Shift+V）→ 保存读回
    combo('cmd', KEYCODES.a, tePid); sleep(300);
    combo('', KEYCODES.delete, tePid); sleep(300);
    typeCEvent(PLAIN_FROM_TEXTEDIT, tePid); sleep(300);
    combo('cmd', KEYCODES.a, tePid); sleep(300);
    combo('cmd', KEYCODES.c, tePid); sleep(600);
    activateMellow();
    combo('cmd', KEYCODES.a, mellow.pid); sleep(300);
    combo('cmd,shift', KEYCODES.v, mellow.pid); sleep(900);
    combo('cmd', KEYCODES.s, mellow.pid); sleep(1500);
    const saved = (readFileSync(DOC, 'utf8') ?? '').replace(/\n+$/, '');
    record('C3 TextEdit-paste-plain-to-Mellow', saved === PLAIN_FROM_TEXTEDIT, JSON.stringify(saved));

    // 清理：关闭我们的 TextEdit 文档（已保存，Cmd+W 无对话框）；仅原本未运行时退出
    combo('cmd', KEYCODES.w, tePid); sleep(500);
    if (!teRunningBefore) sh('pkill -x TextEdit');
  } finally {
    if (mellow?.pid) { try { process.kill(mellow.pid, 'SIGTERM'); } catch { /* 已退出 */ } }
    rmSync(HOME, { recursive: true, force: true });
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-clipboard-cross-app.json`);
  writeFileSync(out, `${JSON.stringify({ platform: 'macos', target: 'TextEdit', results }, null, 2)}\n`);
  console.log(`结果归档：${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
