'use client';

import React, { forwardRef } from 'react';
import { Profile } from '@/types/database';
import { 
  WHITE_TEAM_COORDINATES, 
  BLACK_TEAM_COORDINATES, 
  getOrganicCoordinates 
} from '@/lib/utils/formation';
import { getPlayerOverallRating } from '@/lib/algorithm/teamBalancer';
import { formatItalianDate } from '@/lib/utils/dateUtils';
import { MapPin, Clock, Calendar, Coins } from 'lucide-react';

interface VirtualPitchProps {
  teamWhite: Profile[];
  teamBlack: Profile[];
  matchInfo?: {
    date: string;
    time: string;
    location: string;
    totalCost: number;
  };
  whiteAvg?: number;
  blackAvg?: number;
}

export const VirtualPitch = forwardRef<HTMLDivElement, VirtualPitchProps>(
  ({ teamWhite, teamBlack, matchInfo, whiteAvg, blackAvg }, ref) => {
    const whitePositions = getOrganicCoordinates(WHITE_TEAM_COORDINATES, 3);
    const blackPositions = getOrganicCoordinates(BLACK_TEAM_COORDINATES, 7);

    const costPerPerson = matchInfo?.totalCost
      ? (matchInfo.totalCost / 10).toFixed(matchInfo.totalCost % 10 === 0 ? 0 : 2)
      : '8';

    return (
      <div
        ref={ref}
        className="w-full max-w-lg mx-auto bg-slate-950 p-3 sm:p-4 rounded-3xl border border-slate-800 shadow-2xl space-y-3"
      >
        {/* INTESTAZIONE ESTERNA: Luogo, Ora, Costo Campo e Quota a persona */}
        {matchInfo && (
          <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl p-3 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-base flex-shrink-0">
                ⚽
              </div>
              <div>
                <div className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="truncate max-w-[220px] sm:max-w-[260px]">
                    {matchInfo.location || 'Centro Sportivo Calcetto'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-medium">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-500" />
                    {formatItalianDate(matchInfo.date)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <Clock className="h-3 w-3 text-emerald-400" />
                    Ore {matchInfo.time}
                  </span>
                </div>
              </div>
            </div>

            {/* Box Costo Campo e Quota per Persona */}
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <div className="text-left font-mono">
                <span className="text-xs font-black text-emerald-400">{matchInfo.totalCost}€</span>
                <span className="text-[10px] text-slate-400 font-sans ml-1.5">
                  ({costPerPerson}€ / pers.)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CAMPO DA CALCETTO RIDOTTO E OTTIMIZZATO */}
        <div
          className="relative w-full aspect-[9/12.5] rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-[#165b33] select-none text-white font-sans"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                0deg,
                #195e34,
                #195e34 26px,
                #14522d 26px,
                #14522d 52px
              )
            `,
          }}
        >
          {/* Campo da calcetto: Linee e Tracciati bianchi */}
          {/* Bordo Perimetrale */}
          <div className="absolute inset-3.5 sm:inset-4 border-2 border-white/80 rounded-sm pointer-events-none" />

          {/* Linea di Metà Campo */}
          <div className="absolute top-1/2 left-3.5 right-3.5 sm:left-4 sm:right-4 h-0.5 bg-white/80 -translate-y-1/2 pointer-events-none" />

          {/* Cerchio di Centrocampo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 border-white/80 pointer-events-none flex items-center justify-center">
            {/* Punto di battuta */}
            <div className="w-2.5 h-2.5 bg-white rounded-full shadow" />
          </div>

          {/* Area di Rigore Superiore (Squadra Bianca) */}
          <div className="absolute top-3.5 sm:top-4 left-1/2 -translate-x-1/2 w-44 sm:w-56 h-18 sm:h-22 border-b-2 border-x-2 border-white/80 rounded-b-xl pointer-events-none flex items-end justify-center pb-2">
            {/* Dischetto di rigore */}
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
          {/* Porta Superiore */}
          <div className="absolute top-1 sm:top-1.5 left-1/2 -translate-x-1/2 w-20 sm:w-24 h-3 border-x-2 border-t-2 border-white/90 bg-white/10 pointer-events-none" />

          {/* Area di Rigore Inferiore (Squadra Nera) */}
          <div className="absolute bottom-3.5 sm:bottom-4 left-1/2 -translate-x-1/2 w-44 sm:w-56 h-18 sm:h-22 border-t-2 border-x-2 border-white/80 rounded-t-xl pointer-events-none flex items-start justify-center pt-2">
            {/* Dischetto di rigore */}
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
          {/* Porta Inferiore */}
          <div className="absolute bottom-1 sm:bottom-1.5 left-1/2 -translate-x-1/2 w-20 sm:w-24 h-3 border-x-2 border-b-2 border-white/90 bg-white/10 pointer-events-none" />

          {/* Etichetta Squadra Bianca (In alto a sinistra) */}
          <div className="absolute top-6 left-5 flex items-center gap-1.5 bg-white/95 text-slate-950 px-2 py-0.5 rounded-md text-[11px] font-black shadow-lg pointer-events-none z-10">
            <span>⚪ SQUADRA BIANCA</span>
            {whiteAvg && (
              <span className="bg-slate-900 text-white text-[9px] px-1 rounded font-mono">
                {whiteAvg}
              </span>
            )}
          </div>

          {/* Etichetta Squadra Nera (In basso a destra) */}
          <div className="absolute bottom-6 right-5 flex items-center gap-1.5 bg-slate-950/95 text-white border border-slate-700 px-2 py-0.5 rounded-md text-[11px] font-black shadow-lg pointer-events-none z-10">
            {blackAvg && (
              <span className="bg-amber-400 text-slate-950 text-[9px] px-1 rounded font-mono font-black">
                {blackAvg}
              </span>
            )}
            <span>⚫ SQUADRA NERA</span>
          </div>

          {/* GIOCATORI: SQUADRA BIANCA */}
          {teamWhite.map((player, idx) => {
            const pos = whitePositions[idx] || { x: 50, y: 20, roleLabel: 'CALC' };
            const ovr = getPlayerOverallRating(player);
            return (
              <div
                key={`white-${player.id || idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-transform"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Badge Maglia Giocatore */}
                <div className="relative flex items-center justify-center">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-white to-slate-200 text-slate-900 font-black shadow-xl ring-2 ring-white/90 flex items-center justify-center overflow-hidden">
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs sm:text-sm">{player.full_name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  {/* Rating pill */}
                  <span className="absolute -top-1 -right-1.5 bg-emerald-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-white/80 shadow">
                    {ovr}
                  </span>
                </div>
                {/* Nome Cartellino */}
                <div className="mt-0.5 bg-slate-950/90 backdrop-blur-sm text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow max-w-[80px] sm:max-w-[95px] truncate border border-white/20">
                  {player.full_name}
                </div>
              </div>
            );
          })}

          {/* GIOCATORI: SQUADRA NERA */}
          {teamBlack.map((player, idx) => {
            const pos = blackPositions[idx] || { x: 50, y: 75, roleLabel: 'CALC' };
            const ovr = getPlayerOverallRating(player);
            return (
              <div
                key={`black-${player.id || idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-transform"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Badge Maglia Giocatore */}
                <div className="relative flex items-center justify-center">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-slate-900 to-black text-white font-black shadow-xl ring-2 ring-amber-400/90 flex items-center justify-center overflow-hidden">
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs sm:text-sm">{player.full_name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  {/* Rating pill */}
                  <span className="absolute -top-1 -right-1.5 bg-amber-500 text-slate-950 font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-black shadow">
                    {ovr}
                  </span>
                </div>
                {/* Nome Cartellino */}
                <div className="mt-0.5 bg-slate-950/90 backdrop-blur-sm text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow max-w-[80px] sm:max-w-[95px] truncate border border-amber-400/40">
                  {player.full_name}
                </div>
              </div>
            );
          })}

          {/* Watermark ClubCalcetto */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] text-white/50 tracking-widest font-mono uppercase pointer-events-none">
            ClubCalcetto 5v5 Matchmaker
          </div>
        </div>
      </div>
    );
  }
);

VirtualPitch.displayName = 'VirtualPitch';
