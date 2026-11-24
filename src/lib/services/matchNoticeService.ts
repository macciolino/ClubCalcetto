'use client';

import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { leagueFetch } from '@/lib/services/leagueService';
import type { MatchNotice, MatchNoticeInput, NoticeApplicant, NoticeError } from '@/types/matchNotice';

/** "Bacheca Avvisi / Cerco Giocatore" from the app. Reads from Firestore, writes through /api/match-notices. */

export type NoticeResult = 'ok' | NoticeError | 'failed';
const result = (data: Record<string, unknown>): NoticeResult =>
  data.ok ? 'ok' : typeof data.error === 'string' && data.error !== 'server_error' ? (data.error as NoticeResult) : 'failed';

const post = async (body: Record<string, unknown>) =>
  (await leagueFetch('/api/match-notices', { method: 'POST', body: JSON.stringify(body) })).data;

/** Open notices of every league, the soonest first (sorted here: no composite index needed). */
export function subscribeOpenNotices(onChange: (notices: MatchNotice[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'match_notices'), where('status', '==', 'OPEN')),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ ...(d.data() as MatchNotice), id: d.id }))
          .filter((n) => Date.parse(n.dateTime) > Date.now())
          .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
      ),
    () => onChange([])
  );
}

/** Every notice of one league (managers' list: open, closed and cancelled), the latest match first. */
export function subscribeLeagueNotices(leagueId: string, onChange: (notices: MatchNotice[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'match_notices'), where('leagueId', '==', leagueId)),
    (snap) =>
      onChange(snap.docs.map((d) => ({ ...(d.data() as MatchNotice), id: d.id })).sort((a, b) => b.dateTime.localeCompare(a.dateTime))),
    () => onChange([])
  );
}

/** Who took a spot (readable by the league's managers and platform staff), in order of arrival. */
export function subscribeApplicants(noticeId: string, onChange: (list: NoticeApplicant[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'match_notices', noticeId, 'applicants'),
    (snap) => onChange(snap.docs.map((d) => d.data() as NoticeApplicant).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))),
    () => onChange([])
  );
}

/** Whether this profile already took a spot on the notice (each person reads only their own entry). */
export function subscribeMySpot(noticeId: string, profileId: string, onChange: (taken: boolean) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'match_notices', noticeId, 'applicants', profileId),
    (snap) => onChange(snap.exists()),
    () => onChange(false)
  );
}

/** Creates a notice for a match of the ACTIVE league; returns its id or the error. */
export async function createMatchNotice(notice: MatchNoticeInput): Promise<{ id: string } | { error: NoticeResult }> {
  const data = await post({ action: 'create', notice });
  return data.ok && typeof data.id === 'string' ? { id: data.id } : { error: result(data) };
}

export const updateMatchNotice = async (id: string, notice: Partial<MatchNoticeInput>) => result(await post({ action: 'update', id, notice }));
export const closeMatchNotice = async (id: string) => result(await post({ action: 'close', id }));
export const cancelMatchNotice = async (id: string) => result(await post({ action: 'cancel', id }));
/** "Prendi il posto" */
export const takeNoticeSpot = async (id: string) => result(await post({ action: 'take', id }));
