'use client';

import { useEffect, useMemo, useState } from 'react';
import { Match, MvpVote } from '@/types/database';
import { subscribeAppSettings, subscribeMatches, subscribeMvpVotes } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { FORM_MATCHES, FormSettings, computeForms } from '@/lib/utils/formUtils';

/** Admin switches of the "Stato forma" (Admin → Campi & Parametri). Off by default. */
export function useFormSettings(): FormSettings {
  const [settings, setSettings] = useState<FormSettings>({ goals: false, mvp: false });
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeAppSettings((s) => setSettings({ goals: s.form_goals === true, mvp: s.form_mvp === true }));
    return () => unsub();
  }, []);
  return settings;
}

/** Current "Stato forma" of every player (map playerId → bonus, only players with a bonus), in real time. */
export function useForms(): { forms: Map<string, number>; settings: FormSettings } {
  const settings = useFormSettings();
  const [matches, setMatches] = useState<Match[]>([]);
  const [votesByDate, setVotesByDate] = useState<Record<string, MvpVote[]>>({});

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeMatches((list) => setMatches(list.filter((m) => m.status === 'completed')));
    return () => unsub();
  }, []);

  // Voti MVP solo delle ultime 3 partite archiviate
  const lastDates = useMemo(
    () =>
      [...matches]
        .map((m) => m.match_date || m.id)
        .sort()
        .reverse()
        .slice(0, FORM_MATCHES),
    [matches]
  );
  const datesKey = lastDates.join('|');
  useEffect(() => {
    if (!settings.mvp || lastDates.length === 0) return;
    const unsubs = lastDates.map((date) =>
      subscribeMvpVotes(date, (votes) => setVotesByDate((prev) => ({ ...prev, [date]: votes })))
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, settings.mvp]);

  const forms = useMemo(() => computeForms(matches, votesByDate, settings), [matches, votesByDate, settings]);
  return { forms, settings };
}
