import type { StatCategory } from '@/types/database';

/** Player parameters of a new club / league (also the app fallback before Firestore answers). Shared by app and server. */
export const DEFAULT_BASE_CATEGORIES: StatCategory[] = [
  { id: '1', name: 'Velocità', label: 'Velocità / Scatto breve', default_value: 7 },
  { id: '2', name: 'Fisico', label: 'Fisico / Protezione palla e contrasti', default_value: 7 },
  { id: '3', name: 'Resistenza', label: 'Resistenza / Fiato', default_value: 7 },
  { id: '4', name: 'Tiro', label: 'Tiro / Conclusione', default_value: 7 },
  { id: '5', name: 'Passaggio', label: 'Passaggio / Sponde', default_value: 7 },
  { id: '6', name: 'Dribbling', label: 'Dribbling / Controllo nello stretto', default_value: 7 },
  { id: '7', name: 'Difesa', label: 'Difesa / 1v1', default_value: 7 },
  { id: '8', name: 'Visione', label: 'Visione di gioco / Tattica', default_value: 7 },
];
