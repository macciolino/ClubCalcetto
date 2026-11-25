import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { DEFAULT_BASE_CATEGORIES } from '@/lib/utils/defaultCategories';
import { canChangeLeagueRole, canRemoveFromLeague, leagueSlug } from '@/lib/utils/leaguePermissions';
import { openRequest } from '@/lib/server/adminRequests';
import { inLeague, leagueDb, leaguesWithPlayer } from '@/lib/server/leagueScope';
import { SUPER_ADMIN_PROFILE_ID } from '@/lib/superAdmin';
import { isSuperAdminProfile } from '@/lib/server/platformAccount';
import type { LeagueRole, LeagueVisibility } from '@/types/league';

/**
 * Multi-league step 3: invite links, joining a league (new card or claiming a ghost player), league settings and
 * member roles. Server only: `league_invites/{code}` and `memberships` are denied to the app by the rules.
 */

const LEAGUE_ROLES: LeagueRole[] = ['PRESIDENT', 'COLLABORATOR', 'PLAYER'];
export const isLeagueRole = (v: unknown): v is LeagueRole => LEAGUE_ROLES.includes(v as LeagueRole);
export const isInviteCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v);

// ---------- invite links ----------

/**
 * The league's current invite code (created the first time); `regenerate` revokes the old link(s) and makes a new one.
 * Kept only in `league_invites` (server only), so players never see it unless a manager shares it.
 */
export async function leagueInviteCode(leagueId: string, by: string, regenerate = false): Promise<string> {
  const db = adminDb();
  if (!(await db.doc(`leagues/${leagueId}`).get()).exists) throw new Error('no_league');
  const active = await db.collection('league_invites').where('leagueId', '==', leagueId).where('revoked', '==', false).get();
  if (!regenerate && !active.empty) return active.docs[0].id;
  const code = randomBytes(9).toString('base64url'); // 12 characters, URL-safe
  const now = new Date().toISOString();
  const batch = db.batch();
  active.docs.forEach((d) => batch.update(d.ref, { revoked: true, revoked_at: now }));
  batch.create(db.doc(`league_invites/${code}`), { code, leagueId, createdBy: by, createdAt: now, revoked: false });
  await batch.commit();
  return code;
}

/** The league of a valid invite (not revoked, league active), or null. */
export async function leagueFromInvite(code: string): Promise<{ id: string; name: string } | null> {
  if (!isInviteCode(code)) return null;
  const inv = (await adminDb().doc(`league_invites/${code}`).get()).data();
  if (!inv || inv.revoked) return null;
  const league = (await adminDb().doc(`leagues/${inv.leagueId}`).get()).data();
  if (!league || league.status !== 'active') return null;
  return { id: String(inv.leagueId), name: String(league.name || '') };
}

