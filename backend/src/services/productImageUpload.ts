import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_BYTES = 2 * 1024 * 1024;

/** Guarda imagen base64 en frontend/public/products y devuelve la URL pública. */
export async function saveProductImageFromDataUrl(
  productId: string,
  dataUrl: string
): Promise<string> {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Formato de imagen no válido. Usá JPG, PNG o WebP.');
  }
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length) throw new Error('La imagen está vacía.');
  if (buf.length > MAX_BYTES) throw new Error('La imagen supera el máximo de 2 MB.');

  const backendDir = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(backendDir, '../../frontend/public/products');
  await fs.mkdir(dir, { recursive: true });
  const safeId = productId.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'producto';
  const filename = `${safeId}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buf);
  return `/products/${filename}`;
}
