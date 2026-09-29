#!/usr/bin/env node
/**
 * P8 UX Gate record schema and validator.
 *
 * This intentionally does not drive the UI or invent timings. A human tester
 * records each completed task; this tool only verifies that the evidence meets
 * PRD §132's two-round, same-machine comparison rules.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TASKS = [
  '启动、新建、标题、保存', '双击打开、编辑、保存', '文件夹与文件树切换', 'Quick Open 模糊打开', '全局搜索跳转',
  '文档内查找与替换', '粗体、斜体、删除线', '链接插入', '列表与缩进', '任务列表勾选',
  '表格、Tab、加行与对齐', '截图粘贴与相对路径', '浏览器富文本智能粘贴', '复制到 Word', '复制到 VS Code',
  '内联数学', 'Mermaid 修正', '脚注跳转', 'TOC 跳转', '大纲跳转',
  'Focus Mode 连续写作', 'Typewriter Mode 连续写作', '源码模式往返', '主题切换', '导出 PDF',
  '导出 HTML', '打印', '干净文件外部修改重载', 'dirty 文件冲突处理', '10 MB 打开、搜索、编辑、保存',
];
const CRITICAL_TASKS = new Set([2, 11, 12, 25, 30]); // save / table / image / PDF / large-file save
const APPS = ['typora', 'mellow'];
const ROUNDS = [1, 2];

/**
 * UX Score 模块与权重（PRD §131，满分 100）+ 发布门槛（PRD §131 / master-plan §8）。
 *
 * 立此常量的原因（2026-09-30）：UX Score 此前**只存在于文档**（模板的 Markdown 表），
 * 记录器的 schema 里没有它 —— 于是**一份只含 120 条计时、完全没有 UX Score 的记录**
 * 也能满足 `ux-gate` 证据标记，**PRD 的「总分 ≥92」门槛可被静默跳过**。
 * 本工具是 `ux-gate` 证据的载体，故必须把两部分都纳入校验。
 */
const UX_MODULES = [
  ['liveEditing', 25, 'Live Editing'],
  ['caretImeUndo', 15, 'Caret / IME / Undo'],
  ['markdown', 10, 'Markdown'],
  ['tableImage', 10, 'Table / Image'],
  ['filesSearchOutline', 10, 'Files / Search / Outline'],
  ['desktopUi', 10, 'Desktop UI'],
  ['clipboard', 5, 'Clipboard'],
  ['exportScore', 5, 'Export'],
  ['performance', 5, 'Performance'],
  ['fileSafety', 5, 'File Safety'],
];
const UX_TOTAL_WEIGHT = UX_MODULES.reduce((a, [, w]) => a + w, 0);
/** 门槛：总分 ≥92；Live Editing ≥24/25；Caret/IME/Undo = 15/15；File Safety = 5/5 */
const UX_THRESHOLDS = { total: 92, liveEditing: 24, caretImeUndo: 15, fileSafety: 5 };

function fail(message) { throw new Error(message); }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function blankRecord(platform, mellowCommit = 'REPLACE_WITH_COMMIT') {
  return {
    schemaVersion: 1,
    normativeBaseline: { product: 'Typora', version: '1.14.9', build: '7785' },
    platform,
    mellowCommit,
    tester: 'REPLACE_WITH_TESTER',
    machine: 'REPLACE_WITH_MACHINE',
    imeCorruption: null,
    dataLoss: null,
    uxScore: null, // 人工填写：见 UX_MODULES / UX_THRESHOLDS；null 会被 validate 拒绝
    observations: skeletonObservations(),
    notes:
      'observations 已预置 120 条**骨架**（task/app/round/appOrder 已按交替规则填好），'
      + '你只需补测量值：durationMs（秒→毫秒）、error(布尔)、steps(整数)、subjectiveScore(1-5)、'
      + 'evidence(至少一项截图/视频/日志路径)、entryPoint、sourceDiff。'
      + '**骨架不含任何数值**，故 validate 仍会拒绝未填项；随时用 progress 查进度。'
      + '注意：同一轮内 typora/mellow 的 appOrder 必须一致，两轮之间必须相反（骨架已保证，勿改）。',
  };
}

