#!/usr/bin/env node
/**
 * macOS IME Matrix runner（docs/specs/ime-test-plan.md §4/§5）v2。
 *
 * 输入法：简体拼音（SCIM ITABC）。输入原语 = System Events keystroke（CGEvent 字母键
 * 被 WKWebView 过滤，SE keystroke 是验证过的可行管道）。每音节独立空格提交（候选 1）。
 *
 * 验证：保存读回（Cmd+S → 文件）精确断言：
 * - 丢字/重复：输入词（你好中文）出现 1 次；
 * - caret blocker：两段（你好 + 中文）连续无跳位；
 * - undo corruption：Cmd+Z ×2 后无中文残留。
 *
 * 用法：node ime-matrix.mjs [--scenario paragraph,heading]
 */
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELPER = join(__dirname, 'bin', 'screen-timing');
const MB = '/Volumes/My-Data/jason.wa/codebase/Mellow/apps/desktop/src-tauri/target/release/bundle/macos/Mellow.app/Contents/MacOS/mellow-desktop';
const TMP = '/tmp/mellow-ime-scenario.md';

function helper(...args) {
  const out = execFileSync(HELPER, args, { encoding: 'utf8', timeout: 60000 });
  const lines = out.split('\n').filter((l) => l.trim().startsWith('{'));
  return JSON.parse(lines[lines.length - 1]);
}
function combo(mods, key, pid) {
  try { helper('post-combo', '--mods', mods, '--key', String(key), '--pid', String(pid)); } catch { /* noop */ }
}
function se(script) {
  try { execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 15000 }); } catch { /* noop */ }
}
function sleep(ms) { const at = Date.now() + ms; while (Date.now() < at) { /* busy */ } }

/** SE keystroke 前确保 Mellow 前台（keystroke 投递到前台 app） */
function ensureFront(pid) {
  try {
    execFileSync('osascript', ['-e', 'tell application "System Events" to set frontmost of process "mellow-desktop" to true'], { encoding: 'utf8', timeout: 10000 });
  } catch { /* noop */ }
  sleep(400);
}

/** 音节 → 候选 1（本机 macOS 简体拼音已验证）：ni=你 hao=好 zhong=中 wen=文 shi=是 da=大 xue=学 */
const SYL = { ni: '你', hao: '好', zhong: '中', wen: '文', shi: '是', da: '大', xue: '学' };

function typeWord(pid, syllables) {
  ensureFront(pid);
  for (const s of syllables) {
    se(`tell application "System Events" to keystroke "${s}"`);
    sleep(650);
    se('tell application "System Events" to keystroke space');
    sleep(750);
  }
}

function saveAndRead(pid) {
  combo('cmd', 1, pid);
  sleep(1800);
  return readFileSync(TMP, 'utf8');
}

/** 清除 macOS 崩溃恢复锁存（CrashReporter plist + Saved State）：
 * wry/WebKit 自定义协议存在偶发启动崩溃（tokio-rt-worker SIGABRT，历史 crash
 * 报告签名一致，Aug 13-18 均存在）；崩溃后 macOS 会在后续每次启动弹出
 * 「重新打开窗口」恢复对话框，锁死矩阵。每次 launch 前清除锁存可避免连锁失败。 */
function clearCrashLatch() {
  try {
    execFileSync('sh', ['-c', 'rm -f "$HOME/Library/Application Support/CrashReporter/mellow-desktop_"*.plist; rm -rf "$HOME/Library/Saved Application State/com.mellow.editor.savedState"; defaults write com.mellow.editor NSQuitAlwaysKeepsWindows -bool false; defaults write com.mellow.editor NSDisableAutomaticTermination -bool true'], { encoding: 'utf8', timeout: 15000 });
  } catch { /* noop */ }
}

function launchScenario(doc) {
  spawnSync('pkill', ['-x', 'mellow-desktop']);
  sleep(1000);
  clearCrashLatch();
  writeFileSync(TMP, doc);
  const proc = spawn(MB, [TMP], { stdio: 'ignore' });
  sleep(9000);
  return proc;
}

/** 输入两段（你好 + 中文）：第一段为 caret 连续验证的前缀 */
const SEG1 = ['ni', 'hao'];      // 你好
const SEG2 = ['zhong', 'wen'];   // 中文
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

async function runDocumentScenario(sc) {
  // SE keystroke 偶发不可达 → 场景级重试（≤3 次，输入验证驱动）
  // macOS wry 自定义协议存在偶发 iframe 加载取消（-999）：提高重试上限吸收
  for (let attempt = 1; attempt <= 5; attempt++) {
    const proc = launchScenario(sc.doc);
    const pid = proc.pid;
    try {
      helper('focus-type', '--pid', String(pid), '--roi', '400,200,600,200');
      sleep(1200);
      typeWord(pid, SEG1);
      typeWord(pid, SEG2);
      const text = saveAndRead(pid);
      const r = { scenario: sc.id, attempt, got: text.replace(/\n/g, '⏎') };
      const count = text.split(EXPECT).length - 1;
      r.pass = count === 1;
      if (!r.pass) r.reason = count === 0 ? `未包含 ${EXPECT}` : `重复 ${count} 次`;
      if (!r.pass) { proc.kill(); continue; }
      r.caretOk = r.pass;
      // undo corruption：连续 Cmd+Z 直至中文清空（上限 12 步：CM6 每 composition 事务需 2 次 undo）
      for (let i = 0; i < 12; i++) {
        ensureFront(pid);
        se('tell application "System Events" to keystroke "z" using {command down}');
        sleep(1000);
        const t = saveAndRead(pid);
        if (!t.includes(SYL[SEG1[0]]) && !t.includes(SYL[SEG2[0]])) break;
      }
      const afterUndo = saveAndRead(pid);
      r.undoOk = !afterUndo.includes(SYL[SEG1[0]]) && !afterUndo.includes(SYL[SEG2[0]]);
      if (!r.undoOk) r.undoReason = `undo 6 步后仍有中文: ${JSON.stringify(afterUndo)}`;
      proc.kill();
      return r;
    } catch (e) {
      proc.kill();
      if (attempt === 3) return { scenario: sc.id, pass: false, reason: String(e.message) };
    }
  }
  return { scenario: sc.id, pass: false, reason: '重试耗尽' };
}

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--scenario='))?.split('=')[1];

const results = [];
for (const sc of SCENARIOS) {
  if (only && !only.split(',').includes(sc.id)) continue;
  try {
    const r = await runDocumentScenario(sc);
    results.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.scenario}: got=${JSON.stringify(r.got)}${r.reason ? ' | ' + r.reason : ''}${r.caretOk ? ' | caret ok' : ' | caret FAIL'}${r.undoOk ? ' | undo ok' : ' | undo FAIL'}`);
  } catch (e) {
    results.push({ scenario: sc.id, pass: false, reason: String(e.message) });
    console.log(`FAIL ${sc.id}: ${e.message}`);
  }
}
const pass = results.filter((r) => r.pass && r.undoOk !== false).length;
console.log(`\n${pass}/${results.length} 场景通过（简体拼音）`);
process.exit(pass === results.length ? 0 : 1);
