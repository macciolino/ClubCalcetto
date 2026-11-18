/** C1: the player window saves only what the admin changed, never the whole (possibly stale) copy. */
import { describe, expect, it } from 'vitest';
import { profileChanges } from '@/lib/utils/profileChanges';
import type { Profile } from '@/types/database';

const cats = [
  { name: 'Tiro', default_value: 6 },
  { name: 'Difesa', default_value: 6 },
];
const opened = {
  id: 'luca', user_id: 'luca', full_name: 'Luca', avatar_url: null, role: 'player', position: 'Esterno', is_guest: false,
  stats: { Tiro: 7, Difesa: 5 }, overall_rating: 6, matches_won: 3, matches_drawn: 1, matches_lost: 2,
  self_rating_pending: true, needs_stat_review: true,
} as unknown as Profile;
const same = { full_name: 'Luca', position: 'Esterno' as const, avatar_url: null, overall_rating: 6, matches_won: 3, matches_drawn: 1, matches_lost: 2 };

describe('profileChanges (C1)', () => {
  it('nothing touched → nothing to save', () => {
    expect(profileChanges(opened, same, { Tiro: 7, Difesa: 5 }, cats)).toEqual({ fields: {}, stats: {} });
  });

  it('only the position changed → W/D/L, parameters and server flags are NOT sent', () => {
    const r = profileChanges(opened, { ...same, position: 'Punta' }, { Tiro: 7, Difesa: 5 }, cats);
    expect(r).toEqual({ fields: { position: 'Punta' }, stats: {} });
    // the match closed meanwhile (W 3 → 4 in the database) is safe: matches_won is not in the update
    expect('matches_won' in r.fields).toBe(false);
    expect('self_rating_pending' in r.fields).toBe(false);
  });

  it('one parameter changed → only that parameter (and the new OVR)', () => {
    const r = profileChanges(opened, { ...same, overall_rating: 6.5 }, { Tiro: 8, Difesa: 5 }, cats);
    expect(r).toEqual({ fields: { overall_rating: 6.5 }, stats: { Tiro: 8 } });
  });

  it('the admin corrects W/D/L by hand → those numbers are saved (intended)', () => {
    const r = profileChanges(opened, { ...same, matches_won: 5 }, { Tiro: 7, Difesa: 5 }, cats);
    expect(r.fields).toEqual({ matches_won: 5 });
  });

  it('missing parameter on the profile = club default; untouched default is not sent', () => {
    const noDifesa = { ...opened, stats: { Tiro: 7 } } as Profile;
    expect(profileChanges(noDifesa, same, { Tiro: 7, Difesa: 6 }, cats).stats).toEqual({});
    expect(profileChanges(noDifesa, same, { Tiro: 7, Difesa: 9 }, cats).stats).toEqual({ Difesa: 9 });
  });

  it('photo removed → avatar_url null is saved', () => {
    const withPhoto = { ...opened, avatar_url: 'https://x/y.jpg' } as Profile;
    expect(profileChanges(withPhoto, same, { Tiro: 7, Difesa: 5 }, cats).fields).toEqual({ avatar_url: null });
  });
});
