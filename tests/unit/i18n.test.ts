import { describe, expect, it } from 'vitest';
import { detectLocale, isLocale, matchLocale } from '@/i18n/locale';
import it_ from '../../messages/it.json';
import en from '../../messages/en.json';

describe('Lingua: scelta automatica', () => {
  it('la scelta salvata vince sempre', () => {
    expect(detectLocale({ saved: 'en', browser: ['it-IT'] })).toBe('en');
    expect(detectLocale({ saved: 'it', browser: ['en-US'] })).toBe('it');
  });
  it('senza scelta: la lingua del browser (la prima supportata)', () => {
    expect(detectLocale({ browser: ['en-GB', 'it'] })).toBe('en');
    expect(detectLocale({ browser: ['de-DE', 'en-US'] })).toBe('en');
    expect(detectLocale({ browser: ['it-IT'] })).toBe('it');
  });
  it('lingua non supportata o valori strani → italiano', () => {
    expect(detectLocale({ browser: ['fr-FR', 'de'] })).toBe('it');
    expect(detectLocale({ saved: 'xx', browser: [] })).toBe('it');
    expect(detectLocale({})).toBe('it');
  });
  it('riconoscimento dei codici', () => {
    expect(matchLocale('EN_us')).toBe('en');
    expect(matchLocale('')).toBeNull();
    expect(isLocale('it')).toBe(true);
    expect(isLocale('es')).toBe(false);
  });
});

describe('Dizionari', () => {
  const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));

  it('italiano e inglese hanno esattamente le stesse chiavi', () => {
    expect(keys(en).sort()).toEqual(keys(it_).sort());
  });
  it('nessun testo vuoto', () => {
    const empty = (o: Record<string, unknown>): boolean =>
      Object.values(o).some((v) => (v && typeof v === 'object' ? empty(v as Record<string, unknown>) : String(v).trim() === ''));
    expect(empty(it_)).toBe(false);
    expect(empty(en)).toBe(false);
  });
});
