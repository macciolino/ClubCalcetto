import { adminDb, adminMessaging } from '@/lib/firebase/admin';

/** Server-only helpers to send push notifications (used by /api/notify and /api/cron/mvp-vote). */

export const SUPER_ADMIN_PROFILE_ID = 'p-1';

/** Who receives notifications: 'off' nobody, 'admins' only admins (test), 'all' the players concerned. */
export type NotifyMode = 'off' | 'admins' | 'all';

export interface Message {
  title: string;
  body: string;
  url: string;
}


export function italianDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  });
}

export async function getMode(): Promise<NotifyMode> {
  const snap = await adminDb().doc('settings/notifications').get();
  const mode = snap.exists ? (snap.data()?.mode as NotifyMode) : undefined;
  return mode === 'off' || mode === 'all' ? mode : 'admins';
}

export async function adminProfileIds(): Promise<string[]> {
  const snap = await adminDb().collection('profiles').where('role', '==', 'admin').get();
  return Array.from(new Set([SUPER_ADMIN_PROFILE_ID, ...snap.docs.map((d) => d.id)]));
}

/**
 * In-app bell: every notification sent to a profile is also saved in `profiles/{id}/notifications`
 * (written only by the server; each person reads and marks as read only their own). Profiles without a
 * registered device get it too, so nobody misses a notification because push is off on their phone.
 */
export async function addToInbox(profileIds: string[], msg: Message): Promise<void> {
  const ids = Array.from(new Set(profileIds.filter(Boolean)));
  if (ids.length === 0) return;
  const db = adminDb();
  const created_at = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    ids.slice(i, i + 400).forEach((id) =>
      batch.set(db.collection(`profiles/${id}/notifications`).doc(), {
        title: msg.title,
        body: msg.body,
        url: msg.url || '/',
        created_at,
        read: false,
      })
    );
    await batch.commit();
  }
}

/** Sends to every device registered by these profiles (and to their in-app bell); removes tokens that no longer work. */
export async function sendToProfiles(profileIds: string[], msg: Message, opts: { inbox?: boolean } = {}): Promise<number> {
  const ids = Array.from(new Set(profileIds.filter(Boolean)));
  if (opts.inbox !== false) await addToInbox(ids, msg).catch((err) => console.warn('[campanella] non salvata:', err?.message || err));
  const tokens: string[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await adminDb().collection('push_tokens').where('profile_id', 'in', ids.slice(i, i + 30)).get();
    snap.docs.forEach((d) => tokens.push(d.id));
  }
  return sendToTokens(tokens, msg);
}

export async function sendToTokens(tokens: string[], msg: Message): Promise<number> {
  if (tokens.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await adminMessaging().sendEachForMulticast({
      tokens: chunk,
      data: { title: msg.title, body: msg.body, url: msg.url },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    });
    sent += res.successCount;
    const dead = res.responses
      .map((r, idx) => (!r.success && /registration-token-not-registered|invalid-argument|invalid-registration-token/.test(r.error?.code || '') ? chunk[idx] : null))
      .filter((t): t is string => Boolean(t));
    await Promise.all(dead.map((t) => adminDb().doc(`push_tokens/${t}`).delete().catch(() => undefined)));
  }
  return sent;
}

/** Applies the mode: 'all' → the players concerned; 'admins' → all admins, marked as a test. */
export async function deliver(playerIds: string[], msg: Message): Promise<{ sent: number; mode: NotifyMode }> {
  const mode = await getMode();
  if (mode === 'off') return { sent: 0, mode };
  if (mode === 'all') return { sent: await sendToProfiles(playerIds, msg), mode };
  const sent = await sendToProfiles(await adminProfileIds(), {
    ...msg,
    title: `[PROVA] ${msg.title}`,
    body: `${msg.body} (in modalità prova arriva solo agli admin; destinatari reali: ${playerIds.length} giocatori)`,
  });
  return { sent, mode };
}

/**
 * Every registered account (not guests, not closed accounts): they all get the in-app notification,
 * and those with a registered device also the push.
 */
export async function registeredProfileIds(): Promise<string[]> {
  const [profiles, tokens] = await Promise.all([adminDb().collection('profiles').get(), adminDb().collection('push_tokens').get()]);
  const active = profiles.docs
    .filter((d) => !d.data().is_guest && !d.data().deactivated_at && !d.data().archived_at)
    .map((d) => d.id);
  const withDevice = tokens.docs.map((d) => d.data().profile_id as string).filter(Boolean);
  return Array.from(new Set([...active, ...withDevice]));
}

/** 'YYYY-MM-DD' + 'HH:mm' in Italian time → exact instant (handles summer/winter time). */
export function romeDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '20:30').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asRome = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess - (asRome - guess));
}

export function romeTimeLabel(d: Date): string {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

/**
 * Alerts meant for the admins themselves (e.g. a match reached 10 players): sent to all admins
 * in both 'admins' and 'all' modes (no [PROVA] mark), nothing when notifications are off.
 */
export async function deliverToAdmins(msg: Message): Promise<{ sent: number; mode: NotifyMode }> {
  const mode = await getMode();
  if (mode === 'off') return { sent: 0, mode };
  return { sent: await sendToProfiles(await adminProfileIds(), msg), mode };
}
