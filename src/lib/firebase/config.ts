import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

/**
 * LOCAL EMULATOR MODE
 * Enabled ONLY when NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' (set by `npm run dev:emulators`).
 * In this mode the app uses the fake project "demo-clubcalcetto" and connects to the local
 * Auth/Firestore emulators: it can never reach the production database.
 * Production (Vercel) never sets this variable, so its behaviour is unchanged.
 */
export const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

const firebaseConfig = useEmulators
  ? {
      apiKey: 'emulator-local-key',
      authDomain: 'localhost',
      projectId: 'demo-clubcalcetto',
      storageBucket: 'demo-clubcalcetto.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:emulator',
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'club-calcetto.firebaseapp.com',
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'club-calcetto',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'club-calcetto.appspot.com',
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:abcdef',
    };

// Inizializza Firebase solo se non è già presente un'istanza
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth: Auth = getAuth(app);
export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// Collega gli emulatori una sola volta (anche con hot reload)
if (useEmulators) {
  const g = globalThis as unknown as { __ccEmulatorsConnected?: boolean };
  if (!g.__ccEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    g.__ccEmulatorsConnected = true;
  }
}

export const isFirebaseConfigured =
  useEmulators ||
  Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.includes('demo')
  );

export default app;
