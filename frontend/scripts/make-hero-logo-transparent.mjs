import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(__dirname, '..', 'public', 'lion-logo-hero.png');
const output = path.join(__dirname, '..', 'public', 'lion-logo-hero-transparent.png');
const tolerance = 28;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

function removeBgFromEdges(data, width, height) {
  const out = Buffer.from(data);
  const bgR = out[0];
  const bgG = out[1];
  const bgB = out[2];

  const similar = (i) =>
    Math.abs(out[i] - bgR) <= tolerance &&
    Math.abs(out[i + 1] - bgG) <= tolerance &&
    Math.abs(out[i + 2] - bgB) <= tolerance;

  const seen = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    const id = y * width + x;
    if (seen[id]) return;
    const i = idx(x, y, width);
    if (!similar(i)) return;
    seen[id] = 1;
    queue.push([x, y]);
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
  while (head < queue.length) {
    const [x, y] = queue[head++];
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
      push(nx, ny);
    }
  }
  return out;
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cleaned = removeBgFromEdges(data, info.width, info.height);
await sharp(cleaned, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(output);

console.log('ok', output);
