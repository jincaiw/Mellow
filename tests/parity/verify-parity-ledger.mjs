import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ledgerPath = resolve(import.meta.dirname, 'typora-parity-ledger.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
const allowedGrades = new Set(['E', 'B', 'D']);
const allowedStatuses = new Set([
  'ABSENT', 'IMPL', 'AUTO', 'MAC', 'WIN', 'LINUX', 'PASS-B', 'PASS-E', 'BLOCKED', 'NOT_TESTED'
]);
const platformEvidence = new Set(['macos', 'windows', 'linux']);
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(ledger.schemaVersion === 1, 'schemaVersion 必须为 1');
assert(ledger.normativeBaseline?.product === 'Typora', '规范产品必须为 Typora');
assert(ledger.normativeBaseline?.version === '1.14.6', '规范验收基线必须为 Typora 1.14.6');
assert(Array.isArray(ledger.patchObservations) && ledger.patchObservations.length > 0, '必须记录补丁观察样本');

for (const observation of ledger.patchObservations ?? []) {
  assert(observation.version !== '1.14.6', `补丁观察 ${observation.version} 不应重复规范基线`);
  assert(/不可替代规范验收基线/.test(observation.purpose ?? ''), `补丁观察 ${observation.version} 必须声明其非规范性`);
  assert(typeof observation.evidence === 'string' && existsSync(resolve(root, observation.evidence)), `补丁观察 ${observation.version} 的证据不存在`);
}

const ids = new Set();
const domains = new Set();
for (const item of ledger.items ?? []) {
  assert(/^P0-[A-Z0-9]+-\d{3}$/.test(item.id ?? ''), `无效 P0 ID：${item.id ?? '<missing>'}`);
  assert(!ids.has(item.id), `P0 ID 重复：${item.id}`);
  ids.add(item.id);
  domains.add(item.domain);
  assert(allowedGrades.has(item.grade), `${item.id} 的 grade 必须为 E、B 或 D`);
  assert(allowedStatuses.has(item.status), `${item.id} 的 status 无效：${item.status}`);
  assert(typeof item.typoraBehavior === 'string' && item.typoraBehavior.length > 0, `${item.id} 缺少 Typora 行为合同`);
  assert(typeof item.mellowTarget === 'string' && item.mellowTarget.length > 0, `${item.id} 缺少 Mellow 目标`);
  assert(typeof item.ownerPackage === 'string' && item.ownerPackage.length > 0, `${item.id} 缺少 Owner Package`);
  assert(Array.isArray(item.evidence) && item.evidence.length > 0, `${item.id} 缺少证据`);
  assert(Array.isArray(item.requiredEvidence) && item.requiredEvidence.length > 0, `${item.id} 缺少验收证据要求`);
  for (const evidence of item.evidence ?? []) {
    assert(existsSync(resolve(root, evidence)), `${item.id} 的证据不存在：${evidence}`);
  }
  if (item.status === 'PASS-E') {
    for (const platform of platformEvidence) {
      assert(item.requiredEvidence.includes(platform), `${item.id} 标记 PASS-E 前必须要求 ${platform} 真机证据`);
    }
    assert(item.requiredEvidence.includes('ux-gate'), `${item.id} 标记 PASS-E 前必须要求 UX Gate`);
  }
}

for (const domain of ['editing', 'sidebar', 'desktop-ui', 'menu', 'acceptance']) {
  assert(domains.has(domain), `台账缺少关键域：${domain}`);
}
assert(ids.size >= 25, '台账必须覆盖至少 25 个 P0 项');

if (errors.length) {
  console.error('Typora parity ledger validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = Object.fromEntries([...allowedStatuses].map((status) => [status, 0]));
for (const item of ledger.items) counts[item.status] += 1;
console.log(`Typora parity ledger: ${ledger.items.length} P0 items; normative baseline ${ledger.normativeBaseline.product} ${ledger.normativeBaseline.version}`);
console.log(`Status dashboard: ${Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => `${status}=${count}`).join(', ')}`);
