import { cert, getApp, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Firebase Admin SDK, used ONLY on the server (Vercel API routes) to send push notifications.
 * Credentials come from a service account, set as environment variables on Vercel:
 *   FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY
 * They are secret: never NEXT_PUBLIC_, never committed.
 */
/**
 * TESTS ONLY: when the Firestore emulator is running (FIRESTORE_EMULATOR_HOST set by `firebase emulators:exec`),
 * the Admin SDK talks to the local emulators of the fake project "demo-clubcalcetto", without credentials.
 * Vercel never sets that variable, so production always uses the real service account below.
 */
const onEmulator = () => Boolean(process.env.FIRESTORE_EMULATOR_HOST) && process.env.NODE_ENV !== 'production';

export function isAdminConfigured(): boolean {
  if (onEmulator()) return true;
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );
}

function adminApp(): App {
  if (getApps().length) return getApp();
  if (onEmulator()) return initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-clubcalcetto' });
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel stores the key on one line with literal \n
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
export const adminMessaging = () => getMessaging(adminApp());
