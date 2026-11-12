'use client';

import React, { useState } from 'react';
import { initialsOf, uploadedPhoto, ovrDisplay, ovrTone } from '@/lib/utils/playerUtils';
import { formatForm } from '@/lib/utils/formUtils';
import { getStatValue, PlayerMatchStats, EMPTY_MATCH_STATS } from '@/lib/utils/statUtils';
import { Match, Profile, StatCategory, sortStatsByCanonicalOrder } from '@/types/database';
import { FormDots, playedAny } from './FormDots';
import { RadarChart } from './RadarChart';
import { Sheet, sheetBtn } from './ui/Sheet';
import { Edit3, Trash2, ShieldCheck, ShieldOff } from 'lucide-react';

const isSuperAdminProfile = (p: Profile) => Boolean(p.email?.toLowerCase().includes('macciolino84'));

function Avatar({ player, size = 'md' }: { player: Profile; size?: 'md' | 'lg' }) {
  const photo = uploadedPhoto(player.avatar_url);
  const box = size === 'lg' ? 'w-14 h-14 text-base' : 'w-11 h-11 text-xs';
  return (
    <span className="relative flex-shrink-0">
      {photo ? (
        <img src={photo} alt="" className={`${box} rounded-full object-cover`} />
      ) : (
        <span className={`${box} rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-300`}>
          {initialsOf(player.full_name)}
        </span>
      )}
      {isSuperAdminProfile(player) && (
        <span
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-slate-950 ring-2 ring-slate-900"
          title="Super Admin"
        >
          ★
        </span>
      )}
    </span>
  );
}

/**
 * Compact player card (Giocatori): avatar, full name, role + last 5 dots, OVR coloured by band.
 * No border, the whole card is one button: tapping it opens the player detail (PlayerDetailSheet).
 */
export function PlayerCardFifa({
  player,
  form = 0,
  recentMatches = [],
  isCurrent = false,
  onOpen,
}: {
  player: Profile;
  form?: number;
  recentMatches?: Match[];
  isCurrent?: boolean;
  onOpen: (player: Profile) => void;
}) {
  const ovr = ovrDisplay(player.overall_rating, form);
  return (
    <button
      type="button"
      onClick={() => onOpen(player)}
      aria-label={`${player.full_name}, ${player.position || 'Esterno'}, OVR ${ovr}`}
      className="w-full h-full flex items-center gap-3 rounded-2xl bg-slate-900 hover:bg-slate-800/80 px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      <Avatar player={player} />
      <span className="flex-1 min-w-0">
        <span className={`block text-[15px] font-semibold leading-tight line-clamp-2 break-words ${isCurrent ? 'text-emerald-300' : 'text-white'}`}>
          {player.full_name}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <span className="truncate">
            {player.position || 'Esterno'}
            {player.is_guest ? ' · ospite' : ''}
          </span>
          {playedAny(player.id, recentMatches) ? (
            <FormDots playerId={player.id} matches={recentMatches} interactive={false} className="flex-shrink-0" />
          ) : (
            <span className="text-[11px] text-slate-500 truncate">nessuna partita recente</span>
          )}
        </span>
      </span>
      <span className={`flex-shrink-0 text-2xl font-bold tabular-nums ${ovrTone(ovr)}`}>{ovr}</span>
    </button>
  );
}

/**
 * Player detail, opened from the card, the list or the table: bottom sheet on phone/tablet, centred modal on PC.
 * Left: the radar (shape only; dashed outline = with "Stato forma"). Right: OVR, last 5, record, admin actions.
 */
