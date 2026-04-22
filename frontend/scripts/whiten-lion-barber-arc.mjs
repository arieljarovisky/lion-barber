/**
 * Blanquea el fondo oscuro del sello circular (zona "LION BARBER" y aro),
 * respetando letras muy negras y colores del león.
 */
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const inputName = 'lion-logo-hero-transparent.png';
const fallbackName = 'lion-logo-hero.png';
const outputName = 'lion-logo-hero-for-ui.png';

const inputPath = path.join(
  publicDir,
  fs.existsSync(path.join(publicDir, inputName)) ? inputName : fallbackName
);
const outPath = path.join(publicDir, outputName);

function luma(i, data) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sat(i, data) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const M = Math.max(r, g, b);
  const m = Math.min(r, g, b);
  return M - m;
}

const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const cx = w / 2;
const cy = h / 2;
const rMax = Math.min(w, h) * 0.5;
const out = Buffer.from(data);

// Anillo del sello: entre ~18% y ~52% del radio (típico en logos circulares centrados)
const r1 = 0.17 * rMax;
const r2 = 0.53 * rMax;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const idx = (y * w + x) * 4;
    if (out[idx + 3] < 8) continue;

    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < r1 || d > r2) continue;

    const L = luma(idx, out);
    const S = sat(idx, out);

    // Trazos/ texto muy negro
    if (L < 22) continue;
    // Pelo/dorados y tonos cálidos del león
    if (S > 45 && L > 35) continue;
    if (L > 115) continue;

    out[idx] = 255;
    out[idx + 1] = 255;
    out[idx + 2] = 255;
  }
}

await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outPath);
console.log('ok', outPath, 'from', path.basename(inputPath));
