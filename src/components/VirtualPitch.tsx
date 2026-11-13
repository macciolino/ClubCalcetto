'use client';

import { initialsOf, uploadedPhoto } from '@/lib/utils/playerUtils';
import { ROTATION_KEEPER_LABEL } from '@/lib/utils/teamUtils';
import React, { forwardRef } from 'react';
import { Profile } from '@/types/database';
import { PlayerPitchPosition, getShortPlayerName } from '@/lib/utils/formation';
import { FormationSlot, slotsForTeamSize } from '@/lib/utils/matchFormat';
import { getPlayerOverallRating } from '@/lib/algorithm/teamBalancer';
import { formatLongDate } from '@/lib/utils/dateUtils';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';
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
  /** false = goalkeeper in rotation: the goal slot is labelled "PORTA ↻" instead of POR */
  fixedKeeper?: boolean;
  /** Places of the formation (white half; black is mirrored). Default: from the team size (5 = rombo 1-1-2-1). */
  slots?: FormationSlot[];
  /** "5vs5", "7vs7"… shown on the pitch */
  formatLabel?: string;
  /** Players of the match, for the quota a testa (default: both teams) */
  players?: number;
}

/** Pitch size and sticker size by players per team: more players → longer pitch and smaller stickers. */
function pitchLayout(perTeam: number) {
  if (perTeam <= 5) return { pitch: 'aspect-[9/14.5] sm:aspect-[9/13.5] min-h-[460px] sm:min-h-[520px]', compact: false };
  if (perTeam <= 8) return { pitch: 'aspect-[9/16] min-h-[560px] sm:min-h-[640px]', compact: true };
  return { pitch: 'aspect-[9/17] min-h-[660px] sm:min-h-[760px]', compact: true };
}

export const VirtualPitch = forwardRef<HTMLDivElement, VirtualPitchProps>(
  ({ teamWhite, teamBlack, matchInfo, whiteAvg, blackAvg, fixedKeeper = true, slots, formatLabel, players }, ref) => {
    const t = useTranslations('pitch');
    const { locale } = useLocaleSetting();
    const keeperLabel = (pos: PlayerPitchPosition, idx: number) =>
      idx === 0 && !fixedKeeper ? { ...pos, roleLabel: ROTATION_KEEPER_LABEL } : pos;
    const perTeam = Math.max(teamWhite.length, teamBlack.length, slots?.length || 0) || 5;
    const places = slots && slots.length === perTeam ? slots : slotsForTeamSize(perTeam);
    // Bianchi nella metà alta (porta in alto), Neri nella metà bassa: specchiati sulla linea di metà campo
    const whitePositions: PlayerPitchPosition[] = places.map((s) => ({ x: s.x, y: s.y, roleLabel: s.label }));
    const blackPositions: PlayerPitchPosition[] = places.map((s) => ({ x: s.x, y: 100 - s.y, roleLabel: s.label }));
    const layout = pitchLayout(perTeam);
    const headCount = players || perTeam * 2;

    const costPerPerson = matchInfo?.totalCost
      ? (matchInfo.totalCost / headCount).toFixed((matchInfo.totalCost / headCount) % 1 === 0 ? 0 : 2)
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
                <div className="text-xs sm:text-sm font-black tracking-tight text-white flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words leading-snug">
                    {matchInfo.location || t('defaultLocation')}
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 flex items-center gap-1.5 sm:gap-2 mt-0.5 font-medium flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-500 flex-shrink-0" />
                    {formatLongDate(matchInfo.date, locale)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <Clock className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                    {t('at', { time: matchInfo.time })}
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
                  {t('perPerson', { amount: costPerPerson })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CAMPO DA CALCETTO OTTIMIZZATO PER SMARTPHONE (ASPECT 9/14.5 + MIN HEIGHT) */}
        <div
          className={`relative w-full ${layout.pitch} rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border-2 sm:border-4 border-slate-800 bg-[#165b33] select-none text-white font-sans`}
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
            <span className="tracking-wider">{t('white')}</span>
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
            <span className="tracking-wider">{t('black')}</span>
            <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-slate-900 border border-amber-400 ring-1 ring-slate-700" />
          </div>

          {/* GIOCATORI: figurine stile album */}
          {teamWhite.map((player, idx) => (
            <PlayerSticker
              key={`white-${player.id || idx}`}
              order={idx}
              player={player}
              team="white"
              pos={keeperLabel(whitePositions[idx] || { x: 50, y: 20, roleLabel: 'CALC' }, idx)}
              compact={layout.compact}
            />
          ))}
          {teamBlack.map((player, idx) => (
            <PlayerSticker
              key={`black-${player.id || idx}`}
              order={idx + perTeam}
              player={player}
              team="black"
              pos={keeperLabel(blackPositions[idx] || { x: 50, y: 75, roleLabel: 'CALC' }, idx)}
              compact={layout.compact}
            />
          ))}

          {/* Watermark Club Soccer a bordo centrocampo */}
          <div className="absolute top-[51%] left-2.5 sm:left-3 text-[7px] sm:text-[8px] text-white/35 tracking-wider font-mono uppercase pointer-events-none select-none">
            Club Soccer {formatLabel || `${perTeam}vs${perTeam}`}
          </div>
        </div>
      </div>
    );
  }
);

