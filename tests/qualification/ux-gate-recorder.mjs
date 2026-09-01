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
    observations: [],
    notes: '每个任务需记录 Typora/Mellow 各两轮；两轮 appOrder 必须相反。',
  };
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

function selfTest() {
  const record = blankRecord('macos', 'deadbeef');
  record.tester = 'test'; record.machine = 'test-machine'; record.imeCorruption = false; record.dataLoss = false;
  for (let task = 1; task <= TASKS.length; task++) for (const round of ROUNDS) for (const app of APPS) {
    record.observations.push(sampleObservation(task, app, round, round === 1 ? 'typora-first' : 'mellow-first'));
  }
  const result = validate(record);
  if (!result.valid || result.summary.withinFivePct !== 30) fail(`self-test failed: ${result.errors.join('; ')}`);
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
  } else if (command === 'validate') {
    const input = option('--input'); if (!input) fail('用法：validate --input <file.json>');
    const result = validate(JSON.parse(readFileSync(resolve(input), 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else fail('用法：--self-test | init --output <file.json> --platform <platform> --commit <sha> | validate --input <file.json>');
} catch (error) {
  console.error(`UX Gate recorder: ${error.message}`);
  process.exitCode = 1;
}

