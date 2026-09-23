#!/usr/bin/env node
/**
 * Mellow Performance Benchmark — 夹具确定性生成器（performance-benchmark-spec §4）。
 *
 * 用法：node generate-fixtures.mjs [--seed 42] [--out fixtures]
 * 产物：fixtures/ 下 7 个夹具 + assets/ 1000 个 1×1 PNG + manifest.json（sha256 / bytes / lines）
 * 确定性：固定 seed → 固定内容；manifest 记录实际字节数（UTF-8）。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = 42;
const outDir = join(__dirname, 'fixtures');

// ---------- seeded PRNG (mulberry32) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// ---------- 语料 ----------
const EN_WORDS = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'markdown', 'editor', 'performance', 'benchmark', 'latency', 'throughput', 'render', 'viewport', 'cursor', 'buffer', 'scroll', 'keystroke', 'composition', 'immutable', 'transaction', 'decoration', 'syntax', 'highlight', 'marker', 'widget', 'source', 'document', 'paragraph', 'heading', 'table', 'image', 'diagram', 'flowchart', 'sequence', 'renderer', 'engine', 'metric', 'sample', 'percentile', 'median', 'stable', 'deterministic', 'fixture', 'corpus', 'unicode', 'cjk', 'latin', 'mixed', 'content', 'structure', 'block', 'inline', 'fence', 'quote', 'list', 'ordered', 'unordered', 'emphasis', 'strong', 'link', 'reference', 'escape', 'entity', 'entity', 'streaming', 'async', 'scheduler', 'raster', 'compositor', 'frame', 'budget', 'jank', 'smooth'];
const CJK = ['性能', '基准', '延迟', '渲染', '编辑', '文档', '光标', '滚动', '按键', '输入', '法', '测试', '对照', '目标', '阈值', '大文件', '模式', '视口', '裁剪', '装饰', '标记', '语法', '高亮', '表格', '图片', '流程图', '序列图', '引擎', '指标', '样本', '百分位', '中位数', '稳定', '确定性', '夹具', '语料', '混合', '内容', '结构', '块', '行内', '围栏', '引用', '列表', '有序', '无序', '强调', '加粗', '链接', '实体', '异步', '调度', '合成', '帧', '预算', '卡顿', '平滑', '中文', '输入法', '组词', '候选', '提交'];

function enSentence() {
  const n = int(6, 18);
  const words = [];
  for (let i = 0; i < n; i++) words.push(pick(EN_WORDS));
  return words.join(' ');
}
function cjkSentence() {
  const n = int(8, 24);
  const out = [];
  for (let i = 0; i < n; i++) out.push(pick(CJK));
  return out.join('');
}
function sentence() { return rand() < 0.5 ? enSentence() : cjkSentence(); }
function paragraph() {
  const n = int(3, 8);
  const sents = [];
  for (let i = 0; i < n; i++) sents.push(sentence());
  return sents.join(' ');
}
function heading() {
  const level = int(1, 4);
  return `${'#'.repeat(level)} ${sentence().slice(0, int(10, 40))}`;
}
function listItem() {
  return `${rand() < 0.5 ? '-' : '*'} ${sentence().slice(0, int(8, 30))}`;
}
function codeBlock() {
  const n = int(4, 12);
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(`  const v${i} = compute(${int(0, 99)}, "${pick(EN_WORDS)}");`);
  return '```ts\n' + lines.join('\n') + '\n```';
}
function quote() {
  return `> ${sentence().slice(0, int(15, 50))}`;
}
function inlineSample() {
  return `Text with **${pick(EN_WORDS)}** and \`${pick(EN_WORDS)}\` plus [link](https://example.com/${pick(EN_WORDS)}).`;
}
function block() {
  const r = rand();
  if (r < 0.55) return paragraph();
  if (r < 0.75) return heading();
  if (r < 0.85) return `${listItem()}\n${listItem()}\n${listItem()}`;
  if (r < 0.93) return codeBlock();
  if (r < 0.97) return quote();
  return inlineSample();
}

/** 用 ASCII 行精确补齐字节数（EN_WORDS 全英文，slice 按字符=按字节，可精确） */
function padToExact(buffer, targetBytes) {
  let lines = buffer.split('\n');
  let size = Buffer.byteLength(buffer);
  // 去掉最后一个不完整块（如果超了）
  while (size > targetBytes && lines.length > 1) {
    lines.pop();
    buffer = lines.join('\n');
    size = Buffer.byteLength(buffer);
  }
  while (size < targetBytes) {
    const prefix = buffer.endsWith('\n') ? '' : '\n';
    const need = targetBytes - size - Buffer.byteLength(prefix);
    const filler = (pick(EN_WORDS) + ' ').repeat(Math.ceil(need / 12)).slice(0, need);
    buffer += prefix + filler;
    size = Buffer.byteLength(buffer);
  }
  return buffer;
}

// ---------- 生成器 ----------
function genMixed(targetBytes) {
  let out = '';
  let size = 0;
  while (size < targetBytes * 0.9) {
    const b = block();
    out += (out ? '\n\n' : '') + b;
    size = Buffer.byteLength(out);
  }
  return padToExact(out, targetBytes);
}

function genLines100k() {
  const rows = [];
  for (let i = 0; i < 100000; i++) {
    const r = rand();
    if (r < 0.6) rows.push(paragraph().slice(0, int(10, 60)));
    else if (r < 0.8) rows.push(heading());
    else if (r < 0.92) rows.push(listItem());
    else rows.push('');
  }
  return rows.join('\n') + '\n';
}

