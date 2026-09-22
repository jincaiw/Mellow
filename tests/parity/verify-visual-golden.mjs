/**
 * 视觉 Golden 契约护栏（P2-2.7，静态结构断言；布局级对比由 visual-golden.mjs 真跑执行）。
 *
 * 断言：
 *   ① visual-golden.mjs 覆盖四配置（900×600 / 1200×800 / 1440×900 / 200% Zoom）；
 *   ② 采样契约点齐备：56px paddingTop、fontSize（16 / 32）、行高、写作宽度、
 *      sidebar/statusbar/mode-indicators 默认隐藏、editor-frame 居中；
 *   ③ 截图归档到 tests/visual/actual/、基准 tests/visual/golden/layout-golden.json
 *      存在且含四配置（--update 可重建）；
 *   ④ P2-2.8 截图归档脚本存在且写 manifest（三平台状态可追溯）。
 *   ⑤ drift canary。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const scriptPath = 'tests/visual/visual-golden.mjs';
if (!existsSync(resolve(root, scriptPath))) {
  fail(`缺少 ${scriptPath}（P2-2.7 视觉 Golden 主脚本）`);
} else {
  const source = read(scriptPath);
  for (const config of ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200']) {
    if (!source.includes(`'${config}'`)) fail(`visual-golden 缺少配置 ${config}（P2-2.7 四配置）`);
  }
  for (const assertion of [
    ['expectedPaddingTop: 56', 'paddingTop 56px 契约采样（P2-2.2）'],
    ['expectedFontSize: config.fontSize', 'fontSize 采样（16px = 100% 基准 / 32px = 200% Zoom）'],
    ['expectedLineHeightPx: round1(config.fontSize * TYPOGRAPHY_LINE_HEIGHT)', '行高 = fontSize × 单一真源 lineHeight 采样（P2-2.1 / V7-W2.2）'],
    ['assertEditorContract(config.name, samples[config.name])', '实测 vs 期望硬断言（V7-W2.2：expected* 不得只记录不比对）'],
    // A1（第四轮）：写作宽度内部化到 iframe .cm-content（frame 通栏，不再采 max-width）
    ['contentMaxWidth', '写作宽度采样（A1 内部化：.cm-content max-width，V7-W2.2 默认 860px）'],
    ['editorFrameFullBleed', 'editor-frame 通栏采样（A1：max-width none）'],
    ['sidebarVisible', 'sidebar 默认隐藏采样'],
    ['statusbarVisible', 'statusbar 默认隐藏采样'],
    ['modeIndicatorsVisible', 'mode-indicators 默认隐藏采样（P2-2.5 不常驻）'],
    ["resolve(ACTUAL_DIR, `${config.name}.png`)", '截图归档到 actual/'],
    ['layout-golden.json', '基准文件名'],
    ['--update', '基准重建开关'],
    ['TOLERANCE_PX = 1', '±1px 容差'],
  ]) {
    if (!source.includes(assertion[0])) fail(`visual-golden 缺少 ${assertion[1]}（${assertion[0]}）`);
  }

  // ── V7-W2.2：脚本内的排版字面量必须等于 TYPOGRAPHY_DEFAULTS（单一真源交叉比对）──
  const settingsSource = read('packages/settings/src/index.ts');
  const typographyBlock = /export const TYPOGRAPHY_DEFAULTS = \{([\s\S]*?)\} as const;/.exec(settingsSource)?.[1] ?? '';
  const typographyNumber = (key) => {
    const m = new RegExp(`${key}:\\s*([0-9.]+)`).exec(typographyBlock);
    return m === null ? null : Number(m[1]);
  };
  const literal = (name) => {
    const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(source);
    return m === null ? null : Number(m[1]);
  };
  for (const [literalName, sourceKey, label] of [
    ['TYPOGRAPHY_FONT_SIZE', 'fontSize', 'fontSize'],
    ['TYPOGRAPHY_LINE_HEIGHT', 'lineHeight', 'lineHeight'],
    ['TYPOGRAPHY_WRITING_WIDTH', 'writingWidth', 'writingWidth'],
  ]) {
    const scriptValue = literal(literalName);
    const sourceValue = typographyNumber(sourceKey);
    if (scriptValue === null || sourceValue === null) {
      fail(`视觉 Golden 缺少排版真源字面量 ${literalName} 或 TYPOGRAPHY_DEFAULTS.${sourceKey}（V7-W2.2）`);
    } else if (scriptValue !== sourceValue) {
      fail(`视觉 Golden ${literalName}=${scriptValue} ≠ TYPOGRAPHY_DEFAULTS.${sourceKey}=${sourceValue}（V7-W2.2：漂移须同步）`);
    } else if (label === 'fontSize' && scriptValue !== 16) {
      fail(`视觉 Golden 字号基准应为 16（Typora 真值 html font-size 16px），实际 ${scriptValue}`);
    }
  }
  // V7-W2.9：sidebar 采样必须命中真实侧栏节点 —— 历史实现查 `.sidebar`（不存在该 class）
  // 导致 sidebarVisible 恒 false，「侧栏默认可见」回归永远抓不到（假护栏）。
  if (!source.includes("document.querySelector('aside.file-tree') !== null")) {
    fail("视觉 Golden 的 sidebarVisible 采样必须查真实节点 aside.file-tree（V7-W2.9：.sidebar 选择器恒 false，属假护栏）");
  }
  if (/querySelector\('\.sidebar'\)/.test(source)) {
    fail('视觉 Golden 不得再使用 .sidebar 选择器采样侧栏可见性（V7-W2.9）');
  }
  // 只在代码行（剔除注释）中检查废弃公式，避免命中解释性注释
  const codeOnly = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  if (/\* 1\.65/.test(codeOnly)) fail('视觉 Golden 仍以 ×1.65 计算行高（V7-W2.2：应为 TYPOGRAPHY_LINE_HEIGHT = 1.6）');
  if (/fontSize: 17|820px/.test(codeOnly)) fail('视觉 Golden 代码中仍残留废弃默认值（17 / 820px，V7-W2.2）');
}

const goldenPath = resolve(root, 'tests/visual/golden/layout-golden.json');
if (!existsSync(goldenPath)) {
  fail('tests/visual/golden/layout-golden.json 缺失（首跑 node tests/visual/visual-golden.mjs 生成）');
} else {
  const golden = JSON.parse(read('tests/visual/golden/layout-golden.json'));
  for (const config of ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200']) {
    const sample = golden[config];
    if (sample === undefined) fail(`golden 基准缺少配置 ${config}`);
    else if (sample.editor?.expectedPaddingTop !== 56) fail(`golden ${config} paddingTop 契约应为 56（实际 ${sample.editor?.expectedPaddingTop}）`);
    else if (sample.sidebarVisible !== false || sample.statusbarVisible !== false || sample.modeIndicatorsVisible !== false) {
      fail(`golden ${config} 存在默认可见的 sidebar/statusbar/mode-indicators（违反 Typora parity 隐藏契约）`);
    }
    if ('tabbarH' in sample) fail(`golden ${config} 含已删除的 tabbarH 契约键（B1 SDI：--update 重刷基准）`);
    // ── V7-W2.2：基准自身必须自洽（历史缺陷：lineHeightPx 27.2 与 expectedLineHeightPx 28.1 并存）──
    const e = sample.editor ?? {};
    const expectedFontSize = config === 'zoom-200' ? 32 : 16;
    if (e.fontSize !== expectedFontSize) fail(`golden ${config} fontSize 应为 ${expectedFontSize}（Typora 真值 16px × zoom），实际 ${e.fontSize}`);
    if (e.expectedFontSize !== e.fontSize) fail(`golden ${config} expectedFontSize ${e.expectedFontSize} ≠ fontSize ${e.fontSize}（期望与实测自相矛盾）`);
    const expectedLh = Math.round(e.fontSize * 1.6 * 10) / 10;
    if (e.expectedLineHeightPx !== expectedLh) fail(`golden ${config} expectedLineHeightPx 应为 fontSize × 1.6 = ${expectedLh}，实际 ${e.expectedLineHeightPx}`);
    if (Math.abs(e.lineHeightPx - expectedLh) > 1) fail(`golden ${config} 实测 lineHeightPx ${e.lineHeightPx} 偏离 fontSize × 1.6 = ${expectedLh}（V7-W2.2）`);
    if (e.expectedWritingWidth !== 860) fail(`golden ${config} expectedWritingWidth 应为 TYPOGRAPHY_DEFAULTS.writingWidth = 860，实际 ${e.expectedWritingWidth}`);
    if (e.contentMaxWidth !== null && Math.abs(e.contentMaxWidth - 860) > 1) {
      fail(`golden ${config} 实测 contentMaxWidth ${e.contentMaxWidth} 偏离写作宽度真源 860（V7-W2.2）`);
    }
  }
}

for (const png of ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200']) {
  if (!existsSync(resolve(root, `tests/visual/actual/${png}.png`))) {
    fail(`tests/visual/actual/${png}.png 缺失（跑 visual-golden.mjs 归档）`);
  }
}

// P2-2.8：三平台 window chrome 截图归档脚本 + manifest
const chromeScript = 'tests/visual/capture-window-chrome.mjs';
if (!existsSync(resolve(root, chromeScript))) {
  fail(`缺少 ${chromeScript}（P2-2.8 截图归档）`);
} else {
  const chrome = read(chromeScript);
  for (const item of ['macOS', 'manifest', 'platform-mac', 'screenshots']) {
    if (!chrome.includes(item)) fail(`capture-window-chrome 缺少 ${item}（P2-2.8 归档可追溯性）`);
  }
}
const manifestPath = resolve(root, 'tests/benchmark/screenshots/window-chrome-manifest.json');
if (!existsSync(manifestPath)) {
  fail('tests/benchmark/screenshots/window-chrome-manifest.json 缺失（P2-2.8 归档状态）');
}

// ── drift canary：护栏必须能抓住契约漂移 ─────────────────────────────────
if (existsSync(resolve(root, scriptPath))) {
  const drifted = read(scriptPath).replace('expectedPaddingTop: 56', 'expectedPaddingTop: 2');
  if (!drifted.includes('expectedPaddingTop: 2') || drifted.includes('expectedPaddingTop: 56')) {
    fail('视觉 Golden 护栏自检失败：无法模拟 paddingTop 契约漂移，护栏已失效');
  }
  // V7-W2.2 canary：字号字面量漂移必须能被交叉比对抓到
  const sizeDrift = read(scriptPath).replace('const TYPOGRAPHY_FONT_SIZE = 16;', 'const TYPOGRAPHY_FONT_SIZE = 17;');
  const driftedSize = Number(/const TYPOGRAPHY_FONT_SIZE = ([0-9.]+);/.exec(sizeDrift)?.[1]);
  if (driftedSize !== 17 || driftedSize === 16) {
    fail('视觉 Golden 护栏自检失败：无法模拟字号基准漂移（V7-W2.2 交叉比对失效）');
  }
}

// ── §9.3 14 场景覆盖（V7-W5：补 scenes-golden，使 macOS 侧全覆盖）────────
// visual-golden（6 配置）+ sidebar-golden（4 视图）+ scenes-golden（7 场景）合起来
// 才覆盖 §9.3 的 14 场景：首次启动 / 单文档 Live / File Tree / File List / Outline /
// Search / Settings / Selection Toolbar / Table Toolbar / Reader / Light / Dark /
// 900×600 / 200% Zoom。
const scenesScript = 'tests/visual/scenes-golden.mjs';
const scenesGolden = 'tests/visual/golden/scenes-golden.json';
if (!existsSync(resolve(root, scenesScript))) {
  fail(`缺少 ${scenesScript}（§9.3 余下 7 场景：首次启动 / 单文档 Live / File List / Settings / Selection Toolbar / Table Toolbar / Reader）`);
} else {
  const scenesSource = read(scenesScript);
  // 硬断言必须存在：否则首跑会把「功能不工作」的状态烘进基准，成为永久假绿
  // （本轮 selection-toolbar 就是这么被发现的：元素在但 display 恒为 none）。
  if (!/visible === true/.test(scenesSource)) {
    fail(`${scenesScript} 缺少「visible === true」类硬断言（Golden 采样必须配实测 vs 期望断言）`);
  }
  if (!/EXPECT\(samples\)|hardFail/.test(scenesSource)) {
    fail(`${scenesScript} 缺少硬断言聚合（hardFail），无法阻止把退化状态写入基准`);
  }
}
if (!existsSync(resolve(root, scenesGolden))) {
  fail(`缺少 ${scenesGolden}（§9.3 余下 7 场景的基准，首次运行 scenes-golden.mjs 生成）`);
} else {
  const scenes = JSON.parse(read(scenesGolden));
  const REQUIRED_SCENES = ['first-run', 'single-doc-live', 'file-list', 'settings', 'selection-toolbar', 'table-toolbar', 'reader'];
  const missing = REQUIRED_SCENES.filter((s) => !(s in scenes));
  if (missing.length > 0) fail(`scenes-golden.json 缺少场景：${missing.join(', ')}`);
  if (scenes['selection-toolbar']?.visible !== true) {
    fail('scenes-golden.json 的 selection-toolbar.visible 必须为 true（浮动工具栏不得退回「永不显示」）');
  }
}

// ── 基线按平台分离（P0-LAYOUT-002）──────────────────────────────────────
// 基线存的是布局测量值（写作宽度 / 行高 / aside 尺寸），依赖平台字体度量与 DPI。
// 用 macOS 基线与 Linux / Windows 产物比对必然失配，会让门禁退化成「只能 --update 糊过去」。
const goldenPathSrc = resolve(root, 'tests/visual/golden-path.mjs');
if (!existsSync(goldenPathSrc)) {
  fail('缺少 tests/visual/golden-path.mjs（Golden 基线必须按平台分离，否则跨平台比对无意义）');
} else {
  const gp = read('tests/visual/golden-path.mjs');
  for (const tag of ['linux', 'windows']) {
    if (!gp.includes(`'${tag}'`)) fail(`golden-path.mjs 缺少 ${tag} 平台映射`);
  }
  // 空环境变量必须按「未设置」处理（CI 常见「已设置但为空」）
  if (!/\.trim\(\)/.test(gp)) {
    fail('golden-path.mjs 必须把空/空白的 MELLOW_GOLDEN_PLATFORM 视为未设置（否则会生成 `*-golden..json` 畸形基线）');
  }
  for (const [script, name] of [
    ['tests/visual/visual-golden.mjs', 'layout'],
    ['tests/visual/sidebar-golden.mjs', 'sidebar'],
    ['tests/visual/scenes-golden.mjs', 'scenes'],
  ]) {
    const src = existsSync(resolve(root, script)) ? read(script) : '';
    if (src && !src.includes("from './golden-path.mjs'")) {
      fail(`${script} 未使用 goldenFile()（基线必须按平台分离，不得硬编码单一路径）`);
    }
    if (src && !src.includes(`goldenFile('${name}')`)) {
      fail(`${script} 的 goldenFile 参数应为 '${name}'`);
    }
  }
}
// 已提交的平台基线必须是「预期平台集合」内的名字（防止把 macOS 上生成的
// linux/windows 基线误提交成假证据 —— 该风险无法静态识别，此处只约束命名）
const goldenDir = resolve(root, 'tests/visual/golden');
const allowed = /^(layout|sidebar|scenes)-golden(\.(linux|windows))?\.json$/;
for (const f of existsSync(goldenDir) ? readdirSync(goldenDir) : []) {
  if (!allowed.test(f)) fail(`tests/visual/golden/${f} 命名不符合按平台分离的基线约定`);
}

// ── 跨平台 dev server 启动（P0-LAYOUT-002，2026-09-22）────────────────────
// Windows 侧 §9.3 视觉采集长期「静默产出 0 文件」的根因是 `spawn('npx')`：Windows 上
// `npx` 实际是 `npx.cmd`，无 shell 时 spawn 抛 ENOENT；而该步骤是 continue-on-error，
// 错误被吞掉 → 无基线 → upload-artifact 报 "No files were found" → 制品缺失，
// 屏幕上看不出任何异常（`P0-LAYOUT-002` 因此永久 BLOCKED）。
// 四个视觉脚本必须共用 dev-server.mjs 的平台感知启动器；此处同时锁反例。
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');
const devServerPath = 'tests/visual/dev-server.mjs';
const visualScripts = [
  'tests/visual/visual-golden.mjs',
  'tests/visual/sidebar-golden.mjs',
  'tests/visual/scenes-golden.mjs',
  'tests/visual/capture-window-chrome.mjs',
];
if (!existsSync(resolve(root, devServerPath))) {
  fail(`缺少 ${devServerPath}（跨平台 dev server 启动器：Windows 的 .cmd 必须经 shell）`);
} else {
  const devServer = stripComments(read(devServerPath));
  if (!/isWindows \? 'npx\.cmd' : 'npx'/.test(devServer)) {
    fail(`${devServerPath} 必须在 Windows 用 npx.cmd（否则 spawn ENOENT，采集静默产出 0 文件）`);
  }
  if (!/child\.on\('error'/.test(devServer)) {
    fail(`${devServerPath} 必须监听 spawn 'error'（否则启动失败被静默丢弃，只剩无法定位的超时）`);
  }
  if (!/shell: isWindows/.test(devServer)) {
    fail(`${devServerPath} 必须仅在 Windows 启用 shell: isWindows（其余平台保持直接 spawn）`);
  }
}
for (const script of visualScripts) {
  if (!existsSync(resolve(root, script))) continue;
  const code = stripComments(read(script));
  if (!code.includes("from './dev-server.mjs'")) {
    fail(`${script} 未使用 dev-server.mjs（dev server 启动必须跨平台：Windows 需 .cmd + shell）`);
  }
  if (!/startViteDevServer\(/.test(code)) fail(`${script} 未调用 startViteDevServer()`);
  if (/spawn\(\s*'npx'/.test(code)) {
    fail(`${script} 残留裸 spawn('npx')（Windows 上为 .cmd → ENOENT → 采集静默产出 0 文件）`);
  }
}
// canary：把平台分支改回裸 'npx'，同一条检查必须检出
if (existsSync(resolve(root, devServerPath))) {
  const original = read(devServerPath);
  const drifted = original.replace("isWindows ? 'npx.cmd' : 'npx'", "'npx'");
  if (drifted === original) {
    fail('dev-server canary 未武装：注入点未命中');
  } else if (/isWindows \? 'npx\.cmd' : 'npx'/.test(drifted)) {
    fail('dev-server canary 失效：平台分支漂移未检出');
  }
}

// ── 「实测 vs 期望」硬断言必须先于基线写入（2026-09-22）──────────────────
// 只在**比对**路径断言是不够的：首次采集（基线缺失）会把「字号/行高/写作宽度错」
// 「侧栏没渲染」「退役选择器复活」这类真实缺陷直接烘进基准，此后比对永远绿 ——
// 即「把功能不工作固化成基准」。故锁真正的不变量：**任何基线写入之前**，
// 硬断言必须已经执行（断言放在创建分支内、写入之前是允许且推荐的）。
const WRITE_BASELINE = 'writeFileSync(GOLDEN';
for (const [script, marker] of [
  ['tests/visual/visual-golden.mjs', 'assertEditorContract(config.name'],
  ['tests/visual/sidebar-golden.mjs', 'EXPECT(samples)'],
  ['tests/visual/scenes-golden.mjs', 'EXPECT(samples)'],
]) {
  if (!existsSync(resolve(root, script))) continue;
  const code = stripComments(read(script));
  const writeAt = code.indexOf(WRITE_BASELINE);
  const assertAt = code.indexOf(marker);
  if (writeAt < 0) {
    fail(`${script} 缺少基线写入（${WRITE_BASELINE}）`);
  } else if (assertAt < 0) {
    fail(`${script} 缺少「实测 vs 期望」硬断言（${marker}）`);
  } else if (assertAt > writeAt) {
    fail(`${script} 的硬断言出现在基线写入之后 —— 首跑会把真实缺陷固化成基准`);
  }
}
// canary：把 visual-golden 的断言块整体删掉，同一条检查必须检出
if (existsSync(resolve(root, 'tests/visual/visual-golden.mjs'))) {
  const original = stripComments(read('tests/visual/visual-golden.mjs'));
  const drifted = original.replace(/assertEditorContract\(config\.name/g, 'assertEditorContractX(config.name');
  if (drifted === original) {
    fail('visual-golden 硬断言 canary 未武装：注入点未命中');
  } else if (/assertEditorContract\(config\.name/.test(drifted)) {
    fail('visual-golden 硬断言 canary 失效：断言漂移未检出');
  }
}

// ── 侧栏默认宽度单一真源交叉比对（P0-LAYOUT-002）──────────────────────────
// sidebar-golden.mjs 是纯 .mjs（不引 TS），故以字面量复写 SIDEBAR_DEFAULT_WIDTH；
// 此处与 App.tsx 的真源做交叉比对，防止两处漂移后基线仍「绿」。
if (existsSync(resolve(root, 'tests/visual/sidebar-golden.mjs'))
  && existsSync(resolve(root, 'apps/desktop/src/App.tsx'))) {
  const sidebarSrc = stripComments(read('tests/visual/sidebar-golden.mjs'));
  const appSrc = stripComments(read('apps/desktop/src/App.tsx'));
  const literal = /const SIDEBAR_DEFAULT_WIDTH = (\d+)/.exec(sidebarSrc)?.[1];
  const truth = /const SIDEBAR_DEFAULT_WIDTH = (\d+)/.exec(appSrc)?.[1];
  if (literal === undefined) {
    fail('sidebar-golden.mjs 缺少 SIDEBAR_DEFAULT_WIDTH 字面量（侧栏宽度断言需要单一真源）');
  } else if (truth === undefined) {
    fail('App.tsx 缺少 SIDEBAR_DEFAULT_WIDTH（侧栏宽度真源）');
  } else if (literal !== truth) {
    fail(`侧栏默认宽度漂移：sidebar-golden.mjs=${literal} vs App.tsx=${truth}`);
  }
}

// ── 禁止取 URL 对象的 pathname（2026-09-22）────────────────────────────────
// 立此节的原因：`URL.pathname` 在 Windows 上返回 `/D:/a/...`（带前导斜杠），
// 交给 fs 会被当成「当前盘符下的相对路径」→ 实测报
//   ❌ scenes-golden 失败：ENOENT: no such file or directory,
//      mkdir 'D:\D:\a\Mellow\Mellow\tests\visual\actual'
// （盘符重复）。这正是 Windows 侧视觉采集长期产不出基线的第三个独立缺陷：
// 它被前两个缺陷（working-directory 指向不存在的目录、spawn('npx') ENOENT）掩盖，
// 前两者修好后才暴露出来。
// 正确写法：`fileURLToPath(new URL(..., import.meta.url))`。
// 该模式在 tests/ 下曾有 32 处（visual 5 + e2e 27），故做**全目录扫描**，
// 避免「N 处只做了 1 处」。
{
  const walkMjs = (dir) => {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walkMjs(rel);
      return entry.name.endsWith('.mjs') ? [rel] : [];
    });
  };
  const offenders = [];
  for (const rel of ['tests/visual', 'tests/e2e', 'tests/benchmark', 'tests/parity', 'tests/qualification'].flatMap(walkMjs)) {
    const code = stripComments(read(rel));
    if (/new URL\([^()]*import\.meta\.url\)\.pathname/.test(code)) offenders.push(rel);
  }
  if (offenders.length > 0) {
    // ⚠️ 消息里不得出现连续的目标模式：本文件也在扫描范围内，写连续了就会「检出自己」。
    fail(`以下脚本取 URL 对象的 pathname（Windows 上得到 /D:/... 盘符重复的非法路径，应改用 fileURLToPath）：${offenders.join(', ')}`);
  }
  // canary：自检检测规则（不用真实文件注入，避免与具体写法耦合）。
  // ⚠️ 样本必须**拼接构造**：若写成连续字面量，本文件自身会被上面的全目录扫描命中
  // （stripComments 只去注释、不去字符串），实测护栏会「检出自己」。
  const URLNAME_RE = /new URL\([^()]*import\.meta\.url\)\.pathname/;
  const ILLEGAL_SAMPLE = "const D = new URL('../../apps/desktop/', import.meta.url)." + 'pathname;';
  const LEGAL_SAMPLE = "const D = fileURLToPath(new URL('../../apps/desktop/', import.meta.url));";
  if (!URLNAME_RE.test(ILLEGAL_SAMPLE)) {
    fail('fileURLToPath canary 失效：非法写法未被检出');
  }
  if (URLNAME_RE.test(LEGAL_SAMPLE)) {
    fail('fileURLToPath canary 过宽：正确写法被误判为非法');
  }
  if (URLNAME_RE.test(stripComments(read('tests/parity/verify-visual-golden.mjs')))) {
    fail('本护栏自身含连续非法写法字面量（会自我检出）—— canary 样本必须拼接构造');
  }
}

// ── 视觉脚本的就绪判定必须覆盖采样所需的 DOM（2026-09-22）────────────────────
// 立此节的原因：三个视觉脚本的 `waitEditorFrame` 只查 `window.webModules.core &&
// window.editor`，但采样阶段直接读 `.cm-content`。慢 runner（Windows）上编辑器已挂载
// 而 `.cm-content` 尚未出现 → 采样阶段才炸，表现为**间歇性**的
//   Error: iframe 内未找到 .cm-content
// （实测：同一提交两次运行，一次 visual-golden 通过、另一次失败）。
// 仓库既有正确写法在 `tests/e2e/font-family-verify.mjs`（含 `.cm-content`），
// 视觉脚本属漏改。锁：三个视觉脚本的就绪判定必须包含 `.cm-content`。
for (const script of ['tests/visual/visual-golden.mjs', 'tests/visual/sidebar-golden.mjs', 'tests/visual/scenes-golden.mjs']) {
  if (!existsSync(resolve(root, script))) continue;
  const code = stripComments(read(script));
  if (!/window\.webModules\?\.core && window\.editor && document\.querySelector\('\.cm-content'\)/.test(code)) {
    fail(`${script} 的就绪判定未覆盖 .cm-content —— 慢 runner 上会在采样阶段间歇性报「iframe 内未找到 .cm-content」`);
  }
}
// canary：自检规则（样本拼接构造，避免本文件被自身扫描命中）
{
  const READY_RE = /window\.webModules\?\.core && window\.editor && document\.querySelector\('\.cm-content'\)/;
  const WEAK = 'window.webModules?.core && window.editor' + ')';
  const STRONG = "window.webModules?.core && window.editor && document.querySelector('.cm-content')";
  if (READY_RE.test(WEAK)) fail('就绪判定 canary 过宽：弱判定被误判为合格');
  if (!READY_RE.test(STRONG)) fail('就绪判定 canary 失效：合格写法未被检出');
}

if (errors.length > 0) {
  throw new Error(`Visual golden contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Visual golden: 4-config layout contract armed (900x600 / 1200x800 / 1440x900 / 200% zoom); padding 56px + writing width + hidden-by-default asserted; screenshots archived; window-chrome manifest present');
console.log('Visual golden: §9.3 14-scene coverage — visual-golden(6) + sidebar-golden(4) + scenes-golden(7: first-run / live / file-list / settings / selection-toolbar / table-toolbar / reader)');
