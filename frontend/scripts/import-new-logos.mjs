/**
 * Importa el logo oficial desde `Nuevo logo/` a public/ y genera favicons.
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

const BG = { r: 9, g: 9, b: 11, alpha: 1 };

function sourcePath() {
  const input = path.join(srcDir, PRIMARY_LOGO);
  if (!fs.existsSync(input)) {
    throw new Error(`No se encontró el logo: ${input}`);
  }
  return input;
}

async function writeMainLogo() {
  const input = sourcePath();
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 1200;
  const targetW = Math.min(640, width);

  const png = await sharp(input)
    .resize({ width: targetW, withoutEnlargement: false })
    .png({ quality: 92 })
    .toBuffer();

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
  await sharp(sourcePath())
    .resize(px, px, { fit: 'contain', position: 'centre', background: BG })
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
console.log('Logo importado desde', PRIMARY_LOGO);
