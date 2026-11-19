import { describe, expect, it } from 'vitest';
import {
  canChangeLeagueRole,
  canManageLeague,
  canManageMatchesAndCash,
  isPlatformSuperAdmin,
  isPresident,
  leagueRoleFromLegacy,
  leagueSlug,
  canRemoveFromLeague,
} from '@/lib/utils/leaguePermissions';

describe('Permessi nella lega', () => {
  it('presidente gestisce lega, partite e cassa; collaboratore solo partite e cassa; giocatore niente', () => {
    expect([canManageLeague('PRESIDENT'), canManageMatchesAndCash('PRESIDENT'), isPresident('PRESIDENT')]).toEqual([true, true, true]);
    expect([canManageLeague('COLLABORATOR'), canManageMatchesAndCash('COLLABORATOR'), isPresident('COLLABORATOR')]).toEqual([false, true, false]);
    expect([canManageLeague('PLAYER'), canManageMatchesAndCash('PLAYER')]).toEqual([false, false]);
    expect([canManageLeague(null), canManageMatchesAndCash(undefined)]).toEqual([false, false]);
  });

  it('super admin di piattaforma solo con platformRole SUPER_ADMIN', () => {
    expect(isPlatformSuperAdmin('SUPER_ADMIN')).toBe(true);
    expect(isPlatformSuperAdmin('USER')).toBe(false);
    expect(isPlatformSuperAdmin(undefined)).toBe(false);
  });

  it('mai una lega senza presidente', () => {
    const one = [
      { id: 'a', leagueRole: 'PRESIDENT' as const },
      { id: 'b', leagueRole: 'PLAYER' as const },
    ];
    expect(canChangeLeagueRole(one, 'a', 'COLLABORATOR')).toBe(false);
    expect(canChangeLeagueRole(one, 'b', 'PRESIDENT')).toBe(true);
    expect(canChangeLeagueRole(one, 'a', 'PRESIDENT')).toBe(true);
    const two = [...one, { id: 'c', leagueRole: 'PRESIDENT' as const }];
    expect(canChangeLeagueRole(two, 'a', 'PLAYER')).toBe(true);
    expect(canChangeLeagueRole(two, 'x', 'PLAYER')).toBe(false);
  });

  it('migrazione: admin e super admin diventano presidenti', () => {
    expect(leagueRoleFromLegacy({ id: 'u1', role: 'admin' }, 'p-1')).toBe('PRESIDENT');
    expect(leagueRoleFromLegacy({ id: 'p-1', role: 'player' }, 'p-1')).toBe('PRESIDENT');
    expect(leagueRoleFromLegacy({ id: 'u2', role: 'player' }, 'p-1')).toBe('PLAYER');
    expect(leagueRoleFromLegacy({ id: 'guest-1', role: null }, 'p-1')).toBe('PLAYER');
  });

  it('slug della lega', () => {
    expect(leagueSlug('I Calcettari')).toBe('i-calcettari');
    expect(leagueSlug('  Città di Bari — Over 40! ')).toBe('citta-di-bari-over-40');
  });
});

describe('canRemoveFromLeague: togliere un membro dalla lega (mai l’account)', () => {
  const pres = { id: 'a', leagueRole: 'PRESIDENT' as const };
  const coll = { id: 'b', leagueRole: 'COLLABORATOR' as const };
  const member = (id: string, leagueRole: 'PRESIDENT' | 'COLLABORATOR' | 'PLAYER', extra = {}) => ({ id, leagueRole, userId: `u-${id}`, ...extra });

  it('gestori → giocatori; solo i presidenti → collaboratori; presidenti mai', () => {
    expect(canRemoveFromLeague(pres, member('x', 'PLAYER'), 'p-1')).toBe(true);
    expect(canRemoveFromLeague(coll, member('x', 'PLAYER'), 'p-1')).toBe(true);
    expect(canRemoveFromLeague(pres, member('x', 'COLLABORATOR'), 'p-1')).toBe(true);
    expect(canRemoveFromLeague(coll, member('x', 'COLLABORATOR'), 'p-1')).toBe(false);
    expect(canRemoveFromLeague(pres, member('x', 'PRESIDENT'), 'p-1')).toBe(false);
  });

  it('mai giocatori, se stessi, il super admin, ospiti o chi è già fuori', () => {
    expect(canRemoveFromLeague({ id: 'c', leagueRole: 'PLAYER' }, member('x', 'PLAYER'), 'p-1')).toBe(false);
    expect(canRemoveFromLeague({ id: 'c', leagueRole: null }, member('x', 'PLAYER'), 'p-1')).toBe(false);
    expect(canRemoveFromLeague(pres, member('a', 'PLAYER'), 'p-1')).toBe(false);
    expect(canRemoveFromLeague(pres, member('p-1', 'PLAYER'), 'p-1')).toBe(false);
    expect(canRemoveFromLeague(pres, { id: 'g', leagueRole: 'PLAYER', is_guest: true, userId: null }, 'p-1')).toBe(false);
    expect(canRemoveFromLeague(pres, member('x', 'PLAYER', { removed_at: '2026-01-01' }), 'p-1')).toBe(false);
  });
});
