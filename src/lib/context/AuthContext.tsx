'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Profile, UserRole, FieldPosition } from '@/types/database';
import { updateStoredPlayer, addStoredPlayer, getStoredPlayers } from '@/lib/services/playerService';
import { getStoredCategories } from '@/lib/services/statCategoryService';
import { auth as firebaseAuth, googleProvider, isFirebaseConfigured, db } from '@/lib/firebase/config';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  reload,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * SECURITY MODEL
 * - Identity comes ONLY from Firebase Auth (no local / simulated logins).
 * - The super admin is the verified account SUPER_ADMIN_EMAIL; its profile document is 'p-1'.
 * - Other admins are profiles with role === 'admin', promoted only by the super admin.
 * - Everything here is UI logic: the real enforcement is in firestore.rules.
 */
export const SUPER_ADMIN_PROFILE_ID = 'p-1';
export const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';

// Backward-compatible aliases
export const MARCO_ADMIN_ID = SUPER_ADMIN_PROFILE_ID;
export const MARCO_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;

export function isSuperAdminEmail(email?: string | null): boolean {
  return (email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}

function profileDocIdFor(fbUser: FirebaseUser): string {
  return isSuperAdminEmail(fbUser.email) ? SUPER_ADMIN_PROFILE_ID : fbUser.uid;
}

function normalizeRole(rawRole: unknown, email?: string | null): UserRole {
  if (isSuperAdminEmail(email)) return 'admin';
  return rawRole === 'admin' ? 'admin' : 'player';
}

function defaultStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  getStoredCategories().forEach((cat) => {
    stats[cat.name] = cat.default_value ?? 6;
  });
  return stats;
}

function buildNewProfile(
  fbUser: FirebaseUser,
  fullName?: string | null,
  position?: FieldPosition
): Profile {
  const stats = defaultStats();
  const values = Object.values(stats);
  const ovr = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : 6;
  const now = new Date().toISOString();
  return {
    id: profileDocIdFor(fbUser),
    user_id: fbUser.uid,
    email: fbUser.email,
    full_name:
      (fullName && fullName.trim()) ||
      fbUser.displayName ||
      (fbUser.email ? fbUser.email.split('@')[0] : 'Giocatore'),
    avatar_url: fbUser.photoURL || null,
    role: isSuperAdminEmail(fbUser.email) ? 'admin' : 'player',
    position: position || 'Esterno',
    is_guest: false,
    stats,
    overall_rating: ovr,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    created_at: now,
    updated_at: now,
  };
}

