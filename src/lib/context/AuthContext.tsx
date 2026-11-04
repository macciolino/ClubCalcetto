'use client';

import React, { createContext, useContext, useEffect, useState, useTransition } from 'react';
import { Profile, UserRole, FieldPosition } from '@/types/database';
import { updateStoredPlayer, getStoredPlayers, addStoredPlayer, findPlayerByAuth } from '@/lib/services/playerService';
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

export const MARCO_ADMIN_ID = 'p-1';
export const MARCO_ADMIN_EMAIL = 'macciolino84@gmail.com';

export interface SimpleUser {
  id: string;
  uid?: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  emailVerified?: boolean;
}

export const MARCO_ADMIN_USER: SimpleUser = {
  id: MARCO_ADMIN_ID,
  uid: MARCO_ADMIN_ID,
  email: MARCO_ADMIN_EMAIL,
  displayName: 'Marco B.',
  photoURL: null,
  emailVerified: true,
};

export const MARCO_ADMIN_PROFILE: Profile = {
  id: MARCO_ADMIN_ID,
  user_id: MARCO_ADMIN_ID,
  email: MARCO_ADMIN_EMAIL,
  full_name: 'Marco B.',
  avatar_url: null,
  role: 'admin',
  position: 'Esterno',
  is_guest: false,
  stats: {
    Resistenza: 8,
    Velocità: 8,
    Difesa: 7,
    Tiro: 8,
    Passaggio: 8,
    Tecnica: 9,
    Fisico: 7,
    Dribbling: 8,
  },
  overall_rating: 7.9,
  matches_won: 15,
  matches_drawn: 4,
  matches_lost: 5,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};

export const GUEST_REGULAR_USER: SimpleUser = {
  id: 'guest-regular-user',
  uid: 'guest-regular-user',
  email: 'ospite@clubcalcetto.it',
  displayName: 'Giocatore Ospite',
  photoURL: null,
  emailVerified: true,
};

export const GUEST_REGULAR_PROFILE: Profile = {
  id: 'guest-regular-user',
  user_id: 'guest-regular-user',
  email: 'ospite@clubcalcetto.it',
  full_name: 'Giocatore Ospite',
  avatar_url: null,
  role: 'player',
  position: 'Esterno',
  is_guest: false,
  stats: {
    Resistenza: 6,
    Velocità: 6,
    Difesa: 6,
    Tiro: 6,
    Passaggio: 6,
    Tecnica: 6,
    Fisico: 6,
    Dribbling: 6,
  },
  overall_rating: 6.0,
  matches_won: 6,
  matches_drawn: 2,
  matches_lost: 4,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function determineRoleAndName(
  email?: string | null,
  fallbackName?: string | null
): { role: UserRole; name: string } {
  const cleanEmail = (email || '').toLowerCase().trim();
  const isMacciolino = cleanEmail.includes('macciolino84');
  if (isMacciolino) {
    return { role: 'admin', name: 'Marco B.' };
  }
  return {
    role: 'player',
    name: fallbackName || (email ? email.split('@')[0] : 'Giocatore'),
  };
}

export function resolveProfileForUser(
  authId: string,
  authEmail?: string | null,
  authName?: string | null,
  authAvatar?: string | null,
  tacticalPosition?: FieldPosition
): Profile {
  const { role, name } = determineRoleAndName(authEmail, authName);
  const isMarco = role === 'admin' || (authEmail && authEmail.toLowerCase().includes('macciolino84'));
  const found = findPlayerByAuth(authId, authEmail);

  if (found) {
    return {
      ...found,
      id: isMarco ? 'p-1' : found.id,
      user_id: authId,
      email: authEmail || found.email,
      full_name: isMarco ? 'Marco B.' : (found.full_name || name),
      avatar_url: found.avatar_url || authAvatar || null,
      role: isMarco ? 'admin' : (found.role === 'admin' ? 'admin' : 'player'),
      position: found.position || tacticalPosition || 'Esterno',
      matches_won: found.matches_won ?? (isMarco ? 15 : 0),
      matches_drawn: found.matches_drawn ?? (isMarco ? 4 : 0),
      matches_lost: found.matches_lost ?? (isMarco ? 5 : 0),
      stats: found.stats || (isMarco ? MARCO_ADMIN_PROFILE.stats : GUEST_REGULAR_PROFILE.stats),
      overall_rating: found.overall_rating ?? (isMarco ? 7.9 : 6.0),
    };
  }

  // Nuovo utente registrato: default role 'player'
  const newPlayer: Profile = {
    id: isMarco ? 'p-1' : authId,
    user_id: authId,
    email: authEmail || (isMarco ? MARCO_ADMIN_EMAIL : 'giocatore@clubcalcetto.it'),
    full_name: isMarco ? 'Marco B.' : name,
    avatar_url: authAvatar || null,
    role: isMarco ? 'admin' : 'player',
    position: tacticalPosition || 'Esterno',
    is_guest: false,
    stats: isMarco ? MARCO_ADMIN_PROFILE.stats : GUEST_REGULAR_PROFILE.stats,
    overall_rating: isMarco ? 7.9 : 6.0,
    matches_won: isMarco ? 15 : 0,
    matches_drawn: isMarco ? 4 : 0,
    matches_lost: isMarco ? 5 : 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  addStoredPlayer(newPlayer);
  return newPlayer;
}

const STORAGE_KEY_USER = 'clubcalcetto_active_user';
const STORAGE_KEY_PROFILE = 'clubcalcetto_active_profile';
const STORAGE_KEY_LOCAL_VERIFIED = 'clubcalcetto_email_verified_bypass';

function saveLocalSession(user: any, profile: Profile) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
      document.cookie = 'demo_session=true; path=/; max-age=604800';
    } catch (e) {
      console.warn('Storage save error:', e);
    }
  }
}

