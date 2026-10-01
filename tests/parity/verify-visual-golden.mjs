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
import { pathToFileURL } from 'node:url';

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

// ── §9.3 视觉基线覆盖（V7-W5：补 scenes-golden，使 macOS 侧全覆盖）────────
// visual-golden（6 配置）+ sidebar-golden（4 视图）+ scenes-golden（7 场景）合起来
// 才覆盖 §9.3 的场景清单：首次启动 / 单文档 Live / File Tree / File List / Outline /
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

// ── 三平台基线齐备（2026-09-29）────────────────────────────────────────────
//
// 立此条的原因：P0-LAYOUT-002 的结论是「**3 平台 × 3 类基线全部入库并进入比对模式**」，
// 而此前本护栏**只校验 macOS 主基线** `layout-golden.json` —— 其余 6 个平台基线文件
// （`.linux` / `.windows` 各 3 类）**被删除也不会有任何信号**，
// 三平台视觉覆盖会**静默退化**为单平台，而台账仍显示 PASS-E 证据齐备。
// 实测确认：9 个文件当前均存在（3 类 × 3 平台）。
{
  const PLATFORM_SUFFIXES = ['', '.linux', '.windows'];
  const BASELINE_KINDS = [
    ['layout-golden', ['win-900x600', 'win-1200x800', 'win-1440x900', 'zoom-200', 'dark-900x600', 'dark-1440x900']],
    ['sidebar-golden', ['files-tree', 'outline']],
    ['scenes-golden', ['first-run', 'single-doc-live']],
  ];
  for (const [kind, coreKeys] of BASELINE_KINDS) {
    for (const suf of PLATFORM_SUFFIXES) {
      const rel = `tests/visual/golden/${kind}${suf}.json`;
      if (!existsSync(resolve(root, rel))) {
        fail(`三平台基线缺失：${rel}（P0-LAYOUT-002 的「3 平台 × 3 类基线」结论依赖它；`
          + '缺一个就会静默退化为单平台）');
        continue;
      }
      let d;
      try { d = JSON.parse(read(rel)); } catch { fail(`${rel} 不是合法 JSON`); continue; }
      if (Object.keys(d).length === 0) { fail(`${rel} 为空（基线未采集）`); continue; }
      const missing = coreKeys.filter((k) => d[k] === undefined);
      if (missing.length > 0) fail(`${rel} 缺少核心条目：${missing.join(', ')}`);
    }
  }
  // canary：自检「缺失即报错」这条规则本身（样本拼接构造，避免护栏检出自己）
  {
    const FAKE = `tests/visual/golden/layout-golden` + `.macos.json`;
    if (existsSync(resolve(root, FAKE))) {
      fail('三平台基线护栏 canary 失效：构造的不存在样本竟然存在');
    }
  }
}

// ── scenes-golden 的容差语义：只适用于**像素**字段（2026-10-01）──────────────
// 立此条的原因（实测）：`scenes-golden.mjs` 原把 ±1px 容差套在**所有**数值字段上，
// 于是 `table-toolbar.buttonCount 11 → 12`（新增「调整」按钮）被 `|Δ| = 1 ≤ 容差`
// **静默放过** —— 「加/删一个按钮」对计数检查**不可见**，而它本是唯一能抓住该变更的判据。
// （该漂移最终只由 `bar.w` 暴露，而 `bar.w` 的失败又被 workflow 的 `continue-on-error` 吞掉 ——
//  两个缺陷叠加才让回归一路发布；两者本轮均已修。）
// 判据：容差必须由**字段名**选择 —— 像素字段 ±TOLERANCE_PX，其余（计数/设计常量）精确为 0。
{
  const scenesPath = 'tests/visual/scenes-golden.mjs';
  if (existsSync(resolve(root, scenesPath))) {
    const scenes = read(scenesPath);
    if (!/PX_FIELD\.test\(key\)\s*\?\s*TOLERANCE_PX\s*:\s*0/.test(scenes)) {
      fail('scenes-golden 的容差必须由 PX_FIELD 选择（像素 ±TOLERANCE_PX；计数/常量精确 0）—— '
        + '实测「容差套在所有数值字段」会让 buttonCount 11→12 被静默放过');
    }
    // canary：两个方向
    const OK_SAMPLE = 'const tol = PX_FIELD.test(key) ? TOLERANCE_PX : 0;';
    const BAD_SAMPLE = 'if (Math.abs(bv - av) > TOLERANCE_PX) drift.push(key);';
    const re = /PX_FIELD\.test\(key\)\s*\?\s*TOLERANCE_PX\s*:\s*0/;
    if (!re.test(OK_SAMPLE)) {
      errors.push('容差语义护栏 canary 失效：合规样本未被检出');
    }
    if (re.test(BAD_SAMPLE)) {
      errors.push('容差语义护栏 canary 失效：违规样本被误判为合规');
    }
  }
}

