import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseConfigured } from './config';

export async function uploadPlayerAvatar(playerId: string, file: File): Promise<string> {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    throw new Error('Firebase Storage non è configurato');
  }

  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `avatars/${playerId}-${Date.now()}.${fileExt}`;
  const storageRef = ref(storage, fileName);

  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg',
  });

  const downloadUrl = await getDownloadURL(snapshot.ref);
  return downloadUrl;
}