// UI-only cookies read by src/proxy.ts for routing (NOT a security boundary)
function setRoutingCookies(profile: Profile | null) {
  if (typeof document === 'undefined') return;
  try {
    if (profile) {
      const role = profile.role === 'admin' ? 'admin' : 'player';
      document.cookie = `user_role=${role}; path=/; max-age=604800; SameSite=Lax`;
      document.cookie = 'cc_session=1; path=/; max-age=604800; SameSite=Lax';
    } else {
      document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'cc_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }
    // Remove legacy cookie/keys from the old simulated-login system
    document.cookie = 'demo_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    localStorage.removeItem('clubcalcetto_active_user');
    localStorage.removeItem('clubcalcetto_active_profile');
    localStorage.removeItem('clubcalcetto_email_verified_bypass');
  } catch {
    /* ignore */
  }
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isEmailVerified: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmailPassword: (email: string, password: string, fullName: string, position?: FieldPosition) => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updatedData: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'position'>>) => Promise<void>;
  authProvider: 'firebase' | 'local';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [verifiedTick, setVerifiedTick] = useState(0);

  // Name/position typed in the sign-up form, used when the profile document is first created
  const pendingSignUp = useRef<{ fullName?: string; position?: FieldPosition } | null>(null);

  /** Loads (or creates on first login) the profile document of the signed-in user. */
  const syncProfile = async (fbUser: FirebaseUser): Promise<Profile | null> => {
    const docId = profileDocIdFor(fbUser);
    const docRef = doc(db, 'profiles', docId);
    try {
      const snap = await getDoc(docRef);
      let resolved: Profile;
      if (snap.exists()) {
        const data = snap.data() as Profile;
        if (data.deactivated_at) {
          await firebaseSignOut(firebaseAuth);
          alert('Questo account è stato disattivato. Per riattivarlo contatta l’amministratore del club.');
          return null;
        }
        resolved = {
          ...data,
          id: docId,
          role: normalizeRole(data.role, fbUser.email),
          position: data.position || 'Esterno',
        };
        updateStoredPlayer(resolved);
      } else {
        const pending = pendingSignUp.current;
        resolved = buildNewProfile(fbUser, pending?.fullName, pending?.position);
        await setDoc(docRef, resolved);
        addStoredPlayer(resolved);
      }
      pendingSignUp.current = null;
      setProfile(resolved);
      setRoutingCookies(resolved);
      return resolved;
    } catch (e) {
      console.warn('Firestore sync profile warning:', e);
      return null;
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }
    let mounted = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (!mounted) return;
      if (fbUser) {
        setUser(fbUser);
        await syncProfile(fbUser);
      } else {
        setUser(null);
        setProfile(null);
        setRoutingCookies(null);
      }
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the profile in sync when the local players cache changes (e.g. an admin edits stats)
  useEffect(() => {
    const handlePlayersChanged = () => {
      if (!profile) return;
      const found = getStoredPlayers().find((p) => p.id === profile.id);
      if (!found) return;
      if (JSON.stringify(found) === JSON.stringify(profile)) return;
      const updated: Profile = {
        ...profile,
        ...found,
        id: profile.id,
        role: normalizeRole(found.role, user?.email),
      };
      setProfile(updated);
      setRoutingCookies(updated);
    };
    window.addEventListener('clubcalcetto_players_changed', handlePlayersChanged);
    return () => window.removeEventListener('clubcalcetto_players_changed', handlePlayersChanged);
  }, [profile, user]);

  const isEmailVerified: boolean = Boolean(
    user &&
      (user.emailVerified || user.providerData?.some((p) => p.providerId === 'google.com'))
  );
  void verifiedTick; // re-render trigger after checkEmailVerification

  const ensureConfigured = () => {
    if (!isFirebaseConfigured) {
      throw new Error('Firebase non è configurato: impossibile effettuare il login.');
    }
  };

  const signInWithGoogle = async () => {
    ensureConfigured();
    setIsLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      setUser(result.user);
      await syncProfile(result.user);
      window.location.href = '/presenze';
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithEmailPassword = async (
    email: string,
    pass: string,
    fullName: string,
    position: FieldPosition = 'Esterno'
  ) => {
    ensureConfigured();
    setIsLoading(true);
    try {
      pendingSignUp.current = { fullName: fullName.trim(), position };
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), pass);
      try {
        await sendEmailVerification(cred.user);
      } catch (emailErr) {
        console.warn('Impossibile inviare email di verifica:', emailErr);
      }
      setUser(cred.user);
      await syncProfile(cred.user);
    } catch (err) {
      pendingSignUp.current = null;
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmailPassword = async (email: string, pass: string) => {
    ensureConfigured();
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim(), pass);
      setUser(cred.user);
      await syncProfile(cred.user);
      window.location.href = '/presenze';
    } finally {
      setIsLoading(false);
    }
  };

  const sendVerificationEmail = async () => {
    if (firebaseAuth.currentUser) {
      await sendEmailVerification(firebaseAuth.currentUser);
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    const current = firebaseAuth.currentUser;
    if (!current) return false;
    try {
      await reload(current);
      // Refresh the ID token so Firestore rules see email_verified = true
      await current.getIdToken(true);
      setUser(firebaseAuth.currentUser);
      setVerifiedTick((t) => t + 1);
      return Boolean(current.emailVerified);
    } catch (err) {
      console.warn('Errore checkEmailVerification:', err);
      return false;
    }
  };

  const signOut = async () => {
    try {
      if (isFirebaseConfigured) await firebaseSignOut(firebaseAuth);
    } catch (e) {
      console.warn('Firebase signOut error:', e);
    }
    setUser(null);
    setProfile(null);
    setRoutingCookies(null);
    window.location.href = '/login';
  };

  const refreshProfile = async () => {
    if (firebaseAuth.currentUser) {
      await syncProfile(firebaseAuth.currentUser);
    }
  };

  /** Self-service edit: only name, avatar and field position (enforced by firestore.rules too). */
  const updateProfile = async (
    updatedData: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'position'>>
  ) => {
    if (!profile) return;
    const patch: Partial<Profile> = { updated_at: new Date().toISOString() };
    if (updatedData.full_name !== undefined) patch.full_name = updatedData.full_name || profile.full_name;
    if (updatedData.avatar_url !== undefined) patch.avatar_url = updatedData.avatar_url;
    if (updatedData.position !== undefined) patch.position = updatedData.position || profile.position || 'Esterno';

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'profiles', profile.id), patch, { merge: true });
    }
    const merged: Profile = { ...profile, ...patch };
    setProfile(merged);
    updateStoredPlayer(merged);
  };

  const isSuperAdmin = Boolean(user && user.emailVerified && isSuperAdminEmail(user.email));
  const isAdmin = Boolean(user && (isSuperAdmin || profile?.role === 'admin'));
  const authProvider = isFirebaseConfigured ? 'firebase' : 'local';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isSuperAdmin,
        isLoading,
        isEmailVerified,
        signInWithGoogle,
        signUpWithEmailPassword,
        signInWithEmailPassword,
        sendVerificationEmail,
        checkEmailVerification,
        signOut,
        refreshProfile,
        updateProfile,
        authProvider,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve essere utilizzato all’interno di un AuthProvider');
  }
  return context;
}
