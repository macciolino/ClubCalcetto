import { describe, expect, it } from 'vitest';
import { manualMatchError } from '@/lib/utils/manualMatch';

const p = (id: string) => ({ id, name: id });
const base = {
  date: '2026-10-05',
  today: '2026-11-25',
  archivedDates: new Set(['2026-10-12']),
  white: [p('a'), p('b')],
  black: [p('c'), p('d')],
  perTeam: 5,
};

describe('partita inserita a mano nello Storico', () => {
  it('va bene: data passata libera, due squadre', () => expect(manualMatchError(base)).toBeNull());
  it('oggi va bene, domani no', () => {
    expect(manualMatchError({ ...base, date: '2026-11-25' })).toBeNull();
    expect(manualMatchError({ ...base, date: '2026-11-26' })).toBe('future');
  });
  it('serve la data', () => expect(manualMatchError({ ...base, date: '' })).toBe('date_required'));
  it('una sola partita per giorno', () => expect(manualMatchError({ ...base, date: '2026-10-12' })).toBe('exists'));
  it('due squadre con almeno un giocatore', () => expect(manualMatchError({ ...base, black: [] })).toBe('teams_empty'));
  it('non oltre il formato', () =>
    expect(manualMatchError({ ...base, white: ['a', 'b', 'e', 'f', 'g', 'h'].map(p) })).toBe('too_many'));
  it('nessuno in tutte e due le squadre', () => expect(manualMatchError({ ...base, black: [p('a')] })).toBe('duplicate'));
});