// ── 采样前必须等「渲染稳定」：`sleep(N)` 是等时间，不是等状态（2026-10-01）────────
// 立此条的原因（实测，Windows runner）：`.settings-backdrop` 带
// `animation: mellow-fade 140ms ease`，其 `from` 帧是 `transform: translateY(-4px)`
// → 动画未完成时 `.settings-panel` 的 `getBoundingClientRect().y` 读到 **146**、
// 稳态 **150**（视口 900 / 面板高 600）。原实现用 `sleep(400)` 兜底 140ms 的动画 ——
// **在负载高的 runner 上不成立**：渲染进程可能尚未产出首帧（动画「还没开始」），
// 墙钟却已走完 → 同一提交一次 150、一次 146。
// 另一同型：侧栏过滤框的 `focused` 在「输入框刚出现」时采样，读到的是
// **编辑器 iframe 抢焦点 vs effect 每 60ms 夺回** 的争夺中间态 → 同一提交一次 false 一次 true。
//
// 判据：两个采样脚本都必须从共享模块 `tests/visual/wait-rendered.mjs` 引入
// 「等渲染稳定」原语，且**至少调用一次**。原语返回 false 时调用方必须**响亮失败**，
// 不得静默继续采样（静默继续正是「读数随 runner 负载漂移」的成因）。
{
  const WAIT_MODULE = 'tests/visual/wait-rendered.mjs';
  const WAIT_FNS = ['waitForAnimationsSettled', 'waitForFocusSettled'];
  const VISUAL_DIR = 'tests/visual';
  // 非采样脚本（共享模块 / 仅截图）：**显式登记**，不是「默认排除」——
  // 新增一个采样脚本时它会自动进入判据（见 isSampler），而不是悄悄溜过去。
  const NON_SAMPLERS = ['dev-server.mjs', 'golden-path.mjs', 'wait-rendered.mjs'];
  // 采样脚本的覆盖下限 = 当前基线（防止某次重构把脚本挪走/改名后判据静默变空）。
  const MIN_SAMPLERS = 4;

  // 剥注释（**具名函数**，判定与 canary 共用同一份 —— 否则 canary 测的是副本）。
  // 沿用本文件既有约定：整行注释 / 块注释起始行一律剔除。
  // 保守做法（只剔整行）——行内双斜杠剥离器会截断字符串/正则里的 `//`（本仓已实测的坑）。
  const codeOnlyOf = (s) => s.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  // 「是不是采样脚本」的**具名判据**：**读过几何** 或 **截过图** —— 两者都会被「入场动画」影响：
  //   · `getBoundingClientRect()` 直接读坐标；
  //   · `screenshot()` 把画面冻结下来（动画中间帧会被**归档成证据**）。
  // 只按前者判定会漏掉纯截图脚本（实测 `capture-window-chrome.mjs` 就是这种：它在
  // `waitForTimeout(600)` 后截图并写入 P2-2.8 归档证据）。
  // 范围**按目录派生**而不是硬编码文件名 —— 硬编码清单会在新增脚本时漏守（本仓 skill §9 的形态）。
  const isSampler = (source) => {
    const code = codeOnlyOf(source);
    return code.includes('getBoundingClientRect') || /\.screenshot\(/.test(code);
  };

  const reImport = /from\s+'\.\/wait-rendered\.mjs'/;
  const reCalled = /await\s+waitForAnimationsSettled\(/;
  const reGuard = /if\s*\(\s*!\s*\(\s*await\s+waitFor(Animations|Focus)Settled\(/;

  if (!existsSync(resolve(root, WAIT_MODULE))) {
    fail(`缺少 ${WAIT_MODULE}（视觉采样的「等渲染稳定」原语）—— `
      + '缺它时脚本只能用 sleep(N) 猜动画是否结束，读数会随 runner 负载漂移');
  } else {
    const mod = read(WAIT_MODULE);
    for (const fn of WAIT_FNS) {
      if (!new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`).test(mod)) {
        fail(`${WAIT_MODULE} 必须导出 ${fn}（采样前的确定性等待）`);
      }
    }

    // 派生采样脚本集合
    const SAMPLERS = readdirSync(resolve(root, VISUAL_DIR), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.mjs') && !NON_SAMPLERS.includes(e.name))
      .map((e) => `${VISUAL_DIR}/${e.name}`)
      .filter((p) => isSampler(read(p)))
      .sort();
    if (SAMPLERS.length < MIN_SAMPLERS) {
      fail(`${VISUAL_DIR} 下只派生到 ${SAMPLERS.length} 个采样脚本（下限 ${MIN_SAMPLERS}）—— `
        + '脚本可能被改名/挪走后判据静默变空，请核对 NON_SAMPLERS 与目录内容');
    }

    for (const p of SAMPLERS) {
      const codeOnly = codeOnlyOf(read(p));
      // ① 必须从该模块引入
      if (!reImport.test(codeOnly)) {
        fail(`${p} 必须从 ./wait-rendered.mjs 引入「等渲染稳定」原语（不得自带一份 sleep 兜底）`);
        continue;
      }
      // ② 必须**至少调用一次**（引入却不调用 = 死引用，与「写了却不生效」同型）
      const called = WAIT_FNS.filter((fn) => new RegExp(`await\\s+${fn}\\(`).test(codeOnly));
      if (called.length === 0) {
        fail(`${p} 引入了 wait-rendered.mjs 却一次都没调用 —— 采样仍可能读到动画/焦点争夺的中间值`);
      }
      // ③ 返回 false 必须响亮失败（不得静默继续采样）
      if (!reGuard.test(codeOnly)) {
        fail(`${p} 必须对「等渲染稳定」的返回值做 !(await …) 判定并报错 —— `
          + '静默继续采样会让读数随 runner 负载漂移（实测同一提交一次 150 一次 146）');
      }
    }

    // canary：逐方向验证「能翻转」，且**与判定共用 codeOnlyOf**（同一份逻辑）
    const canary = (sample, re, expect, label) => {
      const got = re.test(codeOnlyOf(sample));
      if (got !== expect) errors.push(`渲染稳定护栏 canary 失效：${label}（期望 ${expect}、实得 ${got}）`);
    };
    canary("import { waitForAnimationsSettled } from './wait-rendered.mjs';", reImport, true, '合规 import 未被检出');
    canary("import { waitForAnimationsSettled } from './dev-server.mjs';", reImport, false, '从别的模块引入被误判为合规');
    canary('if (!(await waitForAnimationsSettled(page))) { throw new Error("x"); }', reCalled, true, '合规调用未被检出');
    canary('// await waitForAnimationsSettled(page);', reCalled, false, '被注释掉的调用被当成合规（剥注释失效）');
    canary('if (!(await waitForFocusSettled(page, ".x"))) { throw new Error("y"); }', reGuard, true, '合规的 !(await …) 判定未被检出');
    canary('await waitForFocusSettled(page, ".x");', reGuard, false, '无判定的裸调用被当成合规（静默继续采样未被拦住）');

    // canary：**纯谓词的功能性验证**（不依赖浏览器）——
    // 「等所有动画结束」在存在**常驻动画**时必然超时；实测编辑器 iframe 里只有
    // CM6 光标闪烁 `cm-blink2`（`iterations: Infinity`）。若谓词不排除它，
    // 对 iframe 调用会**永远等不到**（把假失败引进来，比原问题更糟）。
    // 这里直接 import 真实模块调用它（不是读源码猜语义）。
    {
      const modUrl = pathToFileURL(resolve(root, WAIT_MODULE)).href;
      let mod;
      try {
        mod = await import(modUrl);
      } catch (e) {
        fail(`${WAIT_MODULE} 无法被 import（护栏需要直接调用它的纯谓词）：${e?.message ?? e}`);
      }
      const predicate = mod?.isPendingSettlable;
      if (typeof predicate !== 'function') {
        fail(`${WAIT_MODULE} 必须导出纯函数 isPendingSettlable(animation) —— `
          + '抽成纯函数才能在没有浏览器的护栏里验证它');
      } else {
        const infinite = { playState: 'running', effect: { getTiming: () => ({ iterations: Infinity, duration: 1000 }) } };
        const runningFinite = { playState: 'running', effect: { getTiming: () => ({ iterations: 1, duration: 140 }) } };
        const finished = { playState: 'finished', effect: { getTiming: () => ({ iterations: 1, duration: 140 }) } };
        const cases = [
          [infinite, false, '无限迭代的常驻动画（CM6 光标闪烁）必须被跳过 —— 否则永远等不到'],
          [runningFinite, true, '有限迭代且未结束的入场动画必须被等'],
          [finished, false, '已结束的动画不算待等'],
          [{ playState: 'running' }, true, '缺 effect（拿不到 timing）时保守地等'],
        ];
        for (const [sample, expect, why] of cases) {
          const got = predicate(sample);
          if (got !== expect) {
            errors.push(`渲染稳定谓词 canary 失效：${why}（期望 ${expect}、实得 ${got}）`);
          }
        }
      }
    }

    // canary：**范围派生**（isSampler）逐分支验证 —— 保证「新增采样脚本会被自动纳入」
    if (!isSampler('const r = document.querySelector(".x").getBoundingClientRect();')) {
      errors.push('渲染稳定护栏 canary 失效：读过几何的脚本未被判为采样脚本（新增脚本会溜过判据）');
    }
    if (!isSampler('await page.screenshot({ path: "x.png" });')) {
      errors.push('渲染稳定护栏 canary 失效：纯截图脚本未被判为采样脚本 —— 动画中间帧会被归档成证据');
    }
    if (isSampler('await page.goto("http://x/");')) {
      errors.push('渲染稳定护栏 canary 过宽：既不读几何也不截图的脚本被误判为采样脚本');
    }
    if (isSampler('// const r = el.getBoundingClientRect();')) {
      errors.push('渲染稳定护栏 canary 失效：被注释掉的几何读取被当成采样（剥注释失效）');
    }
    if (isSampler('// await page.screenshot({ path: "x.png" });')) {
      errors.push('渲染稳定护栏 canary 失效：被注释掉的截图被当成采样（剥注释失效）');
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Visual golden contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Visual golden: 4-config layout contract armed (900x600 / 1200x800 / 1440x900 / 200% zoom); padding 56px + writing width + hidden-by-default asserted; screenshots archived; window-chrome manifest present');
console.log('Visual golden: §9.3 14-scene coverage — visual-golden(6) + sidebar-golden(4) + scenes-golden(7: first-run / live / file-list / settings / selection-toolbar / table-toolbar / reader)');
