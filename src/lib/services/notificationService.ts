/**
 * Notifications to the players of a match.
 *
 * NOT ACTIVE YET: web push (Firebase Cloud Messaging, free) arrives with the next phase.
 * The app already calls these functions at the right moments, so switching notifications on
 * will only need this file (plus the Vercel API route that sends them).
 */
export type MatchNotification =
  | { type: 'match_confirmed'; date: string; playerIds: string[] }
  | { type: 'teams_changed'; date: string; playerIds: string[] }
  | { type: 'substitution'; date: string; playerIds: string[]; outName: string; inName: string };

export async function notifyMatchPlayers(event: MatchNotification): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[Notifiche] (non ancora attive) evento:', event.type, event.date);
  }
}
