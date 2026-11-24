import { describe, expect, it } from 'vitest';
import { careerSummary, personalHistory } from '@/lib/utils/career';
import { filterNotices, NO_FILTERS } from '@/lib/utils/matchNotice';
import type { MySpot } from '@/types/matchNotice';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const spot = (id: string, dateTime: string, status: MySpot['status'] = 'ACTIVE'): MySpot => ({
  noticeId: id,
  leagueId: 'altra',
  leagueName: 'Altra lega',
  matchId: dateTime.slice(0, 10),
  dateTime,
  locationName: 'Campo',
  address: 'Via 1',
  format: '5v5',
  costPerPlayer: 8,
  roleNeeded: 'ANY',
  shirtColor: 'DARK',
  status,
  joinedAt: 'x',
});

describe('careerSummary', () => {
  it('somma le leghe e conta le partite da esterno già giocate (senza esito)', () => {
    const c = careerSummary(
      [
        { leagueId: 'a', leagueName: 'I Calcettari', won: 3, drawn: 1, lost: 2 },
        { leagueId: 'b', leagueName: 'Giovedì', won: 1, drawn: 0, lost: 0 },
      ],
      [spot('s1', '2026-11-20T19:30:00.000Z'), spot('s2', '2026-11-30T19:30:00.000Z'), spot('s3', '2026-11-10T19:30:00.000Z', 'CANCELLED')],
      NOW
    );
    expect(c.totals).toEqual({ played: 8, won: 4, drawn: 1, lost: 2 });
    expect(c.external).toMatchObject({ played: 1, upcoming: 1 });
    expect(c.external.list.map((s) => s.noticeId)).toEqual(['s2', 's1']); // più recente prima, annullate escluse
    expect(c.leagues.map((l) => [l.leagueName, l.played])).toEqual([['I Calcettari', 6], ['Giovedì', 1]]);
  });

  it('partita da esterno archiviata: esito, gol e MVP nella carriera; tolto o annullato non conta', () => {
    const c = careerSummary(
      [{ leagueId: 'a', leagueName: 'I Calcettari', won: 1, drawn: 0, lost: 0 }],
      [
        { ...spot('w', '2026-11-20T19:30:00.000Z'), result: 'won', goals: 2, mvp: true },
        { ...spot('l', '2026-11-18T19:30:00.000Z'), result: 'lost', goals: 0 },
        { ...spot('r', '2026-11-16T19:30:00.000Z', 'REMOVED'), result: 'won', goals: 5 },
      ],
      NOW
    );
    expect(c.totals).toEqual({ played: 3, won: 2, drawn: 0, lost: 1 });
    expect(c.external).toMatchObject({ played: 2, goals: 2, mvp: 1 });
  });

  it('senza leghe né posti: tutto a zero; valori strani ignorati', () => {
    expect(careerSummary([], [], NOW).totals).toEqual({ played: 0, won: 0, drawn: 0, lost: 0 });
    expect(careerSummary([{ leagueId: 'a', leagueName: 'A', won: -2, drawn: NaN, lost: 1 }], [], NOW).totals.played).toBe(1);
  });
});

describe('filtri della bacheca', () => {
  const list = [
    { id: 'oggi', dateTime: '2026-11-24T19:30:00.000Z', format: '5v5', roleNeeded: 'GOALKEEPER' },
    { id: 'tre', dateTime: '2026-11-27T19:30:00.000Z', format: '8v8', roleNeeded: 'ANY' },
    { id: 'venti', dateTime: '2026-12-14T19:30:00.000Z', format: '5v5', roleNeeded: 'OUTFIELD' },
  ] as const;
  const ids = (f: Partial<typeof NO_FILTERS>) => filterNotices([...list], { ...NO_FILTERS, ...f }, NOW).map((n) => n.id);

  it('nessun filtro: tutti', () => expect(ids({})).toEqual(['oggi', 'tre', 'venti']));
  it('oggi e 7 giorni (ora italiana)', () => {
    expect(ids({ when: 'today' })).toEqual(['oggi']);
    expect(ids({ when: 'week' })).toEqual(['oggi', 'tre']);
  });
  it('formato', () => expect(ids({ format: '5v5' })).toEqual(['oggi', 'venti']));
  it('ruolo: anche gli avvisi aperti a qualsiasi ruolo', () => expect(ids({ role: 'GOALKEEPER' })).toEqual(['oggi', 'tre']));
});

describe('storico personale', () => {
  it('partite delle mie leghe + da ospite (solo già iniziate), più recenti prima', () => {
    const mine = [
      { key: 'a:1', date: '2026-11-10', leagueId: 'a', leagueName: 'I Calcettari', external: false, result: 'won' as const, score: { white: 3, black: 1 }, goals: 1, mvp: false },
    ];
    const h = personalHistory(
      mine,
      [
        { ...spot('s1', '2026-11-20T19:30:00.000Z'), result: 'drawn', goals: 1 },
        spot('s2', '2026-11-30T19:30:00.000Z'),
        spot('s3', '2026-11-15T19:30:00.000Z', 'CANCELLED'),
      ],
      NOW
    );
    expect(h.map((e) => [e.date, e.external, e.result])).toEqual([
      ['2026-11-20', true, 'drawn'],
      ['2026-11-10', false, 'won'],
    ]);
  });
});
