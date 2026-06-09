const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

/**
 * URL absoluta para archivos subidos al backend (/api/uploads/...).
 * También corrige rutas viejas /products/... guardadas antes de la migración.
 */
export function resolveUploadUrl(raw: string | null | undefined): string | undefined {
  if (!raw || !String(raw).trim()) return undefined;
  let path = String(raw).trim();
  if (/^https?:\/\//i.test(path)) return path;

  if (path.startsWith('/products/')) {
    path = path.replace(/^\/products\//, '/api/uploads/products/');
  }

  if (path.startsWith('/api/')) {
    const base = API_URL.replace(/\/$/, '');
    return base ? `${base}${path}` : path;
  }

  if (path.startsWith('/')) return path;
  return path;
}
