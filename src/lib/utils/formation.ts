export interface PlayerPitchPosition {
  x: number; // percentuale orizzontale (0-100)
  y: number; // percentuale verticale (0-100)
  roleLabel: string;
}

/**
 * Coordinate calcolate per visualizzazione verticale da smartphone (mobile-first)
 * Squadra Bianca in alto (0% -> 48%)
 * Squadra Nera in basso (52% -> 100%)
 * Spaziature studiate per evitare qualsiasi sovrapposizione visiva
 */
export const WHITE_TEAM_COORDINATES: PlayerPitchPosition[] = [
  { x: 50, y: 7, roleLabel: 'POR' },    // Portiere
  { x: 25, y: 20, roleLabel: 'LAT SX' }, // Terzino / Laterale SX
  { x: 75, y: 20, roleLabel: 'LAT DX' }, // Terzino / Laterale DX
  { x: 50, y: 32, roleLabel: 'CEN' },    // Centrocampista
  { x: 50, y: 44, roleLabel: 'ATT' },    // Pivot / Attaccante
];

export const BLACK_TEAM_COORDINATES: PlayerPitchPosition[] = [
  { x: 50, y: 56, roleLabel: 'ATT' },    // Pivot / Attaccante
  { x: 50, y: 68, roleLabel: 'CEN' },    // Centrocampista
  { x: 25, y: 80, roleLabel: 'LAT SX' }, // Terzino / Laterale SX
  { x: 75, y: 80, roleLabel: 'LAT DX' }, // Terzino / Laterale DX
  { x: 50, y: 93, roleLabel: 'POR' },    // Portiere
];

/**
 * Aggiunge un lieve jitter controllato (senza causare sovrapposizioni)
 * per dare un tocco dinamico e realistico
 */
export function getOrganicCoordinates(base: PlayerPitchPosition[], seed = 0): PlayerPitchPosition[] {
  return base.map((pos, idx) => {
    // Genera piccolo offset pseudo-casuale deterministico
    const offsetX = ((seed * (idx + 1) * 7) % 7) - 3; // tra -3 e +3
    const offsetY = ((seed * (idx + 2) * 5) % 5) - 2; // tra -2 e +2
    return {
      x: Math.max(12, Math.min(88, pos.x + offsetX)),
      y: Math.max(5, Math.min(95, pos.y + offsetY)),
      roleLabel: pos.roleLabel,
    };
  });
}
