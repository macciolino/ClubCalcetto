'use client';

import { useTranslations } from 'next-intl';

/** Stored stat names are Italian (data); the dictionary keys are their ASCII ids. */
const STAT_IDS: Record<string, string> = {
  Velocità: 'velocita',
  Fisico: 'fisico',
  Resistenza: 'resistenza',
  Tiro: 'tiro',
  Passaggio: 'passaggio',
  Dribbling: 'dribbling',
  Difesa: 'difesa',
  Visione: 'visione',
  Tecnica: 'tecnica',
};

/**
 * Field positions and stat names in the app language.
 * Positions and stat names stay Italian in Firestore: only what is shown changes.
 * Unknown values (custom stats) are shown as they are.
 */
export function usePlayerLabels() {
  const tp = useTranslations('positions');
  const ts = useTranslations('statNames');
  const tslot = useTranslations('slots');
  const pos = (p: string | null | undefined, field: 'name' | 'plural' | 'abbr') => {
    const k = p || 'Esterno';
    return tp.has(`${k}.${field}`) ? tp(`${k}.${field}`) : k;
  };
  return {
    position: (p?: string | null) => pos(p, 'name'),
    positionPlural: (p?: string | null) => pos(p, 'plural'),
    positionAbbr: (p?: string | null) => pos(p, 'abbr'),
    statName: (name: string) => (STAT_IDS[name] ? ts(`${STAT_IDS[name]}.name`) : name),
    statCode: (name: string) => (STAT_IDS[name] ? ts(`${STAT_IDS[name]}.code`) : name.slice(0, 3).toUpperCase()),
    /** Pitch place labels ("DIF SX", "PORTA ↻"…) translated word by word. */
    slot: (label: string) =>
      label
        .split(' ')
        .map((w) => (/^[A-Z]+$/.test(w) && tslot.has(w) ? tslot(w) : w))
        .join(' '),
  };
}
