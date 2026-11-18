/**
 * C13 — the ONE place that names the super admin (also used by the server). firestore.rules has its own copy
 * (rules cannot import code): change both together.
 * Exact comparison only: an address like "macciolino84@other.com" is NOT the super admin.
 */
export const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';
export const SUPER_ADMIN_PROFILE_ID = 'p-1';

export function isSuperAdminEmail(email?: string | null): boolean {
  return (email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}

/** A profile shown in the app is the super admin: profile p-1 (emails are no longer in public profiles, C2). */
export function isSuperAdminProfile(p: { id?: string | null; email?: string | null }): boolean {
  return p.id === SUPER_ADMIN_PROFILE_ID || isSuperAdminEmail(p.email);
}