function genLargeTable() {
  const cols = 8;
  const head = '| ' + Array.from({ length: cols }, (_, c) => `col${c}`).join(' | ') + ' |';
  const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
  const rows = [head, sep];
  for (let r = 0; r < 600; r++) {
    const cells = Array.from({ length: cols }, () => pick(EN_WORDS) + int(0, 99));
    rows.push('| ' + cells.join(' | ') + ' |');
  }
  return rows.join('\n') + '\n';
}

function genMermaid() {
  const blocks = [];
  for (let i = 0; i < 100; i++) {
    if (i % 2 === 0) {
      blocks.push(`\`\`\`mermaid\nflowchart LR\n  A[${pick(EN_WORDS)}] --> B{${pick(EN_WORDS)}?}\n  B -- yes --> C[${pick(EN_WORDS)}]\n  B -- no --> D[${pick(EN_WORDS)}]\n  C --> E[${pick(EN_WORDS)}]\n  D --> E\n\`\`\``);
    } else {
      blocks.push(`\`\`\`mermaid\nsequenceDiagram\n  participant U as User\n  participant E as Engine\n  U->>E: ${pick(EN_WORDS)} ${pick(EN_WORDS)}\n  E-->>U: ${pick(EN_WORDS)}\n  Note over E: ${pick(EN_WORDS)}\n  U->>E: ${pick(EN_WORDS)}\n  E-->>U: done\n\`\`\``);
    }
  }
  return blocks.join('\n\n') + '\n';
}

const PNG_1PX_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function genImages() {
  const lines = [];
  for (let i = 0; i < 1000; i++) {
    lines.push(`![img-${String(i).padStart(4, '0')}](assets/${String(i).padStart(4, '0')}.png)`);
  }
  return lines.join('\n') + '\n';
}

function writePngs(dir) {
  const assetsDir = join(dir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const buf = Buffer.from(PNG_1PX_B64, 'base64');
  for (let i = 0; i < 1000; i++) {
    writeFileSync(join(assetsDir, `${String(i).padStart(4, '0')}.png`), buf);
  }
}

// ---------- 主流程 ----------
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
function linesOf(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

// 生成产物清单（保留提交的 README.md / .gitignore / typora-menu-dump.txt）
// `_blank.md` 不在其中：它是 runner 按需创建的临时空白文档，不由本脚本生成，
// 故只参与「清理旧产物」而不参与「搬入新产物」。
const GENERATED = ['manifest.json', '1MB.md', '5MB.md', '10MB.md', '100k-lines.md', 'large-table.md', '100-mermaid.md', '1000-images.md'];
const STALE_EXTRA = ['_blank.md'];

// **原子生成**（2026-09-23 修复）：原实现先 rmSync 掉全部夹具再重新生成，
// 一旦中途失败（实测：沙箱下写 PNG 被拒）夹具就**整体丢失**且无任何提示 ——
// 表现为 runner 在 Typora 那一轮重建失败后，Mellow 那一轮的两个夹具被
// 「跳过（夹具缺失）」，整批测量静默变成空跑，而 results JSON 看起来「跑过了」。
// 现在：全部写入 .staging/，**全部成功之后**才删除旧产物并搬入。
const stagingDir = join(outDir, '.staging');
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const jobs = [
  { name: '1MB.md', make: () => genMixed(1024 * 1024) },
  { name: '5MB.md', make: () => genMixed(5 * 1024 * 1024) },
  { name: '10MB.md', make: () => genMixed(10 * 1024 * 1024) },
  { name: '100k-lines.md', make: genLines100k },
  { name: 'large-table.md', make: genLargeTable },
  { name: '100-mermaid.md', make: genMermaid },
  { name: '1000-images.md', make: genImages },
];

const manifest = {
  generator: 'generate-fixtures.mjs',
  seed: SEED,
  generatedAt: new Date().toISOString(),
  files: {},
};

for (const job of jobs) {
  const text = job.make();
  writeFileSync(join(stagingDir, job.name), text);
  manifest.files[job.name] = {
    bytes: Buffer.byteLength(text),
    lines: linesOf(text),
    sha256: sha256(text),
  };
}

writePngs(stagingDir);
const pngCount = readdirSync(join(stagingDir, 'assets')).filter((f) => f.endsWith('.png')).length;
manifest.assets = { pngCount };
writeFileSync(join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// —— 走到这里说明全部生成成功，现在才替换正式产物（失败则旧夹具原样保留）——
// 单个文件用 renameSync 直接覆盖（POSIX 上是对目标位置的原子替换），因此**不需要**
// 先删旧文件 —— 先删再搬会在中途失败时留下「旧已删、新未到」的空档。
for (const f of GENERATED) renameSync(join(stagingDir, f), join(outDir, f));
// assets 是目录，rename 不能覆盖非空目录 → 先把旧目录移开，再移入新的，最后清理。
const oldAssets = join(stagingDir, '.old-assets');
rmSync(oldAssets, { recursive: true, force: true });
if (existsSync(join(outDir, 'assets'))) renameSync(join(outDir, 'assets'), oldAssets);
renameSync(join(stagingDir, 'assets'), join(outDir, 'assets'));
rmSync(oldAssets, { recursive: true, force: true });
for (const f of STALE_EXTRA) rmSync(join(outDir, f), { force: true });
rmSync(stagingDir, { recursive: true, force: true });

for (const [name, meta] of Object.entries(manifest.files)) {
  console.log(`${name}: ${meta.bytes} bytes / ${meta.lines} lines`);
}
console.log(`assets: ${pngCount} pngs, manifest written`);
