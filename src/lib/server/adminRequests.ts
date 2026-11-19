import { adminAuth } from '@/lib/firebase/admin';
import { isLeagueManager, leagueDb } from '@/lib/server/leagueScope';
import { adminProfileIds, sendToProfiles } from '@/lib/server/push';

import { platformAccount } from '@/lib/server/platformAccount';

/**
 * Requests for the admins (collection `admin_requests`, written ONLY by the server; admins read them in the app).
 *  - new_signup:     someone registered without an invite while unlinked guests exist → link to a guest or "new player"
 *  - restore:        a closed (deactivated) account tried to come back → "restore profile and history" or "start from zero"
 *  - account_closed: a player closed their own account (information, "Segna come letto")
 *  - format_proposal: many sign-ups for a day → proposal to switch to a bigger format (once per day and format)
 */
export type AdminRequestType = 'new_signup' | 'restore' | 'account_closed' | 'format_proposal' | 'guest_claim';

export interface AdminRequestDoc {
  type: AdminRequestType;
  status: 'open' | 'done';
  profile_id: string;
  name: string;
  email?: string | null;
  /** account_closed: 'deactivate' (data kept) | 'delete' (everything removed) */
  mode?: 'deactivate' | 'delete';
  reason?: string;
  /** guest_claim: the guest card the account says is theirs */
  guest_id?: string;
  guest_name?: string;
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
  const ref = leagueDb().doc(`admin_requests/${id}`);
  const prev = await ref.get();
  if (prev.exists && prev.data()?.status === 'open') return; // già in attesa: niente doppioni né notifiche ripetute
  await ref.set({ ...data, status: 'open', created_at: new Date().toISOString() });
  const admins = await adminProfileIds().catch(() => [] as string[]);
  // Nella campanella la richiesta c'è già (sezione "Da gestire"): qui solo la notifica sul telefono
  await sendToProfiles(admins, { ...push, url: '/?richieste=1' }, { inbox: false }).catch(() => 0);
}

export async function closeRequest(id: string, by: string, resolution: string): Promise<void> {
  await leagueDb()
    .doc(`admin_requests/${id}`)
    .set({ status: 'done', resolved_at: new Date().toISOString(), resolved_by: by, resolution }, { merge: true });
}

/** Signed-in caller from the "Authorization: Bearer <idToken>" header. */
export async function callerFrom(request: Request) {
  const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!idToken) return null;
  // Token scaduto, falso o di un account disattivato: non autorizzato (non "errore del server")
  const decoded = await adminAuth()
    .verifyIdToken(idToken)
    .catch(() => null);
  if (!decoded) return null;
  // Platform role from the global profile (profiles.platformRole), never from the email
  const account = await platformAccount(decoded);
  // Google accounts are always verified; email/password accounts after the link in the email
  const emailVerified = decoded.email_verified === true;
  return {
    uid: decoded.uid,
    email: decoded.email || null,
    profileId: account.profileId,
    platformRole: account.platformRole,
    isSuper: account.isSuper,
    isPlatformStaff: account.isPlatformStaff,
    emailVerified,
  };
}

/**
 * Caller that manages the current league (president / collaborator); null otherwise.
 * The platform super admin has NO bypass here: in a league it is a manager only if its card says so.
 */
export async function adminCaller(request: Request) {
  const caller = await callerFrom(request);
  if (!caller) return null;
  return (await isLeagueManager(caller.uid)) ? caller : null;
}
