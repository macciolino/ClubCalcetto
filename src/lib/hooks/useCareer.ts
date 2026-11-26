'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { subscribeMySpots } from '@/lib/services/matchNoticeService';
import { careerSummary, personalHistory, type CareerSummary, type HistoryEntry, type LeagueRecord } from '@/lib/utils/career';
import { outcomeFor } from '@/lib/utils/externalPlayers';
import type { Match } from '@/types/database';
import type { MySpot } from '@/types/matchNotice';

/**
 * "Carriera globale" of the signed-in person: the record on their card in EVERY league they belong to (members
 * read their own league's cards and matches) + the spots taken on the board. Also the personal history (every
 * archived match they played, in their leagues and as an external). null while loading.
 */
export function useCareer(profileId: string | null): { summary: CareerSummary; history: HistoryEntry[] } | null {
  const { leagues } = useActiveLeague();
  const [records, setRecords] = useState<LeagueRecord[] | null>(null);
  const [leagueHistory, setLeagueHistory] = useState<HistoryEntry[]>([]);
  const [spots, setSpots] = useState<MySpot[] | null>(null);
  // Plain "now" for the summary, refreshed when the data changes (not read while rendering)
  const [now, setNow] = useState(0);

  const withCard = leagues.filter((l) => l.playerId);
  const key = withCard.map((l) => `${l.id}:${l.playerId}`).join('|');

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let alive = true;
    Promise.all(
      withCard.map(async (l) => {
        const [card, matches] = await Promise.all([
          getDoc(doc(db, 'leagues', l.id, 'players', l.playerId)).catch(() => null),
          getDocs(collection(db, 'leagues', l.id, 'matches')).catch(() => null),
        ]);
        const c = card?.data();
        const record: LeagueRecord = { leagueId: l.id, leagueName: l.name, won: c?.matches_won, drawn: c?.matches_drawn, lost: c?.matches_lost, stats: c?.stats, stat_status: c?.stat_status };
        const played: HistoryEntry[] = [];
        matches?.docs.forEach((d) => {
          const m = d.data() as Match;
          if (m.status !== 'completed') return;
          const o = outcomeFor(m, l.playerId);
          if (!o) return;
          played.push({
            key: `${l.id}:${d.id}`,
            date: m.match_date || d.id,
            leagueId: l.id,
            leagueName: l.name,
            external: false,
            result: o.result,
            score: { white: m.score_white ?? 0, black: m.score_black ?? 0 },
            goals: o.goals,
            mvp: o.mvp,
          });
        });
        return { record, played };
      })
    ).then((r) => {
      if (!alive) return;
      setRecords(r.map((x) => x.record));
      setLeagueHistory(r.flatMap((x) => x.played));
      setNow(Date.now());
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` lists the leagues with a card
  }, [key]);

  useEffect(() => {
    if (!profileId || !isFirebaseConfigured) return;
    return subscribeMySpots(profileId, (s) => {
      setSpots(s);
      setNow(Date.now());
    });
  }, [profileId]);

  return records && spots ? { summary: careerSummary(records, spots, now), history: personalHistory(leagueHistory, spots, now) } : null;
}
