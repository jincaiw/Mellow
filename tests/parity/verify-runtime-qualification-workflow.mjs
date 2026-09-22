import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/runtime-qualification.yml'), 'utf8').replace(/\r\n/g, '\n');
const cargoManifest = readFileSync(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8').replace(/\r\n/g, '\n');
const releaseBuilds = [...workflow.matchAll(/run:\s*cargo build --release([^\n]*)/g)];

if (!/workflow_dispatch:\s*\n\s+inputs:\s*\n\s+target:/.test(workflow)
  || !/macos-windows/.test(workflow)
  || !/inputs\.target == 'all' \|\| inputs\.target == 'macos-windows'/.test(workflow)) {
  throw new Error('Runtime Qualification must support a macOS/Windows-only dispatch while Linux is deferred');
}

if (releaseBuilds.length !== 3) {
  throw new Error(`Expected exactly 3 Runtime Qualification release builds, found ${releaseBuilds.length}`);
}

for (const build of releaseBuilds) {
  if (!/--features\s+custom-protocol\b/.test(build[0])) {
    throw new Error(`Runtime Qualification release build must embed frontendDist: ${build[0]}`);
  }
}

if (!/^custom-protocol\s*=\s*\["tauri\/custom-protocol"\]$/m.test(cargoManifest)) {
  throw new Error('Desktop Cargo manifest must forward custom-protocol to Tauri');
}

if (!/ime-matrix-linux\.mjs --im=fcitx5 --driver=xdotool/.test(workflow)) {
  throw new Error('Linux IME matrix must use the XTEST driver that reaches WebKitGTK and fcitx5');
}
if (/apt-get install[^\n]*\bydotool\b|\bydotoold\b|--driver=ydotool/.test(workflow)) {
  throw new Error('Linux IME workflow must not use raw ydotool injection under Xvfb');
}
if (!/locale-gen\s+zh_CN\.UTF-8/.test(workflow)
  || !/export LANG=zh_CN\.UTF-8 LC_CTYPE=zh_CN\.UTF-8/.test(workflow)) {
  throw new Error('Linux XIM-based IME matrix must generate and export zh_CN.UTF-8');
}

if (!/Windows Source Fidelity gate/.test(workflow)
  || !/cargo test --features custom-protocol --test file_safety_corpus source_fidelity_open_no_edit_save_byte_identical/.test(workflow)
  || !/interactive_input_skipped=true/.test(workflow)
  || !/interactive_input_persisted=/.test(workflow)) {
  throw new Error('Windows Runtime Qualification must gate source fidelity and report its hosted-desktop interaction limit');
}

// ── 步骤工作目录 / 制品路径必须与 checkout 落点一致（2026-09-22）──────────────
// 立此节的原因：Windows job 的 actions/checkout **没有** `path: mellow`（仓库落在工作区根），
// 但视觉采集步骤写了 `working-directory: mellow` —— 该目录不存在，pwsh 直接无法启动：
//   ##[error]An error occurred trying to start process '…pwsh.EXE' with working directory
//            'D:\a\Mellow\Mellow\mellow'. The directory name is invalid.
// 步骤**一步都没跑**（连脚本都没执行），而 continue-on-error 把错误吞掉
// → upload-artifact 报 "No files were found" → 制品静默缺失、屏幕上看不出异常
// → P0-LAYOUT-002 长期 BLOCKED。这类「路径前缀写错」无法从产物看出，必须静态锁定。
{
  const problems = [];
  for (const name of ['linux-runtime', 'windows-runtime', 'macos-runtime']) {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    if (start < 0) { problems.push(`workflow 缺少 job ${name}`); continue; }
    const rest = workflow.slice(start + 1);
    const next = /\n  [a-z][a-z0-9-]*:\n/.exec(rest.slice(name.length + 4));
    const body = next === null ? rest : rest.slice(0, name.length + 4 + next.index);
    // 该 job 的 checkout 落点（缺省 = 仓库根）
    const checkoutPath = (/uses: actions\/checkout@v4\n(?:[ \t]+with:\n)?(?:[ \t]+path:[ \t]*([^\n]+)\n)?/
      .exec(body)?.[1] ?? '').trim();
    const where = checkoutPath === '' ? '<repo root>' : checkoutPath;
    for (const m of body.matchAll(/working-directory:[ \t]*([^\n]+)/g)) {
      const wd = m[1].trim();
      const ok = checkoutPath === ''
        ? !/^mellow(\/|$)/.test(wd)
        : (wd === checkoutPath || wd.startsWith(`${checkoutPath}/`));
      if (!ok) {
        problems.push(`${name} 的 working-directory '${wd}' 与 checkout 落点 '${where}' 不一致（目录不存在 → 步骤静默不执行）`);
      }
    }
    // 制品路径前缀同理：写错前缀时 upload-artifact 只 warn，步骤仍显示 ✓
    // 按缩进逐行扫描（不能用「匹配所有缩进行」的块正则：它会把紧随其后的
    // 同级键 `if-no-files-found:` 一起吞进来，产生假阳性）。
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const head = /^([ \t]*)path:[ \t]*\|[ \t]*$/.exec(lines[i]);
      if (head === null) continue;
      const indent = head[1].length;
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '') continue;
        const lead = line.length - line.trimStart().length;
        if (lead <= indent) break;
        const raw = line.trim();
        if (checkoutPath === '' && /^mellow\//.test(raw)) {
          problems.push(`${name} 的制品路径 '${raw}' 带 mellow/ 前缀，但 checkout 落在仓库根 → 制品静默为空`);
        }
        if (checkoutPath !== '' && !/^\//.test(raw) && !raw.startsWith(`${checkoutPath}/`) && !raw.startsWith('${{')) {
          problems.push(`${name} 的制品路径 '${raw}' 与 checkout 落点 '${where}' 不一致`);
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Runtime Qualification 路径一致性违规：\n  ${problems.join('\n  ')}`);
  }
}

console.log('Runtime Qualification embeds frontendDist on all platforms and gates Windows source fidelity');
