'use client';

import { initialsOf, uploadedPhoto } from '@/lib/utils/playerUtils';
import { formatForm } from '@/lib/utils/formUtils';
import { getStatValue, PlayerMatchStats, EMPTY_MATCH_STATS } from '@/lib/utils/statUtils';
import React, { useState } from 'react';
import { Match, Profile, StatCategory, sortStatsByCanonicalOrder } from '@/types/database';
import { FormDots } from './FormDots';
import { RadarChart } from './RadarChart';
import { ChevronDown, Edit3, Trash2 } from 'lucide-react';

interface PlayerCardFifaProps {
  player: Profile;
  isAdmin: boolean;
  onEdit?: (player: Profile) => void;
  onDelete?: (player: Profile) => void;
  /** Parametri ufficiali configurati dall'admin (Campi & Parametri). Se assenti usa le chiavi del giocatore. */
  categories?: StatCategory[];
  /** "Stato forma" (ultime 3 partite): aggiunto a ogni parametro e all'OVR mostrati. La scheda salvata non cambia. */
  form?: number;
  /** Gol, presenze, vinte/pareggiate/perse e MVP dalle partite archiviate (stessi numeri di Storico e Profilo) */
  matchStats?: PlayerMatchStats;
  /** The club's last archived matches, oldest first (form tracker with 5 fixed slots) */
  recentMatches?: Match[];
}

export function PlayerCardFifa({
  player,
  isAdmin,
  onEdit,
  onDelete,
  categories,
  form = 0,
  matchStats = EMPTY_MATCH_STATS,
  recentMatches = [],
}: PlayerCardFifaProps) {
  const [activeTab, setActiveTab] = useState<'radar' | 'stats'>('radar');
  // Chiusa all'inizio: si apre con un tocco (fisarmonica)
  const [open, setOpen] = useState(false);
  const isSuperAdmin = player.email?.toLowerCase().includes('macciolino84');

  // Statistiche mostrate: solo i parametri ufficiali dell'admin, con fallback al valore di default
  const displayStats: Record<string, number> = {};
  if (categories && categories.length > 0) {
    categories.forEach((cat) => {
      displayStats[cat.name] = getStatValue(player.stats, cat.name, cat.default_value ?? 6);
    });
  } else {
    Object.assign(displayStats, player.stats || {});
  }

  // Valori della scheda (prima della forma), per le barre dei parametri
  const baseStats = sortStatsByCanonicalOrder(Object.keys(displayStats)).map((name) => ({
    name,
    value: Number(displayStats[name] ?? 6),
  }));

  // Stato forma: si aggiunge (o toglie) a ogni parametro e all'OVR, sempre tra 1 e 10
  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n * 10) / 10));
  if (form !== 0) {
    Object.keys(displayStats).forEach((k) => {
      displayStats[k] = clamp(Number(displayStats[k]) + form);
    });
  }
  const ovrValue = clamp((Number(player.overall_rating) || 6) + form);
  const ovrDisplay = Math.round(ovrValue * 10); // stile FIFA (es. 7.9 -> 79)

  const photo = uploadedPhoto(player.avatar_url);
  const panelId = `card-${player.id}`;

  return (
    <div
      className={`bg-slate-900 border rounded-2xl transition-colors ${open ? 'border-slate-700' : 'border-slate-800'}`}
    >
      {/* Parte compatta, sempre visibile: tocca per aprire l'ottagono */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <span className="relative flex-shrink-0">
          {photo ? (
            <img src={photo} alt="" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <span className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-300 text-sm">
              {initialsOf(player.full_name)}
            </span>
          )}
          {isSuperAdmin && (
            <span
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-slate-950 ring-2 ring-slate-900"
              title="Super Admin"
            >
              ★
            </span>
          )}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-white truncate">{player.full_name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            <span>{player.position || 'Esterno'}</span>
            {player.is_guest && <span>· ospite</span>}
            {form !== 0 && (
              <span className={form > 0 ? 'text-orange-300' : 'text-sky-300'}>
                · {form > 0 ? '🔥' : '❄️'} {formatForm(form)}
              </span>
            )}
          </span>
          <FormDots playerId={player.id} matches={recentMatches} className="mt-1.5" />
        </span>

        <span className="flex-shrink-0 text-right">
          <span className="block text-2xl font-bold text-white tabular-nums leading-none">{ovrDisplay}</span>
          <span className="block text-[10px] font-semibold text-slate-400 mt-1">OVR</span>
        </span>
        <ChevronDown className={`h-5 w-5 text-slate-500 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* Dettaglio a fisarmonica (altezza animata) */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className={`px-4 pb-4 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex bg-slate-950 p-1 rounded-xl text-xs" role="tablist">
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
                  aria-selected={activeTab === key}
                  tabIndex={open ? 0 : -1}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors ${
                    activeTab === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'radar' ? (
              /* Solo la forma dell'ottagono: i numeri non servono, parla la geometria */
              <div className="pt-2 flex flex-col items-center">
                <RadarChart
                  stats={Object.fromEntries(baseStats.map((b) => [b.name, b.value]))}
                  overlay={form !== 0 ? { stats: displayStats, kind: 'form' } : undefined}
                  size={240}
                  color="emerald"
                  showLabels={true}
                  showValues={false}
                />
                {form !== 0 && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t-2 border-dashed border-emerald-300" aria-hidden="true" /> con lo stato forma
                  </p>
                )}
              </div>
            ) : matchStats.played === 0 ? (
              <div className="py-8 text-center space-y-1">
                <p className="text-sm font-semibold text-slate-300">Ancora nessuna partita</p>
                <p className="text-xs text-slate-500">Le statistiche compaiono dopo la prima partita archiviata.</p>
              </div>
            ) : (
              <div className="pt-4 space-y-4">
                <div className="space-y-2">
                  <div className="grid grid-cols-3 text-center">
                    {(
                      [
                        ['Vinte', matchStats.won, 'text-emerald-300'],
                        ['Pari', matchStats.drawn, 'text-amber-300'],
                        ['Perse', matchStats.lost, 'text-rose-300'],
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
                    <span className="bg-rose-400" style={{ width: `${(matchStats.lost / matchStats.played) * 100}%` }} />
                  </div>
                </div>
                <dl className="divide-y divide-slate-800 rounded-xl bg-slate-950/50 px-3 text-sm">
                  {(
                    [
                      ['Presenze', String(matchStats.played)],
                      ['Gol', String(matchStats.goals)],
                      ['MVP', String(matchStats.mvp)],
                      ['% vittorie', `${Math.round((matchStats.won / matchStats.played) * 100)}%`],
                      ['Gol a partita', String((matchStats.goals / matchStats.played).toFixed(1)).replace('.', ',')],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-2">
                      <dt className="text-slate-400">{label}</dt>
                      <dd className="font-semibold text-white tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {isAdmin && (onEdit || (onDelete && !isSuperAdmin)) && (
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                {onEdit && (
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => onEdit(player)}
                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl text-xs transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Modifica
                  </button>
                )}
                {onDelete && !isSuperAdmin && (
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => onDelete(player)}
                    className="p-2 border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 rounded-xl transition-colors"
                    title="Elimina giocatore"
                    aria-label={`Elimina ${player.full_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
