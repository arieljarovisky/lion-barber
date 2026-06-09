const MAX_OUTPUT_CHARS = 2.4 * 1024 * 1024;

function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

/** Comprime/redimensiona para subir al backend (máx. ~2 MB en base64). */
export async function prepareProductImageFile(file: File): Promise<string> {
  if (isHeicFile(file)) {
    throw new Error(
      'Las fotos HEIC de iPhone no son compatibles. En Ajustes > Cámara elegí «Más compatible» o exportá la foto como JPG.'
    );
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Elegí una imagen JPG, PNG o WebP');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo abrir la imagen. Probá con JPG o PNG.'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    const maxDim = 1600;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen');

    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.9;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > MAX_OUTPUT_CHARS && quality > 0.45) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > MAX_OUTPUT_CHARS) {
      throw new Error('La imagen es muy pesada. Probá con una foto más chica.');
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Vista previa local antes de comprimir (formulario de producto nuevo). */
export async function readProductImagePreview(file: File): Promise<string> {
  if (isHeicFile(file)) {
    throw new Error(
      'Las fotos HEIC de iPhone no son compatibles. En Ajustes > Cámara elegí «Más compatible» o exportá la foto como JPG.'
    );
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Elegí una imagen JPG, PNG o WebP');
  }
  return prepareProductImageFile(file);
}
