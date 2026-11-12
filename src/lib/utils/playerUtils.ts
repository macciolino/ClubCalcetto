/**
 * A player's real photo = only one uploaded in the app (JPEG made by the app). Google's automatic picture
 * (a letter on a coloured background) and old emoji avatars do not count: those players show their initials.
 */
export function uploadedPhoto(url: string | null | undefined): string | null {
  return url && url.startsWith('data:image/') && !url.startsWith('data:image/svg') ? url : null;
}

/** Initials of first name and surname ("Marco Bianchi" → "MB", "Andrei" → "A"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * Role badge colours (one legend for the whole app). Deliberately NOT green/amber/red, which mean
 * won/drawn/lost and starter/waiting: POR sky, DIF indigo, EST teal, PUN orange.
 */
export const POSITION_BADGE: Record<string, string> = {
  Portiere: 'bg-sky-500/15 text-sky-300',
  Difensore: 'bg-indigo-500/15 text-indigo-300',
  Esterno: 'bg-teal-500/15 text-teal-300',
  Punta: 'bg-orange-500/15 text-orange-300',
};

/** OVR shown FIFA-style (7.9 → 79), with the "Stato forma" bonus, between 10 and 100. */
export function ovrDisplay(overall: number | undefined, form = 0): number {
  return Math.round(Math.max(1, Math.min(10, (Number(overall) || 6) + form)) * 10);
}

/** OVR colour by band, the same everywhere: 80+ green, 70-79 white, under 70 grey. */
export function ovrTone(ovr: number): string {
  return ovr >= 80 ? 'text-emerald-400' : ovr >= 70 ? 'text-white' : 'text-slate-400';
}
