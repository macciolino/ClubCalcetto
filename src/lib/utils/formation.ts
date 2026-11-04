export interface PlayerPitchPosition {
  x: number; // percentuale orizzontale (0-100)
  y: number; // percentuale verticale (0-100)
  roleLabel: string;
}

/**
 * Ritorna una versione compatta del nome giocatore ideale per il campetto su smartphone:
 * - Rimuove note tra parentesi (es: "Gabriele E. (Waitlist)" -> "Gabriele E.")
 * - Se nome e cognome completi (es. "Marco Bianchi"), mostra "Marco B."
 * - Se già compatto (es. "Marco B." o "Ospite"), mantiene "Marco B."
 */
export function getShortPlayerName(fullName: string): string {
  if (!fullName) return '';
  const clean = fullName.replace(/\s*\(.*?\)/g, '').trim();
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length <= 1) return clean;
  const first = parts[0];
  const second = parts[1];
  if (second.length <= 2) {
    return `${first} ${second.endsWith('.') ? second : second + '.'}`;
  }
  return `${first} ${second.charAt(0).toUpperCase()}.`;
}

/**
 * Coordinate ottimizzate rigorosamente per la visualizzazione mobile (smartphone):
 * Formazione A ROMBO (1-1-2-1):
 * - Portiere vicino alla riga di porta
 * - Difensore centrale a debita distanza
 * - Due Esterni larghi sulle fasce (SX e DX)
 * - Due Punte sfalsate diagonalmente rispetto al centro del campo (43% vs 57%)
 *   per garantire zero collisioni o sovrapposizioni visive su qualsiasi schermo.
 */
export const WHITE_TEAM_COORDINATES: PlayerPitchPosition[] = [
  { x: 50, y: 7.5, roleLabel: 'POR' },    // Portiere (in alto vicino alla porta)
  { x: 50, y: 19.5, roleLabel: 'DIF' },   // Difensore centrale
  { x: 19, y: 31.5, roleLabel: 'EST SX' }, // Esterno Sinistro largo
  { x: 81, y: 31.5, roleLabel: 'EST DX' }, // Esterno Destro largo
  { x: 43, y: 43, roleLabel: 'PUN' },     // Punta verso sinistra del centrocampo
];

export const BLACK_TEAM_COORDINATES: PlayerPitchPosition[] = [
  { x: 50, y: 92.5, roleLabel: 'POR' },   // Portiere (in basso vicino alla porta)
  { x: 50, y: 80.5, roleLabel: 'DIF' },   // Difensore centrale
  { x: 19, y: 68.5, roleLabel: 'EST SX' }, // Esterno Sinistro largo
  { x: 81, y: 68.5, roleLabel: 'EST DX' }, // Esterno Destro largo
  { x: 57, y: 57, roleLabel: 'PUN' },     // Punta verso destra del centrocampo
];

/**
 * Ritorna le coordinate rigide della formazione a rombo 1-1-2-1
 * senza jitter casuali che possono provocare sovrapposizioni visive
 */
export function getOrganicCoordinates(base: PlayerPitchPosition[], _seed = 0): PlayerPitchPosition[] {
  return base;
}
