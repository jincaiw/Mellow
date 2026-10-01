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

// ── 非默认入口探针必须挂在发布门禁上（2026-10-01，审计 §4.59 / §4.60）──────────
// 立此条的原因：本仓的 e2e 与视觉 Golden **长期只在「默认值」下采样**（亮色 / 工具栏默认开 / 中文），
// 于是**非默认入口整条路径无人走** —— 「默认能跑」被当成了「能跑」。实测代价：
//   ① 冷启动即暗色时编辑器用**默认亮主题**渲染、`--mellow-md-*` 全空；
//   ② 关掉格式工具栏后**重启又出现**。
// 这些探针需要 Playwright + 构建产物（进不了主 CI），故挂在 Runtime Qualification 的 Linux job ——
// **每次发布都会跑**。本断言防「被静默摘掉」。
{
  const ENTRY_PROBES = ['theme-follow-probe', 'i18n-engine-probe', 'startup-state-probe'];
  // 剥 YAML 注释行 —— 否则本步骤的**说明注释**里写的「不得用 continue-on-error」会触发判据
  // （本仓已实测过 4 次的同型坑：注释满足/触发判据）。
  const stripYamlComments = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  // 该步骤必须在**每个带 Playwright 的平台 job** 里都存在（Linux + Windows）——
  // 只挂一个平台，另一个平台的非默认入口仍无人走；而本仓平台专有代码集中在 Adapter
  // （ADR-0016/0022），Windows 侧尤其值得跑（上一轮在 Linux 抓到的正是**按键处理**类问题）。
  const steps = [...workflow.matchAll(/- name: "Non-default entry probes[\s\S]*?(?=\n      - name:)/g)]
    .map((m) => stripYamlComments(m[0]));
  if (steps.length < 2) {
    throw new Error(`Runtime Qualification 里「非默认入口探针」步骤只有 ${steps.length} 处（下限 2：Linux + Windows）—— `
      + '暗色 / English / 关掉的开关这三条非默认路径会在缺的那个平台上**无人走**（审计 §4.59/§4.60/§4.62）');
  }
  for (const [i, body] of steps.entries()) {
    for (const probe of ENTRY_PROBES) {
      if (!body.includes(probe)) {
        throw new Error(`非默认入口探针步骤 #${i + 1} 缺少 ${probe}（该探针覆盖一条非默认路径）`);
      }
    }
    if (/continue-on-error/.test(body)) {
      throw new Error('非默认入口探针步骤不得带 continue-on-error —— 那是 §4.51 修过的**假门禁**');
    }
    // bash 与 pwsh 两种写法都要认：`status=1` / `$status = 1`，且都以 `exit $status` 收口
    if (!/status\s*=\s*1/.test(body) || !/exit \$status/.test(body)) {
      throw new Error(`非默认入口探针步骤 #${i + 1} 必须逐条记录退出码并 \`exit $status\``
        + '（步骤退出码只取**最后一条**命令，否则失败会被静默吞掉）');
    }
  }
  // canary：步骤计数必须能翻转（否则「只有 1 处」会被漏判）
  if (steps.length !== 2) {
    throw new Error(`非默认入口探针步骤数异常（${steps.length}）—— 若确实增减了平台 job，请同步更新本判据与下限`);
  }
  // canary：注释剥离必须生效（否则上面的 continue-on-error 判据会被本步骤的说明注释触发）
  if (/continue-on-error/.test(stripYamlComments('      # 不得用 continue-on-error\n      run: x'))) {
    throw new Error('非默认入口探针护栏 canary 失效：YAML 注释未被剥离');
  }
  if (!/continue-on-error/.test(stripYamlComments('      continue-on-error: true'))) {
    throw new Error('非默认入口探针护栏 canary 失效：真实违规未被检出');
  }
  // ── 探针必须**跨平台**（2026-10-01 实测）：它们在 Linux job 上跑，
  // 写死 macOS 专有的 `Meta+…` 会在 Linux 上开不出面板（实测 `i18n-engine-probe` 因此失败）。
  // 统一用 Playwright 的 `ControlOrMeta`（macOS→Cmd / 其它→Ctrl）。
  for (const probe of ENTRY_PROBES) {
    const src = readFileSync(resolve(root, `tests/e2e/${probe}.mjs`), 'utf8')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');   // 先剥注释（本仓已实测 5 次同型坑）
    const bad = /['"`](Meta|Cmd)\+/.exec(src);
    if (bad !== null) {
      throw new Error(`非默认入口探针 ${probe} 用了 macOS 专有的按键 ${bad[0]} —— `
        + '它在 Linux job 上跑，必须用 `ControlOrMeta`（否则该探针在 Linux 恒失败）');
    }
    // ── 也不得**裸 spawn('npx')**（2026-10-01 实测）：Windows 上 `npx` 实际是 `npx.cmd`，
    // 无 shell 时 spawn 抛 ENOENT —— 该探针在 Windows 上**三个全挂**（实测 RQ Windows job）。
    // 本仓既有约定：共用 `tests/visual/dev-server.mjs` 的平台感知启动器。
    // ⚠️ 注意 `verify-visual-golden.mjs` 里已有一条同型判据，但它的 `visualScripts` **只列
    // `tests/visual/` 的 4 个脚本** → 覆盖不到 `tests/e2e/` 的探针（范围缺口，实测踩到）。
    if (/spawn\(\s*['"`]npx['"`]/.test(src)) {
      throw new Error(`非默认入口探针 ${probe} 裸 spawn('npx') —— Windows 上是 npx.cmd，会 ENOENT；`
        + '必须改用 `tests/visual/dev-server.mjs` 的 `startViteDevServer`');
    }
    if (!/startViteDevServer/.test(src)) {
      throw new Error(`非默认入口探针 ${probe} 必须使用跨平台启动器 startViteDevServer（dev-server.mjs）`);
    }
  }
  // canary：裸 spawn 判据两个方向
  if (!/spawn\(\s*['"`]npx['"`]/.test("const v = spawn('npx', ['vite']);")) {
    throw new Error('探针跨平台护栏 canary 失效：裸 spawn(\'npx\') 未被检出');
  }
  if (/spawn\(\s*['"`]npx['"`]/.test("const server = startViteDevServer({ cwd, port });")) {
    throw new Error('探针跨平台护栏 canary 过宽：合规写法被误判为裸 spawn');
  }
  // canary：两个方向
  if (/['"`](Meta|Cmd)\+/.exec("await page.keyboard.press('Meta+f');") === null) {
    throw new Error('探针跨平台护栏 canary 失效：macOS 专有按键未被检出');
  }
  if (/['"`](Meta|Cmd)\+/.exec("await page.keyboard.press('ControlOrMeta+f');") !== null) {
    throw new Error('探针跨平台护栏 canary 过宽：ControlOrMeta 被误判为 macOS 专有');
  }
}

// ── IME 矩阵的覆盖清单必须与 spec 双向一致（2026-10-01，审计 §4.70）──────────────
// 立节原因：`docs/specs/ime-test-plan.md` §4 列了 **21 个节点**，而自动化矩阵只覆盖其中 **8 个** ——
// 而「覆盖了哪 8 个」此前**只存在于矩阵源码**（`SCENARIOS`），spec 里完全没记。
// 于是「矩阵增删场景」与「spec 的覆盖声明」会**各自漂移**（本仓已多次踩到「多处副本只改一处」）。
// 更糟的是同一件事还有**第三个副本**：`runtime-qualification.yml` 的注释里写着「（8 场景 IME 矩阵）」。
// 修法：在 spec §4 加一行**机器可读**的覆盖清单，本护栏把三处**双向锁死**。
{
  const spec = readFileSync(resolve(root, 'docs/specs/ime-test-plan.md'), 'utf8').replace(/\r\n/g, '\n');
  const matrix = readFileSync(resolve(root, 'tests/benchmark/ime-matrix-linux.mjs'), 'utf8').replace(/\r\n/g, '\n');

  const MARK = '矩阵覆盖节点（机器可读）';
  const parseDeclared = (text) => {
    const line = text.split('\n').find((l) => l.includes(MARK));
    return line === undefined ? null : [...line.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1]);
  };
  const declared = parseDeclared(spec);
  if (declared === null) {
    throw new Error(`ime-test-plan 缺少「${MARK}」行 —— 判据锚点漂移，别静默跳过`);
  }
  if (declared.length < 4) {
    throw new Error(`「${MARK}」行只解析出 ${declared.length} 个 id（下限 4）—— 解析器漏成员必须响亮失败`);
  }
  const scenariosBlock = /const SCENARIOS = \[([\s\S]*?)\n\];/.exec(matrix)?.[1] ?? '';
  if (scenariosBlock === '') {
    throw new Error('ime-matrix-linux.mjs 找不到 SCENARIOS 数组（判据无从比对，不得静默通过）');
  }
  const actual = [...scenariosBlock.matchAll(/\{\s*id:\s*'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]);

  const missInSpec = actual.filter((id) => !declared.includes(id));
  const missInMatrix = declared.filter((id) => !actual.includes(id));
  if (missInSpec.length > 0) {
    throw new Error(`ime-matrix-linux.mjs 的场景 ${missInSpec.join(', ')} 未登记进 ime-test-plan 的「${MARK}」行`
      + ' —— 矩阵覆盖变了，spec 必须同步（否则覆盖声明静默失真）');
  }
  if (missInMatrix.length > 0) {
    throw new Error(`ime-test-plan 声明覆盖 ${missInMatrix.join(', ')}，而 SCENARIOS 里没有这些场景`
      + ' —— 覆盖声明**不得超出实际**（双向一致，不是单向）');
  }
  // 同一件事的第三个副本：RQ 注释里的「N 场景 IME 矩阵」
  const stepCount = /(\d+)\s*场景\s*IME 矩阵/.exec(workflow)?.[1];
  if (stepCount === undefined) {
    throw new Error('runtime-qualification.yml 找不到「N 场景 IME 矩阵」字样 —— 锚点漂移，别静默跳过');
  }
  if (Number(stepCount) !== actual.length) {
    throw new Error(`runtime-qualification.yml 写「${stepCount} 场景」，而 SCENARIOS 实际 ${actual.length} 个`);
  }
  // canary：三个方向
  if (parseDeclared('> **矩阵覆盖节点（机器可读）**：`a` `b` `c` `d`')?.length !== 4) {
    throw new Error('IME 覆盖护栏 canary 失效：声明行未被解析');
  }
  if (parseDeclared('> 没有锚点的一行 `a` `b` `c` `d`') !== null) {
    throw new Error('IME 覆盖护栏 canary 过宽：缺少锚点却仍被解析');
  }
  if (parseDeclared('> **矩阵覆盖节点（机器可读）**：`a` `b` `c` `d`').length === 0) {
    throw new Error('IME 覆盖护栏 canary 失效：解析结果为空');
  }
}

console.log('Runtime Qualification embeds frontendDist on all platforms and gates Windows source fidelity');
