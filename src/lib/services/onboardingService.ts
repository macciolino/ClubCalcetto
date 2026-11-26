'use client';

import { leagueFetch } from '@/lib/services/leagueService';
import type { PublicLeague } from '@/lib/utils/publicLeagues';

/** Onboarding of a new account: the Radar Base step and the public leagues. Writes go through the server. */

/** Saves the Radar Base (an integer 1–10 for every base parameter). Only while the step is pending. */
export async function saveBaseRadar(radar: Record<string, number>): Promise<boolean> {
  const { data } = await leagueFetch('/api/account/base-radar', { method: 'POST', body: JSON.stringify({ radar }) });
  return data.ok === true;
}

/** The public leagues the account is not in yet, or null when they cannot be loaded. */
export async function fetchPublicLeagues(): Promise<PublicLeague[] | null> {
  const { data } = await leagueFetch('/api/leagues/public');
  return data.ok === true && Array.isArray(data.leagues) ? (data.leagues as PublicLeague[]) : null;
}

/** Joins a public league directly (new card from the Radar Base, values unconfirmed). */
export async function joinPublicLeague(leagueId: string): Promise<boolean> {
  const { data } = await leagueFetch('/api/leagues/public', { method: 'POST', body: JSON.stringify({ leagueId }) });
  return data.ok === true;
}
