/** Reduce y comprime una foto (ticket) a JPEG. */
export async function compressImage(file: Blob, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen.'))), 'image/jpeg', quality),
  );
}

/** Comprime hasta quedar por debajo de `maxBytes` (para guardarla dentro de un documento). */
export async function compressToDataUrl(file: Blob, maxBytes: number): Promise<string> {
  const attempts: [number, number][] = [[1400, 0.75], [1200, 0.65], [1000, 0.6], [800, 0.55], [640, 0.5]];
  for (const [side, q] of attempts) {
    const blob = await compressImage(file, side, q);
    if (blob.size * 1.37 < maxBytes) return blobToDataUrl(blob);
  }
  throw new Error('La foto es demasiado grande incluso comprimida.');
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('No se pudo leer la imagen.'));
    r.readAsDataURL(blob);
  });
}
