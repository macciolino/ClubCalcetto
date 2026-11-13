'use client';

import React, { useState } from 'react';
import { initialsOf, uploadedPhoto, ovrDisplay, ovrTone } from '@/lib/utils/playerUtils';
import { formatForm } from '@/lib/utils/formUtils';
import { getStatValue, PlayerMatchStats, EMPTY_MATCH_STATS } from '@/lib/utils/statUtils';
import { Match, Profile, StatCategory, sortStatsByCanonicalOrder } from '@/types/database';
import { FormDots, playedAny } from './FormDots';
import { RadarChart } from './RadarChart';
import { Sheet } from './ui/Sheet';
import { Edit3, Trash2, ShieldCheck, ShieldOff, MoreHorizontal, MessageCircle } from 'lucide-react';
import { menu } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';

const isSuperAdminProfile = (p: Profile) => Boolean(p.email?.toLowerCase().includes('macciolino84'));

function Avatar({ player, size = 'md' }: { player: Profile; size?: 'md' | 'lg' }) {
  const t = useTranslations('playerCard');
  const photo = uploadedPhoto(player.avatar_url);
  const box = size === 'lg' ? 'w-14 h-14 text-base' : 'w-11 h-11 text-xs';
  return (
    <span className="relative flex-shrink-0">
      {photo ? (
        <img src={photo} alt="" className={`${box} rounded-full object-cover`} />
      ) : (
        <span className={`${box} rounded-full bg-card-hover flex items-center justify-center font-bold text-accent-text`}>
          {initialsOf(player.full_name)}
        </span>
      )}
      {isSuperAdminProfile(player) && (
        <span
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-on-accent ring-2 ring-card"
          title={t('superAdmin')}
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
  const t = useTranslations('playerCard');
  const labels = usePlayerLabels();
  return (
    <button
      type="button"
      onClick={() => onOpen(player)}
      aria-label={`${player.full_name}, ${labels.position(player.position)}, OVR ${ovr}`}
      className="w-full h-full flex items-center gap-3 rounded-2xl bg-card hover:bg-card-hover/80 px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Avatar player={player} />
      <span className="flex-1 min-w-0">
        <span className={`block text-[15px] font-semibold leading-tight line-clamp-2 break-words ${isCurrent ? 'text-accent-text' : 'text-primary'}`}>
          {player.full_name}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-secondary">
          <span className="truncate">
            {labels.position(player.position)}
            {player.is_guest ? t('guestSuffix') : ''}
          </span>
          {playedAny(player.id, recentMatches) ? (
            <FormDots playerId={player.id} matches={recentMatches} interactive={false} className="flex-shrink-0" />
          ) : (
            <span className="text-[11px] text-muted truncate">{t('noRecent')}</span>
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
  onInvite,
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
  /** Admins, guests only: invite link on WhatsApp (the guest registers and keeps matches and stats) */
  onInvite?: (player: Profile) => void;
}) {
  const [tab, setTab] = useState<'radar' | 'stats'>('radar');
  const t = useTranslations('playerCard');
  const labels = usePlayerLabels();

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
  const canToggleAdmin = Boolean(onToggleAdmin) && !player.is_guest && !isSuperAdminProfile(player);
  const canInvite = Boolean(onInvite) && player.is_guest;
  const [menuOpen, setMenuOpen] = useState(false);

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
        <p className="text-xs text-secondary flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-emerald-300" aria-hidden="true" /> {t('withForm')}
        </p>
      )}

      {/* Valori dei parametri: piccole tessere con sigla, numero e barra sottile */}
      <ul className="mt-4 w-full grid grid-cols-4 gap-2" aria-label={t('parameters')}>
        {baseStats.map((b) => {
          const value = form !== 0 ? Number(displayStats[b.name] ?? b.value) : b.value;
          const code = labels.statCode(b.name);
          return (
            <li key={b.name} className="rounded-xl bg-app/60 px-2 pt-2 pb-2.5 text-center" title={labels.statName(b.name)}>
              <span className="block text-[10px] font-semibold tracking-wider text-muted">{code}</span>
              <span className="block mt-0.5 text-lg font-semibold text-primary tabular-nums leading-tight">
                {String(Math.round(value * 10) / 10).replace('.', ',')}
              </span>
              <span className="mt-1.5 mx-auto block h-1 w-full max-w-[3rem] rounded-full bg-card-hover overflow-hidden" aria-hidden="true">
                <span
                  className={`block h-full rounded-full ${value >= 8 ? 'bg-accent/90' : value >= 6 ? 'bg-emerald-600' : 'bg-slate-500'}`}
                  style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const stats =
    matchStats.played === 0 ? (
      <p className="py-6 text-center text-sm text-secondary">{t('statsAfterFirst')}</p>
    ) : (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-3 text-center">
            {(
              [
                [t('won'), matchStats.won, 'text-accent-text'],
                [t('drawn'), matchStats.drawn, 'text-warning'],
                [t('lost'), matchStats.lost, 'text-danger'],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label}>
                <span className={`block text-3xl font-bold tabular-nums leading-none ${color}`}>{value}</span>
                <span className="block text-xs text-secondary mt-1">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-card-hover" aria-hidden="true">
            <span className="bg-accent" style={{ width: `${(matchStats.won / matchStats.played) * 100}%` }} />
            <span className="bg-amber-500" style={{ width: `${(matchStats.drawn / matchStats.played) * 100}%` }} />
            <span className="bg-red-500" style={{ width: `${(matchStats.lost / matchStats.played) * 100}%` }} />
          </div>
        </div>
        <dl className="divide-y divide-line rounded-xl bg-app/50 px-3 text-sm">
          {(
            [
              [t('played'), String(matchStats.played)],
              [t('goals'), String(matchStats.goals)],
              [t('mvp'), String(matchStats.mvp)],
              [t('winPct'), `${Math.round((matchStats.won / matchStats.played) * 100)}%`],
              [t('goalsPerMatch'), (matchStats.goals / matchStats.played).toFixed(1).replace('.', ',')],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <dt className="text-secondary">{label}</dt>
              <dd className="font-semibold text-primary tabular-nums">{value}</dd>
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
            <span className="block text-sm font-normal text-secondary mt-0.5">
              {labels.position(player.position)}
              {player.is_guest ? t('guestSuffix') : ''}
              {form !== 0 && (
                <span className={form > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-sky-700 dark:text-sky-300'}>
                  {' '}
                  · {form > 0 ? t('inForm') : t('outOfForm')} {formatForm(form)}
                </span>
              )}
            </span>
            {showEmail && player.email && <span className="block text-xs font-normal text-muted mt-0.5 break-all">{player.email}</span>}
          </span>
        </span>
      }
      headerActions={
        isAdmin && (onEdit || canDelete || canToggleAdmin || canInvite) ? (
          <>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(player)}
                aria-label={t('editPlayer')}
                title={t('edit')}
                className="p-2 rounded-full text-secondary hover:text-primary hover:bg-card-hover"
              >
                <Edit3 className="h-5 w-5" />
              </button>
            )}
            {(canDelete || canToggleAdmin || canInvite) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label={t('moreActions')}
                  aria-expanded={menuOpen}
                  className="p-2 rounded-full text-secondary hover:text-primary hover:bg-card-hover"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                    <div className={`absolute right-0 top-full mt-1 z-20 w-56 ${menu.panel}`} role="menu">
                      {canInvite && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onInvite?.(player);
                          }}
                          className={menu.item}
                        >
                          <MessageCircle className="h-4 w-4 text-accent-text" /> {t('inviteWhatsapp')}
                        </button>
                      )}
                      {canToggleAdmin && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onToggleAdmin?.(player);
                          }}
                          className={menu.item}
                        >
                          {player.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                          {player.role === 'admin' ? t('removeAdmin') : t('makeAdmin')}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onDelete?.(player);
                          }}
                          className={menu.danger}
                        >
                          <Trash2 className="h-4 w-4" /> {t('delete')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : undefined
      }
    >
      {/* OVR e ultime 5 */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-app/50 px-4 py-3">
        <div>
          <span className={`block text-4xl font-bold tabular-nums leading-none ${ovrTone(ovr)}`}>{ovr}</span>
          <span className="block text-xs text-secondary mt-1">OVR</span>
        </div>
        <div className="text-right">
          <span className="block text-xs text-secondary mb-1">{t('last5')}</span>
          <FormDots playerId={player.id} matches={recentMatches} size="md" />
        </div>
      </div>

      {/* Telefono e tablet: schede Abilità / Statistiche. PC: le due cose affiancate */}
      <div className="lg:hidden space-y-4">
        <div className="flex bg-app p-1 rounded-xl text-sm" role="tablist">
          {(
            [
              ['radar', t('tabSkills')],
              ['stats', t('tabStats')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${tab === key ? 'bg-line-strong text-primary' : 'text-secondary hover:text-primary'}`}
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
