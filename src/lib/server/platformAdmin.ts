import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { platformAccount } from '@/lib/server/platformAccount';
import type { LeagueStatus, PlatformRole } from '@/types/league';

/**
 * Platform governance. Roles on the global profile (`profiles.platformRole`, written only by the server; the
 * rules refuse it from the app), always with a verified email:
 *  - SUPER_ADMIN:  everything here (suspend / re-activate leagues, appoint or revoke platform admins);
 *  - GLOBAL_ADMIN: platform helper, reads the console (leagues and their numbers), no destructive action.
 * Platform roles are NOT memberships: in a league they manage only what their card there allows.
 */
export async function platformCaller(request: Request) {
  const caller = await callerFrom(request);
  return caller?.isSuper ? caller : null;
}

/** Super admin or platform admin (read-only governance). */
export async function platformStaffCaller(request: Request) {
  const caller = await callerFrom(request);
  return caller?.isPlatformStaff ? caller : null;
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

// ---------- platform admins (GLOBAL_ADMIN) ----------

export interface PlatformStaffRow {
  profileId: string;
  name: string;
  platformRole: Exclude<PlatformRole, 'USER'>;
}

/** Who has a platform role (super admin first). */
export async function listPlatformStaff(): Promise<PlatformStaffRow[]> {
  const snap = await adminDb().collection('profiles').where('platformRole', 'in', ['SUPER_ADMIN', 'GLOBAL_ADMIN']).get();
  return snap.docs
    .map((d) => ({ profileId: d.id, name: String(d.data().full_name || d.id), platformRole: d.data().platformRole as PlatformStaffRow['platformRole'] }))
    .sort((a, b) => Number(b.platformRole === 'SUPER_ADMIN') - Number(a.platformRole === 'SUPER_ADMIN') || a.name.localeCompare(b.name));
}

export type PlatformRoleChangeError = 'bad_request' | 'not_found' | 'protected';

/**
 * Super admin only (checked by the caller). `GLOBAL_ADMIN`: the account with EXACTLY this email becomes a platform
 * admin (nothing is listed or searched by name). `USER`: takes the role away, by email or by the profile id shown in
 * the list. The super admin role itself never changes from here.
 */
export async function setPlatformRole(
  target: { email?: unknown; profileId?: unknown },
  role: unknown
): Promise<{ ok: true; name: string } | { ok: false; error: PlatformRoleChangeError }> {
  if (role !== 'GLOBAL_ADMIN' && role !== 'USER') return { ok: false, error: 'bad_request' };
  const db = adminDb();
  let profileId: string | null = null;
  const email = String(target.email || '').trim().toLowerCase();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad_request' };
    const user = await adminAuth().getUserByEmail(email).catch(() => null);
    if (!user) return { ok: false, error: 'not_found' };
    profileId = (await platformAccount({ uid: user.uid, email: user.email, email_verified: user.emailVerified })).profileId;
  } else if (role === 'USER' && typeof target.profileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(target.profileId)) {
    profileId = target.profileId;
  } else {
    return { ok: false, error: 'bad_request' };
  }
  const ref = db.doc(`profiles/${profileId}`);
  const profile = await ref.get();
  if (!profile.exists) return { ok: false, error: 'not_found' };
  if (profile.data()?.platformRole === 'SUPER_ADMIN') return { ok: false, error: 'protected' };
  await ref.set({ platformRole: role, platform_role_changed_at: new Date().toISOString() }, { merge: true });
  return { ok: true, name: String(profile.data()?.full_name || email || profileId) };
}
