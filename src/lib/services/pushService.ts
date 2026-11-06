'use client';

import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase/config';

let vapidKeyCache: string | null = null;
/** Public VAPID key: read from the server (/api/push-config), so it needs no NEXT_PUBLIC_ variable. */
async function getVapidKey(): Promise<string> {
  if (vapidKeyCache !== null) return vapidKeyCache;
  try {
    const res = await fetch('/api/push-config', { cache: 'no-store' });
    vapidKeyCache = ((await res.json()) as { vapidKey?: string }).vapidKey || '';
  } catch {
    return '';
  }
  return vapidKeyCache;
}
const TOKEN_KEY = 'clubcalcetto_push_token';

export type PushStatus = 'unsupported' | 'not_configured' | 'needs_install' | 'denied' | 'off' | 'on';

const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Current state of notifications on THIS device. */
export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIos() && !isStandalone() ? 'needs_install' : 'unsupported';
  }
  if (!isFirebaseConfigured || !(await getVapidKey())) return 'not_configured';
  if (!(await isSupported().catch(() => false))) return isIos() && !isStandalone() ? 'needs_install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && savedToken() ? 'on' : 'off';
}

/** Asks permission and registers this device to receive ClubCalcetto notifications. */
export async function enablePush(profileId: string): Promise<PushStatus> {
  const status = await getPushStatus();
  if (status === 'unsupported' || status === 'not_configured' || status === 'needs_install' || status === 'denied') {
    return status;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(getApp()), { vapidKey: await getVapidKey(), serviceWorkerRegistration: registration });
  const uid = auth.currentUser?.uid;
  if (!token || !uid) return 'off';

  await setDoc(doc(db, 'push_tokens', token), {
    uid,
    profile_id: profileId,
    platform: isIos() ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop',
    updated_at: serverTimestamp(),
  });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
  return 'on';
}

/** Stops notifications on this device. */
export async function disablePush(): Promise<void> {
  const token = savedToken();
  try {
    if (token) await deleteDoc(doc(db, 'push_tokens', token));
    await deleteToken(getMessaging(getApp()));
  } catch (err) {
    console.warn('[Push] disattivazione:', err);
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Calls the server route that sends notifications (signed with the user's Firebase ID token). */
export async function callNotifyApi(body: Record<string, unknown>): Promise<{ ok: boolean; [k: string]: unknown }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'unauthenticated' };
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: 'bad_response' }));
}
