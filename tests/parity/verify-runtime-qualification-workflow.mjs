import { existsSync, readFileSync } from 'node:fs';
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

// ── §6 Tauri Pass Conditions 的每条必须挂**可解析的载体**（2026-10-01，审计 §4.71）────────
// 立节原因：`runtime-qualification-plan` §6 是一条**门禁**（「全部满足」才锁定 Tauri），
// 而它的 9 条条件此前**只是散文** —— 没有任何地方能核对「这条挂在哪个台账条目 / 哪个护栏上」。
// 实测（同一轮）：ADR-0019 是在这些条件**未满足**时锁定 Tauri 的（该 ADR 自述「真机体验矩阵
// 在决策时点未取得完整实测数据」），而 §6 从未更新 ⇒ **权威层（P1 spec）与判决层（P2 ADR）
// 长期不一致，且无人发现** —— 与 §4.70 的「验证范围只写在散文里」同型。
// 修法：给每条挂**可解析的载体**（台账条目 id，或护栏文件路径），并在此断言可解析。
{
  const spec = readFileSync(resolve(root, 'docs/specs/runtime-qualification-plan.md'), 'utf8').replace(/\r\n/g, '\n');
  const at = spec.indexOf('## 6. Tauri Pass Conditions');
  if (at < 0) {
    throw new Error('runtime-qualification-plan 缺少 §6「Tauri Pass Conditions」—— 锚点漂移，别静默跳过');
  }
  const next = spec.indexOf('\n## ', at + 1);
  const body = spec.slice(at, next < 0 ? spec.length : next);
  const items = body.split('\n').filter((l) => /^- /.test(l));
  if (items.length < 9) {
    throw new Error(`§6 只解析出 ${items.length} 条 pass condition（下限 9）—— 解析器漏成员必须响亮失败`);
  }
  // 载体形态：`（\`<台账 id>\`）` 或 `（护栏：\`<路径>\`）`。判定与 canary 共用这一个函数。
  const carrierOf = (line) => {
    const m = /（(护栏：)?`([^`]+)`）\s*$/.exec(line.trim());
    return m === null ? null : { isGuard: m[1] !== undefined, ref: m[2] };
  };
  const ledger = JSON.parse(readFileSync(resolve(root, 'tests/parity/typora-parity-ledger.json'), 'utf8'));
  const ids = new Set((ledger.items ?? []).map((i) => i.id));
  const resolveCarrier = (c) => (c.isGuard ? existsSync(resolve(root, c.ref)) : ids.has(c.ref));

  for (const line of items) {
    const c = carrierOf(line);
    if (c === null) {
      throw new Error(`§6 的这条 pass condition 没有挂载体：${line.slice(0, 64)}`
        + ' —— 门禁条件必须可核对（挂台账 id 或护栏路径）');
    }
    if (!resolveCarrier(c)) {
      throw new Error(`§6 挂了**解析不到**的载体 ${c.isGuard ? `护栏 ${c.ref}` : `台账条目 ${c.ref}`}`
        + `（条件：${line.slice(2, 50)}）—— 条件指向空气等于没挂`);
    }
  }
  // canary：四个方向（判定与 canary 共用 carrierOf / resolveCarrier）
  if (carrierOf('- x（`P0-EDITOR-004`）') === null) {
    throw new Error('§6 载体护栏 canary 失效：台账 id 形态未被解析');
  }
  if (carrierOf('- x（护栏：`tests/parity/verify-adapter-contract.mjs`）') === null) {
    throw new Error('§6 载体护栏 canary 失效：护栏路径形态未被解析');
  }
  if (carrierOf('- x') !== null) {
    throw new Error('§6 载体护栏 canary 过宽：无载体的一行被当成了有载体');
  }
  if (resolveCarrier({ isGuard: false, ref: 'P0-NOPE-999' })) {
    throw new Error('§6 载体护栏 canary 过宽：不存在的台账 id 被判为可解析');
  }
  if (!resolveCarrier(carrierOf('- x（`P0-EDITOR-004`）'))) {
    throw new Error('§6 载体护栏 canary 失效：真实存在的台账 id 未被判定为可解析');
  }
  // ── §6 更正块里声明的「N 条未闭环」必须 == 表里标「未闭环」的行数（2026-10-09，审计 §4.184）──
  // 【为什么】该表（§6 的「今天的逐条状态」）有 7 行，其中 **3 行**标「**未闭环**」，
  //   而紧随其后的句子写「（**4 条未闭环**）」—— **活文档里的一处自相矛盾**；
  //   且该句**不带日期**（写「**至今**仍未达成」）⇒ 它**声称当前**，必须与表一致。
  //   ⚠️ 同族：§4.183（「4 处出现、只有 1 处有判据」）。
  {
    const RQ = 'docs/specs/runtime-qualification-plan.md';
    const ROW = new RegExp('^>\\s*\\|\\s*[^|]+\\|\\s*`[^`]+`\\s*\\|\\s*\\**未闭环');
    const lines = readFileSync(resolve(root, RQ), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const unclosedRows = lines.filter((l) => ROW.test(l)).length;
    const declMatch = lines.map((l) => /（\**(\d+)\s*条未闭环\**）/.exec(l)).find((m) => m !== null);
    if (declMatch === undefined) {
      throw new Error(`${RQ} 找不到「（N 条未闭环）」—— 判据锚点漂移，别静默跳过`);
    }
    if (unclosedRows === 0) {
      throw new Error(`${RQ} 的表里一行「未闭环」都解析不到 —— 解析器失效`);
    }
    if (Number(declMatch[1]) !== unclosedRows) {
      throw new Error(`${RQ} 声明「${declMatch[1]} 条未闭环」，而表里标「未闭环」的只有 ${unclosedRows} 行`
        + ' —— 该句不带日期（写「至今」）⇒ 必须与表一致');
    }
    // canary：谓词与判定共用（表格行**带 `> ` 前缀**）
    if (!ROW.test('> | IME corruption = 0 | `P0-EDITOR-004` | **未闭环**（`MAC`） |')) {
      throw new Error('§6 未闭环计数 canary 失效：表格行形态未被识别（`> ` 前缀）');
    }
    if (ROW.test('> | clipboard P0 complete | `P0-CLIPBOARD-001` | ✅ 闭环 |')) {
      throw new Error('§6 未闭环计数 canary 过宽：闭环行被当成未闭环');
    }
    console.log(`RQ §6: 表里 ${unclosedRows} 行标「未闭环」== 声明「${declMatch[1]} 条未闭环」`);
  }
}