function clearLocalSession() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_PROFILE);
      localStorage.removeItem(STORAGE_KEY_LOCAL_VERIFIED);
      document.cookie = 'demo_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch (e) {
      console.warn('Storage clear error:', e);
    }
  }
}

function getLocalSession(): { user: any; profile: Profile } | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawUser = localStorage.getItem(STORAGE_KEY_USER);
    const rawProfile = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (rawUser && rawProfile) {
      const parsedUser = JSON.parse(rawUser);
      const parsedProfile = JSON.parse(rawProfile);
      const { role, name } = determineRoleAndName(parsedProfile.email || parsedUser.email, parsedProfile.full_name);
      return {
        user: parsedUser,
        profile: {
          ...parsedProfile,
          role: parsedProfile.role === 'admin' ? 'admin' : role,
          full_name: (role === 'admin' && parsedProfile.email?.includes('macciolino84')) ? 'Marco B.' : (parsedProfile.full_name || name),
        },
      };
    }
  } catch (e) {
    console.warn('Storage read error:', e);
  }
  return null;
}

interface AuthContextType {
  user: FirebaseUser | SimpleUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  isEmailVerified: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmailPassword: (email: string, password: string, fullName: string, position?: FieldPosition) => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  simulateEmailVerification: () => void;
  loginAsMarcoAdmin: () => void;
  loginAsGuestUser: () => void;
  loginAsPlayer: (player: Profile) => void;
  loginWithEmail: (email: string, name?: string) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updatedData: Partial<Profile>) => Promise<void>;
  setMockRole?: (role: 'player' | 'admin' | 'user') => void;
  authProvider: 'firebase' | 'local';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | SimpleUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [localVerifiedBypass, setLocalVerifiedBypass] = useState<boolean>(false);

  const syncProfileWithFirestore = async (fbUser: FirebaseUser) => {
    if (!isFirebaseConfigured) return;
    try {
      const isMarco = (fbUser.email || '').toLowerCase().includes('macciolino84');
      const docRef = doc(db, 'profiles', isMarco ? 'p-1' : fbUser.uid);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const firestoreData = snap.data() as Profile;
        const resolved = resolveProfileForUser(
          fbUser.uid,
          fbUser.email,
          firestoreData.full_name || fbUser.displayName,
          firestoreData.avatar_url || fbUser.photoURL,
          firestoreData.position
        );
        const merged: Profile = {
          ...resolved,
          ...firestoreData,
          id: isMarco ? 'p-1' : firestoreData.id || fbUser.uid,
          role: isMarco ? 'admin' : (firestoreData.role === 'admin' ? 'admin' : 'player'),
          position: firestoreData.position || resolved.position || 'Esterno',
          full_name: isMarco ? 'Marco B.' : (firestoreData.full_name || resolved.full_name),
        };
        setProfile(merged);
        saveLocalSession(fbUser, merged);
      } else {
        const newProf = resolveProfileForUser(
          fbUser.uid,
          fbUser.email,
          fbUser.displayName,
          fbUser.photoURL
        );
        await setDoc(docRef, newProf, { merge: true });
        setProfile(newProf);
        saveLocalSession(fbUser, newProf);
      }
    } catch (e) {
      console.warn('Firestore sync profile warning:', e);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Ripristina prima dal localStorage
    const local = getLocalSession();
    if (local && mounted) {
      setUser(local.user);
      setProfile(local.profile);
    }
    if (typeof window !== 'undefined') {
      const bypass = localStorage.getItem(STORAGE_KEY_LOCAL_VERIFIED) === 'true';
      if (bypass && mounted) {
        setLocalVerifiedBypass(true);
      }
    }

    // 2. Ascolta Firebase Auth se configurato
    let unsubscribeFirebase: (() => void) | undefined;
    if (isFirebaseConfigured) {
      try {
        unsubscribeFirebase = onAuthStateChanged(firebaseAuth, async (fbUser) => {
          if (!mounted) return;
          if (fbUser) {
            const fbProfile = resolveProfileForUser(
              fbUser.uid,
              fbUser.email,
              fbUser.displayName,
              fbUser.photoURL
            );
            setUser(fbUser);
            setProfile(fbProfile);
            saveLocalSession(fbUser, fbProfile);
            await syncProfileWithFirestore(fbUser);
          }
        });
      } catch (e) {
        console.warn('Firebase listener error:', e);
      }
    }

    return () => {
      mounted = false;
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, []);

  // Sincronizzazione locale quando un giocatore o le statistiche cambiano
  useEffect(() => {
    const handlePlayersChanged = () => {
      const currentAuthId = (user as any)?.uid || (user as any)?.id;
      const currentEmail = (user as any)?.email;
      if (!currentAuthId && !currentEmail) return;

      const found = findPlayerByAuth(currentAuthId, currentEmail);
      if (found) {
        setProfile((prev) => {
          if (!prev) return found;
          if (
            prev.full_name !== found.full_name ||
            prev.avatar_url !== found.avatar_url ||
            prev.overall_rating !== found.overall_rating ||
            prev.matches_won !== found.matches_won ||
            prev.matches_drawn !== found.matches_drawn ||
            prev.matches_lost !== found.matches_lost ||
            prev.position !== found.position ||
            prev.role !== found.role ||
            JSON.stringify(prev.stats) !== JSON.stringify(found.stats)
          ) {
            const isMarco =
              prev.email?.toLowerCase().includes('macciolino84') ||
              found.email?.toLowerCase().includes('macciolino84');
            const updated: Profile = {
              ...prev,
              ...found,
              id: isMarco ? 'p-1' : found.id,
              role: isMarco ? 'admin' : (found.role || prev.role || 'player'),
              position: found.position || prev.position || 'Esterno',
              full_name: isMarco ? 'Marco B.' : found.full_name,
            };
            saveLocalSession(user, updated);
            return updated;
          }
          return prev;
        });
      }
    };

    window.addEventListener('clubcalcetto_players_changed', handlePlayersChanged);
    return () => {
      window.removeEventListener('clubcalcetto_players_changed', handlePlayersChanged);
    };
  }, [user]);

  // Controlla stato di verifica email
  const isEmailVerified: boolean = Boolean(
    // Se è Marco super admin
    user?.email?.toLowerCase().includes('macciolino84') ||
    // Se bypass locale abilitato per test rapido
    localVerifiedBypass ||
    // Se utente Google (providerData include google.com)
    (user as any)?.providerData?.some((p: any) => p.providerId === 'google.com') ||
    // Se Firebase flag emailVerified è true
    (user as any)?.emailVerified === true
  );

  const simulateEmailVerification = () => {
    setLocalVerifiedBypass(true);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_LOCAL_VERIFIED, 'true');
      } catch {}
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    if (!firebaseAuth.currentUser) return isEmailVerified;
    try {
      await reload(firebaseAuth.currentUser);
      const isVerified = Boolean(firebaseAuth.currentUser.emailVerified);
      if (isVerified) {
        setUser({ ...firebaseAuth.currentUser });
      }
      return isVerified;
    } catch (err) {
      console.warn('Errore checkEmailVerification:', err);
      return isEmailVerified;
    }
  };

  const sendVerificationEmail = async () => {
    if (firebaseAuth.currentUser) {
      await sendEmailVerification(firebaseAuth.currentUser);
    }
  };

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      if (isFirebaseConfigured) {
        const result = await signInWithPopup(firebaseAuth, googleProvider);
        const fbUser = result.user;
        const newProfile = resolveProfileForUser(
          fbUser.uid,
          fbUser.email,
          fbUser.displayName,
          fbUser.photoURL
        );
        setUser(fbUser);
        setProfile(newProfile);
        saveLocalSession(fbUser, newProfile);
        await syncProfileWithFirestore(fbUser);
        if (typeof window !== 'undefined') {
          window.location.href = '/presenze';
        }
        return;
      }
    } catch (err: unknown) {
      console.warn('Firebase popup fallito:', err);
      throw err;
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
    setIsLoading(true);
    try {
      let fbUser: any;
      if (isFirebaseConfigured) {
        try {
          const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), pass);
          fbUser = cred.user;
          // Invia email di verifica richiesta dal punto 5
          try {
            await sendEmailVerification(fbUser);
          } catch (emailErr) {
            console.warn('Impossibile inviare email di verifica:', emailErr);
          }
        } catch (firebaseErr: any) {
          if (firebaseErr?.code === 'auth/operation-not-allowed' || firebaseErr?.message?.includes('operation-not-allowed')) {
            console.warn('Firebase auth/operation-not-allowed: Email/Password non è ancora abilitato nella console Firebase. Modalità locale attivata per consentire il test.');
            const cleanEmail = email.trim().toLowerCase();
            const localUid = `u-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
            fbUser = {
              id: localUid,
              uid: localUid,
              email: cleanEmail,
              displayName: fullName.trim(),
              photoURL: null,
              emailVerified: false,
            };
          } else {
            throw firebaseErr;
          }
        }
      } else {
        const cleanEmail = email.trim().toLowerCase();
        const localUid = `u-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
        fbUser = {
          id: localUid,
          uid: localUid,
          email: cleanEmail,
          displayName: fullName.trim(),
          photoURL: null,
          emailVerified: false,
        };
      }

      const newProfile = resolveProfileForUser(
        fbUser.uid || fbUser.id,
        fbUser.email,
        fullName.trim(),
        null,
        position
      );

      setUser(fbUser);
      setProfile(newProfile);
      saveLocalSession(fbUser, newProfile);
      if (isFirebaseConfigured && fbUser.uid && !fbUser.uid.startsWith('u-')) {
        await syncProfileWithFirestore(fbUser);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmailPassword = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      let fbUser: any;
      if (isFirebaseConfigured) {
        try {
          const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim(), pass);
          fbUser = cred.user;
        } catch (firebaseErr: any) {
          if (firebaseErr?.code === 'auth/operation-not-allowed' || firebaseErr?.message?.includes('operation-not-allowed')) {
            console.warn('Firebase auth/operation-not-allowed: Login con fallback locale.');
            const cleanEmail = email.trim().toLowerCase();
            const isMarco = cleanEmail.includes('macciolino84');
            const localUid = isMarco ? 'p-1' : `u-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
            const existing = findPlayerByAuth(localUid, cleanEmail);
            fbUser = {
              id: localUid,
              uid: localUid,
              email: cleanEmail,
              displayName: existing?.full_name || (isMarco ? 'Marco B.' : cleanEmail.split('@')[0]),
              photoURL: existing?.avatar_url || null,
              emailVerified: true,
            };
          } else {
            throw firebaseErr;
          }
        }
      } else {
        const cleanEmail = email.trim().toLowerCase();
        const isMarco = cleanEmail.includes('macciolino84');
        const localUid = isMarco ? 'p-1' : `u-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
        const existing = findPlayerByAuth(localUid, cleanEmail);
        fbUser = {
          id: localUid,
          uid: localUid,
          email: cleanEmail,
          displayName: existing?.full_name || (isMarco ? 'Marco B.' : cleanEmail.split('@')[0]),
          photoURL: existing?.avatar_url || null,
          emailVerified: true,
        };
      }

      const resolved = resolveProfileForUser(
        fbUser.uid || fbUser.id,
        fbUser.email,
        fbUser.displayName,
        fbUser.photoURL
      );
      setUser(fbUser);
      setProfile(resolved);
      saveLocalSession(fbUser, resolved);
      if (isFirebaseConfigured && fbUser.uid && !fbUser.uid.startsWith('u-')) {
        await syncProfileWithFirestore(fbUser);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/presenze';
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsMarcoAdmin = () => {
    const adminProf = resolveProfileForUser('p-1', MARCO_ADMIN_EMAIL, 'Marco B.', null, 'Esterno');
    setUser(MARCO_ADMIN_USER);
    setProfile(adminProf);
    saveLocalSession(MARCO_ADMIN_USER, adminProf);
    if (typeof window !== 'undefined') {
      window.location.href = '/presenze';
    }
  };

  const loginAsGuestUser = () => {
    const guestProf = resolveProfileForUser('guest-regular-user', 'ospite@clubcalcetto.it', 'Giocatore Ospite', null, 'Esterno');
    setUser(GUEST_REGULAR_USER);
    setProfile(guestProf);
    saveLocalSession(GUEST_REGULAR_USER, guestProf);
    if (typeof window !== 'undefined') {
      window.location.href = '/presenze';
    }
  };

  const loginAsPlayer = (player: Profile) => {
    const isMarco = (player.email || '').toLowerCase().includes('macciolino84') || player.id === 'p-1';
    const simpleUser: SimpleUser = {
      id: player.id,
      uid: player.id,
      email: player.email,
      displayName: player.full_name,
      photoURL: player.avatar_url,
      emailVerified: true,
    };
    const playerProf: Profile = {
      ...player,
      role: isMarco ? 'admin' : (player.role === 'admin' ? 'admin' : 'player'),
      full_name: isMarco ? 'Marco B.' : player.full_name,
    };
    setUser(simpleUser);
    setProfile(playerProf);
    saveLocalSession(simpleUser, playerProf);
    if (typeof window !== 'undefined') {
      window.location.href = '/presenze';
    }
  };

  const loginWithEmail = (email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const isMarco = cleanEmail.includes('macciolino84');
    const authId = isMarco ? 'p-1' : `user-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
    const userObj: SimpleUser = {
      id: authId,
      uid: authId,
      email: cleanEmail,
      displayName: isMarco ? 'Marco B.' : (name || cleanEmail.split('@')[0]),
      photoURL: null,
      emailVerified: true,
    };
    const resolved = resolveProfileForUser(authId, cleanEmail, userObj.displayName);
    setUser(userObj);
    setProfile(resolved);
    saveLocalSession(userObj, resolved);
    if (typeof window !== 'undefined') {
      window.location.href = '/presenze';
    }
  };

  const signOut = async () => {
    clearLocalSession();
    try {
      if (isFirebaseConfigured) {
        await firebaseSignOut(firebaseAuth);
      }
    } catch (e) {
      console.warn('Firebase signOut error:', e);
    }
    setUser(null);
    setProfile(null);
    setLocalVerifiedBypass(false);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const refreshProfile = async () => {
    const currentId = (user as any)?.uid || (user as any)?.id;
    if (currentId && isFirebaseConfigured) {
      try {
        const snap = await getDoc(doc(db, 'profiles', currentId));
        if (snap.exists()) {
          const data = snap.data() as Profile;
          setProfile(data);
          saveLocalSession(user, data);
        }
      } catch (e) {
        console.warn('refreshProfile error:', e);
      }
    }
  };

  const updateProfile = async (updatedData: Partial<Profile>) => {
    if (!profile) return;
    const isMarco = profile.email?.toLowerCase().includes('macciolino84') || profile.id === 'p-1';
    const merged: Profile = {
      ...profile,
      ...updatedData,
      id: isMarco ? 'p-1' : profile.id,
      role: isMarco ? 'admin' : (profile.role === 'admin' ? 'admin' : 'player'),
      position: updatedData.position || profile.position || 'Esterno',
      full_name: isMarco ? (updatedData.full_name || 'Marco B.') : (updatedData.full_name || profile.full_name),
      updated_at: new Date().toISOString(),
    };
    setProfile(merged);
    saveLocalSession(user, merged);
    updateStoredPlayer(merged);

    try {
      if (isFirebaseConfigured && merged.id) {
        await setDoc(doc(db, 'profiles', merged.id), merged, { merge: true });
      }
    } catch (err) {
      console.warn('Sync Firebase updateProfile warning:', err);
    }
  };

  const [mockRole, setMockRoleState] = useState<'player' | 'admin' | 'user' | null>(null);

  const setMockRole = (role: 'player' | 'admin' | 'user') => {
    setMockRoleState(role);
    if (profile) {
      const normalizedRole: UserRole = role === 'admin' ? 'admin' : 'player';
      const updated: Profile = { ...profile, role: normalizedRole };
      setProfile(updated);
      saveLocalSession(user, updated);
    }
  };

  const isSuperAdminEmail = Boolean(
    (user?.email && user.email.toLowerCase().includes('macciolino84')) ||
    (profile?.email && profile.email.toLowerCase().includes('macciolino84'))
  );

  const isAdmin = (mockRole === 'player' || mockRole === 'user')
    ? false
    : mockRole === 'admin'
    ? true
    : Boolean(profile?.role === 'admin' || isSuperAdminEmail);

  const authProvider = isFirebaseConfigured ? 'firebase' : 'local';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isLoading,
        isEmailVerified,
        signInWithGoogle,
        signUpWithEmailPassword,
        signInWithEmailPassword,
        sendVerificationEmail,
        checkEmailVerification,
        simulateEmailVerification,
        loginAsMarcoAdmin,
        loginAsGuestUser,
        loginAsPlayer,
        loginWithEmail,
        signOut,
        refreshProfile,
        updateProfile,
        setMockRole,
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
