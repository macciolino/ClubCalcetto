/** Max size of a profile photo saved in Firestore (also enforced by firestore.rules). */
export const MAX_AVATAR_CHARS = 150000;

/**
 * Turns a photo chosen from the phone/computer into a small square JPEG (center crop),
 * returned as a data URL to store in the profile. Free: no Firebase Storage needed.
 * Only real photos are accepted (no SVG / preset images).
 */
export async function photoToAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error('Formato non supportato: scegli una foto (JPG, PNG o WebP).');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Impossibile leggere la foto. Prova con un\'altra immagine.'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossibile elaborare la foto.');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    for (const quality of [0.82, 0.7, 0.55]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_AVATAR_CHARS) return dataUrl;
    }
    throw new Error('La foto è troppo pesante, prova con un\'altra.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
