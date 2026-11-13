import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { adminProfileIds, sendToProfiles } from '@/lib/server/push';

export const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';

/**
 * Requests for the admins (collection `admin_requests`, written ONLY by the server; admins read them in the app).
 *  - new_signup:     someone registered without an invite while unlinked guests exist → link to a guest or "new player"
 *  - restore:        a closed (deactivated) account tried to come back → "restore profile and history" or "start from zero"
 *  - account_closed: a player closed their own account (information, "Segna come letto")
 *  - format_proposal: many sign-ups for a day → proposal to switch to a bigger format (once per day and format)
 */
export type AdminRequestType = 'new_signup' | 'restore' | 'account_closed' | 'format_proposal';

export interface AdminRequestDoc {
  type: AdminRequestType;
  status: 'open' | 'done';
  profile_id: string;
  name: string;
  email?: string | null;
  /** account_closed: 'deactivate' (data kept) | 'delete' (everything removed) */
  mode?: 'deactivate' | 'delete';
  reason?: string;
  /** format_proposal: match day, proposed format, sign-ups when it was proposed, format at that moment */
  date?: string;
  format?: string;
  from_format?: string;
  count?: number;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution?: string;
}

/** Creates (or reopens) a request with a stable id, so the same event never creates duplicates. Notifies the admins. */
export async function openRequest(
  id: string,
  data: Omit<AdminRequestDoc, 'status' | 'created_at'>,
  push: { title: string; body: string }
): Promise<void> {
  const ref = adminDb().doc(`admin_requests/${id}`);
  const prev = await ref.get();
  if (prev.exists && prev.data()?.status === 'open') return; // già in attesa: niente doppioni né notifiche ripetute
  await ref.set({ ...data, status: 'open', created_at: new Date().toISOString() });
  const admins = await adminProfileIds().catch(() => [] as string[]);
  await sendToProfiles(admins, { ...push, url: '/?richieste=1' }).catch(() => 0);
}

export async function closeRequest(id: string, by: string, resolution: string): Promise<void> {
  await adminDb()
    .doc(`admin_requests/${id}`)
    .set({ status: 'done', resolved_at: new Date().toISOString(), resolved_by: by, resolution }, { merge: true });
}

/** Signed-in caller from the "Authorization: Bearer <idToken>" header. */
export async function callerFrom(request: Request) {
  const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!idToken) return null;
  const decoded = await adminAuth().verifyIdToken(idToken);
  const isSuper = decoded.email === SUPER_ADMIN_EMAIL && decoded.email_verified === true;
  const profileId = isSuper ? 'p-1' : decoded.uid;
  return { uid: decoded.uid, email: decoded.email || null, isSuper, profileId };
}

/** Caller that is an admin (role 'admin' on their profile) or the super admin; null otherwise. */
export async function adminCaller(request: Request) {
  const caller = await callerFrom(request);
  if (!caller) return null;
  if (caller.isSuper) return caller;
  const snap = await adminDb().doc(`profiles/${caller.profileId}`).get();
  return snap.exists && snap.data()?.role === 'admin' && !snap.data()?.deactivated_at ? caller : null;
}
