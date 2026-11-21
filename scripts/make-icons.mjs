// Рисует простые PNG-иконки без внешних библиотек: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const png = (size, px) => {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// Фигуры в координатах 0..1; возвращают true, если точка закрашена белым.
const SHAPES = {
  finance: (x, y) => [[0.3, 0.72, 0.52], [0.5, 0.72, 0.32], [0.7, 0.72, 0.42]]
    .some(([cx, by, ty]) => Math.abs(x - cx) < 0.06 && y <= by && y >= ty),
  day: (x, y) => segDist(x, y, 0.28, 0.52, 0.44, 0.68) < 0.055 || segDist(x, y, 0.44, 0.68, 0.74, 0.34) < 0.055,
  life: (x, y) => Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.24) < 0.05 || Math.hypot(x - 0.5, y - 0.5) < 0.07,
};
const BG = { finance: '#1D4ED8', day: '#C2410C', life: '#12161C' };

for (const key of Object.keys(SHAPES)) {
  for (const size of [180, 192, 512]) {
    const bg = hex(BG[key]);
    const S = 3; // сглаживание: 3×3 подвыборки на пиксель
    const buf = png(size, (x, y) => {
      let hit = 0;
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
        if (SHAPES[key]((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size)) hit++;
      }
      const a = hit / (S * S);
      return bg.map((c) => Math.round(c * (1 - a) + 255 * a));
    });
    writeFileSync(new URL(`../public/icons/${key}-${size}.png`, import.meta.url), buf);
  }
}
console.log('icons written');
