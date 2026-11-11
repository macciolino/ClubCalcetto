'use client';

import React, { useState, useEffect } from 'react';
import { Presence, Profile } from '@/types/database';
import { CalendarDay } from '@/lib/utils/dateUtils';
import { isTimelockActive } from '@/lib/services/presenceService';
import { Lock, ArrowUp, ArrowDown, UserX, ChevronDown, MoreHorizontal, Check } from 'lucide-react';

interface PresenceCardProps {
  day: CalendarDay;
  presences: Presence[];
  allProfiles: Profile[];
  currentUserId?: string;
  isAdmin: boolean;
  onTogglePresence: (dateString: string) => void;
  onAddGuestPresence?: (dateString: string, guestId: string) => void;
  onRemovePresence?: (presenceId: string) => void;
  isToggling?: boolean;
  /** Day not open yet for players (next week before the admin opens voting) */
  isLocked?: boolean;
  /** This day reached 10 starters first in its week */
  isFirstToTen?: boolean;
  /** Admin only: force a player into the starters or onto the waitlist */
  onSetOverride?: (presenceId: string, override: 'starter' | 'waitlist') => void;
  /** Admin only: remove every sign-up of the day */
  onResetDay?: (dateString: string) => void;
}

const MAX = 10;

/** Initials of first name and surname ("Marco Bianchi" → "MB") */
const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Ring that fills up to 10 starters */
function CountRing({ count }: { count: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const full = count >= MAX;
  return (
    <div className="relative h-16 w-16 flex-shrink-0" role="img" aria-label={`${count} titolari su ${MAX}`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-slate-800" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(count, MAX) / MAX)}
          className={`transition-all duration-500 ${full ? 'stroke-emerald-400' : 'stroke-emerald-600'}`}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-mono font-black text-sm ${full ? 'text-emerald-300' : 'text-white'}`}>
        {Math.min(count, MAX)}/{MAX}
      </span>
    </div>
  );
}

/**
 * Card of one day in Presenze. In front: the question "Ci sei?" (one main button), a ring with the starters
 * and ten dots with the initials. Names, waitlist and admin tools open only on request.
 */
export function PresenceCard({
  day,
  presences,
  allProfiles,
  currentUserId,
  isAdmin,
  onTogglePresence,
  onAddGuestPresence,
  onRemovePresence,
  isToggling = false,
  isLocked = false,
  isFirstToTen = false,
  onSetOverride,
  onResetDay,
}: PresenceCardProps) {
  const [mounted, setMounted] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showAdminActions = mounted && isAdmin;
  const effectiveUserId = mounted ? currentUserId : undefined;

  const enriched = [...presences]
    .sort((a, b) => a.order_index - b.order_index)
    .map((p) => {
      const profile = allProfiles.find((prof) => prof.id === p.player_id) || p.profile;
      return { ...p, profile, name: profile?.full_name || 'Giocatore' };
    });
  const starters = enriched.filter((p) => p.status === 'confirmed');
  const waitlist = enriched.filter((p) => p.status === 'waitlist');
  const isFull = starters.length >= MAX;

  const mine = effectiveUserId ? enriched.find((p) => p.player_id === effectiveUserId) : undefined;
  const myStarterIdx = mine ? starters.findIndex((p) => p.id === mine.id) : -1;
  const myWaitIdx = mine ? waitlist.findIndex((p) => p.id === mine.id) : -1;
  const timelockCheck = mounted && !isAdmin ? isTimelockActive(day.dateString) : { locked: false };
  const cancelLocked = Boolean(mine) && timelockCheck.locked;
  const revealed = enriched.find((p) => p.id === revealedId);

  const availableToAdd = allProfiles.filter((p) => !presences.some((pr) => pr.player_id === p.id));

  return (
    <div
      className={`relative flex flex-col bg-slate-900 border rounded-2xl p-5 transition-colors ${
        day.isToday ? 'border-emerald-500/50' : 'border-slate-800'
      }`}
    >
      {/* Giorno */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white capitalize">{day.dayName}</h3>
            {day.isToday && (
              <span className="bg-emerald-500/15 text-emerald-300 text-xs font-medium px-2 py-0.5 rounded-full">Oggi</span>
            )}
            {isFirstToTen && (
              <span className="bg-amber-500/15 text-amber-300 text-xs font-medium px-2 py-0.5 rounded-full">🥇 Primo a 10</span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {day.dayNumber} {day.monthName} {day.dateObj.getFullYear()}
          </p>
        </div>
        {showAdminActions && (
          <button
            type="button"
            onClick={() => setShowManage((o) => !o)}
            aria-expanded={showManage}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showManage ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MoreHorizontal className="h-4 w-4" /> Gestisci
          </button>
        )}
      </div>

      {/* Ci sei? — l'azione principale */}
      <div className="mt-4">
        {mine ? (
          <div
            className={`w-full rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
              myStarterIdx >= 0 ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-amber-500/10 border-amber-500/40'
            }`}
          >
            <span className={`text-sm font-semibold flex items-center gap-2 ${myStarterIdx >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
              <Check className="h-4 w-4" />
              {myStarterIdx >= 0 ? `Sei titolare (n° ${myStarterIdx + 1})` : `In attesa (${myWaitIdx + 1}°)`}
            </span>
            {cancelLocked ? (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Ritiri bloccati
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onTogglePresence(day.dateString)}
                disabled={isToggling}
                className="text-xs text-slate-400 hover:text-rose-300 underline disabled:opacity-50"
              >
                Ritirati
              </button>
            )}
          </div>
        ) : isLocked ? (
          <div className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-center">
            <span className="text-sm font-semibold text-slate-300 flex items-center justify-center gap-2">
              <Lock className="h-4 w-4" /> Iscrizioni chiuse
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">L&apos;admin le apre per la settimana prossima.</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onTogglePresence(day.dateString)}
            disabled={isToggling}
            className={`w-full py-3.5 px-4 rounded-xl font-semibold text-base transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-wait ${
              isFull ? 'bg-amber-400 hover:bg-amber-300 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {isFull ? 'Mettimi in attesa' : 'Ci sono'}
          </button>
        )}
      </div>

      {/* Titolari: anello + dieci pallini */}
      <div className="mt-5 flex items-center gap-4">
        <CountRing count={starters.length} />
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-5 gap-1.5 w-fit">
            {Array.from({ length: MAX }, (_, i) => {
              const p = starters[i];
              if (!p) {
                return (
                  <span
                    key={`free-${i}`}
                    className="h-8 w-8 rounded-full border-2 border-dashed border-slate-700"
                    aria-label="Posto libero"
                  />
                );
              }
              const isMe = p.player_id === effectiveUserId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRevealedId((id) => (id === p.id ? null : p.id))}
                  title={p.name}
                  aria-label={p.name}
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black ${
                    isMe ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300' : 'bg-slate-800 text-emerald-300 border border-slate-700'
                  } ${revealedId === p.id ? 'ring-2 ring-white' : ''}`}
                >
                  {initialsOf(p.name)}
                </button>
              );
            })}
          </div>
          {revealed ? (
            <p className="mt-1.5 text-xs text-white font-semibold truncate">{revealed.name}</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">
              {isFull ? 'Completo' : `${MAX - starters.length} ${MAX - starters.length === 1 ? 'posto libero' : 'posti liberi'}`}
            </p>
          )}
        </div>
      </div>

      {/* Nomi dei titolari, su richiesta */}
      {starters.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowNames((o) => !o)}
            aria-expanded={showNames}
            className="text-sm font-medium text-slate-400 hover:text-white flex items-center gap-1"
          >
            Vedi nomi <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showNames ? 'rotate-180' : ''}`} />
          </button>
          {showNames && (
            <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {starters.map((p, i) => (
                <li
                  key={p.id}
                  className={`truncate ${p.player_id === effectiveUserId ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}
                >
                  <span className="tabular-nums text-slate-500 mr-1.5">{i + 1}.</span>
                  {p.name}
                  {p.profile?.is_guest && <span className="text-[10px] text-slate-500"> · ospite</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Lista d'attesa in una riga */}
      {waitlist.length > 0 && (
        <button
          type="button"
          onClick={() => setShowWaitlist((o) => !o)}
          aria-expanded={showWaitlist}
          className="mt-3 w-full text-left text-sm text-amber-300/90 hover:text-amber-200"
        >
          <span className="font-semibold">In attesa:</span>{' '}
          {showWaitlist
            ? waitlist.map((p, i) => `${i + 1}. ${p.name}`).join(' · ')
            : `${waitlist
                .slice(0, 2)
                .map((p) => p.name.split(/\s+/)[0])
                .join(', ')}${waitlist.length > 2 ? ` +${waitlist.length - 2}` : ''}`}
        </button>
      )}

      {/* Strumenti admin, solo su richiesta */}
      {showAdminActions && showManage && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
          <p className="text-xs font-semibold text-slate-400">Gestione admin</p>
          {enriched.length === 0 && <p className="text-xs text-slate-500">Nessun iscritto.</p>}
          <ul className="space-y-1">
            {enriched.map((p) => {
              const isStarter = p.status === 'confirmed';
              return (
                <li key={p.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isStarter ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="flex-1 min-w-0 truncate text-slate-200">{p.name}</span>
                  {onSetOverride && (
                    <button
                      type="button"
                      onClick={() => onSetOverride(p.id, isStarter ? 'waitlist' : 'starter')}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                      title={isStarter ? "Sposta in lista d'attesa" : 'Fai titolare'}
                      aria-label={isStarter ? `Sposta ${p.name} in lista d'attesa` : `Fai titolare ${p.name}`}
                    >
                      {isStarter ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  {onRemovePresence && (
                    <button
                      type="button"
                      onClick={() => onRemovePresence(p.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                      title="Rimuovi"
                      aria-label={`Rimuovi ${p.name}`}
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {onAddGuestPresence && (
            <select
              className="w-full min-w-0 text-xs bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:border-slate-500"
              defaultValue=""
              aria-label="Aggiungi un giocatore a questo giorno"
              onChange={(e) => {
                if (e.target.value) {
                  onAddGuestPresence(day.dateString, e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>
                + Aggiungi giocatore o ospite…
              </option>
              {availableToAdd.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.is_guest ? ' (ospite)' : ''}
                </option>
              ))}
            </select>
          )}
          {onResetDay && presences.length > 0 && (
            <button
              type="button"
              onClick={() => onResetDay(day.dateString)}
              className="text-[11px] text-rose-400/80 hover:text-rose-300 underline"
            >
              Azzera presenze del giorno
            </button>
          )}
        </div>
      )}
    </div>
  );
}
