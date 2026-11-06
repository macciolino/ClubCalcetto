'use client';

import React, { useState } from 'react';
import { Bell, Smartphone } from 'lucide-react';

type Platform = 'android' | 'ios';

const STEPS: Record<Platform, string[]> = {
  android: [
    'Apri ClubCalcetto con Google Chrome.',
    'Tocca i tre puntini in alto a destra e scegli "Aggiungi a schermata Home" (oppure "Installa app").',
    'Apri l\'app dall\'icona che è comparsa sulla schermata Home.',
    'Quando l\'app chiede di inviarti notifiche, tocca "Consenti".',
    'Se per sbaglio hai negato: Impostazioni del telefono → App → Chrome (o ClubCalcetto) → Notifiche → attiva.',
  ],
  ios: [
    'Serve iPhone con iOS 16.4 o successivo (Impostazioni → Generali → Info).',
    'Apri ClubCalcetto con Safari (non con altre app o browser).',
    'Tocca il pulsante Condividi (il quadrato con la freccia verso l\'alto) e scegli "Aggiungi alla schermata Home".',
    'Apri l\'app SOLO dall\'icona sulla schermata Home: su iPhone le notifiche funzionano solo così.',
    'Quando l\'app chiede di inviarti notifiche, tocca "Consenti".',
    'Se per sbaglio hai negato: Impostazioni → Notifiche → ClubCalcetto → Consenti notifiche.',
  ],
};

/** Simple step-by-step guide to enable notifications on Android and iPhone (shown in the profile). */
export function NotificationGuide() {
  const [platform, setPlatform] = useState<Platform>(() => {
    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
    return 'android';
  });

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4" aria-labelledby="notif-guide-title">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Bell className="h-5 w-5 text-emerald-400" />
        <h2 id="notif-guide-title" className="text-base font-black text-white uppercase tracking-wider">
          Come attivare le notifiche
        </h2>
      </div>
      <p className="text-xs text-slate-400">
        Ti avvisiamo quando la partita è confermata, quando entri tra i titolari dalla lista d&apos;attesa e quando si
        aprono le iscrizioni della settimana dopo. Le notifiche sono gratuite.
      </p>

      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl text-sm">
        {(['android', 'ios'] as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            aria-pressed={platform === p}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-bold transition-all ${
              platform === p ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-4 w-4" /> {p === 'android' ? 'Android' : 'iPhone'}
          </button>
        ))}
      </div>

      <ol className="space-y-2.5">
        {STEPS[platform].map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-200">
            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-black flex items-center justify-center">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
        L&apos;invio delle notifiche verrà attivato con il prossimo aggiornamento: intanto puoi già aggiungere l&apos;app
        alla schermata Home, così sarai pronto.
      </p>
    </section>
  );
}
