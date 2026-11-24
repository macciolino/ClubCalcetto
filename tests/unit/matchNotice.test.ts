import { describe, expect, it } from 'vitest';
import { cleanNoticeInput, patchNotice, statusFor } from '@/lib/utils/matchNotice';
import type { MatchNotice } from '@/types/matchNotice';

const valid = {
  matchId: '2026-12-06',
  dateTime: '2026-12-06T19:30:00.000Z',
  locationName: 'Campo Luini',
  address: 'Via Luini 5, Milano',
  format: '5v5',
  totalFieldCost: 80,
  costPerPlayer: 8,
  spotsNeeded: 2,
  roleNeeded: 'GOALKEEPER',
  shirtColor: 'DARK',
  notes: '  porta i parastinchi ',
};

describe('cleanNoticeInput', () => {
  it('accetta un avviso completo e ripulisce i testi', () => {
    expect(cleanNoticeInput(valid)).toEqual({ ...valid, notes: 'porta i parastinchi' });
  });

  it('le note sono facoltative', () => {
    const { notes: _n, ...rest } = valid; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(cleanNoticeInput(rest)).toEqual(rest);
  });

  it.each([
    ['partita senza giorno', { matchId: '6/12' }],
    ['ora non valida', { dateTime: 'domenica' }],
    ['campo senza nome', { locationName: '  ' }],
    ['senza indirizzo', { address: '' }],
    ['formato sconosciuto', { format: '6v6' }],
    ['ruolo sconosciuto', { roleNeeded: 'STRIKER' }],
    ['colore sconosciuto', { shirtColor: 'RED' }],
    ['nessun posto', { spotsNeeded: 0 }],
    ['posti non interi', { spotsNeeded: 1.5 }],
    ['troppi posti', { spotsNeeded: 23 }],
    ['costo negativo', { totalFieldCost: -1 }],
    ['quota senza numero', { costPerPlayer: 'gratis' }],
    ['quota oltre il costo del campo', { totalFieldCost: 50, costPerPlayer: 60 }],
  ])('rifiuta: %s', (_label, patch) => {
    expect(cleanNoticeInput({ ...valid, ...patch })).toBeNull();
  });

  it('partita gratuita: costo e quota a zero vanno bene', () => {
    expect(cleanNoticeInput({ ...valid, totalFieldCost: 0, costPerPlayer: 0 })).not.toBeNull();
  });
});

describe('patchNotice', () => {
  const current = { ...cleanNoticeInput(valid)!, id: 'n1', leagueId: 'x', spotsFilled: 1 } as MatchNotice;

  it('cambia solo i campi modificabili, mai la partita', () => {
    expect(patchNotice(current, { spotsNeeded: 4, matchId: '2030-01-01', leagueId: 'altra' })).toMatchObject({
      matchId: '2026-12-06',
      spotsNeeded: 4,
    });
  });

  it('una modifica non valida rende nullo tutto', () => {
    expect(patchNotice(current, { format: 'x' })).toBeNull();
  });
});

describe('statusFor', () => {
  it('si chiude da solo quando i posti sono coperti', () => {
    expect(statusFor(2, 2, { status: 'OPEN' })).toEqual({ status: 'CLOSED', closedReason: 'full' });
  });
  it('resta aperto finché manca qualcuno', () => {
    expect(statusFor(1, 2, { status: 'OPEN' })).toEqual({ status: 'OPEN' });
  });
  it('chiuso perché pieno: riapre se il gestore aggiunge posti', () => {
    expect(statusFor(2, 3, { status: 'CLOSED', closedReason: 'full' })).toEqual({ status: 'OPEN' });
  });
  it('chiuso a mano o annullato: non cambia da solo', () => {
    expect(statusFor(1, 3, { status: 'CLOSED', closedReason: 'manual' })).toEqual({ status: 'CLOSED', closedReason: 'manual' });
    expect(statusFor(0, 3, { status: 'CANCELLED' })).toEqual({ status: 'CANCELLED' });
  });
});
