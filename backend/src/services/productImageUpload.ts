import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { parseProductImageDataUrl, setProductImageData } from '../repositories/shopProducts.js';

/** Carpeta legacy (archivos viejos en disco). */
export function getProductUploadsDir(): string {
  const backendDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(backendDir, '../../uploads/products');
}

function mimeFromFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function filenameFromLegacyUrl(imageUrl: string): string | null {
  const trimmed = imageUrl.trim();
  const prefixes = ['/api/uploads/products/', '/products/'];
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      const name = trimmed.slice(prefix.length).split('?')[0];
      return name && !name.includes('..') ? name : null;
    }
  }
  return null;
}

/** Guarda imagen en MySQL (persiste en Railway/Vercel) y devuelve URL de la API. */
export async function saveProductImageFromDataUrl(
  productId: string,
  dataUrl: string
): Promise<string> {
  await setProductImageData(productId, dataUrl);
  return `/api/shop-products/${encodeURIComponent(productId)}/image`;
}

/** Importa archivos viejos del disco a la base de datos. */
export async function migrateLegacyProductImages(): Promise<void> {
  try {
    await query('ALTER TABLE shop_products ADD COLUMN image_data MEDIUMTEXT NULL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw e;
  }

  const rows = await query<{ id: string; image_url: string | null; image_data: string | null }[]>(
    `SELECT id, image_url, image_data FROM shop_products
     WHERE (image_data IS NULL OR TRIM(image_data) = '')
       AND image_url IS NOT NULL AND TRIM(image_url) <> ''`
  );

  const uploadsDir = getProductUploadsDir();
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const repoRoot = path.resolve(backendRoot, '..');
  const searchDirs = [
    uploadsDir,
    path.join(repoRoot, 'frontend/public/products'),
    path.join(backendRoot, 'frontend/public/products'),
  ];

  for (const row of rows) {
    const filename = filenameFromLegacyUrl(String(row.image_url));
    if (!filename) continue;

    for (const dir of searchDirs) {
      const filePath = path.join(dir, filename);
      try {
        const buf = await fs.readFile(filePath);
        if (buf.length <= 0 || buf.length > 2 * 1024 * 1024) continue;
        const mime = mimeFromFilename(filename);
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        parseProductImageDataUrl(dataUrl);
        await setProductImageData(row.id, dataUrl);
        break;
      } catch {
        /* probar otra carpeta */
      }
    }
  }

  await query(
    `UPDATE shop_products SET image_url = NULL
     WHERE image_data IS NOT NULL AND TRIM(image_data) <> ''`
  );
}
