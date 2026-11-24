import type { MatchFormat } from '@/types/database';

/**
 * "Bacheca Avvisi / Cerco Giocatore" (platform-wide). A league looks for players for one of its matches; any
 * signed-in user with a verified email can take a spot. See docs/ARCHITECTURE.md §3.5.
 *
 *  match_notices/{noticeId}                       the notice (read: every verified user; write: server only)
 *  match_notices/{noticeId}/applicants/{profileId} who took a spot (read: the person, the league's managers, staff)
 */
export type NoticeRole = 'ANY' | 'GOALKEEPER' | 'ROTATION_GOALKEEPER' | 'OUTFIELD';
export type ShirtColor = 'DARK' | 'LIGHT';
/** OPEN = on the board; CLOSED = spots filled (or closed by a manager); CANCELLED = withdrawn by a manager */
export type NoticeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

/** Error codes of /api/match-notices (each one has its own translated message in the app) */
export type NoticeError =
  | 'bad_request'
  | 'not_found'
  | 'forbidden'
  | 'suspended'
  | 'not_open'
  | 'cancelled'
  | 'expired'
  | 'full'
  | 'already_joined'
  | 'already_in_match'
  | 'below_filled';

export const NOTICE_ROLES: NoticeRole[] = ['ANY', 'GOALKEEPER', 'ROTATION_GOALKEEPER', 'OUTFIELD'];
export const SHIRT_COLORS: ShirtColor[] = ['DARK', 'LIGHT'];

/** What a manager writes (create / update). */
export interface MatchNoticeInput {
  /** The match it refers to: in this app a match is identified by its day, `YYYY-MM-DD` (matches/{date}) */
  matchId: string;
  /** Kick-off, ISO 8601 */
  dateTime: string;
  locationName: string;
  address: string;
  format: MatchFormat;
  totalFieldCost: number;
  costPerPlayer: number;
  spotsNeeded: number;
  roleNeeded: NoticeRole;
  shirtColor: ShirtColor;
  notes?: string;
}

export interface MatchNotice extends MatchNoticeInput {
  id: string;
  leagueId: string;
  leagueName: string;
  spotsFilled: number;
  status: NoticeStatus;
  /** Why it is CLOSED: 'full' (automatic, reopens if a manager adds spots) or 'manual' */
  closedReason?: 'full' | 'manual';
  createdBy: { profileId: string; name: string };
  created_at: string;
  updated_at: string;
}

/** One person who took a spot. They do NOT become a member of the league. */
export interface NoticeApplicant {
  profileId: string;
  userId: string;
  displayName: string;
  joinedAt: string;
}