export function PlayerDetailSheet({
  player,
  categories,
  form = 0,
  matchStats = EMPTY_MATCH_STATS,
  recentMatches = [],
  isAdmin,
  onEdit,
  onDelete,
  onClose,
  showEmail = false,
  onToggleAdmin,
}: {
  player: Profile;
  categories?: StatCategory[];
  form?: number;
  matchStats?: PlayerMatchStats;
  recentMatches?: Match[];
  isAdmin: boolean;
  onEdit?: (player: Profile) => void;
  onDelete?: (player: Profile) => void;
  onClose: () => void;
  /** Admins see the player's email */
  showEmail?: boolean;
  /** Super admin: make / remove admin */
  onToggleAdmin?: (player: Profile) => void;
}) {
  const [tab, setTab] = useState<'radar' | 'stats'>('radar');

  // Parametri ufficiali dell'admin (con fallback al valore di default), prima e dopo la forma
  const displayStats: Record<string, number> = {};
  if (categories && categories.length > 0) {
    categories.forEach((cat) => (displayStats[cat.name] = getStatValue(player.stats, cat.name, cat.default_value ?? 6)));
  } else {
    Object.assign(displayStats, player.stats || {});
  }
  const baseStats = sortStatsByCanonicalOrder(Object.keys(displayStats)).map((name) => ({ name, value: Number(displayStats[name] ?? 6) }));
  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n * 10) / 10));
  if (form !== 0) Object.keys(displayStats).forEach((k) => (displayStats[k] = clamp(Number(displayStats[k]) + form)));
  const ovr = ovrDisplay(player.overall_rating, form);
  const canDelete = Boolean(onDelete) && !isSuperAdminProfile(player);

  const radar = (
    <div className="flex flex-col items-center">
      <RadarChart
        stats={Object.fromEntries(baseStats.map((b) => [b.name, b.value]))}
        overlay={form !== 0 ? { stats: displayStats, kind: 'form' } : undefined}
        size={250}
        color="emerald"
        showLabels
        showValues={false}
      />
      {form !== 0 && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-emerald-300" aria-hidden="true" /> con lo stato forma
        </p>
      )}
    </div>
  );

  const stats =
    matchStats.played === 0 ? (
      <p className="py-6 text-center text-sm text-slate-400">Le statistiche compaiono dopo la prima partita archiviata.</p>
    ) : (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-3 text-center">
            {(
              [
                ['Vinte', matchStats.won, 'text-emerald-400'],
                ['Pari', matchStats.drawn, 'text-amber-400'],
                ['Perse', matchStats.lost, 'text-red-400'],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label}>
                <span className={`block text-3xl font-bold tabular-nums leading-none ${color}`}>{value}</span>
                <span className="block text-xs text-slate-400 mt-1">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <span className="bg-emerald-500" style={{ width: `${(matchStats.won / matchStats.played) * 100}%` }} />
            <span className="bg-amber-500" style={{ width: `${(matchStats.drawn / matchStats.played) * 100}%` }} />
            <span className="bg-red-500" style={{ width: `${(matchStats.lost / matchStats.played) * 100}%` }} />
          </div>
        </div>
        <dl className="divide-y divide-slate-800 rounded-xl bg-slate-950/50 px-3 text-sm">
          {(
            [
              ['Presenze', String(matchStats.played)],
              ['Gol', String(matchStats.goals)],
              ['MVP', String(matchStats.mvp)],
              ['% vittorie', `${Math.round((matchStats.won / matchStats.played) * 100)}%`],
              ['Gol a partita', (matchStats.goals / matchStats.played).toFixed(1).replace('.', ',')],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <dt className="text-slate-400">{label}</dt>
              <dd className="font-semibold text-white tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );

  return (
    <Sheet
      onClose={onClose}
      size="lg"
      height="tall"
      title={
        <span className="flex items-center gap-3 min-w-0">
          <Avatar player={player} size="lg" />
          <span className="min-w-0">
            <span className="block leading-tight break-words">{player.full_name}</span>
            <span className="block text-sm font-normal text-slate-400 mt-0.5">
              {player.position || 'Esterno'}
              {player.is_guest ? ' · ospite' : ''}
              {form !== 0 && (
                <span className={form > 0 ? 'text-orange-300' : 'text-sky-300'}>
                  {' '}
                  · {form > 0 ? '🔥 in forma' : '❄️ fuori forma'} {formatForm(form)}
                </span>
              )}
            </span>
            {showEmail && player.email && <span className="block text-xs font-normal text-slate-500 mt-0.5 break-all">{player.email}</span>}
          </span>
        </span>
      }
      footer={
        isAdmin && (onEdit || canDelete || onToggleAdmin) ? (
          <>
            {onToggleAdmin && !player.is_guest && !isSuperAdminProfile(player) && (
              <button type="button" onClick={() => onToggleAdmin(player)} className={sheetBtn.secondary}>
                {player.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {player.role === 'admin' ? 'Togli admin' : 'Rendi admin'}
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => onDelete?.(player)} className={`${sheetBtn.danger} sm:mr-auto`}>
                <Trash2 className="h-4 w-4" /> Elimina
              </button>
            )}
            {onEdit && (
              <button type="button" onClick={() => onEdit(player)} className={sheetBtn.primary}>
                <Edit3 className="h-4 w-4" /> Modifica
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {/* OVR e ultime 5 */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-950/50 px-4 py-3">
        <div>
          <span className={`block text-4xl font-bold tabular-nums leading-none ${ovrTone(ovr)}`}>{ovr}</span>
          <span className="block text-xs text-slate-400 mt-1">OVR</span>
        </div>
        <div className="text-right">
          <span className="block text-xs text-slate-400 mb-1">Ultime 5</span>
          <FormDots playerId={player.id} matches={recentMatches} size="md" />
        </div>
      </div>

      {/* Telefono e tablet: schede Abilità / Statistiche. PC: le due cose affiancate */}
      <div className="lg:hidden space-y-4">
        <div className="flex bg-slate-950 p-1 rounded-xl text-sm" role="tablist">
          {(
            [
              ['radar', 'Abilità'],
              ['stats', 'Statistiche'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${tab === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'radar' ? radar : stats}
      </div>
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
        {radar}
        {stats}
      </div>
    </Sheet>
  );
}
