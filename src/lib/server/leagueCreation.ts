import { randomBytes } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { DEFAULT_BASE_CATEGORIES } from '@/lib/utils/defaultCategories';
import { isMatchFormat } from '@/lib/utils/matchFormat';
import { leagueSlug } from '@/lib/utils/leaguePermissions';
import type { League, LeagueVisibility } from '@/types/league';
import type { MatchFormat } from '@/types/database';

/** Leagues one account can create (protects the free Firestore quota). */
export const MAX_LEAGUES_PER_USER = 5;

export interface NewLeagueInput {
  name: string;
  visibility: LeagueVisibility;
  defaultFormat?: MatchFormat;
  defaultLocation?: string;
  /** The creator plays too (true) or only organises (false) */
  joinAsPlayer: boolean;
}

/** Checks and cleans what the app sent; null = not valid. */
export function parseNewLeague(body: unknown): NewLeagueInput | null {
  const b = (body || {}) as Record<string, unknown>;
  const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 48 || !leagueSlug(name)) return null;
  const visibility = b.visibility === 'public' ? 'public' : b.visibility === 'private' || b.visibility === undefined ? 'private' : null;
  if (!visibility) return null;
  if (b.defaultFormat !== undefined && b.defaultFormat !== '' && !isMatchFormat(b.defaultFormat)) return null;
  const location = String(b.defaultLocation ?? '').trim().slice(0, 80);
  return {
    name,
    visibility,
    defaultFormat: isMatchFormat(b.defaultFormat) ? b.defaultFormat : undefined,
    defaultLocation: location || undefined,
    joinAsPlayer: b.joinAsPlayer !== false,
  };
}

/**
 * Creates a league: the creator becomes PRESIDENT (playing or only organising), with the default parameters,
 * and the usual field if given. Everything in one batch; the league id is the slug + a random suffix.
 */
export async function createLeague(
  creator: { uid: string; profileId: string },
  input: NewLeagueInput
): Promise<{ id: string } | { error: 'too_many' | 'no_profile' }> {
  const db = adminDb();
  const profile = (await db.doc(`profiles/${creator.profileId}`).get()).data();
  if (!profile) return { error: 'no_profile' };
  const mine = await db.collection('leagues').where('createdBy', '==', creator.profileId).select().get();
  if (mine.size >= MAX_LEAGUES_PER_USER) return { error: 'too_many' };

  const id = `${leagueSlug(input.name)}-${randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const league: League = {
    id,
    name: input.name,
    slug: leagueSlug(input.name),
    status: 'active',
    visibility: input.visibility,
    createdAt: now,
    createdBy: creator.profileId,
    ...(input.defaultFormat ? { defaultFormat: input.defaultFormat } : {}),
    ...(input.defaultLocation ? { defaultLocation: input.defaultLocation } : {}),
  };
  const stats: Record<string, number> = {};
  DEFAULT_BASE_CATEGORIES.forEach((c) => (stats[c.name] = c.default_value));
  const values = Object.values(stats);
  const ovr = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));

  const base = db.doc(`leagues/${id}`);
  const batch = db.batch();
  batch.create(base, league);
  batch.create(base.collection('players').doc(creator.profileId), {
    id: creator.profileId,
    user_id: creator.uid,
    userId: creator.uid,
    full_name: profile.full_name || 'Presidente',
    avatar_url: profile.avatar_url || null,
    position: profile.position || 'Esterno',
    role: 'admin',
    leagueRole: 'PRESIDENT',
    isActivePlayer: input.joinAsPlayer,
    is_guest: false,
    stats,
    overall_rating: ovr,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    created_at: now,
    updated_at: now,
  });
  DEFAULT_BASE_CATEGORIES.forEach((c, i) =>
    batch.create(base.collection('stat_categories').doc(`cat-${i + 1}`), { ...c, id: `cat-${i + 1}`, created_at: `${now}-${i}` })
  );
  if (input.defaultLocation) {
    batch.create(base.collection('sport_fields').doc('f1'), { id: 'f1', name: input.defaultLocation, created_at: now });
    batch.set(base.collection('settings').doc('app_config'), { default_field_id: 'f1' });
  }
  batch.set(
    db.doc(`memberships/${creator.uid}`),
    { leagues: { [id]: { player_id: creator.profileId, league_role: 'PRESIDENT', name: input.name } }, updated_at: now },
    { merge: true }
  );
  await batch.commit();
  return { id };
}
