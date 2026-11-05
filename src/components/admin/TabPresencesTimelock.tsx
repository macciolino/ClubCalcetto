'use client';

import React, { useState } from 'react';
import { Profile, Presence } from '@/types/database';
import { CalendarDay, formatItalianDate } from '@/lib/utils/dateUtils';
import { StatBadge } from '@/components/StatBadge';
import { ResetConfirmModal } from './ResetConfirmModal';
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  UserPlus, 
  AlertTriangle, 
  RotateCcw, 
  ShieldAlert, 
  Lock, 
  Unlock,
  Sparkles,
  CalendarDays
} from 'lucide-react';

interface TabPresencesTimelockProps {
  days: CalendarDay[];
  activeDate: string;
  onSelectDate: (dateString: string) => void;
  players: Profile[];
  presences: Presence[];
  onRemovePresence: (presenceId: string, playerName: string) => void;
  onPromoteWaitlistToStarter: (presenceId: string) => void;
  onDemoteStarterToWaitlist: (presenceId: string) => void;
  onAddGuestPresence: (dateString: string, guestId: string) => void;
  onResetPresences: (dateString: string) => void;
  timelockEnabled: boolean;
  timelockHours: number;
  onUpdateTimelock: (enabled: boolean, hours: number) => void;
}

export function TabPresencesTimelock({
  days,
  activeDate,
  onSelectDate,
  players,
  presences,
  onRemovePresence,
  onPromoteWaitlistToStarter,
  onDemoteStarterToWaitlist,
  onAddGuestPresence,
  onResetPresences,
  timelockEnabled,
  timelockHours,
  onUpdateTimelock,
}: TabPresencesTimelockProps) {
  const [selectedGuestToAdd, setSelectedGuestToAdd] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Filtra presenze per la data attiva
  const dayPresences = presences.filter((p) => p.date === activeDate);
  const sorted = [...dayPresences].sort((a, b) => a.order_index - b.order_index);

  const starters = sorted.filter((p) => p.status === 'confirmed');
  const waitlist = sorted.filter((p) => p.status === 'waitlist');

  // Trova giocatori non ancora iscritti a questo giorno per la dropdown "+ Assegna giocatore"
  const availablePlayers = players.filter(
    (p) => !dayPresences.some((dp) => dp.player_id === p.id)
  );

  return (
    <div className="space-y-6">
      {/* 1. SELETTORE A 7 GIORNI (LUN - DOM) ORIZZONTALE */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Calendario Convocazioni Settimanali (Seleziona Giorno)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 font-bold">
            {formatItalianDate(activeDate)}
          </span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
          {days.map((day) => {
            const count = presences.filter(
              (p) => p.date === day.dateString && p.status === 'confirmed'
            ).length;
            const isSelected = activeDate === day.dateString;
            const isFull = count >= 10;

            return (
              <button
                key={day.dateString}
                type="button"
                onClick={() => onSelectDate(day.dateString)}
                className={`flex-shrink-0 flex flex-col items-center justify-between w-24 sm:w-28 p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg ring-2 ring-emerald-500/60'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {day.dayName.slice(0, 3)}
                  </span>
                  {isSelected && <span className="text-[11px] text-amber-400 font-black">★</span>}
                </div>

                <span className="text-xl font-black my-1 text-white">{day.dayNumber}</span>
                <span className="text-[10px] text-slate-400">{day.monthName}</span>

                <div className="mt-2 w-full pt-1.5 border-t border-slate-800/80 flex items-center justify-center gap-1 font-mono text-[10px]">
                  <span className={`font-black ${isFull ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {count}/10
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. REGOLA TIME-LOCK (BLOCCO RITIRI OPZIONALE) */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-3 rounded-2xl ring-1 ${
              timelockEnabled
                ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                : 'bg-slate-800 text-slate-400 ring-slate-700'
            }`}
          >
            {timelockEnabled ? <Lock className="h-6 w-6" /> : <Unlock className="h-6 w-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                Regola Time-lock
              </span>
              <span className="text-xs font-bold text-white">
                {timelockEnabled ? 'Blocco Disdette ATTIVO' : 'Disdette Libere'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Se abilitato, impedisce ai giocatori ordinari di annullare la propria presenza a ridosso
              del match (es. 2h, 4h o 24h prima). Solo l&apos;Admin potrà modificare le presenze.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium pl-1">Blocca a:</span>
            <select
              value={timelockHours}
              onChange={(e) => onUpdateTimelock(timelockEnabled, parseInt(e.target.value) || 4)}
              disabled={!timelockEnabled}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 font-semibold focus:outline-none disabled:opacity-50"
            >
              <option value="2">2 ore prima</option>
              <option value="4">4 ore prima</option>
              <option value="12">12 ore prima</option>
              <option value="24">24 ore prima</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onUpdateTimelock(!timelockEnabled, timelockHours)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              timelockEnabled
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            {timelockEnabled ? 'Disattiva Blocco' : 'Attiva Blocco'}
          </button>
        </div>
      </div>

      {/* 3. LISTE AFFIANCATE: TITOLARI (1-10) VS WAITLIST / RISERVE (11+) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* COLONNA TITOLARI */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Titolari Confermati ({starters.length}/10)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
              {starters.length >= 10 ? 'Quorum 10/10 Completo' : `Mancano ${10 - starters.length}`}
            </span>
          </div>

          {starters.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 italic bg-slate-950/50 rounded-2xl border border-dashed border-slate-800">
              Nessun titolare confermato per questa data.
            </div>
          ) : (
            <div className="space-y-2">
              {starters.map((item, idx) => {
                const profile = players.find((p) => p.id === item.player_id) || item.profile;
                const name = profile?.full_name || 'Giocatore';
                const rating = profile?.overall_rating || 6.0;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className="font-mono text-xs font-bold text-slate-500 w-5">
                        {idx + 1}.
                      </span>
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-emerald-400">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{name}</span>
                          {profile?.is_guest && (
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">
                              Ospite
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {profile?.position || 'Esterno'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatBadge score={rating} size="sm" />

                      {/* Azioni Rapide Admin: Sposta in Riserva & Elimina */}
                      <button
                        type="button"
                        onClick={() => onDemoteStarterToWaitlist(item.id)}
                        className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Sposta in lista d'attesa (Waitlist)"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemovePresence(item.id, name)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Rimuovi presenza (con subentro automatico riserva)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COLONNA WAITLIST / RISERVE */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Waitlist / Riserve ({waitlist.length})
              </h3>
            </div>
            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-bold">
              Subentro Automatico
            </span>
          </div>

          {waitlist.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 italic bg-slate-950/50 rounded-2xl border border-dashed border-slate-800">
              Nessun giocatore in lista d&apos;attesa per questa data.
            </div>
          ) : (
            <div className="space-y-2">
              {waitlist.map((item, idx) => {
                const profile = players.find((p) => p.id === item.player_id) || item.profile;
                const name = profile?.full_name || 'Riserva';
                const rating = profile?.overall_rating || 6.0;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className="font-mono text-xs font-bold text-amber-500 w-6">
                        +{idx + 1}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-amber-400">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{name}</span>
                          {profile?.is_guest && (
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">
                              Ospite
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {profile?.position || 'Esterno'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatBadge score={rating} size="sm" />

                      {/* Azioni Rapide Admin: Promuovi a Titolare & Elimina */}
                      <button
                        type="button"
                        onClick={() => onPromoteWaitlistToStarter(item.id)}
                        className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Promuovi a titolare"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemovePresence(item.id, name)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Rimuovi da waitlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. ASSEGNAZIONE GIOCATORE / OSPITE & AZIONI DISTRUTTIVE */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Assegna Rapido Giocatore */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <select
            value={selectedGuestToAdd}
            onChange={(e) => setSelectedGuestToAdd(e.target.value)}
            className="flex-1 text-xs bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="">+ Seleziona giocatore da iscrivere a questa data...</option>
            {availablePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.overall_rating}) {p.is_guest ? '[Ospite]' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedGuestToAdd}
            onClick={() => {
              if (selectedGuestToAdd) {
                onAddGuestPresence(activeDate, selectedGuestToAdd);
                setSelectedGuestToAdd('');
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Iscrivi</span>
          </button>
        </div>

        {/* Azioni Distruttive con Modale di Conferma */}
        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-xl text-xs border border-rose-500/30 transition-all cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Azzera Presenze della Settimana</span>
        </button>
      </div>

      {/* MODALE DI CONFERMA PER AZZERAMENTO PRESENZE */}
      <ResetConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={() => onResetPresences(activeDate)}
        title="Azzera Presenze & Votazioni"
        description={`Sei sicuro di voler cancellare TUTTE le presenze registrate per la partita del ${formatItalianDate(activeDate)}? I giocatori dovranno iscriversi nuovamente.`}
        confirmLabel="Sì, Azzera Tutto"
      />
    </div>
  );
}
