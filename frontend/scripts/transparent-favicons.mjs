/**
 * Quita el fondo claro de los favicons (relleno desde bordes, tolerancia por antialiasing).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const FILES = [
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
];

const TOLERANCE = 45;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

function makeTransparent(data, width, height) {
  const out = Buffer.from(data);
  const bgR = out[0];
  const bgG = out[1];
  const bgB = out[2];

  const similar = (i) => {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    return (
      Math.abs(r - bgR) <= TOLERANCE &&
      Math.abs(g - bgG) <= TOLERANCE &&
      Math.abs(b - bgB) <= TOLERANCE
    );
  };

  const inQueue = new Uint8Array(width * height);
  const q = [];

  const push = (x, y) => {
    const id = y * width + x;
    if (inQueue[id]) return;
    const i = idx(x, y, width);
    if (!similar(i)) return;
    inQueue[id] = 1;
    q.push([x, y]);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    const i = idx(x, y, width);
    out[i + 3] = 0;
    const n = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of n) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nid = ny * width + nx;
      if (inQueue[nid]) continue;
      const ni = idx(nx, ny, width);
      if (!similar(ni)) continue;
      inQueue[nid] = 1;
      q.push([nx, ny]);
    }
  }

  return out;
}

for (const name of FILES) {
  const filePath = path.join(publicDir, name);
  if (!fs.existsSync(filePath)) {
    console.warn('omitido (no existe):', name);
    continue;
  }
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const w = width;
  const h = height;
  const cornerAlphas = [
    data[idx(0, 0, w) + 3],
    data[idx(w - 1, 0, w) + 3],
    data[idx(0, h - 1, w) + 3],
    data[idx(w - 1, h - 1, w) + 3],
  ];
  const avgA = cornerAlphas.reduce((a, b) => a + b, 0) / 4;
  if (avgA < 200) {
    console.log('omitido (ya parece transparente):', name);
    continue;
  }
  const rgba = makeTransparent(data, width, height);
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(filePath + '.tmp');
  fs.renameSync(filePath + '.tmp', filePath);
  console.log('ok', name);
}

const icoBuf = await toIco([
  fs.readFileSync(path.join(publicDir, 'favicon-16x16.png')),
  fs.readFileSync(path.join(publicDir, 'favicon-32x32.png')),
]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);
console.log('ok favicon.ico (alpha desde PNGs)');

console.log('Listo: fondo transparente (PNG + ICO).');
