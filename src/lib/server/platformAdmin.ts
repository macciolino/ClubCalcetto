import { adminDb } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import type { LeagueStatus } from '@/types/league';

/**
 * Multi-league step 4 — platform governance. Only an account whose global profile has `platformRole: 'SUPER_ADMIN'`
 * (written only by the server; the rules refuse it from the app) and a verified email.
 * Platform super admins are NOT members of other people's leagues: here they only see and switch them on / off.
 */
export async function platformCaller(request: Request) {
  const caller = await callerFrom(request);
  if (!caller || !caller.emailVerified) return null;
  const profile = (await adminDb().doc(`profiles/${caller.profileId}`).get()).data();
  return profile?.platformRole === 'SUPER_ADMIN' ? caller : null;
}

export interface PlatformLeagueRow {
  id: string;
  name: string;
  status: LeagueStatus;
  visibility: string;
  createdAt: string;
  createdBy: string;
  /** Registered members (cards linked to an account, not archived) */
  members: number;
  /** Players without an account (guests) */
  guests: number;
}

/** Every league of the platform, newest first, with member counts (aggregation queries: 1 read each per 1000 docs). */
export async function listPlatformLeagues(): Promise<PlatformLeagueRow[]> {
  const db = adminDb();
  const leagues = await db.collection('leagues').get();
  const rows = await Promise.all(
    leagues.docs.map(async (l) => {
      const players = l.ref.collection('players');
      const [members, guests] = await Promise.all([
        players.where('is_guest', '==', false).count().get(),
        players.where('is_guest', '==', true).count().get(),
      ]);
      const d = l.data();
      return {
        id: l.id,
        name: String(d.name || l.id),
        status: (d.status === 'suspended' ? 'suspended' : 'active') as LeagueStatus,
        visibility: String(d.visibility || 'private'),
        createdAt: String(d.createdAt || d.migratedAt || ''),
        createdBy: String(d.createdBy || ''),
        members: members.data().count,
        guests: guests.data().count,
      };
    })
  );
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Suspends (read-only for everyone, invites refused, no notifications) or re-activates a league. */
export async function setLeagueStatus(leagueId: string, status: unknown, by: string): Promise<'ok' | 'bad_request' | 'not_found'> {
  if (status !== 'active' && status !== 'suspended') return 'bad_request';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leagueId)) return 'bad_request';
  const ref = adminDb().doc(`leagues/${leagueId}`);
  if (!(await ref.get()).exists) return 'not_found';
  await ref.update({ status, status_changed_at: new Date().toISOString(), status_changed_by: by });
  return 'ok';
}