/** Ghost players of a league (cards without an account) a new member can say "that's me" to. */
export async function ghostPlayers(leagueId: string): Promise<{ id: string; name: string; position: string | null }[]> {
  const snap = await leagueDb(leagueId).collection('players').where('is_guest', '==', true).get();
  return snap.docs
    .filter((d) => !d.data().userId && !d.data().archived_at && !d.data().deactivated_at)
    .map((d) => ({ id: d.id, name: String(d.data().full_name || ''), position: (d.data().position as string) || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function isMemberOf(uid: string, leagueId: string): Promise<boolean> {
  const m = await adminDb().doc(`memberships/${uid}`).get();
  return Boolean(m.data()?.leagues?.[leagueId]);
}

// ---------- joining ----------

/**
 * The account's card in a league (created from the global profile with the league's default parameters if missing)
 * + its membership entry. Returns whether the card was created now.
 */
export async function ensureLeagueCard(leagueId: string, caller: { uid: string; profileId: string }, leagueName: string): Promise<boolean> {
  const db = adminDb();
  const L = leagueDb(leagueId);
  const cardRef = L.doc(`players/${caller.profileId}`);
  const [card, profileSnap, cats] = await Promise.all([cardRef.get(), db.doc(`profiles/${caller.profileId}`).get(), L.collection('stat_categories').get()]);
  const now = new Date().toISOString();
  const batch = db.batch();
  let created = false;
  if (!card.exists) {
    const profile = profileSnap.data() || {};
    const categories = cats.empty ? DEFAULT_BASE_CATEGORIES : cats.docs.map((c) => c.data() as { name: string; default_value?: number });
    // Parameters (Velocità, Fisico…) of the last card the account had in another league, even one it left:
    // they come along, and a president of THIS league approves them again (no self-assessment)
    const previous = await previousLeagueStats(caller.profileId, leagueId);
    const stats: Record<string, number> = {};
    categories.forEach((c) => {
      const carried = Number(previous?.stats[String(c.name)]);
      stats[String(c.name)] = carried >= 1 && carried <= 10 ? carried : Number(c.default_value ?? 6);
    });
    const values = Object.values(stats);
    batch.create(cardRef, {
      id: caller.profileId,
      user_id: caller.uid,
      userId: caller.uid,
      full_name: profile.full_name || 'Giocatore',
      ...(profile.first_name ? { first_name: profile.first_name, last_name: profile.last_name } : {}),
      avatar_url: profile.avatar_url || null,
      position: previous?.position || profile.position || 'Esterno',
      role: 'player',
      leagueRole: 'PLAYER',
      isActivePlayer: true,
      is_guest: false,
      stats,
      overall_rating: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : 6,
      matches_won: 0,
      matches_drawn: 0,
      matches_lost: 0,
      // new in this league: rates themselves once, a manager reviews after the first match;
      // with parameters from another league: no self-assessment, a president approves them again
      ...(previous ? { stats_from: { leagueId: previous.leagueId, leagueName: previous.leagueName } } : { self_rating_pending: true }),
      needs_stat_review: true,
      created_at: now,
      updated_at: now,
    });
    created = true;
  } else if (card.data()?.removed_at) {
    // Back in a league they had been taken out of: same card (history, parameters), as a player
    batch.update(cardRef, { removed_at: FieldValue.delete(), removed_by: FieldValue.delete(), isActivePlayer: true, updated_at: now });
  }
  const role = (card.data()?.leagueRole as LeagueRole) || 'PLAYER';
  batch.set(
    db.doc(`memberships/${caller.uid}`),
    { leagues: { [leagueId]: { player_id: caller.profileId, league_role: role, name: leagueName } }, updated_at: now },
    { merge: true }
  );
  await batch.commit();
  return created;
}

/** Parameters of the account's most recent card in another league (reviewed ones first), or null. */
export async function previousLeagueStats(profileId: string, exceptLeague: string) {
  const ids = (await leaguesWithPlayer(profileId)).filter((id) => id !== exceptLeague);
  if (ids.length === 0) return null;
  const db = adminDb();
  const [cards, leagues] = await Promise.all([
    db.getAll(...ids.map((id) => leagueDb(id).doc(`players/${profileId}`))),
    db.getAll(...ids.map((id) => db.doc(`leagues/${id}`))),
  ]);
  const found = cards
    .map((c, i) => ({ data: c.data() || {}, leagueId: ids[i], leagueName: String(leagues[i].data()?.name || ids[i]) }))
    .filter((c) => c.data.stats && Object.keys(c.data.stats).length > 0 && !c.data.is_guest)
    .sort((a, b) => String(b.data.stat_reviewed_at || b.data.updated_at || '').localeCompare(String(a.data.stat_reviewed_at || a.data.updated_at || '')))[0];
  return found
    ? {
        stats: found.data.stats as Record<string, number>,
        overall_rating: Number(found.data.overall_rating) || undefined,
        position: found.data.position as string | undefined,
        leagueId: found.leagueId,
        leagueName: found.leagueName,
      }
    : null;
}

export type JoinResult =
  | { ok: true; leagueId: string; already?: boolean; claimPending?: string }
  | { ok: false; error: 'invalid' | 'not_a_ghost' };

/**
 * Joins with an invite as a new player. Saying "I am this guest" does NOT hand over the guest's card (matches,
 * goals, OVR, W/D/L): it opens a request that a president or collaborator of the league approves or rejects
 * (Notifiche → Da gestire), so nobody can take someone else's history with a shared link.
 */
export async function joinWithInvite(code: string, caller: { uid: string; profileId: string }, claimPlayerId?: string | null): Promise<JoinResult> {
  const league = await leagueFromInvite(code);
  if (!league) return { ok: false, error: 'invalid' };
  if (await isMemberOf(caller.uid, league.id)) return { ok: true, leagueId: league.id, already: true };
  if (claimPlayerId) {
    const ghosts = await ghostPlayers(league.id);
    const ghost = ghosts.find((g) => g.id === claimPlayerId);
    if (!ghost) return { ok: false, error: 'not_a_ghost' };
    await ensureLeagueCard(league.id, caller, league.name);
    const profile = (await adminDb().doc(`profiles/${caller.profileId}`).get()).data() || {};
    const name = String(profile.full_name || 'Giocatore');
    await inLeague(league.id, () =>
      openRequest(
        `claim_${caller.profileId}`,
        { type: 'guest_claim', profile_id: caller.profileId, name, guest_id: ghost.id, guest_name: ghost.name },
        { title: '🔗 Scheda ospite da confermare', body: `${name} dice di essere "${ghost.name}": approva o rifiuta.` }
      )
    );
    return { ok: true, leagueId: league.id, claimPending: ghost.name };
  }
  await ensureLeagueCard(league.id, caller, league.name);
  return { ok: true, leagueId: league.id };
}

// ---------- league settings and roles (presidents) ----------

export async function updateLeagueSettings(leagueId: string, input: { name?: unknown; visibility?: unknown }): Promise<'ok' | 'bad_request'> {
  const db = adminDb();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 48 || !leagueSlug(name)) return 'bad_request';
    patch.name = name;
    patch.slug = leagueSlug(name);
  }
  if (input.visibility !== undefined) {
    if (input.visibility !== 'private' && input.visibility !== 'public') return 'bad_request';
    patch.visibility = input.visibility as LeagueVisibility;
  }
  if (Object.keys(patch).length === 0) return 'bad_request';
  await db.doc(`leagues/${leagueId}`).update(patch);
  // The name is also copied in every member's index (league list in the header)
  if (patch.name) {
    const members = await leagueDb(leagueId).collection('players').get();
    const uids = members.docs.map((d) => d.data().userId).filter((u): u is string => typeof u === 'string' && Boolean(u));
    for (let i = 0; i < uids.length; i += 400) {
      const batch = db.batch();
      uids.slice(i, i + 400).forEach((uid) => batch.set(db.doc(`memberships/${uid}`), { leagues: { [leagueId]: { name: patch.name } } }, { merge: true }));
      await batch.commit();
    }
  }
  return 'ok';
}

export type RoleChangeError = 'bad_request' | 'not_found' | 'guest' | 'last_president' | 'protected';

/**
 * Promotes / demotes a member (presidents only, checked by the caller). Never leaves the league without a president;
 * guests never become managers; the platform super admin's card is changed only by the super admin.
 */
export async function setMemberRole(
  leagueId: string,
  playerId: string,
  role: unknown,
  by: { profileId: string; isSuper: boolean }
): Promise<'ok' | RoleChangeError> {
  if (!isLeagueRole(role) || !playerId) return 'bad_request';
  // A super admin's card (any account with platformRole SUPER_ADMIN) is changed only by a super admin
  if (!by.isSuper && (playerId === SUPER_ADMIN_PROFILE_ID || (await isSuperAdminProfile(playerId)))) return 'protected';
  const db = adminDb();
  const L = leagueDb(leagueId);
  return db.runTransaction(async (tx) => {
    const presidents = await tx.get(L.collection('players').where('leagueRole', '==', 'PRESIDENT'));
    const target = await tx.get(L.doc(`players/${playerId}`));
    if (!target.exists) return 'not_found' as const;
    const data = target.data() || {};
    if (role !== 'PLAYER' && (data.is_guest || !data.userId)) return 'guest' as const;
    const members = [
      ...presidents.docs.filter((d) => !d.data().deactivated_at).map((d) => ({ id: d.id, leagueRole: 'PRESIDENT' as LeagueRole })),
      ...(data.leagueRole === 'PRESIDENT' ? [] : [{ id: playerId, leagueRole: (data.leagueRole as LeagueRole) || 'PLAYER' }]),
    ];
    if (!canChangeLeagueRole(members, playerId, role)) return 'last_president' as const;
    tx.update(target.ref, { leagueRole: role, role: role === 'PLAYER' ? 'player' : 'admin', updated_at: new Date().toISOString() });
    if (typeof data.userId === 'string' && data.userId) {
      tx.set(db.doc(`memberships/${data.userId}`), { leagues: { [leagueId]: { league_role: role } } }, { merge: true });
    }
    return 'ok' as const;
  });
}

/**
 * "Gioco anch'io": playing status of a card (the member themselves, or a president for anyone). An organiser
 * (isActivePlayer false) is never on the pitch: their future sign-ups are cancelled (returned dates: the waiting
 * list moves up) and the rules refuse new ones.
 */
export async function setActivePlayer(leagueId: string, playerId: string, active: boolean): Promise<{ ok: true; dates: string[] } | { ok: false; error: 'not_found' }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(playerId)) return { ok: false, error: 'not_found' };
  const L = leagueDb(leagueId);
  const ref = L.doc(`players/${playerId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.removed_at) return { ok: false, error: 'not_found' };
  const now = new Date().toISOString();
  if (active) {
    await ref.update({ isActivePlayer: true, updated_at: now });
    return { ok: true, dates: [] };
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const presences = (await L.collection('presences').where('player_id', '==', playerId).get()).docs.filter(
    (d) => String(d.data().date || '') >= today
  );
  const batch = adminDb().batch();
  batch.update(ref, { isActivePlayer: false, updated_at: now });
  presences.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { ok: true, dates: Array.from(new Set(presences.map((d) => String(d.data().date)))) };
}


// ---------- taking a member out of the league ----------

export type RemoveMemberError = 'not_found' | 'forbidden';

/**
 * A manager takes a registered member OUT OF THIS LEAGUE (rules in `canRemoveFromLeague`). The global account,
 * the card's history and the other leagues stay as they are: the card is marked `removed_at` (hidden from the
 * lists, kept for the archived matches), the membership entry goes away (no more access) and their future
 * sign-ups in this league are cancelled. Returns the dates whose sign-ups were removed (substitutions re-checked).
 */
export async function removeLeagueMember(
  leagueId: string,
  playerId: string,
  by: { profileId: string; leagueRole: LeagueRole; isSuper?: boolean }
): Promise<{ ok: true; dates: string[] } | { ok: false; error: RemoveMemberError }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(playerId)) return { ok: false, error: 'not_found' };
  const L = leagueDb(leagueId);
  const ref = L.doc(`players/${playerId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'not_found' };
  const card = snap.data() || {};
  const target = {
    id: playerId,
    leagueRole: (card.leagueRole as LeagueRole) || 'PLAYER',
    is_guest: card.is_guest === true,
    userId: (card.userId as string) || null,
    removed_at: (card.removed_at as string) || null,
  };
  if (!canRemoveFromLeague({ id: by.profileId, leagueRole: by.leagueRole }, target, by.isSuper ? '' : SUPER_ADMIN_PROFILE_ID)) {
    return { ok: false, error: target.removed_at || target.is_guest || !target.userId ? 'not_found' : 'forbidden' };
  }
  // Any super admin account is protected (only a super admin takes it out)
  if (!by.isSuper && (await isSuperAdminProfile(playerId))) return { ok: false, error: 'forbidden' };

  return { ok: true, dates: await takeOutOfLeague(leagueId, playerId, target.userId!, by.profileId) };
}

/**
 * Out of THIS league (taken out by a manager, or left by the member): card kept for the history (removed_at,
 * hidden from the lists, parameters kept), membership entry removed, future sign-ups cancelled.
 * Returns the dates whose sign-ups were removed (the waiting list moves up).
 */
async function takeOutOfLeague(leagueId: string, playerId: string, userId: string, byId: string): Promise<string[]> {
  const db = adminDb();
  const L = leagueDb(leagueId);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const presences = (await L.collection('presences').where('player_id', '==', playerId).get()).docs.filter(
    (d) => String(d.data().date || '') >= today
  );
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(L.doc(`players/${playerId}`), { removed_at: now, removed_by: byId, leagueRole: 'PLAYER', role: 'player', isActivePlayer: false, updated_at: now });
  batch.set(db.doc(`memberships/${userId}`), { leagues: { [leagueId]: FieldValue.delete() }, updated_at: now }, { merge: true });
  presences.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return Array.from(new Set(presences.map((d) => String(d.data().date))));
}

export type LeaveError = 'not_found' | 'last_president';

/** "Esci dalla lega": the member leaves at once (same effects as being taken out). Never the last president. */
export async function leaveLeague(
  leagueId: string,
  playerId: string,
  userId: string
): Promise<{ ok: true; dates: string[]; name: string } | { ok: false; error: LeaveError }> {
  const L = leagueDb(leagueId);
  const snap = await L.doc(`players/${playerId}`).get();
  const card = snap.data();
  if (!card || card.removed_at || card.userId !== userId) return { ok: false, error: 'not_found' };
  if (card.leagueRole === 'PRESIDENT') {
    const presidents = (await L.collection('players').where('leagueRole', '==', 'PRESIDENT').get()).docs.filter(
      (d) => d.id !== playerId && !d.data().deactivated_at && !d.data().removed_at
    );
    if (presidents.length === 0) return { ok: false, error: 'last_president' };
  }
  const dates = await takeOutOfLeague(leagueId, playerId, userId, playerId);
  return { ok: true, dates, name: String(card.full_name || 'Un giocatore') };
}
