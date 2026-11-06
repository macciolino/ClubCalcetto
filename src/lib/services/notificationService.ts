import { callNotifyApi } from '@/lib/services/pushService';

/**
 * Notifications to the players of a match (web push via Firebase Cloud Messaging, free).
 * Sent by the server route /api/notify. Who receives them is decided by the admin
 * (Admin → Campi & Parametri → Notifiche): nobody, only admins (test) or all the players concerned.
 */
export type MatchNotification =
  | { type: 'match_confirmed'; date: string; playerIds: string[] }
  | { type: 'teams_changed'; date: string; playerIds: string[] }
  | { type: 'substitution'; date: string; playerIds: string[]; outName: string; inName: string };

export async function notifyMatchPlayers(event: MatchNotification): Promise<void> {
  try {
    await callNotifyApi(event);
  } catch (err) {
    console.warn('[Notifiche] invio non riuscito:', err);
  }
}

/** After a sign-up or withdrawal: the server checks if someone takes a place in the saved teams. */
export function requestTeamsCheck(date: string): void {
  callNotifyApi({ type: 'reconcile', date }).catch(() => undefined);
}
