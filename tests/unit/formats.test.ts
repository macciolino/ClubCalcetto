import { describe, expect, it } from 'vitest';
import {
  FORMAT_INFO,
  MATCH_FORMATS,
  dayFormat,
  fieldFormatCost,
  fieldHostsFormat,
  formationSlots,
  maxPlayersFor,
  proposedFormat,
  slotsForTeamSize,
  type MatchFormat,
} from '@/lib/utils/matchFormat';
import { firstToTenByWeek, rankDayPresences, rankPresencesByDate } from '@/lib/utils/presenceRanking';
import { balanceTeams, orderTeamForDiamondRombo, orderTeamForFormation } from '@/lib/algorithm/teamBalancer';
import { reconcileTeams, slotLabel, splitKey } from '@/lib/utils/teamUtils';
import type { FieldPosition, Presence, Profile } from '@/types/database';

describe('Formati di gioco', () => {
  it.each([
    ['5v5', 13, null], ['5v5', 14, '7v7'], ['5v5', 16, '8v8'], ['5v5', 21, '8v8'], ['5v5', 22, '11v11'],
    ['7v7', 15, null], ['7v7', 16, '8v8'], ['8v8', 21, null], ['8v8', 22, '11v11'], ['11v11', 40, null],
  ] as const)('proposta: %s con %i iscritti → %s', (current, n, expected) => {
    expect(proposedFormat(current as MatchFormat, n)).toBe(expected);
  });

  it('giorno senza scelta = 5vs5 1-1-2-1; valori non validi tornano al predefinito', () => {
    expect(dayFormat({}, 'd')).toEqual({ format: '5v5', formation: '1-1-2-1' });
    expect(dayFormat({ d: { format: '9v9' as MatchFormat } }, 'd').format).toBe('5v5');
    expect(dayFormat({ d: { format: '8v8', formation: '1-1-2-1' } }, 'd').formation).toBe('1-3-3-1');
    expect(dayFormat({ d: { format: '8v8', formation: '1-2-3-2' } }, 'd').formation).toBe('1-2-3-2');
  });

  it('giocatori per formato', () => {
    expect(MATCH_FORMATS.map((f) => maxPlayersFor({ d: { format: f } }, 'd'))).toEqual([10, 14, 16, 22]);
  });

  it('moduli: predefiniti e alternative', () => {
    expect(FORMAT_INFO['7v7'].formations).toEqual(['1-2-3-1', '1-3-2-1']);
    expect(FORMAT_INFO['8v8'].formations).toEqual(['1-3-3-1', '1-2-3-2']);
    expect(FORMAT_INFO['11v11'].formations).toEqual(['1-4-3-3', '1-4-4-2']);
  });

  it('ogni modulo ha i posti giusti, il portiere per primo e righe coerenti', () => {
    for (const f of MATCH_FORMATS) {
      for (const m of FORMAT_INFO[f].formations) {
        const slots = formationSlots(f, m);
        const shape = m.split('-').map(Number);
        expect(slots).toHaveLength(FORMAT_INFO[f].perTeam);
        expect(slots[0]).toMatchObject({ label: 'POR', role: 'Portiere' });
        expect(shape.reduce((a, b) => a + b, 0)).toBe(slots.length);
        expect(slots.filter((s) => s.role === 'Difensore')).toHaveLength(shape[1]);
        expect(slots.every((s) => s.x >= 8 && s.x <= 92 && s.y > 2 && s.y < 47)).toBe(true);
      }
    }
  });

  it('le figurine non si sovrappongono su un telefono stretto (300px)', () => {
    const LAYOUT: Record<number, { W: number; H: number; w: number; h: number }> = {
      5: { W: 300, H: 460, w: 48, h: 64 },
      7: { W: 300, H: 560, w: 40, h: 52 },
      8: { W: 300, H: 560, w: 40, h: 52 },
      11: { W: 300, H: 660, w: 40, h: 52 },
    };
    for (const f of MATCH_FORMATS) {
      for (const m of FORMAT_INFO[f].formations) {
        const slots = formationSlots(f, m);
        const L = LAYOUT[slots.length];
        const pts = [...slots, ...slots.map((s) => ({ ...s, y: 100 - s.y }))];
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++) {
            const dx = (Math.abs(pts[i].x - pts[j].x) / 100) * L.W;
            const dy = (Math.abs(pts[i].y - pts[j].y) / 100) * L.H;
            expect(dx >= L.w + 2 || dy >= L.h + 2, `${f} ${m}: ${pts[i].label} / ${pts[j].label}`).toBe(true);
          }
      }
    }
  });

  it('campo: casella vuota = formato non disponibile (il 5vs5 è sempre possibile)', () => {
    const field = { id: 'f', name: 'F', address: '', cost: 80, costs: { '7v7': 126 } };
    expect(fieldFormatCost(field, '7v7')).toBe(126);
    expect(fieldHostsFormat(field, '8v8')).toBe(false);
    expect(fieldHostsFormat({ id: 'x', name: 'x', address: '' }, '5v5')).toBe(true);
  });
});

