'use client';

import React, { useState, useEffect } from 'react';
import { Presence, Profile } from '@/types/database';
import { CalendarDay } from '@/lib/utils/dateUtils';
import { isTimelockActive } from '@/lib/services/presenceService';
import { askConfirm } from '@/components/ui/Feedback';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { Lock, ArrowUp, ArrowDown, UserX, ChevronDown, ChevronRight, MoreHorizontal, Check, LogOut } from 'lucide-react';
import { presenceBtn } from '@/components/ui/buttons';

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
  /** This day was complete first in its week */
  isFirstToTen?: boolean;
  /** Starters of this day (10 for 5vs5, 14 for 7vs7, 16 for 8vs8, 22 for 11vs11) */
  maxPlayers?: number;
  /** Admin only: force a player into the starters or onto the waitlist */
  onSetOverride?: (presenceId: string, override: 'starter' | 'waitlist') => void;
  /** Admin only: remove every sign-up of the day */
  onResetDay?: (dateString: string) => void;
}

const DEFAULT_MAX = 10;

/** Dots grid of the starters: columns and dot size by number of places (Tailwind classes written in full). */
function dotsLayout(max: number) {
  if (max <= 10) return { cols: 5, grid: 'grid-cols-5', dot: 'h-10 w-10 text-[11px]' };
  if (max <= 14) return { cols: 7, grid: 'grid-cols-7', dot: 'h-10 w-10 text-[11px]' };
  return { cols: 8, grid: 'grid-cols-8', dot: 'h-8 w-8 text-[10px]' };
}

