import { auth } from '@/lib/firebase/config';
import type { MatchFormat } from '@/types/database';
import type { LeagueVisibility } from '@/types/league';

export interface CreateLeagueInput {
  name: string;
  visibility: LeagueVisibility;
  defaultFormat?: MatchFormat;
  defaultLocation?: string;
  joinAsPlayer: boolean;
}

export type CreateLeagueError = 'bad_request' | 'too_many' | 'email_not_verified' | 'failed';

/** Multi-league step 2: creates a league on the server (the creator becomes president). */
export async function createLeagueRequest(input: CreateLeagueInput): Promise<{ id: string } | { error: CreateLeagueError }> {
  const user = auth.currentUser;
  if (!user) return { error: 'failed' };
  try {
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (data.ok && data.id) return { id: data.id };
    const known: CreateLeagueError[] = ['bad_request', 'too_many', 'email_not_verified'];
    return { error: known.includes(data.error as CreateLeagueError) ? (data.error as CreateLeagueError) : 'failed' };
  } catch {
    return { error: 'failed' };
  }
}

/** An invite code from what the user typed or pasted: a bare code or a link ending in /join/<code>. */
export function inviteCodeFrom(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/join\/([A-Za-z0-9_-]{6,64})(?:[/?#].*)?$/) || t.match(/^([A-Za-z0-9_-]{6,64})$/);
  return m ? m[1] : null;
}