/**
 * 120 条观测骨架（2026-09-30）。
 *
 * 立此函数的必要性：原先 `observations: []` —— 人工需**手写 120 条、每条 8 个字段**的 JSON，
 * 且草稿里没有任何结构示例。这既是巨大的时间成本，也是错填的高发区。
 * 现预置**只含结构**的骨架：
 *   - `task` / `app` / `round` 由 30 × 2 × 2 生成；
 *   - `appOrder` **按规则算好**（同一轮内两 app 一致；两轮之间交换），
 *     避免人工在 120 条里手工维护这个易错约束；
 *   - **测量字段一律不填**（不写占位数值）—— 这样 validate 仍会拒绝，progress 会如实报「未填」，
 *     不可能把占位值误当成真实读数。
 */
function skeletonObservations() {
  const rows = [];
  for (let task = 1; task <= TASKS.length; task++) {
    for (let round = 1; round <= ROUNDS.length; round++) {
      // 第一轮 typora 先做，第二轮交换 —— 与 validate 的顺序规则同源
      const appOrder = round === 1 ? 'typora-first' : 'mellow-first';
      for (const app of APPS) rows.push({ task, app, round, appOrder });
    }
  }
  return rows;
}

function validate(record) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(record?.schemaVersion === 1, 'schemaVersion 必须为 1');
  require(record?.normativeBaseline?.product === 'Typora', '基线产品必须为 Typora');
  require(record?.normativeBaseline?.version === '1.14.9', '规范基线必须为 Typora 1.14.9');
  require(['macos', 'windows', 'linux'].includes(record?.platform), 'platform 必须为 macos、windows 或 linux');
  require(typeof record?.mellowCommit === 'string' && !record.mellowCommit.startsWith('REPLACE_'), '必须记录 Mellow commit');
  require(typeof record?.tester === 'string' && !record.tester.startsWith('REPLACE_'), '必须记录真实测试者');
  require(typeof record?.machine === 'string' && !record.machine.startsWith('REPLACE_'), '必须记录机器');
  require(record?.imeCorruption === false, 'IME corruption 必须明确记录为 false');
  require(record?.dataLoss === false, 'data loss 必须明确记录为 false');
  const observations = Array.isArray(record?.observations) ? record.observations : [];
  require(observations.length === TASKS.length * APPS.length * ROUNDS.length, `必须有 ${TASKS.length * APPS.length * ROUNDS.length} 条观测记录`);

  const byKey = new Map();
  for (const observation of observations) {
    const task = observation?.task;
    const app = observation?.app;
    const round = observation?.round;
    const key = `${task}/${app}/${round}`;
    require(Number.isInteger(task) && task >= 1 && task <= TASKS.length, `无效 task：${task}`);
    require(APPS.includes(app), `task ${task} 的 app 必须为 typora 或 mellow`);
    require(ROUNDS.includes(round), `task ${task} 的 round 必须为 1 或 2`);
    require(!byKey.has(key), `重复观测：${key}`);
    byKey.set(key, observation);
    require(Number.isFinite(observation?.durationMs) && observation.durationMs > 0, `${key} 的 durationMs 必须为正数`);
    require(typeof observation?.error === 'boolean', `${key} 必须记录 error`);
    require(Number.isInteger(observation?.steps) && observation.steps > 0, `${key} 必须记录 steps`);
    require(Number.isInteger(observation?.subjectiveScore) && observation.subjectiveScore >= 1 && observation.subjectiveScore <= 5, `${key} 的 subjectiveScore 必须为 1–5`);
    require(Array.isArray(observation?.evidence) && observation.evidence.length > 0, `${key} 必须附至少一项截图、视频或日志证据`);
    require(['typora-first', 'mellow-first'].includes(observation?.appOrder), `${key} 必须记录 appOrder`);
    require(typeof observation?.entryPoint === 'string' && observation.entryPoint.length > 0, `${key} 必须记录 entryPoint`);
    require(typeof observation?.sourceDiff === 'string' && observation.sourceDiff.length > 0, `${key} 必须记录 sourceDiff`);
  }

  // ── UX Score（PRD §131）──────────────────────────────────────────────
  const ux = record?.uxScore;
  if (ux === null || ux === undefined) {
    require(false,
      'uxScore 缺失：`ux-gate` 证据必须同时包含 **UX Score（PRD §131）** 与 30 任务计时 —— '
      + '否则「总分 ≥92」门槛会被静默跳过');
  } else {
    const scores = ux.modules ?? {};
    let total = 0;
    for (const [key, weight, label] of UX_MODULES) {
      const v = scores[key];
      require(Number.isInteger(v) && v >= 0 && v <= weight,
        `uxScore.modules.${key}（${label}）必须为 0–${weight} 的整数`);
      if (Number.isInteger(v)) total += v;
    }
    require(Array.isArray(ux.evidence) && ux.evidence.length > 0,
      'uxScore 必须附证据（截图/记录路径），否则分数无法复核');
    require(total >= UX_THRESHOLDS.total,
      `UX Score 总分必须 ≥ ${UX_THRESHOLDS.total}（实际 ${total}/${UX_TOTAL_WEIGHT}）`);
    require(Number.isInteger(scores.liveEditing) && scores.liveEditing >= UX_THRESHOLDS.liveEditing,
      `Live Editing 必须 ≥ ${UX_THRESHOLDS.liveEditing}/25`);
    require(scores.caretImeUndo === UX_THRESHOLDS.caretImeUndo,
      `Caret / IME / Undo 必须 = ${UX_THRESHOLDS.caretImeUndo}/15`);
    require(scores.fileSafety === UX_THRESHOLDS.fileSafety,
      `File Safety 必须 = ${UX_THRESHOLDS.fileSafety}/5`);
  }

  const taskResults = [];
  for (let task = 1; task <= TASKS.length; task++) {
    const rows = APPS.flatMap((app) => ROUNDS.map((round) => byKey.get(`${task}/${app}/${round}`)));
    if (rows.some((row) => !row)) { errors.push(`task ${task} 缺少完整双 app、双轮记录`); continue; }
    for (const round of ROUNDS) {
      const typora = byKey.get(`${task}/typora/${round}`);
      const mellow = byKey.get(`${task}/mellow/${round}`);
      require(typora.appOrder === mellow.appOrder, `task ${task} round ${round} 的 appOrder 必须一致`);
    }
    require(byKey.get(`${task}/typora/1`).appOrder !== byKey.get(`${task}/typora/2`).appOrder, `task ${task} 两轮必须交换执行顺序`);
    const typoraRows = ROUNDS.map((round) => byKey.get(`${task}/typora/${round}`));
    const mellowRows = ROUNDS.map((round) => byKey.get(`${task}/mellow/${round}`));
    const typoraMs = mean(typoraRows.map((row) => row.durationMs));
    const mellowMs = mean(mellowRows.map((row) => row.durationMs));
    taskResults.push({
      task,
      typoraMs,
      mellowMs,
      deltaPct: ((mellowMs / typoraMs) - 1) * 100,
      mellowErrorRate: mean(mellowRows.map((row) => Number(row.error))),
      typoraErrorRate: mean(typoraRows.map((row) => Number(row.error))),
      mellowScore: mean(mellowRows.map((row) => row.subjectiveScore)),
      typoraScore: mean(typoraRows.map((row) => row.subjectiveScore)),
    });
  }
  if (errors.length) return { valid: false, errors, taskResults: [] };

  const withinFivePct = taskResults.filter((task) => task.deltaPct <= 5).length;
  const criticalSlow = taskResults.filter((task) => CRITICAL_TASKS.has(task.task) && task.deltaPct > 15).map((task) => task.task);
  const errorRegressions = taskResults.filter((task) => task.mellowErrorRate > task.typoraErrorRate).map((task) => task.task);
  const mellowScore = mean(taskResults.map((task) => task.mellowScore));
  const typoraScore = mean(taskResults.map((task) => task.typoraScore));
  const gateErrors = [];
  if (withinFivePct < 27) gateErrors.push(`仅 ${withinFivePct}/30 任务满足 Typora +5%`);
  if (criticalSlow.length) gateErrors.push(`关键任务慢于 Typora 15%：${criticalSlow.join(', ')}`);
  if (errorRegressions.length) gateErrors.push(`Mellow 错误率高于 Typora：${errorRegressions.join(', ')}`);
  if (mellowScore < typoraScore) gateErrors.push(`主观评分 Mellow ${mellowScore.toFixed(2)} < Typora ${typoraScore.toFixed(2)}`);
  return { valid: gateErrors.length === 0, errors: gateErrors, taskResults, summary: { withinFivePct, criticalSlow, errorRegressions, mellowScore, typoraScore } };
}

