import { describe, expect, it } from 'vitest';
import { cashHeadCount, cashPayers, cashSummary } from '@/lib/utils/cashUtils';
import { perHead } from '@/lib/utils/matchFormat';
import { matchCostFor, standardCostFor } from '@/lib/utils/matchUtils';
import type { Match, SportField } from '@/types/database';

const players = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix.toUpperCase()}${i}` }));

describe('Cassa: quota a testa', () => {
  it('divide il costo per i giocatori e formatta in italiano', () => {
    expect(perHead(80, 10)).toBe('8');
    expect(perHead(126, 14)).toBe('9');
    expect(perHead(230, 22)).toBe('10,45');
    expect(perHead(85, 10)).toBe('8,50');
  });

  it('non divide mai per zero', () => {
    expect(perHead(80, 0)).toBe('80');
    expect(cashHeadCount('teams', 0, 10)).toBe(1);
  });

  it('con soli iscritti divide per i posti del formato, con le squadre per chi gioca', () => {
    expect(cashHeadCount('starters', 6, 10)).toBe(10); // 6 iscritti su 10: la quota non salta
    expect(cashHeadCount('starters', 3, 14)).toBe(14);
    expect(cashHeadCount('teams', 9, 10)).toBe(9); // squadra incompleta: pagano in 9
    expect(cashHeadCount('archive', 10, 14)).toBe(10); // archiviata: chi ha giocato davvero
  });

  it('riepilogo: pagati, mancanti, incasso e barra', () => {
    const list = players(10);
    const s = cashSummary(list, { payments: { p0: true, p1: true, p2: false, ghost: true } }, 80, 10);
    expect(s.paidCount).toBe(2);
    expect(s.unpaid.map((p) => p.id)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    expect(s.quota).toBe(8);
    expect(s.collected).toBe(16);
    expect(s.progress).toBe(20);
  });

  it('chi ha pagato ma non è più nell’elenco non conta (né sparisce dai dati)', () => {
    const s = cashSummary(players(2), { payments: { p0: true, exPlayer: true } }, 20, 2);
    expect(s.paidCount).toBe(1);
    expect(s.collected).toBe(10);
  });

  it('elenco vuoto: barra a zero', () => {
    expect(cashSummary([], { payments: {} }, 80, 10).progress).toBe(0);
  });
});

describe('Cassa: chi paga (target dei paganti)', () => {
  const starters = players(10, 's');
  const team = (ids: string[]) => ids.map((id) => ({ id, name: id.toUpperCase() }));

  it('nessuna squadra → i titolari iscritti', () => {
    const r = cashPayers({ date: '2026-12-01', today: '2026-11-20', starters });
    expect(r.source).toBe('starters');
    expect(r.payers).toHaveLength(10);
  });

  it('partita archiviata → le squadre archiviate, anche se gli iscritti sono cambiati', () => {
    const archivedMatch = { team_white: team(['a', 'b']), team_black: team(['c', 'd']) } as Pick<Match, 'team_white' | 'team_black'>;
    const r = cashPayers({ date: '2026-11-10', today: '2026-11-20', archivedMatch, starters, teamRecord: { team_white: team(['x']), team_black: team(['y']) } });
    expect(r.source).toBe('archive');
    expect(r.payers.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('squadre salvate e partita passata → i giocatori delle squadre così come sono', () => {
    const r = cashPayers({ date: '2026-11-18', today: '2026-11-20', starters: [], teamRecord: { team_white: team(['a', 'b']), team_black: team(['c']) } });
    expect(r.source).toBe('teams');
    expect(r.payers.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('squadre salvate e partita futura → con le sostituzioni (chi si ritira paga al suo posto il subentrato)', () => {
    const teamRecord = { team_white: team(['s0', 's1', 's2', 's3', 's4']), team_black: team(['s5', 's6', 's7', 's8', 'old']) };
    const r = cashPayers({ date: '2026-12-01', today: '2026-11-20', teamRecord, starters: starters.slice(0, 9).concat({ id: 'new', name: 'NEW' }) });
    expect(r.source).toBe('teams');
    expect(r.payers.map((p) => p.id)).toContain('new');
    expect(r.payers.map((p) => p.id)).not.toContain('old');
    expect(r.payers).toHaveLength(10);
  });

  it('nessun doppione anche se un id compare due volte', () => {
    const r = cashPayers({ date: '2026-11-18', today: '2026-11-20', starters: [], teamRecord: { team_white: team(['a', 'b']), team_black: team(['a']) } });
    expect(r.payers.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('Costo della partita per formato', () => {
  const field: SportField = { id: 'f1', name: 'Sporting', address: 'Via 1', cost: 80, costs: { '7v7': 126 } };
  const settings = { standard_total_cost: 80, standard_costs: { '11v11': 230 }, default_field_id: 'f1' };

  it('campo con costo per quel formato', () => {
    expect(matchCostFor(null, settings, [field], '5v5')).toBe(80);
    expect(matchCostFor(null, settings, [field], '7v7')).toBe(126);
  });
  it('campo senza costo → standard del club, proporzionale se non impostato', () => {
    expect(standardCostFor(settings, '8v8')).toBe(128);
    expect(matchCostFor(null, settings, [field], '8v8')).toBe(128);
    expect(matchCostFor(null, settings, [field], '11v11')).toBe(230);
  });
  it('costo personalizzato e partita archiviata vincono sempre', () => {
    expect(matchCostFor({ cost_override: true, total_cost: 150, status: 'open' } as Match, settings, [field], '7v7')).toBe(150);
    expect(matchCostFor({ status: 'completed', total_cost: 90 } as Match, settings, [field], '11v11')).toBe(90);
  });
});
