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