function sampleObservation(task, app, round, appOrder) {
  return { task, app, round, appOrder, durationMs: app === 'mellow' ? 1000 : 1000, error: false, steps: 1, subjectiveScore: 4, evidence: [`evidence/task-${task}-${app}-${round}.png`], entryPoint: 'manual', sourceDiff: 'none' };
}

/**
 * 进度报告（2026-09-25 新增）。
 *
 * 立此命令的原因：`validate` 要求 120 条观测齐备后才给结论，中途**无法知道还差哪些** ——
 * 人工会话动辄数小时，填到一半想核对只能靠肉眼数；而 `validate` 会把「还没填」与
 * 「填错了」混在同一次报错里，无法区分。
 *
 * 本命令**只读**：报告每条观测的填写状态与字段完整性，并单独检查 appOrder 交替规则。
 * **不做任何阈值判定、不生成任何数值、不因未填完而失败**（进度 ≠ 门禁）。
 */
function progressReport(input) {
  const record = JSON.parse(readFileSync(resolve(input), 'utf8'));
  const observations = Array.isArray(record?.observations) ? record.observations : [];
  const byKey = new Map();
  for (const o of observations) byKey.set(`${o?.task}/${o?.app}/${o?.round}`, o);

  const fieldProblem = (o, f) => {
    const v = o[f];
    if (f === 'evidence') return (!Array.isArray(v) || v.length === 0) ? 'evidence' : null;
    if (f === 'durationMs') return (Number.isFinite(v) && v > 0) ? null : 'durationMs';
    if (f === 'error') return (typeof v === 'boolean') ? null : 'error';
    if (f === 'steps') return (Number.isInteger(v) && v > 0) ? null : 'steps';
    if (f === 'subjectiveScore') return (Number.isInteger(v) && v >= 1 && v <= 5) ? null : 'subjectiveScore';
    if (f === 'appOrder') return ['typora-first', 'mellow-first'].includes(v) ? null : 'appOrder';
    return (typeof v === 'string' && v.length > 0) ? null : f;
  };
  const REQUIRED = ['durationMs', 'error', 'steps', 'subjectiveScore', 'evidence', 'appOrder', 'entryPoint', 'sourceDiff'];

  const missingKeys = [];
  const incompleteList = [];
  let filled = 0;
  for (let task = 1; task <= TASKS.length; task++) {
    for (const round of ROUNDS) {
      for (const app of APPS) {
        const key = `${task}/${app}/${round}`;
        const o = byKey.get(key);
        if (!o) { missingKeys.push(key); continue; }
        const bad = REQUIRED.map((f) => fieldProblem(o, f)).filter(Boolean);
        if (bad.length) incompleteList.push(`${key}（缺 ${bad.join('/')}）`);
        else filled += 1;
      }
    }
  }

  const orderIssues = [];
  for (let task = 1; task <= TASKS.length; task++) {
    for (const round of ROUNDS) {
      const t = byKey.get(`${task}/typora/${round}`);
      const m = byKey.get(`${task}/mellow/${round}`);
      if (t?.appOrder && m?.appOrder && t.appOrder !== m.appOrder) {
        orderIssues.push(`task ${task} round ${round}：同一轮内 typora 与 mellow 的 appOrder 不一致（${t.appOrder} vs ${m.appOrder}）`);
      }
    }
    const t1 = byKey.get(`${task}/typora/1`)?.appOrder;
    const t2 = byKey.get(`${task}/typora/2`)?.appOrder;
    if (t1 && t2 && t1 === t2) orderIssues.push(`task ${task}：两轮未交换执行顺序（都是 ${t1}）`);
  }

  const filledOr = (v) => (typeof v === 'string' && v.length > 0 && !v.startsWith('REPLACE_')) ? '已填' : '未填';
  return {
    total: TASKS.length * APPS.length * ROUNDS.length,
    filled,
    incompleteCount: incompleteList.length,
    missingCount: missingKeys.length,
    meta: {
      tester: filledOr(record?.tester),
      machine: filledOr(record?.machine),
      mellowCommit: filledOr(record?.mellowCommit),
      imeCorruption: record?.imeCorruption === false ? 'false ✓' : '未填（必须明确为 false）',
      dataLoss: record?.dataLoss === false ? 'false ✓' : '未填（必须明确为 false）',
      uxScore: (() => {
        const ux = record?.uxScore;
        if (ux === null || ux === undefined) {
          return `未填（PRD §131：总分 ≥${UX_THRESHOLDS.total} / Live Editing ≥${UX_THRESHOLDS.liveEditing}`
            + ` / Caret-IME-Undo = ${UX_THRESHOLDS.caretImeUndo} / File Safety = ${UX_THRESHOLDS.fileSafety}）`;
        }
        const sc = ux.modules ?? {};
        const total = UX_MODULES.reduce((a, [k, w]) => a + (Number.isInteger(sc[k]) ? Math.min(sc[k], w) : 0), 0);
        return `总分 ${total}/${UX_TOTAL_WEIGHT}`;
      })(),
    },
    missingKeys,
    incompleteList,
    orderIssues,
  };
}

