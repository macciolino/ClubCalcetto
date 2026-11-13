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

// Le posizioni in campo di ogni formato e modulo sono in lib/utils/matchFormat.ts (FORMATIONS).