describe('Titolari e lista d’attesa', () => {
  const pres = (n: number, date = '2026-11-20'): Presence[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${date}_p${i}`, date, player_id: `p${i}`, status: 'waitlist', order_index: 0, created_at: '', joined_ms: 1000 + i }));

  it.each([[10, 12], [14, 16], [16, 16], [22, 25], [14, 9]])('max %i con %i iscritti', (max, n) => {
    const starters = rankDayPresences(pres(n), max).filter((p) => p.status === 'confirmed');
    expect(starters).toHaveLength(Math.min(max, n));
    starters.forEach((p, i) => expect(p.player_id).toBe(`p${i}`));
  });

  it('gli override dell’admin vincono sull’ordine', () => {
    const list = pres(16);
    list[15].admin_override = 'starter';
    list[0].admin_override = 'waitlist';
    const r = rankDayPresences(list, 14);
    expect(r.find((p) => p.player_id === 'p15')!.status).toBe('confirmed');
    expect(r.find((p) => p.player_id === 'p0')!.status).toBe('waitlist');
  });

  it('giorni diversi, formati diversi; primo al completo con le sue soglie', () => {
    const all = [...pres(16, '2026-11-20'), ...pres(16, '2026-11-21')];
    const maxFor = (d: string) => (d === '2026-11-20' ? 10 : 16);
    const r = rankPresencesByDate(all, maxFor);
    expect(r.filter((p) => p.date === '2026-11-20' && p.status === 'confirmed')).toHaveLength(10);
    expect(r.filter((p) => p.date === '2026-11-21' && p.status === 'confirmed')).toHaveLength(16);
    const days = [
      { dateString: '2026-11-20', dateObj: new Date(2026, 10, 20) },
      { dateString: '2026-11-21', dateObj: new Date(2026, 10, 21) },
    ];
    expect(Array.from(firstToTenByWeek(days, r, maxFor))).toEqual(['2026-11-20']);
  });
});

describe('Generatore squadre', () => {
  const ROLES: FieldPosition[] = ['Difensore', 'Centrocampista', 'Esterno', 'Punta'];
  function mkPlayers(n: number, seed: number, keepers = 2): Profile[] {
    let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: n }, (_, i) => {
      const stats = { Velocità: 4 + Math.round(rnd() * 5), Fisico: 4 + Math.round(rnd() * 5), Tiro: 4 + Math.round(rnd() * 5), Difesa: 4 + Math.round(rnd() * 5), Visione: 4 + Math.round(rnd() * 5) };
      const vals = Object.values(stats);
      return {
        id: `pl${seed}_${i}`,
        full_name: `G${i}`,
        position: i < keepers ? 'Portiere' : ROLES[Math.floor(rnd() * 4)],
        stats,
        overall_rating: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)),
      } as unknown as Profile;
    });
  }
  const key = (r: { teamWhite: Profile[]; teamBlack: Profile[] }) => splitKey(r.teamWhite.map((p) => p.id), r.teamBlack.map((p) => p.id));

  for (const f of MATCH_FORMATS) {
    for (const m of FORMAT_INFO[f].formations) {
      it(`${FORMAT_INFO[f].label} ${m}: squadre complete, equilibrate, portieri in porta, deterministico, Ribilancia cambia`, () => {
        const info = FORMAT_INFO[f];
        const opts = f === '5v5' ? { fixedKeeper: true } : { fixedKeeper: true, slots: formationSlots(f, m) };
        for (let seed = 1; seed <= 15; seed++) {
          const players = mkPlayers(info.players, seed * 7 + info.players);
          const res = balanceTeams(players, opts);
          const ids = [...res.teamWhite, ...res.teamBlack].map((p) => p.id);
          expect(res.teamWhite).toHaveLength(info.perTeam);
          expect(res.teamBlack).toHaveLength(info.perTeam);
          expect(new Set(ids).size).toBe(info.players);
          expect(res.teamWhite[0].position).toBe('Portiere');
          expect(res.teamBlack[0].position).toBe('Portiere');
          expect(res.difference).toBeLessThanOrEqual(0.35);
          expect(key(balanceTeams(players, opts))).toBe(key(res));
          expect(key(balanceTeams(players, { ...opts, excludeSplitKey: key(res) }))).not.toBe(key(res));
        }
      });
    }
  }

  it('numero sbagliato di giocatori → errore chiaro', () => {
    expect(() => balanceTeams(mkPlayers(13, 3), { slots: formationSlots('7v7') })).toThrow(/14/);
  });

  it('11vs11: con i ruoli giusti ogni posto prende il suo ruolo', () => {
    const slots = formationSlots('11v11', '1-4-3-3');
    const ideal = slots.map((s, i) => ({ id: `i${i}`, full_name: `I${i}`, position: s.role, stats: {}, overall_rating: 6 }) as unknown as Profile);
    expect(orderTeamForFormation([...ideal].reverse(), slots, true).map((p) => p.position)).toEqual(slots.map((s) => s.role));
  });

  it('5vs5: il Centrocampista va sulla fascia', () => {
    const five = (['Portiere', 'Difensore', 'Centrocampista', 'Esterno', 'Punta'] as FieldPosition[]).map(
      (r, i) => ({ id: `f${i}`, full_name: `F${i}`, position: r, stats: {}, overall_rating: 6 }) as unknown as Profile
    );
    const o = orderTeamForDiamondRombo([...five].reverse(), true);
    expect([o[0].position, o[1].position, o[4].position]).toEqual(['Portiere', 'Difensore', 'Punta']);
    expect([o[2].position, o[3].position].sort()).toEqual(['Centrocampista', 'Esterno']);
  });
});

describe('Squadre salvate e cambio formato', () => {
  const mk = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${i + from}`, name: `P${i + from}` }));

  it('5vs5 salvato, ora 14 titolari: nessuna sostituzione inventata', () => {
    const r = reconcileTeams({ team_white: mk(5), team_black: mk(5, 5) }, mk(14));
    expect(r.substitutions).toHaveLength(0);
    expect(r.white).toHaveLength(5);
  });

  it('un titolare si ritira: il primo in attesa prende esattamente il suo posto', () => {
    const starters = [...mk(9), { id: 'new', name: 'NEW' }];
    const r = reconcileTeams({ team_white: mk(5), team_black: [...mk(4, 5), { id: 'gone', name: 'GONE' }] }, starters);
    expect(r.substitutions).toEqual([{ out_id: 'gone', out_name: 'GONE', in_id: 'new', in_name: 'NEW' }]);
    expect(r.black[4].id).toBe('new');
  });

  it('nomi dei posti con il modulo e portiere a rotazione', () => {
    expect(slotLabel(5, true, formationSlots('11v11', '1-4-3-3'))).toBe('CC');
    expect(slotLabel(0, false, formationSlots('7v7'))).toBe('PORTA ↻');
    expect(slotsForTeamSize(8)).toHaveLength(8);
  });
});
