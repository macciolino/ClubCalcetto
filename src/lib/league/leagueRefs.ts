import { collection, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CALCETTARI_LEAGUE_ID } from '@/types/league';

/**
 * Multi-league (1B): every club collection lives under `leagues/{activeLeagueId}/…`.
 * The active league is set by ActiveLeagueProvider BEFORE the pages mount (they remount when it changes),
 * so services read it here instead of receiving it as a parameter.
 */
let activeLeagueId: string = CALCETTARI_LEAGUE_ID;

export function setActiveLeagueForData(leagueId: string) {
  activeLeagueId = leagueId;
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
