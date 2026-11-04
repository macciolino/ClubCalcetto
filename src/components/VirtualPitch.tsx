'use client';

import React, { forwardRef } from 'react';
import { Profile } from '@/types/database';
import { 
  WHITE_TEAM_COORDINATES, 
  BLACK_TEAM_COORDINATES, 
  getOrganicCoordinates,
  getShortPlayerName 
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
        className="w-full max-w-lg mx-auto bg-slate-950 p-2 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-2xl space-y-2.5 sm:space-y-3"
      >
        {/* INTESTAZIONE ESTERNA: Luogo, Ora, Costo Campo e Quota a persona */}
        {matchInfo && (
          <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl p-2.5 sm:p-3 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-md">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-sm sm:text-base flex-shrink-0">
                ⚽
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="truncate max-w-[180px] xs:max-w-[220px] sm:max-w-[260px]">
                    {matchInfo.location || 'Centro Sportivo Calcetto'}
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 flex items-center gap-1.5 sm:gap-2 mt-0.5 font-medium flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-500 flex-shrink-0" />
                    {formatItalianDate(matchInfo.date)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <Clock className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                    Ore {matchInfo.time}
                  </span>
                </div>
              </div>
            </div>

            {/* Box Costo Campo e Quota per Persona */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-950/80 border border-slate-800 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl self-start sm:self-auto flex-shrink-0">
              <Coins className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
              <div className="text-left font-mono">
                <span className="text-xs font-black text-emerald-400">{matchInfo.totalCost}€</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-sans ml-1">
                  ({costPerPerson}€ / pers.)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CAMPO DA CALCETTO OTTIMIZZATO PER SMARTPHONE (ASPECT 9/14.5 + MIN HEIGHT) */}
        <div
          className="relative w-full aspect-[9/14.5] sm:aspect-[9/13.5] min-h-[460px] sm:min-h-[520px] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border-2 sm:border-4 border-slate-800 bg-[#165b33] select-none text-white font-sans"
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
          <div className="absolute inset-2.5 sm:inset-3.5 border sm:border-2 border-white/80 rounded-sm pointer-events-none" />

          {/* Linea di Metà Campo */}
          <div className="absolute top-1/2 left-2.5 right-2.5 sm:left-3.5 sm:right-3.5 h-0.5 bg-white/80 -translate-y-1/2 pointer-events-none" />

          {/* Cerchio di Centrocampo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-28 sm:h-28 rounded-full border sm:border-2 border-white/80 pointer-events-none flex items-center justify-center">
            {/* Punto di battuta */}
            <div className="w-2 h-2 bg-white rounded-full shadow" />
          </div>

          {/* Area di Rigore Superiore (Squadra Bianca) */}
          <div className="absolute top-2.5 sm:top-3.5 left-1/2 -translate-x-1/2 w-36 sm:w-48 h-12 sm:h-16 border-b sm:border-b-2 border-x sm:border-x-2 border-white/80 rounded-b-xl pointer-events-none flex items-end justify-center pb-1 sm:pb-1.5">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full" />
          </div>
          {/* Porta Superiore */}
          <div className="absolute top-0.5 sm:top-1 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-2 sm:h-2.5 border-x sm:border-x-2 border-t sm:border-t-2 border-white/90 bg-white/10 pointer-events-none" />

          {/* Area di Rigore Inferiore (Squadra Nera) */}
          <div className="absolute bottom-2.5 sm:bottom-3.5 left-1/2 -translate-x-1/2 w-36 sm:w-48 h-12 sm:h-16 border-t sm:border-t-2 border-x sm:border-x-2 border-white/80 rounded-t-xl pointer-events-none flex items-start justify-center pt-1 sm:pt-1.5">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full" />
          </div>
          {/* Porta Inferiore */}
          <div className="absolute bottom-0.5 sm:bottom-1 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-2 sm:h-2.5 border-x sm:border-x-2 border-b sm:border-b-2 border-white/90 bg-white/10 pointer-events-none" />

          {/* Badge Squadra Bianca Discreto e Compatto (Angolo in alto a sinistra) */}
          <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 flex items-center gap-1 bg-slate-950/90 text-white/90 border border-white/20 px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold shadow-md pointer-events-none z-10 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-white ring-1 ring-slate-400" />
            <span className="tracking-wider">BIANCHI</span>
            {whiteAvg && (
              <span className="bg-white text-slate-950 text-[7.5px] sm:text-[8px] font-black px-1 rounded font-mono ml-0.5">
                {whiteAvg}
              </span>
            )}
          </div>

          {/* Badge Squadra Nera Discreto e Compatto (Angolo in basso a destra) */}
          <div className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 flex items-center gap-1 bg-slate-950/90 text-white/90 border border-slate-700 px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold shadow-md pointer-events-none z-10 backdrop-blur-sm">
            {blackAvg && (
              <span className="bg-amber-400 text-slate-950 text-[7.5px] sm:text-[8px] font-black px-1 rounded font-mono mr-0.5">
                {blackAvg}
              </span>
            )}
            <span className="tracking-wider">NERI</span>
            <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-slate-900 border border-amber-400 ring-1 ring-slate-700" />
          </div>

          {/* GIOCATORI: SQUADRA BIANCA */}
          {teamWhite.map((player, idx) => {
            const pos = whitePositions[idx] || { x: 50, y: 20, roleLabel: 'CALC' };
            const ovr = getPlayerOverallRating(player);
            const shortName = getShortPlayerName(player.full_name);

            return (
              <div
                key={`white-${player.id || idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-transform z-10"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Badge Maglia Giocatore */}
                <div className="relative flex items-center justify-center">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-white to-slate-200 text-slate-900 font-black shadow-lg ring-1.5 sm:ring-2 ring-white/95 flex items-center justify-center overflow-hidden">
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.full_name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[11px] sm:text-sm font-black">
                        {player.full_name ? player.full_name.charAt(0).toUpperCase() : 'P'}
                      </span>
                    )}
                  </div>
                  {/* Rating pill */}
                  <span className="absolute -top-1 -right-1 sm:-right-1.5 bg-emerald-600 text-white font-mono text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0 rounded-full border border-white/80 shadow-sm leading-tight select-none">
                    {ovr}
                  </span>
                </div>
                {/* Nome Cartellino */}
                <div
                  title={player.full_name}
                  className="mt-0.5 bg-slate-950/95 backdrop-blur-sm text-white text-[8px] sm:text-[9.5px] font-bold px-1.5 py-0.5 rounded shadow max-w-[64px] xs:max-w-[72px] sm:max-w-[88px] truncate border border-white/25 text-center leading-tight whitespace-nowrap select-none"
                >
                  {shortName}
                </div>
              </div>
            );
          })}

          {/* GIOCATORI: SQUADRA NERA */}
          {teamBlack.map((player, idx) => {
            const pos = blackPositions[idx] || { x: 50, y: 75, roleLabel: 'CALC' };
            const ovr = getPlayerOverallRating(player);
            const shortName = getShortPlayerName(player.full_name);

            return (
              <div
                key={`black-${player.id || idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-transform z-10"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Badge Maglia Giocatore */}
                <div className="relative flex items-center justify-center">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-slate-900 to-black text-white font-black shadow-lg ring-1.5 sm:ring-2 ring-amber-400/90 flex items-center justify-center overflow-hidden">
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.full_name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[11px] sm:text-sm font-black">
                        {player.full_name ? player.full_name.charAt(0).toUpperCase() : 'P'}
                      </span>
                    )}
                  </div>
                  {/* Rating pill */}
                  <span className="absolute -top-1 -right-1 sm:-right-1.5 bg-amber-500 text-slate-950 font-mono text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0 rounded-full border border-black/80 shadow-sm leading-tight select-none">
                    {ovr}
                  </span>
                </div>
                {/* Nome Cartellino */}
                <div
                  title={player.full_name}
                  className="mt-0.5 bg-slate-950/95 backdrop-blur-sm text-white text-[8px] sm:text-[9.5px] font-bold px-1.5 py-0.5 rounded shadow max-w-[64px] xs:max-w-[72px] sm:max-w-[88px] truncate border border-amber-400/40 text-center leading-tight whitespace-nowrap select-none"
                >
                  {shortName}
                </div>
              </div>
            );
          })}

          {/* Watermark ClubCalcetto a bordo centrocampo */}
          <div className="absolute top-[51%] left-2.5 sm:left-3 text-[7px] sm:text-[8px] text-white/35 tracking-wider font-mono uppercase pointer-events-none select-none">
            ClubCalcetto 5v5
          </div>
        </div>
      </div>
    );
  }
);

VirtualPitch.displayName = 'VirtualPitch';
