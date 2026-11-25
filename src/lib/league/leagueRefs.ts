import { collection, doc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { CALCETTARI_LEAGUE_ID } from '@/types/league';

/**
 * Multi-league (1B): every club collection lives under `leagues/{activeLeagueId}/…`.
 * The active league is set by ActiveLeagueProvider BEFORE the pages mount (they remount when it changes),
 * so services read it here instead of receiving it as a parameter.
 */
let activeLeagueId: string = CALCETTARI_LEAGUE_ID;
/** False while the account's leagues are still loading: `activeLeagueId` is then only a placeholder (the default league) */
let resolved = false;

export function setActiveLeagueForData(leagueId: string, isResolved = true) {
  activeLeagueId = leagueId;
  resolved = isResolved;
}

/**
 * May a copy of league data be saved on this device? Not before the active league is known: until then the pages
 * may already be listening to the placeholder league, and what arrives is not this person's active league (someone in
 * two leagues would find the other league's fields, players and prices in the copies of the first). Without Firebase
 * (local development) the copies ARE the data, so they are always saved.
 */
export function canCacheLeagueData(): boolean {
  return !isFirebaseConfigured || resolved;
}

export function currentLeagueId(): string {
  return activeLeagueId;
}

/** `leagues/{active}/{name}/…` */
export function lcol(name: string, ...rest: string[]) {
  return collection(db, 'leagues', activeLeagueId, name, ...rest);
}

/** `leagues/{active}/{name}/{id}/…` */
export function ldoc(name: string, id: string, ...rest: string[]) {
  return doc(db, 'leagues', activeLeagueId, name, id, ...rest);
}
