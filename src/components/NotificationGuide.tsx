'use client';

import { notify } from '@/components/ui/Feedback';

import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { PushStatus, getPushStatus, enablePush, disablePush } from '@/lib/services/pushService';

const STATUS_TEXT: Record<PushStatus, string> = {
  on: 'Notifiche ATTIVE su questo dispositivo.',
  off: 'Notifiche non ancora attive su questo dispositivo.',
  denied: 'Hai bloccato le notifiche: sbloccale dalle impostazioni del telefono (vedi l\'ultimo passaggio qui sotto).',
  needs_install: 'Su iPhone prima aggiungi l\'app alla schermata Home e aprila da lì (passaggi qui sotto).',
  unsupported: 'Questo browser non supporta le notifiche: usa Chrome su Android o Safari su iPhone.',
  not_configured: 'Le notifiche non sono ancora attive sul server: riprova tra qualche giorno.',
};

type Platform = 'android' | 'ios';

const STEPS: Record<Platform, string[]> = {
  android: [
    'Apri Club Soccer con Google Chrome.',
    'Tocca i tre puntini in alto a destra e scegli "Aggiungi a schermata Home" (oppure "Installa app").',
    'Apri l\'app dall\'icona che è comparsa sulla schermata Home.',
    'Torna qui nel Profilo, tocca "Attiva notifiche su questo telefono" e poi "Consenti".',
    'Se per sbaglio hai negato: Impostazioni del telefono → App → Chrome (o Club Soccer) → Notifiche → attiva.',
  ],
  ios: [
    'Serve iPhone con iOS 16.4 o successivo (Impostazioni → Generali → Info).',
    'Apri Club Soccer con Safari (non con altre app o browser).',
    'Tocca il pulsante Condividi (il quadrato con la freccia verso l\'alto) e scegli "Aggiungi alla schermata Home".',
    'Apri l\'app SOLO dall\'icona sulla schermata Home: su iPhone le notifiche funzionano solo così.',
    'Dall\'app aperta così, vai nel Profilo, tocca "Attiva notifiche su questo telefono" e poi "Consenti".',
    'Se per sbaglio hai negato: Impostazioni → Notifiche → Club Soccer → Consenti notifiche.',
  ],
};

/** Simple step-by-step guide to enable notifications on Android and iPhone (shown in the profile). */
export function NotificationGuide() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const handleEnable = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      setStatus(await enablePush(profile.id));
    } catch (err) {
      console.warn('[Push] attivazione:', err);
      notify('Attivazione non riuscita. Riprova; su iPhone apri l\'app dall\'icona sulla schermata Home.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    await disablePush();
    setStatus(await getPushStatus());
    setBusy(false);
  };

  const [platform, setPlatform] = useState<Platform>(() => {
    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
    return 'android';
  });

  return (
    <section className="bg-card border border-line rounded-2xl p-5 space-y-4" aria-labelledby="notif-guide-title">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Bell className="h-5 w-5 text-accent-text" />
        <h2 id="notif-guide-title" className="text-base font-bold text-primary">
          Notifiche
        </h2>
      </div>
      <div className="text-xs text-secondary space-y-1">
        <p>Ti avvisiamo quando:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>si aprono le iscrizioni della settimana prossima;</li>
          <li>dalla lista d&apos;attesa entri tra i titolari;</li>
          <li>la tua partita è confermata o le squadre cambiano;</li>
          <li>qualcuno prende il posto di chi si è ritirato;</li>
          <li>si apre il voto per l&apos;MVP, a fine partita.</li>
        </ul>
        <p>Le notifiche sono gratuite.</p>
      </div>

      {status && (
        <div
          className={`rounded-2xl border p-3 space-y-2 ${
            status === 'on' ? 'border-accent/40 bg-accent/10' : 'border-line-strong bg-app'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-primary flex items-center gap-2">
              {status === 'on' ? <Bell className="h-4 w-4 text-accent-text" /> : <BellOff className="h-4 w-4 text-secondary" />}
              Notifiche su questo dispositivo
            </p>
            {(status === 'on' || status === 'off') && (
              <button
                type="button"
                role="switch"
                aria-checked={status === 'on'}
                aria-label="Notifiche su questo dispositivo"
                onClick={status === 'on' ? handleDisable : handleEnable}
                disabled={busy || !profile}
                className={`relative flex-shrink-0 h-8 w-14 rounded-full transition-colors disabled:opacity-60 ${
                  status === 'on' ? 'bg-accent' : 'bg-line-strong'
                }`}
              >
                {busy ? (
                  <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span
                    className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      status === 'on' ? 'translate-x-6' : ''
                    }`}
                  />
                )}
              </button>
            )}
          </div>
          <p className="text-xs text-secondary">{STATUS_TEXT[status]}</p>
        </div>
      )}

      <p className="text-xs font-bold text-secondary pt-1">Come attivarle sul telefono</p>
      <div className="flex items-center gap-1 bg-app border border-line p-1 rounded-xl text-sm">
        {(['android', 'ios'] as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            aria-pressed={platform === p}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-bold transition-all ${
              platform === p ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary'
            }`}
          >
            <Smartphone className="h-4 w-4" /> {p === 'android' ? 'Android' : 'iPhone'}
          </button>
        ))}
      </div>

      <ol className="space-y-2.5">
        {STEPS[platform].map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-primary">
            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/15 border border-accent/40 text-accent-text text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

    </section>
  );
}