VirtualPitch.displayName = 'VirtualPitch';

/** Player sticker in "album figurine" style: white sticker border, photo, team band, role and name. */
function PlayerSticker({
  player,
  team,
  pos,
  order = 0,
  compact = false,
}: {
  player: Profile;
  team: 'white' | 'black';
  pos: PlayerPitchPosition;
  /** Entry order on the pitch: each sticker comes in a little after the previous one */
  order?: number;
  /** 7vs7 and more: smaller stickers so they never overlap */
  compact?: boolean;
}) {
  const ovr = getPlayerOverallRating(player);
  const labels = usePlayerLabels();
  // Senza foto: iniziali di nome e cognome al posto dell'immagine e, sotto, solo il nome
  const nameParts = (player.full_name || '').trim().split(/\s+/).filter(Boolean);
  const initials = initialsOf(player.full_name);
  // "Foto" = solo quella caricata dal giocatore nell'app. L'immagine automatica di Google (una lettera su
  // sfondo colorato per chi non ha una foto) e i vecchi avatar emoji non contano: per loro si vedono le iniziali.
  const photo = uploadedPhoto(player.avatar_url);
  const shortName = photo ? getShortPlayerName(player.full_name) : nameParts[0] || '';
  const isWhite = team === 'white';
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 select-none"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      title={player.full_name}
    >
      <div
        className={`sticker-enter ${compact ? 'w-[40px] sm:w-[50px]' : 'w-[48px] sm:w-[62px]'} rounded-[5px] bg-[#fdfaf0] p-[2px] shadow-[0_3px_6px_rgba(0,0,0,0.55)]`}
        style={{ animationDelay: `${order * (compact ? 40 : 70)}ms`, ['--from-y' as string]: team === 'white' ? '-48px' : '48px' }}
      >
        {/* Fascia squadra con ruolo e voto */}
        <div
          className={`flex items-center justify-between px-1 rounded-t-[3px] text-[7px] sm:text-[8px] font-black leading-[11px] sm:leading-[13px] ${
            isWhite ? 'bg-slate-100 text-slate-900 border-b border-slate-300' : 'bg-slate-900 text-amber-300'
          }`}
        >
          <span>{labels.slot(pos.roleLabel)}</span>
          <span className="font-mono">{ovr}</span>
        </div>
        {/* Foto */}
        <div
          className={`relative ${compact ? 'h-[26px] sm:h-[34px]' : 'h-[36px] sm:h-[46px]'} overflow-hidden flex items-center justify-center ${
            isWhite
              ? 'bg-gradient-to-b from-sky-200 to-sky-400'
              : 'bg-gradient-to-b from-amber-200 to-amber-500'
          }`}
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className={`${compact ? 'text-sm sm:text-lg' : 'text-lg sm:text-2xl'} font-black text-white drop-shadow`}>
              {initials}
            </span>
          )}
        </div>
        {/* Nome */}
        <div
          className={`rounded-b-[3px] px-0.5 text-center text-[7.5px] sm:text-[9px] font-black uppercase tracking-tight truncate leading-[12px] sm:leading-[14px] ${
            isWhite ? 'bg-white text-slate-900' : 'bg-black text-white'
          }`}
        >
          {shortName}
        </div>
      </div>
    </div>
  );
}
