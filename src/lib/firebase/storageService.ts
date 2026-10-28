import { compressImageToBase64 } from '@/lib/utils/imageCompressor';

/**
 * Carica e ottimizza l'avatar del giocatore.
 * Utilizza la compressione intelligente in Base64 (200x200 px, ~15-20 KB)
 * salvando l'immagine direttamente su Cloud Firestore con il profilo.
 *
 * In questo modo:
 * 1. Non è richiesto alcun piano a pagamento (Blaze) su Firebase Storage.
 * 2. Non è richiesta alcuna carta di credito / fatturazione.
 * 3. Le foto profilo si sincronizzano all'istante su tutti i dispositivi.
 */
export async function uploadPlayerAvatar(playerId: string, file: File): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Upload disponibile solo nel browser');
  }

  // Comprime a 200x200 pixel quadrato con qualità ottimale per Firestore
  const compressedBase64 = await compressImageToBase64(file, 200, 0.82);
  return compressedBase64;
}
