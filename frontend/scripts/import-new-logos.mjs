/**
 * Importa los logos de `Nuevo logo/` a public/ y genera favicons.
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

const SOURCES = {
  circle: 'WhatsApp Image 2026-06-08 at 17.51.00 (1).jpeg',
  head: 'WhatsApp Image 2026-06-08 at 17.51.01 (1).jpeg',
  full: 'WhatsApp Image 2026-06-08 at 17.51.01 (3).jpeg',
};

async function writePng(sourceName, destName, size) {
  const input = path.join(srcDir, sourceName);
  if (!fs.existsSync(input)) {
    throw new Error(`No se encontró: ${input}`);
  }
  let img = sharp(input);
  if (size) {
    img = img.resize(size, size, { fit: 'cover', position: 'centre' });
  }
  await img.png({ quality: 92 }).toFile(path.join(publicDir, destName));
  console.log('ok', destName);
}

await writePng(SOURCES.circle, 'lion-logo-circle.png', 512);
await writePng(SOURCES.full, 'lion-logo-full.png', 800);
await writePng(SOURCES.head, 'lion-logo-head.png', 512);

for (const legacy of [
  'lion-logo-hero-for-ui.png',
  'lion-logo-hero.png',
  'lion-barber-logo.png',
  'lion-icon.png',
  'lion-head-transparent.png',
  'lion-logo-hero-transparent.png',
]) {
  await sharp(path.join(publicDir, 'lion-logo-circle.png'))
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(path.join(publicDir, legacy));
  console.log('ok legacy', legacy);
}

const faviconSizes = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
];

for (const [name, px] of faviconSizes) {
  await sharp(path.join(publicDir, 'lion-logo-circle.png'))
    .resize(px, px, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(path.join(publicDir, name));
  console.log('ok', name);
}

const icoBuf = await toIco([
  fs.readFileSync(path.join(publicDir, 'favicon-16x16.png')),
  fs.readFileSync(path.join(publicDir, 'favicon-32x32.png')),
]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);
console.log('ok favicon.ico');
console.log('Logos importados.');
