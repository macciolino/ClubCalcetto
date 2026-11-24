'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { subscribeMySpots } from '@/lib/services/matchNoticeService';
import { careerSummary, type CareerSummary, type LeagueRecord } from '@/lib/utils/career';
import type { MySpot } from '@/types/matchNotice';

/**
 * "Carriera globale" of the signed-in person: the record on their card in EVERY league they belong to (members
 * read their own league's cards) + the spots taken on the board. null while loading.
 */
export function useCareer(profileId: string | null): CareerSummary | null {
  const { leagues } = useActiveLeague();
  const [records, setRecords] = useState<LeagueRecord[] | null>(null);
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
        const card = (await getDoc(doc(db, 'leagues', l.id, 'players', l.playerId)).catch(() => null))?.data();
        return { leagueId: l.id, leagueName: l.name, won: card?.matches_won, drawn: card?.matches_drawn, lost: card?.matches_lost } as LeagueRecord;
      })
    ).then((r) => {
      if (!alive) return;
      setRecords(r);
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

  return records && spots ? careerSummary(records, spots, now) : null;
}
