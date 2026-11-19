import { adminDb } from '@/lib/firebase/admin';
import { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PROFILE_ID } from '@/lib/superAdmin';
import type { PlatformRole } from '@/types/league';

/**
 * The global account behind a signed-in user and its PLATFORM role (`profiles.platformRole`, written only by the
 * server; missing = 'USER'). The role is the only source of platform powers: the email grants nothing.
 *
 * Which profile: `profiles/{uid}` for every account; the founder's legacy document `p-1` (created before Firebase
 * Auth) is found by its `user_id`, or — only to locate it — by the founder's verified email, in which case its
 * `user_id` is repaired so that firestore.rules can recognise it by uid from then on.
 */
export interface PlatformAccount {
  profileId: string;
  platformRole: PlatformRole;
  /** platformRole SUPER_ADMIN with a verified email */
  isSuper: boolean;
  /** SUPER_ADMIN or GLOBAL_ADMIN with a verified email (platform helpers) */
  isPlatformStaff: boolean;
}

const PLATFORM_ROLES: PlatformRole[] = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'USER'];
export const isPlatformRole = (v: unknown): v is PlatformRole => PLATFORM_ROLES.includes(v as PlatformRole);

/** The account `profileId` has platformRole SUPER_ADMIN: protected from everyone but a super admin. */
export async function isSuperAdminProfile(profileId: string): Promise<boolean> {
  if (!profileId) return false;
  return (await adminDb().doc(`profiles/${profileId}`).get()).data()?.platformRole === 'SUPER_ADMIN';
}

export async function platformAccount(decoded: { uid: string; email?: string | null; email_verified?: boolean }): Promise<PlatformAccount> {
  const db = adminDb();
  const verified = decoded.email_verified === true;
  let profileId = decoded.uid;
  let data = (await db.doc(`profiles/${decoded.uid}`).get()).data();
  if (!data) {
    const legacy = await db.doc(`profiles/${SUPER_ADMIN_PROFILE_ID}`).get();
    const legacyData = legacy.data();
    const ownsLegacy = legacyData?.user_id === decoded.uid;
    const isFounderEmail = verified && (decoded.email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
    if (legacy.exists && (ownsLegacy || isFounderEmail)) {
      profileId = SUPER_ADMIN_PROFILE_ID;
      data = legacyData;
      if (!ownsLegacy) await legacy.ref.set({ user_id: decoded.uid }, { merge: true });
    }
  }
  const raw = data?.platformRole;
  const platformRole: PlatformRole = isPlatformRole(raw) ? raw : 'USER';
  return {
    profileId,
    platformRole,
    isSuper: verified && platformRole === 'SUPER_ADMIN',
    isPlatformStaff: verified && (platformRole === 'SUPER_ADMIN' || platformRole === 'GLOBAL_ADMIN'),
  };
}