// ── 「30 个核心任务」的多处副本必须 == 记录器的 `TASKS` 长度（2026-10-09，审计 §4.183）────────
// 【为什么】「30 个核心 Typora 任务」出现在 **4 处**，而**没有任何判据**：
//   · `docs/qualification/ux-score-gate-template.md` §二 的任务表（**唯一来源**，master-plan §9.5 指定）
//   · `docs/product/Mellow-PRD-V1.2-FINAL.md` §132（「30 个核心 Typora 任务」+ 四条阈值）
//   · `tests/qualification/ux-gate-recorder.mjs` 的 `TASKS`（**机器可读**；记录器按它生成 30×2×2 条观测）
//   · `README.md` / `ADR-0020 §2`（「30 任务效率 Gate」，由判据 ⑨c 锁）
//   ⚠️ 记录器**已经**用 `TASKS.length` 算观测总数（`TASKS.length * APPS.length * ROUNDS.length`）
//   ⇒ 若 `TASKS` 被误改成 31 项，**模板表 / PRD / README 都不会红**（只是观测数悄悄变了）。
// 【判据】以 `TASKS.length` 为**真值源**：模板 §二 任务表行数、PRD §132 的数量声明都必须 == 它。
{
  const RECORDER = 'tests/qualification/ux-gate-recorder.mjs';
  const countTasks = (s) => {
    const b = (/const TASKS = \[([\s\S]*?)\n\];/.exec(s) ?? [])[1];
    return b === undefined ? null : (b.match(/'[^']*'/g) ?? []).length;
  };
  const recSrc = readFileSync(resolve(root, RECORDER), 'utf8').replace(/\r\n/g, '\n');
  const tasksLen = countTasks(recSrc);
  if (tasksLen === null) throw new Error(`${RECORDER} 找不到 \`const TASKS = [\` —— 判据锚点漂移`);
  if (tasksLen === 0) throw new Error(`${RECORDER} 的 TASKS 解析出 0 项 —— 解析器失效`);
  // ① 模板 §二 的任务表行数
  const TPL = 'docs/qualification/ux-score-gate-template.md';
  const sec2 = readFileSync(resolve(root, TPL), 'utf8').replace(/\r\n/g, '\n')
    .split(/^## /m).find((x) => x.startsWith('二'));
  if (sec2 === undefined) throw new Error(`${TPL} 找不到 §二 —— 判据锚点漂移`);
  const tplRows = sec2.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).length;
  if (tplRows !== tasksLen) {
    throw new Error(`「核心任务」数不一致：${TPL} §二 有 ${tplRows} 行，而 ${RECORDER} 的 TASKS 有 ${tasksLen} 项`
      + ' —— 模板是**唯一来源**（master-plan §9.5），必须与记录器一致');
  }
  // ② PRD §132 的数量声明
  const PRD = 'docs/product/Mellow-PRD-V1.2-FINAL.md';
  const pm = /(\d+)\s*个核心 Typora 任务/.exec(readFileSync(resolve(root, PRD), 'utf8').replace(/\r\n/g, '\n'));
  if (pm === null) throw new Error(`${PRD} 找不到「N 个核心 Typora 任务」—— 判据锚点漂移`);
  if (Number(pm[1]) !== tasksLen) {
    throw new Error(`「核心任务」数不一致：${PRD} 写「${pm[1]} 个核心 Typora 任务」，`
      + `而记录器 TASKS 有 ${tasksLen} 项`);
  }
  // canary：谓词与判定共用（拼接构造）
  if (countTasks(`const TASKS = [\n  'a', 'b',\n];`) !== 2) {
    throw new Error('「核心任务」护栏 canary 失效：TASKS 计数取不到');
  }
  if (countTasks('无此形态') !== null) {
    throw new Error('「核心任务」护栏 canary 失效：无锚点的样本被误判');
  }
  console.log(`UX gate tasks: ${tasksLen} 项核心任务 —— 模板 §二 表（${tplRows} 行）· PRD §132（${pm[1]}）· 记录器 TASKS 三处一致`);
}

// ── UX Score 的「权重表 / 门槛」在模板与记录器两处必须一致（2026-10-09，审计 §4.185）────────────
// 【为什么】`docs/qualification/ux-score-gate-template.md` 的**评分表**（10 模块 + 合计 100）与
//   「**Release 门槛**」（总分 ≥92 / Live Editing ≥24 / Caret-IME-Undo =15 / File Safety =5）
//   是**人工评分时看的**；而 `ux-gate-recorder.mjs` 的 `UX_MODULES` / `UX_THRESHOLDS`
//   是**机器校验时用的**。两者是**同一套发布门槛的两处副本**，而**没有任何判据**守着它们一致
//   ⇒ 若只改一处，会出现「按模板算过、被记录器拒绝」（或反之）—— **发布门槛的口径分歧**。
//   ⚠️ 同族：§4.183（模板表 ⇄ TASKS）· §4.184（表 ⇄ 汇总数字）—— 本轮是**第 15 次**。
// 【判据】**两侧都现读**：模板评分表的每行（标签 + 权重）必须与 `UX_MODULES` 一一对应；
//   「合计」必须 == `UX_MODULES` 权重和；四条门槛必须 == `UX_THRESHOLDS`。
{
  const REC = 'tests/qualification/ux-gate-recorder.mjs';
  const TPL = 'docs/qualification/ux-score-gate-template.md';
  const rec = readFileSync(resolve(root, REC), 'utf8').replace(/\r\n/g, '\n');
  const modBody = (/const UX_MODULES = \[([\s\S]*?)\n\];/.exec(rec) ?? [])[1];
  if (modBody === undefined) throw new Error(`${REC} 找不到 \`const UX_MODULES = [\` —— 判据锚点漂移`);
  const mods = [...modBody.matchAll(/\['([a-zA-Z]+)',\s*(\d+),\s*'([^']+)'\]/g)]
    .map((m) => ({ key: m[1], weight: Number(m[2]), label: m[3] }));
  if (mods.length === 0) throw new Error(`${REC} 的 UX_MODULES 解析出 0 项 —— 解析器失效`);
  const totalWeight = mods.reduce((a, m) => a + m.weight, 0);
  const thBody = (/const UX_THRESHOLDS = \{([^}]*)\}/.exec(rec) ?? [])[1];
  if (thBody === undefined) throw new Error(`${REC} 找不到 \`const UX_THRESHOLDS = {\` —— 判据锚点漂移`);
  const th = Object.fromEntries([...thBody.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const tpl = readFileSync(resolve(root, TPL), 'utf8').replace(/\r\n/g, '\n');
  const tplRows = [...tpl.matchAll(/^\|\s*([^|*]+?)\s*\|\s*(\d+)\s*\|/gm)]
    .map((m) => ({ label: m[1].trim(), weight: Number(m[2]) }));
  if (tplRows.length === 0) throw new Error(`${TPL} 的评分表解析出 0 行 —— 解析器失效`);
  const tplByLabel = new Map(tplRows.map((r) => [r.label, r.weight]));
  for (const m of mods) {
    if (!tplByLabel.has(m.label)) {
      throw new Error(`UX Score 权重表不一致：记录器有模块「${m.label}」（${m.weight}），而 ${TPL} 的表里没有`);
    }
    if (tplByLabel.get(m.label) !== m.weight) {
      throw new Error(`UX Score 权重不一致：「${m.label}」记录器 = ${m.weight}，${TPL} = ${tplByLabel.get(m.label)}`);
    }
  }
  const tplTotal = (/^\|\s*\**合计\**\s*\|\s*\**(\d+)\**\s*\|/m.exec(tpl) ?? [])[1];
  if (tplTotal === undefined) throw new Error(`${TPL} 找不到「合计」行 —— 判据锚点漂移`);
  if (Number(tplTotal) !== totalWeight) {
    throw new Error(`UX Score 合计不一致：${TPL} 写 ${tplTotal}，而记录器权重和 = ${totalWeight}`);
  }
  const gateChecks = [
    ['total', /总分\s*≥\s*(\d+)/, '总分 ≥'],
    ['liveEditing', /Live Editing\s*≥\s*(\d+)/, 'Live Editing ≥'],
    ['caretImeUndo', /Caret\s*\/\s*IME\s*\/\s*Undo\s*=\s*(\d+)/, 'Caret/IME/Undo ='],
    ['fileSafety', /File Safety\s*=\s*(\d+)/, 'File Safety ='],
  ];
  for (const [key, re, label] of gateChecks) {
    const m = re.exec(tpl);
    if (m === null) throw new Error(`${TPL} 找不到门槛「${label}」—— 判据锚点漂移`);
    if (Number(m[1]) !== th[key]) {
      throw new Error(`UX Score 门槛不一致：「${label}」${TPL} 写 ${m[1]}，记录器 UX_THRESHOLDS = ${th[key]}`);
    }
  }
  // canary：谓词与判定共用（拼接构造）
  const rowsOf = (s) => [...s.matchAll(/^\|\s*([^|*]+?)\s*\|\s*(\d+)\s*\|/gm)].length;
  if (rowsOf('| Live Editing | 25 |\n| Markdown | 10 |') !== 2) {
    throw new Error('UX Score 权重表 canary 失效：表行未被解析');
  }
  if (rowsOf('无表格的行') !== 0) {
    throw new Error('UX Score 权重表 canary 过宽：非表行被当成表行');
  }
  console.log(`UX Score: ${mods.length} 模块 / 合计 ${totalWeight} · 门槛 ${JSON.stringify(th)} —— 模板与记录器一致`);
}

console.log('Runtime Qualification embeds frontendDist on all platforms and gates Windows source fidelity');
