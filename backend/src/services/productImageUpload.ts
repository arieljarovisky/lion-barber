import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_BYTES = 2 * 1024 * 1024;

/** Carpeta persistente junto al backend (funciona en src/ y dist/). */
export function getProductUploadsDir(): string {
  const backendDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(backendDir, '../../uploads/products');
}

export function productImagePublicPath(filename: string): string {
  return `/api/uploads/products/${filename}`;
}

/** Guarda imagen base64 y devuelve la URL pública servida por la API. */
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

  const dir = getProductUploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const safeId = productId.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'producto';
  const filename = `${safeId}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buf);
  return productImagePublicPath(filename);
}

/** Copia archivos viejos y normaliza URLs en DB (/products/ → /api/uploads/products/). */
export async function migrateLegacyProductImages(): Promise<void> {
  const uploadsDir = getProductUploadsDir();
  await fs.mkdir(uploadsDir, { recursive: true });

  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const repoRoot = path.resolve(backendRoot, '..');
  const legacyDirs = [
    path.join(repoRoot, 'frontend/public/products'),
    path.join(backendRoot, 'frontend/public/products'),
  ];

  for (const legacyDir of legacyDirs) {
    try {
      const entries = await fs.readdir(legacyDir);
      for (const name of entries) {
        if (name === '.gitkeep' || name.startsWith('.')) continue;
        const src = path.join(legacyDir, name);
        const dest = path.join(uploadsDir, name);
        try {
          await fs.access(dest);
        } catch {
          await fs.copyFile(src, dest);
        }
      }
    } catch {
      /* carpeta inexistente */
    }
  }

  const { query } = await import('../db.js');
  await query(
    `UPDATE shop_products SET image_url = CONCAT('/api/uploads/products/', SUBSTRING(image_url, 11))
     WHERE image_url LIKE '/products/%' AND image_url NOT LIKE '/api/uploads/products/%'`
  );
}
