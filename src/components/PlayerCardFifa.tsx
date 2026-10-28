'use client';

import React, { useState } from 'react';
import { Profile } from '@/types/database';
import { RadarChart } from './RadarChart';
import { StatBadge } from './StatBadge';
import { getPlayerMatchRecord } from '@/lib/services/playerService';
import { 
  Trophy, 
  Swords, 
  Minus, 
  X, 
  Percent, 
  Edit3, 
  Trash2, 
  Sparkles,
  Flame,
  Award
} from 'lucide-react';

interface PlayerCardFifaProps {
  player: Profile;
  isAdmin: boolean;
  onEdit?: (player: Profile) => void;
  onDelete?: (player: Profile) => void;
}

export function PlayerCardFifa({
  player,
  isAdmin,
  onEdit,
  onDelete,
}: PlayerCardFifaProps) {
  const [activeTab, setActiveTab] = useState<'radar' | 'stats'>('radar');
  const record = getPlayerMatchRecord(player);
  const isSuperAdmin = player.email?.toLowerCase().includes('macciolino84');

  const ovrDisplay = Math.round(player.overall_rating * 10); // stile FIFA (es. 7.9 -> 79)

  return (
    <div className="relative group bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-4 sm:p-5 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between overflow-hidden">
      {/* Glow Effetto Card */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/20 transition-all" />

      {/* HEADER CARD: Stile FUT / PES Card */}
      <div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
          {/* OVR & Dettagli Sinistra */}
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight font-mono">
                {ovrDisplay}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">OVR</span>
            </div>
            <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">
              {player.role === 'admin' ? 'CAP' : 'CALC'}
            </span>
            <span className="text-base mt-1">⚽</span>
          </div>

          {/* Avatar Giocatore */}
          <div className="relative">
            {player.avatar_url ? (
              <img
                src={player.avatar_url}
                alt={player.full_name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-emerald-500/40 shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 border-2 border-emerald-500/40 flex items-center justify-center font-black text-2xl text-emerald-400 shadow-lg">
                {player.full_name.charAt(0).toUpperCase()}
              </div>
            )}
            {isSuperAdmin && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-slate-950 ring-2 ring-slate-950 shadow"
                title="Super Admin"
              >
                ★
              </span>
            )}
          </div>
        </div>

        {/* Nome Giocatore e Tipo Profilo */}
        <div className="mt-3 text-center">
          <h3 className="font-black text-sm sm:text-base text-white truncate uppercase tracking-wide">
            {player.full_name}
          </h3>
          <div className="flex items-center justify-center gap-2 mt-1">
            {player.is_guest ? (
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
                Ospite
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                Google Member
              </span>
            )}
            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {record.points} pt
            </span>
          </div>
        </div>

        {/* Switcher Tab: Radar Ottagonale vs Record Partite */}
        <div className="mt-4 flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className={`flex-1 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'radar'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            <span>Ottagono Abilità</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="h-3 w-3" />
            <span>V / P / S</span>
          </button>
        </div>

        {/* CONTENUTO SCHEDA 1: RADAR OTTAGONALE STILE PES/FIFA */}
        {activeTab === 'radar' ? (
          <div className="mt-3 py-2 flex flex-col items-center justify-center animate-in fade-in duration-200">
            <RadarChart stats={player.stats} size={180} color="emerald" showLabels={true} />

            {/* Griglia mini pill delle 8 abilità */}
            <div className="mt-3 grid grid-cols-4 gap-1.5 w-full text-center">
              {Object.entries(player.stats).map(([name, val]) => {
                const abbr = name.slice(0, 3).toUpperCase();
                return (
                  <div
                    key={name}
                    className="bg-slate-950/80 border border-slate-800/80 p-1 rounded-lg"
                  >
                    <span className="block text-[8px] text-slate-400 font-bold">{abbr}</span>
                    <span
                      className={`text-[11px] font-black font-mono ${
                        val >= 8
                          ? 'text-emerald-400'
                          : val >= 6
                          ? 'text-white'
                          : 'text-rose-400'
                      }`}
                    >
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* CONTENUTO SCHEDA 2: TABELLA RECORD PARTITE (V - P - S) */
          <div className="mt-4 p-3 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Swords className="h-3.5 w-3.5 text-emerald-400" />
                Bilancio Partite
              </span>
              <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono">
                {record.winRate}% Win
              </span>
            </div>

            {/* Contatori V - P - S */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl">
                <span className="block text-[9px] font-bold text-emerald-400 uppercase">Vittorie</span>
                <span className="text-lg font-black text-emerald-300 font-mono">{record.won}</span>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl">
                <span className="block text-[9px] font-bold text-amber-400 uppercase">Pareggi</span>
                <span className="text-lg font-black text-amber-300 font-mono">{record.drawn}</span>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl">
                <span className="block text-[9px] font-bold text-rose-400 uppercase">Sconfitte</span>
                <span className="text-lg font-black text-rose-300 font-mono">{record.lost}</span>
              </div>
            </div>

            {/* Dettagli Record */}
            <div className="space-y-1.5 text-xs text-slate-300 pt-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Partite Disputate:</span>
                <span className="font-bold text-white font-mono">{record.total} match</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Punti Classifica:</span>
                <span className="font-bold text-amber-300 font-mono">{record.points} pt</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Media Punti/Partita:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {record.total > 0 ? (record.points / record.total).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER CARD: AZIONI ADMIN */}
      {isAdmin && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(player)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Modifica</span>
            </button>
          )}

          {onDelete && !isSuperAdmin && (
            <button
              type="button"
              onClick={() => onDelete(player)}
              className="flex items-center gap-1 p-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 rounded-xl text-xs transition-colors cursor-pointer"
              title="Elimina giocatore"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
