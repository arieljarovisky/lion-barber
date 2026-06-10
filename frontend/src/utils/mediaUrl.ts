const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

/**
 * URL absoluta para archivos subidos al backend (/api/uploads/...).
 * También corrige rutas viejas /products/... guardadas antes de la migración.
 */
export function resolveUploadUrl(
  raw: string | null | undefined,
  cacheKey?: string | number
): string | undefined {
  if (!raw || !String(raw).trim()) return undefined;
  let path = String(raw).trim();
  if (/^https?:\/\//i.test(path)) return path;

  if (path.startsWith('/products/')) {
    path = path.replace(/^\/products\//, '/api/uploads/products/');
  }

  let url: string;
  if (path.startsWith('/api/shop-products/') && path.endsWith('/image')) {
    const base = API_URL.replace(/\/$/, '');
    url = base ? `${base}${path}` : path;
  } else if (path.startsWith('/api/')) {
    const base = API_URL.replace(/\/$/, '');
    url = base ? `${base}${path}` : path;
  } else if (path.startsWith('/')) {
    url = path;
  } else {
    url = path;
  }

  if (cacheKey != null && cacheKey !== '') {
    url += `${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheKey))}`;
  }
  return url;
}
