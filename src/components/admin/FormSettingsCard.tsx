'use client';

import React, { useState } from 'react';
import { saveAppSettingsDoc } from '@/lib/firebase/firestoreService';
import { useFormSettings } from '@/lib/hooks/useForms';
import {
  FORM_GOALS_MIN,
  FORM_PENALTY_SAVE_POINTS,
  FORM_PENALTY_SAVE_MAX,
  FORM_GOALS_POINTS,
  FORM_MATCHES,
  FORM_MAX,
  FORM_MIN_VOTES,
  FORM_MVP_POINTS,
  FORM_VOTE_POINTS,
  FORM_WIN_POINTS,
  FORM_LOSS_POINTS,
} from '@/lib/utils/formUtils';
import { ChevronDown, Flame, Star, Info } from 'lucide-react';

const num = (n: number) => String(Math.abs(n)).replace('.', ',');

/**
 * Impostazioni → Parametri e forma: what raises the players' "Stato forma". Always open; the legend is collapsible.
 * Everything off = only the values in the player's card count.
 */
export function FormSettingsCard({ show = 'form' }: { show?: 'form' | 'keeper' }) {
  const settings = useFormSettings();
  const [saving, setSaving] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const setKeeperMode = async (mode: 'rotation' | 'fixed') => {
    if ((mode === 'fixed') === Boolean(settings.fixedKeeper)) return;
    setSaving(true);
    try {
      await saveAppSettingsDoc({ goalkeeper_mode: mode });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: 'form_goals' | 'form_mvp' | 'form_results', next: boolean) => {
    setSaving(true);
    try {
      await saveAppSettingsDoc({ [key]: next });
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    {
      key: 'form_goals' as const,
      on: settings.goals,
      label: 'Gol',
      help: settings.fixedKeeper
        ? `${FORM_GOALS_MIN}+ gol in una partita +${num(FORM_GOALS_POINTS)} (difensori e portiere dal primo gol); rigore parato +${num(FORM_PENALTY_SAVE_POINTS)}.`
        : `${FORM_GOALS_MIN}+ gol in una partita +${num(FORM_GOALS_POINTS)}; i difensori già dal primo gol.`,
      icon: <span className="text-base leading-none">⚽</span>,
    },
    {
      key: 'form_mvp' as const,
      on: settings.mvp,
      label: 'MVP e voti',
      help: `MVP della partita +${num(FORM_MVP_POINTS)}; gli altri da ${FORM_MIN_VOTES} voti in su +${num(FORM_VOTE_POINTS)} per voto.`,
      icon: <Star className="h-4 w-4 text-amber-400" />,
    },
    {
      key: 'form_results' as const,
      on: settings.results,
      label: 'Vittorie e sconfitte',
      help: `Vittoria +${num(FORM_WIN_POINTS)}, pareggio 0, sconfitta −${num(FORM_LOSS_POINTS)} a tutti e 5 della squadra.`,
      icon: <span className="text-base leading-none">🏆</span>,
    },
  ];
  const anyOn = settings.goals || settings.mvp || settings.results;

  if (show === 'keeper') {
    return (
      <>
      {/* Come gioca il club in porta */}
      <section className="bg-slate-900 rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">Portiere</h3>
          <p className="text-sm text-slate-400 mt-0.5">Come gioca il club in porta: cambia il bilanciamento delle squadre e il campo.</p>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl text-sm" role="radiogroup" aria-label="Portiere">
          {([
            ['rotation', 'A rotazione'],
            ['fixed', 'Fisso'],
          ] as const).map(([value, label]) => {
            const active = (value === 'fixed') === Boolean(settings.fixedKeeper);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => setKeeperMode(value)}
                className={`py-2.5 rounded-lg font-bold transition-all ${active ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400">
          {settings.fixedKeeper
            ? 'Fisso: due portieri tra i 10 vanno uno per squadra; il portiere prende il bonus dal primo gol e i rigori parati contano.'
            : 'A rotazione (es. ogni 5 minuti): nessun portiere fisso, sul campo il posto in porta è "PORTA ↻" e le squadre si bilanciano senza cercare un portiere.'}
        </p>
      </section>
      </>
    );
  }

  return (
    <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl space-y-4">
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400 flex-shrink-0" />
          Stato forma dei giocatori
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {anyOn
            ? `Attivo: in base alle ultime ${FORM_MATCHES} partite i giocatori salgono o scendono un po' in tutti i parametri e nel bilanciamento delle squadre.`
            : 'Spento: contano solo i valori scritti nella scheda di ogni giocatore.'}
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                {r.icon} {r.label}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{r.help}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={r.on}
              aria-label={`${r.label}: fa salire lo stato forma`}
              disabled={saving}
              onClick={() => toggle(r.key, !r.on)}
              className={`relative flex-shrink-0 h-8 w-14 rounded-full transition-colors disabled:opacity-60 ${
                r.on ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  r.on ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Legenda di quanto deciso (a tendina) */}
      <div className="rounded-2xl border border-slate-700 bg-slate-950/70">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="w-full flex items-center justify-between gap-2 p-3 text-left"
        >
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Info className="h-4 w-4 text-emerald-400" /> Legenda: come si calcola lo stato forma
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${legendOpen ? 'rotate-180' : ''}`} />
        </button>
        {legendOpen && (
          <div className="px-3 pb-3 space-y-3 text-xs text-slate-300">
            <div>
              <p className="font-bold text-white mb-1">Punti di ogni partita</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  <strong>MVP della partita</strong> (scelto dall&apos;admin alla chiusura): <strong>+{num(FORM_MVP_POINTS)}</strong>.
                  Così anche un difensore che non segna può salire.
                </li>
                <li>
                  <strong>Voti MVP dei giocatori</strong>, da {FORM_MIN_VOTES} voti in su: <strong>+{num(FORM_VOTE_POINTS)} per voto</strong>{' '}
                  (2 voti +0,2 · 3 voti +0,3 · 5 voti +0,5). Per chi è l&apos;MVP vale il +{num(FORM_MVP_POINTS)} al posto dei voti.
                </li>
                <li>
                  <strong>{FORM_GOALS_MIN} o più gol</strong> nella stessa partita: <strong>+{num(FORM_GOALS_POINTS)}</strong>.
                  Chi ha come ruolo <strong>Difensore</strong> (nella scheda giocatore) lo prende già{' '}
                  <strong>dal primo gol</strong>, perché segna raramente. Con il <strong>portiere fisso</strong> vale lo stesso
                  per chi ha ruolo <strong>Portiere</strong>.
                </li>
                <li>
                  <strong>Rigore parato</strong> (solo con portiere fisso, si segna a fine partita):{' '}
                  <strong>+{num(FORM_PENALTY_SAVE_POINTS)}</strong> ciascuno, al massimo <strong>+{num(FORM_PENALTY_SAVE_MAX)}</strong> a
                  partita. Conta con l&apos;interruttore Gol.
                </li>
                <li>
                  <strong>Risultato</strong>: vittoria <strong>+{num(FORM_WIN_POINTS)}</strong>, pareggio <strong>0</strong>, sconfitta{' '}
                  <strong>−{num(FORM_LOSS_POINTS)}</strong>, a tutti e 5 della squadra. Lo scarto non conta (5-4 o 10-2 è uguale).
                </li>
                <li>
                  I punti della stessa partita <strong>si sommano</strong>: chi perde ma è MVP prende −0,2 + 1 = <strong>+0,8</strong>.
                </li>
                <li>Ogni voce conta solo se il suo interruttore qui sopra è acceso.</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-white mb-1">Stato forma</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  È la <strong>media dei punti delle ultime {FORM_MATCHES} partite</strong> archiviate (una partita non giocata conta 0),
                  da <strong>−{num(FORM_MAX)}</strong> a <strong>+{num(FORM_MAX)}</strong>.
                </li>
                <li>
                  Sopra zero il giocatore è <strong>🔥 in forma</strong> (i valori salgono), sotto zero è <strong>❄️ fuori forma</strong>{' '}
                  (i valori scendono un po&apos;).
                </li>
                <li>
                  Si aggiunge (o si toglie) a <strong>tutti i parametri</strong> e all&apos;<strong>OVR</strong>, sempre tra 1 e 10,
                  e conta quando si bilanciano le squadre.
                </li>
                <li>
                  È <strong>temporaneo</strong>: se nelle partite dopo non fa punti, torna a 0 da solo. I valori scritti nella scheda
                  del giocatore non vengono mai modificati.
                </li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-white mb-1">Esempi (tutti gli interruttori accesi)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Marco B.</strong>: ultima partita vinta (+0,2), MVP (+1) e 4 gol (+0,5) = 1,7; nelle 2 partite prima ha perso
                  (−0,2) e pareggiato (0). Media: (1,7 − 0,2 + 0) ÷ 3 = <strong>+0,5 🔥</strong>. Tiro 7 diventa 7,5, OVR 7,2 diventa 7,7.
                </li>
                <li>
                  <strong>Luca</strong>: 3 sconfitte di fila, nessun voto né gol. Media: (−0,2 × 3) ÷ 3 = <strong>−0,2 ❄️</strong>.
                  Difesa 8 diventa 7,8, OVR 6,5 diventa 6,3.
                </li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-white mb-1">Portiere a rotazione o fisso</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  <strong>A rotazione</strong> (in porta a turno): il ruolo Portiere non conta, nessun bonus da portiere, le squadre si
                  bilanciano solo sulle abilità.
                </li>
                <li>
                  <strong>Fisso</strong>: due portieri tra i 10 vanno in squadre diverse; gol del portiere dal primo gol; rigori parati
                  +{num(FORM_PENALTY_SAVE_POINTS)}.
                </li>
              </ul>
            </div>
            <p className="text-slate-400">Con tutti gli interruttori spenti lo stato forma è 0 per tutti.</p>
          </div>
        )}
      </div>
    </div>
  );
}
