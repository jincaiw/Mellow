// Mellow 应用图标生成器（纯 Node，无外部依赖）
//
// 生成 1024x1024 RGBA PNG：圆角方块（品牌色 #3563d6 渐变）+ 白色 "M" 字形。
// 产物：branding/icon-source.png —— 作为 `npx tauri icon` 的源图，生成全平台图标集。
//
// 用法：node scripts/generate-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'branding', 'icon-source.png');

const SIZE = 1024;
const SS = 3; // 3x3 supersampling

// 品牌色（packages/themes/src/index.ts --mellow-accent）
const C_TOP = [0x35, 0x63, 0xd6]; // #3563d6
const C_BOT = [0x2a, 0x4f, 0xc2]; // 渐变下端
const C_FG = [255, 255, 255];

// 圆角方块：边距 + 圆角半径
const MARGIN = 72;
const RADIUS = 224;

// "M" 字形 polyline（归一化坐标）
const M_PTS = [
  [0.24, 0.31],
  [0.24, 0.71],
  [0.5, 0.33],
  [0.76, 0.71],
  [0.76, 0.31],
];
const M_STROKE = 0.115; // 笔画宽度（归一化）

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
  const dx = px - (ax + t * abx), dy = py - (ay + t * aby);
  return Math.hypot(dx, dy);
}

function distToM(x, y) {
  let d = Infinity;
  for (let i = 0; i < M_PTS.length - 1; i++) {
    d = Math.min(d, distToSegment(x, y, M_PTS[i][0], M_PTS[i][1], M_PTS[i + 1][0], M_PTS[i + 1][1]));
  }
  return d;
}

function sdRoundRect(x, y) {
  const half = SIZE / 2 - MARGIN;
  const qx = Math.abs(x - SIZE / 2) - (half - RADIUS);
  const qy = Math.abs(y - SIZE / 2) - (half - RADIUS);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - RADIUS;
}

// 像素颜色（supersample 求均值）
function sample(cx, cy) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = cx + (sx + 0.5) / SS - 0.5;
      const y = cy + (sy + 0.5) / SS - 0.5;
      const d = sdRoundRect(x, y);
      if (d > 0) continue; // 方块外
      // 方块内 alpha（1px 抗锯齿）
      let alpha = 1;
      if (d > -1) alpha = Math.max(0, Math.min(1, -d));
      const t = y / SIZE;
      let br = C_TOP[0] + (C_BOT[0] - C_TOP[0]) * t;
      let bg = C_TOP[1] + (C_BOT[1] - C_TOP[1]) * t;
      let bb = C_TOP[2] + (C_BOT[2] - C_TOP[2]) * t;
      // "M" 白色笔画（归一化坐标）
      const dm = distToM(x / SIZE, y / SIZE);
      const half = M_STROKE / 2;
      if (dm < half) {
        const mAlpha = alpha * Math.max(0, Math.min(1, half - dm + 0.5));
        br = br + (C_FG[0] - br) * mAlpha;
        bg = bg + (C_FG[1] - bg) * mAlpha;
        bb = bb + (C_FG[2] - bb) * mAlpha;
      }
      r += br; g += bg; b += bb; a += alpha * 255;
    }
  }
  const n = SS * SS;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)];
}

// 组装 PNG（RGBA8 非交错）
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter: None
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = sample(x, y);
    const o = rowStart + 1 + x * 4;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`icon source written: ${OUT} (${SIZE}x${SIZE})`);
