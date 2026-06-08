/**
 * Importa el logo oficial desde `Nuevo logo/` a public/ y genera favicons.
 * Quita el fondo negro por flood-fill desde los bordes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'Nuevo logo');
const publicDir = path.join(root, 'public');

/** Logo oficial Lion Barber (cabezal + tipografía). */
const PRIMARY_LOGO = 'WhatsApp Image 2026-06-08 at 17.51.01 (3).jpeg';

const BG_TOLERANCE = 48;

function sourcePath() {
  const input = path.join(srcDir, PRIMARY_LOGO);
  if (!fs.existsSync(input)) {
    throw new Error(`No se encontró el logo: ${input}`);
  }
  return input;
}

function idx(x, y, w) {
  return (y * w + x) * 4;
}

/** Transparenta el color de fondo conectado a los bordes (típico fondo negro del JPEG). */
function makeEdgeBackgroundTransparent(data, width, height, tolerance = BG_TOLERANCE) {
  const out = Buffer.from(data);
  const corners = [
    idx(0, 0, width),
    idx(width - 1, 0, width),
    idx(0, height - 1, width),
    idx(width - 1, height - 1, width),
  ];
  const bgR = Math.round(corners.reduce((s, i) => s + out[i], 0) / corners.length);
  const bgG = Math.round(corners.reduce((s, i) => s + out[i + 1], 0) / corners.length);
  const bgB = Math.round(corners.reduce((s, i) => s + out[i + 2], 0) / corners.length);

  const similar = (i) => {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    return (
      Math.abs(r - bgR) <= tolerance &&
      Math.abs(g - bgG) <= tolerance &&
      Math.abs(b - bgB) <= tolerance
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
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nid = ny * width + nx;
      if (inQueue[nid]) continue;
      if (!similar(idx(nx, ny, width))) continue;
      inQueue[nid] = 1;
      q.push([nx, ny]);
    }
  }

  return out;
}

async function loadTransparentLogo(targetW) {
  const { data, info } = await sharp(sourcePath())
    .resize({ width: targetW, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = makeEdgeBackgroundTransparent(data, info.width, info.height);
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 10 })
    .png({ quality: 92 });
}

async function writeMainLogo() {
  const meta = await sharp(sourcePath()).metadata();
  const width = meta.width ?? 800;
  const targetW = Math.min(640, width);
  const png = await (await loadTransparentLogo(targetW)).toBuffer();

  const outputs = [
    'lion-logo.png',
    'lion-logo-full.png',
    'lion-logo-circle.png',
    'lion-logo-hero-for-ui.png',
    'lion-logo-hero.png',
    'lion-barber-logo.png',
    'lion-icon.png',
    'lion-head-transparent.png',
    'lion-logo-hero-transparent.png',
  ];

  for (const name of outputs) {
    fs.writeFileSync(path.join(publicDir, name), png);
    console.log('ok', name);
  }
}

async function writeSquareIcon(destName, px) {
  const meta = await sharp(sourcePath()).metadata();
  const targetW = Math.min(640, meta.width ?? 640);
  await (await loadTransparentLogo(targetW))
    .resize(px, px, {
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(publicDir, destName));
  console.log('ok', destName);
}

await writeMainLogo();

for (const [name, px] of [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
]) {
  await writeSquareIcon(name, px);
}

const icoBuf = await toIco([
  fs.readFileSync(path.join(publicDir, 'favicon-16x16.png')),
  fs.readFileSync(path.join(publicDir, 'favicon-32x32.png')),
]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);
console.log('ok favicon.ico');
console.log('Logo importado (fondo transparente) desde', PRIMARY_LOGO);