function selfTest() {
  const record = blankRecord('macos', 'deadbeef');
  record.tester = 'test'; record.machine = 'test-machine'; record.imeCorruption = false; record.dataLoss = false;

  // 骨架自检（2026-09-30）：条数正确，且 appOrder 规则**由构造保证**
  const expected = TASKS.length * APPS.length * ROUNDS.length;
  if (record.observations.length !== expected) {
    fail(`self-test failed: 骨架应 ${expected} 条，实际 ${record.observations.length}`);
  }
  const orderOf = (task, app, round) => record.observations
    .find((o) => o.task === task && o.app === app && o.round === round)?.appOrder;
  for (let task = 1; task <= TASKS.length; task++) {
    for (const round of ROUNDS) {
      if (orderOf(task, 'typora', round) !== orderOf(task, 'mellow', round)) {
        fail(`self-test failed: task ${task} round ${round} 同轮 appOrder 不一致（骨架破坏了顺序规则）`);
      }
    }
    if (orderOf(task, 'typora', 1) === orderOf(task, 'typora', 2)) {
      fail(`self-test failed: task ${task} 两轮 appOrder 未交换（骨架破坏了顺序规则）`);
    }
  }
  // 骨架**不得含测量值**（否则占位值可能被误当成真实读数）
  for (const o of record.observations) {
    if ('durationMs' in o || 'error' in o || 'steps' in o || 'subjectiveScore' in o || 'evidence' in o) {
      fail(`self-test failed: 骨架不应含测量字段（发现于 task ${o.task}/${o.app}/${o.round}）`);
    }
  }
  if (validate(record).valid) fail('self-test failed: 只有骨架、无测量值的记录必须被拒绝');

  // UX Score（PRD §131）：缺失必须被拒绝 —— 这是「≥92 门槛可被静默跳过」的回归防线
  const withoutUx = { ...record, uxScore: null };
  if (validate(withoutUx).valid) fail('self-test failed: 缺 uxScore 的记录必须被拒绝（否则 ≥92 门槛会被跳过）');

  // 补测量值（与人工流程一致：只填数值，不改结构）
  for (const row of record.observations) {
    Object.assign(row, sampleObservation(row.task, row.app, row.round, row.appOrder));
  }
  // UX Score：满分模块（门槛全部满足）
  record.uxScore = {
    modules: Object.fromEntries(UX_MODULES.map(([k, w]) => [k, w])),
    evidence: ['evidence/ux-score-sheet.png'],
  };
  const result = validate(record);
  if (!result.valid || result.summary.withinFivePct !== 30) fail(`self-test failed: ${result.errors.join('; ')}`);
  // 门槛反例：Caret/IME/Undo 少 1 分 → 必须被拒绝（PRD §131 要求满分）
  const caretShort = JSON.parse(JSON.stringify(record));
  caretShort.uxScore.modules.caretImeUndo = UX_THRESHOLDS.caretImeUndo - 1;
  if (validate(caretShort).valid) fail('self-test failed: Caret/IME/Undo 未满分时必须被拒绝');

  // 门槛反例：总分不足 → 必须被拒绝
  const lowTotal = JSON.parse(JSON.stringify(record));
  lowTotal.uxScore.modules.markdown = 0;
  lowTotal.uxScore.modules.tableImage = 0;
  lowTotal.uxScore.modules.desktopUi = 0;
  if (validate(lowTotal).valid) fail('self-test failed: UX Score 总分低于门槛时必须被拒绝');

  record.observations.pop();
  if (validate(record).valid) fail('self-test failed: incomplete record must be rejected');
  console.log('UX gate recorder self-test: PASS');
}

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
try {
  if (command === '--self-test') selfTest();
  else if (command === 'init') {
    const output = option('--output'); const platform = option('--platform'); const commit = option('--commit');
    if (!output || !platform || !commit) fail('用法：init --output <file.json> --platform <macos|windows|linux> --commit <sha>');
    const path = resolve(output);
    if (existsSync(path)) fail(`拒绝覆盖已有记录：${path}`);
    writeFileSync(path, `${JSON.stringify(blankRecord(platform, commit), null, 2)}\n`);
    console.log(`已创建 UX Gate 记录：${path}`);
  } else if (command === 'progress') {
    const input = option('--input'); if (!input) fail('用法：progress --input <file.json>');
    const r = progressReport(input);
    console.log(`UX Gate 进度：${r.filled}/${r.total} 条已填写完整（字段不完整 ${r.incompleteCount}，未填 ${r.missingCount}）`);
    console.log(`元数据：${Object.entries(r.meta).map(([k, v]) => `${k}=${v}`).join('  ')}`);
    if (r.incompleteList.length) {
      console.log('字段不完整：');
      for (const x of r.incompleteList.slice(0, 30)) console.log(`  - ${x}`);
      if (r.incompleteList.length > 30) console.log(`  … 另有 ${r.incompleteList.length - 30} 条`);
    }
    if (r.missingKeys.length) {
      console.log(`未填（共 ${r.missingKeys.length} 条，列前 20）：`);
      for (const x of r.missingKeys.slice(0, 20)) console.log(`  - ${x}`);
    }
    if (r.orderIssues.length) {
      console.log('顺序规则问题：');
      for (const x of r.orderIssues.slice(0, 20)) console.log(`  - ${x}`);
    }
    if (r.filled === r.total && r.orderIssues.length === 0 && r.meta.imeCorruption.endsWith('✓') && r.meta.dataLoss.endsWith('✓')) {
      console.log('✓ 120 条齐备、顺序规则与两项安全声明均通过 → 可执行 validate');
    }
    // 进度报告**不是门禁**：未填完不失败，否则无法在会话中途查看进度
    process.exitCode = 0;
  } else if (command === 'validate') {
    const input = option('--input'); if (!input) fail('用法：validate --input <file.json>');
    const result = validate(JSON.parse(readFileSync(resolve(input), 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else fail('用法：--self-test | init --output <file.json> --platform <platform> --commit <sha> | progress --input <file.json> | validate --input <file.json>');
} catch (error) {
  console.error(`UX Gate recorder: ${error.message}`);
  process.exitCode = 1;
}

