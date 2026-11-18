import { describe, expect, it } from 'vitest';
import { inviteCodeFrom } from '@/lib/services/leagueService';

describe('Codice di invito da quello che si incolla', () => {
  it('link completo, link con parametri, codice nudo', () => {
    expect(inviteCodeFrom('https://club.example.com/join/AbC123_xy')).toBe('AbC123_xy');
    expect(inviteCodeFrom('  https://club.example.com/join/AbC123?da=whatsapp ')).toBe('AbC123');
    expect(inviteCodeFrom('/join/abcdef/')).toBe('abcdef');
    expect(inviteCodeFrom('AbC123')).toBe('AbC123');
  });

  it('testo non valido', () => {
    expect(inviteCodeFrom('')).toBeNull();
    expect(inviteCodeFrom('abc')).toBeNull(); // troppo corto
    expect(inviteCodeFrom('codice con spazi')).toBeNull();
    expect(inviteCodeFrom('https://club.example.com/players')).toBeNull();
  });
});