/** Initials of first name and surname ("Marco Bianchi" → "MB") */
const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Ring that fills up to the starters of the day */
export function CountRing({ count, max: MAX = DEFAULT_MAX }: { count: number; max?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const full = count >= MAX;
  return (
    <div className="relative h-16 w-16 flex-shrink-0" role="img" aria-label={`${count} titolari su ${MAX}`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-line" />
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
      <span className={`absolute inset-0 flex items-center justify-center font-mono font-black text-sm ${full ? 'text-accent-text' : 'text-primary'}`}>
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
  maxPlayers = DEFAULT_MAX,
}: PresenceCardProps) {
  const MAX = maxPlayers;
  const dots = dotsLayout(MAX);
  const [mounted, setMounted] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Nome sopra il pallino toccato: si chiude da solo dopo qualche secondo
  useEffect(() => {
    if (!revealedId) return;
    const t = setTimeout(() => setRevealedId(null), 2500);
    return () => clearTimeout(t);
  }, [revealedId]);


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
  const actionTarget = enriched.find((p) => p.id === actionsFor);

  // Ritiro: chiede conferma, così un tocco per sbaglio non toglie il posto
  const handleWithdraw = async () => {
    const msg =
      myStarterIdx >= 0
        ? `Vuoi ritirarti da ${day.dayName} ${day.dayNumber} ${day.monthName}? Il tuo posto passa al primo in lista d'attesa.`
        : `Vuoi uscire dalla lista d'attesa di ${day.dayName} ${day.dayNumber} ${day.monthName}?`;
    if (await askConfirm(msg)) onTogglePresence(day.dateString);
  };

  const availableToAdd = allProfiles.filter((p) => !presences.some((pr) => pr.player_id === p.id));

  return (
    <div
      className={`relative flex flex-col bg-card border rounded-2xl p-5 transition-colors ${
        day.isToday ? 'border-accent/50' : 'border-line'
      }`}
    >
      {/* Giorno */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-primary capitalize">{day.dayName}</h3>
            {day.isToday && (
              <span className="bg-accent/15 text-accent-text text-xs font-medium px-2 py-0.5 rounded-full">Oggi</span>
            )}
            {isFirstToTen && (
              <span className="bg-amber-500/15 text-warning text-xs font-medium px-2 py-0.5 rounded-full">🥇 Primo a 10</span>
            )}
          </div>
          <p className="text-sm text-secondary">
            {day.dayNumber} {day.monthName} {day.dateObj.getFullYear()}
          </p>
        </div>
        {showAdminActions && (
          <button
            type="button"
            onClick={() => setShowManage((o) => !o)}
            aria-expanded={showManage}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showManage ? 'bg-card-hover text-primary' : 'text-secondary hover:text-primary hover:bg-card-hover'
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
              myStarterIdx >= 0 ? 'bg-accent/10 border-accent/40' : 'bg-amber-500/10 border-amber-500/40'
            }`}
          >
            <span className={`text-sm font-semibold flex items-center gap-2 ${myStarterIdx >= 0 ? 'text-accent-text' : 'text-warning'}`}>
              <Check className="h-4 w-4" />
              {myStarterIdx >= 0 ? `Sei titolare (n° ${myStarterIdx + 1})` : `In attesa (${myWaitIdx + 1}°)`}
            </span>
            {cancelLocked ? (
              <span className="text-[11px] text-secondary flex items-center gap-1">
                <Lock className="h-3 w-3" /> Ritiri bloccati
              </span>
            ) : (
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={isToggling}
                className="flex-shrink-0 flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-line-strong text-xs font-medium text-secondary hover:text-danger hover:border-rose-500/40 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" /> Ritirati
              </button>
            )}
          </div>
        ) : isLocked ? (
          <div className="w-full rounded-xl border border-line-strong bg-card-hover/60 px-4 py-3 text-center">
            <span className="text-sm font-semibold text-secondary flex items-center justify-center gap-2">
              <Lock className="h-4 w-4" /> Iscrizioni chiuse
            </span>
            <span className="block text-xs text-secondary mt-0.5">L&apos;admin le apre per la settimana prossima.</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onTogglePresence(day.dateString)}
            disabled={isToggling}
            className={`${presenceBtn(isFull)} disabled:cursor-wait`}
          >
            {isFull ? 'Mettimi in attesa' : 'Ci sono'}
          </button>
        )}
      </div>

      {/* Titolari: anello e posti liberi, poi un pallino per posto (10, 14, 16 o 22) */}
      <div className="mt-5 flex items-center gap-4">
        <CountRing count={starters.length} max={MAX} />
        <div className="text-sm min-w-0">
          <p className="font-semibold text-primary">
            {isFull ? 'Al completo' : `${MAX - starters.length} ${MAX - starters.length === 1 ? 'posto libero' : 'posti liberi'}`}
          </p>
          <p className="text-secondary">{waitlist.length > 0 ? `${waitlist.length} in lista d’attesa` : 'Tocca un pallino per il nome'}</p>
        </div>
      </div>
      <div className={`mt-4 grid ${dots.grid} gap-y-3 justify-items-center max-w-sm`}>
        {Array.from({ length: MAX }, (_, i) => {
          const p = starters[i];
          if (!p) {
            return (
              <span
                key={`free-${i}`}
                className={`${dots.dot} rounded-full border-2 border-dashed border-line-strong`}
                aria-label="Posto libero"
              />
            );
          }
          const isMe = p.player_id === effectiveUserId;
          const open = revealedId === p.id;
          const col = i % dots.cols;
          const bubblePos = col === 0 ? 'left-0' : col === dots.cols - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
          return (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => setRevealedId((id) => (id === p.id ? null : p.id))}
                aria-label={p.name}
                aria-describedby={open ? `tip-${p.id}` : undefined}
                className={`${dots.dot} rounded-full flex items-center justify-center font-bold transition-shadow ${
                  isMe ? 'bg-accent text-on-accent' : 'bg-card-hover text-accent-text'
                } ${open ? 'ring-2 ring-white' : ''}`}
              >
                {initialsOf(p.name)}
              </button>
              {open && (
                <span
                  id={`tip-${p.id}`}
                  role="tooltip"
                  className={`absolute bottom-full mb-2 z-20 whitespace-nowrap rounded-lg bg-white ring-1 ring-line-strong px-2.5 py-1 text-xs font-semibold text-slate-950 shadow-lg animate-in ${bubblePos}`}
                >
                  {p.name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Nomi dei titolari, su richiesta */}
      {starters.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowNames((o) => !o)}
            aria-expanded={showNames}
            className="text-sm font-medium text-secondary hover:text-primary flex items-center gap-1"
          >
            Vedi nomi <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showNames ? 'rotate-180' : ''}`} />
          </button>
          {showNames && (
            <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {starters.map((p, i) => (
                <li
                  key={p.id}
                  className={`truncate ${p.player_id === effectiveUserId ? 'text-accent-text font-bold' : 'text-secondary'}`}
                >
                  <span className="tabular-nums text-muted mr-1.5">{i + 1}.</span>
                  {p.name}
                  {p.profile?.is_guest && <span className="text-[10px] text-muted"> · ospite</span>}
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
          className="mt-3 w-full text-left text-sm text-warning/90 hover:text-warning"
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
        <div className="mt-4 pt-4 border-t border-line space-y-3">
          <p className="text-xs font-semibold text-secondary">Gestione admin · tocca un giocatore per le azioni</p>
          {enriched.length === 0 && <p className="text-xs text-muted">Nessun iscritto.</p>}
          <ul className="divide-y divide-line rounded-xl bg-app/50">
            {enriched.map((p, i) => {
              const isStarter = p.status === 'confirmed';
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActionsFor(p.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left text-sm hover:bg-card-hover/60 first:rounded-t-xl last:rounded-b-xl"
                    aria-haspopup="dialog"
                  >
                    <span className="w-5 text-right tabular-nums text-xs text-muted">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate text-primary">{p.name}</span>
                    <span
                      className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        isStarter ? 'bg-accent/15 text-accent-text' : 'bg-amber-500/15 text-warning'
                      }`}
                    >
                      {isStarter ? 'Titolare' : 'In attesa'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
          {onAddGuestPresence && (
            <select
              className="w-full min-w-0 text-xs bg-app border border-line text-secondary rounded-lg px-2 py-2 focus:outline-none focus:border-slate-500"
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
              className="text-[11px] text-rose-400/80 hover:text-danger underline"
            >
              Azzera presenze del giorno
            </button>
          )}
        </div>
      )}
      {showAdminActions && actionTarget && (
        <Sheet
          onClose={() => setActionsFor(null)}
          title={actionTarget.name}
          subtitle={`${day.dayName} ${day.dayNumber} ${day.monthName} · ${actionTarget.status === 'confirmed' ? 'titolare' : 'in lista d’attesa'}`}
          footer={
            <button type="button" onClick={() => setActionsFor(null)} className={sheetBtn.secondary}>
              Annulla
            </button>
          }
        >
          <div className="space-y-2">
            {onSetOverride && (
              <button
                type="button"
                onClick={() => {
                  onSetOverride(actionTarget.id, actionTarget.status === 'confirmed' ? 'waitlist' : 'starter');
                  setActionsFor(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-app/60 hover:bg-card-hover text-sm font-medium text-primary"
              >
                {actionTarget.status === 'confirmed' ? (
                  <>
                    <ArrowDown className="h-4 w-4 text-warning" /> Sposta in lista d&apos;attesa
                  </>
                ) : (
                  <>
                    <ArrowUp className="h-4 w-4 text-accent-text" /> Fai titolare
                  </>
                )}
              </button>
            )}
            {onRemovePresence && (
              <button
                type="button"
                onClick={async () => {
                  const target = actionTarget;
                  setActionsFor(null);
                  if (await askConfirm(`Rimuovere ${target.name} da ${day.dayName} ${day.dayNumber} ${day.monthName}?`)) onRemovePresence(target.id);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-app/60 hover:bg-card-hover text-sm font-medium text-danger"
              >
                <UserX className="h-4 w-4" /> Rimuovi dal giorno
              </button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
