'use client';

import React, { useState, useEffect } from 'react';
import { Presence, Profile } from '@/types/database';
import { StatBadge } from './StatBadge';
import { CalendarDay } from '@/lib/utils/dateUtils';
import { isTimelockActive } from '@/lib/services/presenceService';
import { CheckCircle2, Clock, UserX, UserPlus, Sparkles, Lock } from 'lucide-react';

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
}

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
}: PresenceCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showAdminActions = mounted && isAdmin;
  const effectiveUserId = mounted ? currentUserId : undefined;

  // Ordina per order_index
  const sortedPresences = [...presences].sort((a, b) => a.order_index - b.order_index);

  // Mappa i profili ai giocatori
  const enrichedPresences = sortedPresences.map((p) => {
    const profile = allProfiles.find((prof) => prof.id === p.player_id) || p.profile;
    return {
      ...p,
      profile,
    };
  });

  const starters = enrichedPresences.filter((p) => p.status === 'confirmed');
  const waitlist = enrichedPresences.filter((p) => p.status === 'waitlist');

  const isUserPresent = effectiveUserId
    ? presences.some((p) => p.player_id === effectiveUserId)
    : false;

  const userPresence = effectiveUserId
    ? presences.find((p) => p.player_id === effectiveUserId)
    : null;

  const isFull = starters.length >= 10;
  const timelockCheck = mounted && !isAdmin ? isTimelockActive(day.dateString) : { locked: false };
  const isCancelLocked = isUserPresent && timelockCheck.locked;

  return (
    <div
      className={`relative flex flex-col bg-slate-900 border rounded-2xl p-5 shadow-xl transition-all ${
        day.isToday
          ? 'border-emerald-500/60 ring-1 ring-emerald-500/30'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Header Giorno */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-white capitalize">{day.dayName}</h3>
            {day.isToday && (
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                Oggi
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-medium">
            {day.dayNumber} {day.monthName} {day.dateObj.getFullYear()}
          </p>
        </div>

        {/* Badge Conteggio */}
        <div className="text-right">
          <div className="flex items-center gap-1.5 font-mono text-sm">
            <span
              className={`font-black ${
                isFull ? 'text-emerald-400' : 'text-slate-300'
              }`}
            >
              {starters.length}/10
            </span>
            <span className="text-xs text-slate-500">Titolari</span>
          </div>
          {waitlist.length > 0 && (
            <div className="text-[11px] font-bold text-amber-400 font-mono">
              +{waitlist.length} in waitlist
            </div>
          )}
        </div>
      </div>

      {/* Barra di Avanzamento Titolari */}
      <div className="w-full bg-slate-950 h-2 rounded-full mt-3 overflow-hidden border border-slate-800">
        <div
          className={`h-full transition-all duration-500 ${
            isFull ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-emerald-600'
          }`}
          style={{ width: `${Math.min(100, (starters.length / 10) * 100)}%` }}
        />
      </div>

      {/* Lista Titolari (1..10) */}
      <div className="mt-4 flex-1 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Titolari ({starters.length})
          </span>
          {isFull && (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded">
              Completo
            </span>
          )}
        </div>

        {starters.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
            Nessuna presenza confermata. Sii il primo!
          </div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {starters.map((item, idx) => {
              const name = item.profile?.full_name || 'Giocatore';
              const rating = item.profile?.overall_rating || 6.0;
              const isCurrentUser = Boolean(effectiveUserId && item.player_id === effectiveUserId);

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs border transition-colors ${
                    isCurrentUser
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono font-bold text-[10px] text-slate-500 w-4">
                      {idx + 1}.
                    </span>
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold truncate flex-1 min-w-0">{name}</span>
                    {item.profile?.is_guest && (
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">
                        Ospite
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatBadge score={rating} size="sm" />
                    {showAdminActions && onRemovePresence && (
                      <button
                        type="button"
                        onClick={() => onRemovePresence(item.id)}
                        className="text-slate-600 hover:text-rose-400 p-0.5"
                        title="Rimuovi presenza"
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Lista Waitlist (Dall'11esimo in poi) */}
        {waitlist.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> In Attesa (Waitlist)
              </span>
              <span className="text-[10px] text-amber-400/80 font-mono">
                Subentro automatico
              </span>
            </div>

            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {waitlist.map((item, idx) => {
                const name = item.profile?.full_name || 'Riserva';
                const rating = item.profile?.overall_rating || 6.0;
                const isCurrentUser = Boolean(effectiveUserId && item.player_id === effectiveUserId);

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs border ${
                      isCurrentUser
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                        : 'bg-slate-950/40 border-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-bold text-[10px] text-amber-500 w-5">
                        +{idx + 1}
                      </span>
                      <span className="font-medium truncate flex-1 min-w-0">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatBadge score={rating} size="sm" />
                      {showAdminActions && onRemovePresence && (
                        <button
                          type="button"
                          onClick={() => onRemovePresence(item.id)}
                          className="text-slate-600 hover:text-rose-400 p-0.5"
                          title="Rimuovi da waitlist"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pulsante Azione Partecipazione */}
      <div className="mt-5 pt-3 border-t border-slate-800 flex flex-col gap-2">
        {isLocked && !isUserPresent ? (
          <div className="w-full py-2.5 px-3 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs text-center flex items-center justify-center gap-2">
            <Lock className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-semibold text-[11px] leading-tight">
              Votazioni non ancora aperte: l&apos;admin le apre per la settimana prossima.
            </span>
          </div>
        ) : isCancelLocked ? (
          <div className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center flex items-center justify-center gap-2">
            <Lock className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <span className="font-semibold text-[11px] leading-tight">
              Disdette bloccate (Time-lock attivo). Contatta l&apos;Admin per disdire.
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onTogglePresence(day.dateString)}
            disabled={isToggling}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
              isUserPresent
                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : isFull
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
            }`}
          >
            {isUserPresent ? (
              <>
                <UserX className="h-4 w-4" />
                Annulla Presenza ({userPresence?.status === 'confirmed' ? 'Titolare' : 'Waitlist'})
              </>
            ) : isFull ? (
              <>
                <Clock className="h-4 w-4" />
                Mettiti in Waitlist (+{waitlist.length + 1})
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Vota Presenza (Gioca)
              </>
            )}
          </button>
        )}

        {/* Per l'Admin: Assegna giocatore ospite */}
        {showAdminActions && onAddGuestPresence && (
          <div className="flex items-center gap-1.5 mt-1">
            <select
              className="flex-1 min-w-0 text-xs bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onAddGuestPresence(day.dateString, e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>
                + Aggiungi ospite al giorno...
              </option>
              {allProfiles
                .filter((p) => !presences.some((pr) => pr.player_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.overall_rating}) {p.is_guest ? '[Ospite]' : ''}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
