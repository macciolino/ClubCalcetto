/**
 * Comprime e ritaglia un'immagine caricata dall'utente in un avatar quadrato (200x200 px),
 * restituendo una stringa Base64 JPEG leggera (~15-25 KB).
 * Questo permette di salvare le foto profilo direttamente in Cloud Firestore
 * SENZA bisogno di attivare Firebase Storage a pagamento (piano Blaze) o inserire carte di credito!
 */
export function compressImageToBase64(file: File, maxSize = 200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Il file selezionato non è un\'immagine valida'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Errore durante la lettura del file'));
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Dati immagine non validi'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Errore durante il caricamento dell\'immagine'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = img.width;
          const height = img.height;

          // Calcola il ritaglio centrato quadrato (1:1)
          const minDim = Math.min(width, height);
          const startX = (width - minDim) / 2;
          const startY = (height - minDim) / 2;

          canvas.width = maxSize;
          canvas.height = maxSize;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          // Disegna l'immagine ritagliata e scalata
          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, maxSize, maxSize);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
