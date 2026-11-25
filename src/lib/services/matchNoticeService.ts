'use client';

import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { leagueFetch } from '@/lib/services/leagueService';
import type { MatchNotice, MatchNoticeInput, MySpot, NoticeApplicant, NoticeError } from '@/types/matchNotice';

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

/** Notices of one match of a league (the managers' panel inside the match), the latest first. */
export function subscribeMatchNotices(leagueId: string, matchId: string, onChange: (notices: MatchNotice[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'match_notices'), where('leagueId', '==', leagueId), where('matchId', '==', matchId)),
    (snap) =>
      onChange(snap.docs.map((d) => ({ ...(d.data() as MatchNotice), id: d.id })).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    () => onChange([])
  );
}

/** The spots this person took on the board (their own copy, kept in sync by the server). */
export function subscribeMySpots(profileId: string, onChange: (spots: MySpot[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'profiles', profileId, 'spots'),
    (snap) => onChange(snap.docs.map((d) => d.data() as MySpot)),
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

/** Creates a notice for a match of the ACTIVE league; returns its id or the error. */
export async function createMatchNotice(notice: MatchNoticeInput): Promise<{ id: string } | { error: NoticeResult }> {
  const data = await post({ action: 'create', notice });
  return data.ok && typeof data.id === 'string' ? { id: data.id } : { error: result(data) };
}

export const updateMatchNotice = async (id: string, notice: Partial<MatchNoticeInput>) => result(await post({ action: 'update', id, notice }));
export const closeMatchNotice = async (id: string) => result(await post({ action: 'close', id }));
export const cancelMatchNotice = async (id: string) => result(await post({ action: 'cancel', id }));
/** After the match: sends one person who took a spot the league's invite link. */
export const inviteNoticeApplicant = async (id: string, profileId: string) => result(await post({ action: 'invite', id, profileId }));
/** Before the match: takes one person out (frees the spot; the notice reopens if it was full). */
export const removeNoticeApplicant = async (id: string, profileId: string) => result(await post({ action: 'remove', id, profileId }));
/** The person gives their spot back before the match (it disappears from everywhere); also clears a cancelled / removed one. */
export const leaveNoticeSpot = async (id: string) => result(await post({ action: 'leave', id }));
/** The match as an external player sees it: teams, own MVP vote, vote window, score. */
export async function fetchExternalMatch(id: string): Promise<ExternalMatchView | null> {
  const data = await post({ action: 'match_view', id });
  return data.ok ? (data as unknown as ExternalMatchView) : null;
}
/** The external player's MVP vote. */
export const voteExternalMvp = async (id: string, playerId: string) => result(await post({ action: 'mvp_vote', id, playerId }));

export interface ExternalMatchView {
  teams: { white: { id: string; name: string }[]; black: { id: string; name: string }[] };
  myVote: string | null;
  opensAt: number;
  closesAt: number;
  score: { white: number; black: number } | null;
}
/** "Prendi il posto" */
export const takeNoticeSpot = async (id: string) => result(await post({ action: 'take', id }));
