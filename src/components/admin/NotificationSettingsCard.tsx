'use client';

import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { useAuth } from '@/lib/context/AuthContext';
import { callNotifyApi } from '@/lib/services/pushService';
import { Bell, Loader2, Send, ChevronDown } from 'lucide-react';

type Mode = 'off' | 'admins' | 'all';

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: 'off', label: 'Spente', help: 'Non parte nessuna notifica.' },
  {
    value: 'admins',
    label: 'Solo admin (prova)',
    help: 'Ogni notifica arriva SOLO agli amministratori, con la scritta [PROVA]: vedete cosa riceverebbero i giocatori senza disturbarli.',
  },
  { value: 'all', label: 'Tutti i giocatori', help: 'Le notifiche arrivano ai giocatori interessati.' },
];

/** Admin → Campi & Parametri: who receives notifications + test notification to yourself. */
export function NotificationSettingsCard() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('admins');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      doc(db, 'settings', 'notifications'),
      (snap) => {
        const m = snap.data()?.mode;
        setMode(m === 'off' || m === 'all' ? m : 'admins');
      },
      (err) => console.warn('[Notifiche] impostazioni:', err.message)
    );
  }, []);

  const handleMode = async (next: Mode) => {
    if (next === mode) return;
    if (next === 'all' && !confirm('Da ora le notifiche arriveranno a tutti i giocatori interessati. Confermi?')) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'settings', 'notifications'),
        { mode: next, updated_at: new Date().toISOString(), updated_by: profile?.id || '' },
        { merge: true }
      );
    } catch (err) {
      console.warn('[Notifiche] salvataggio modalità:', err);
      setMessage('Impossibile salvare la modalità. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  // Diagnostica: quali admin hanno un telefono registrato (per capire perché a qualcuno non arriva)
  type AdminDevice = { name: string; count: number; platforms: string[]; last: string | null };
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const loadDevices = async (type: 'admin_devices' | 'test_admins') => {
    setLoadingDevices(true);
    setMessage('');
    try {
      const res = await callNotifyApi({ type });
      if (res.ok) {
        setDevices((res.devices as AdminDevice[]) || []);
        if (type === 'test_admins') setMessage(`Prova inviata a ${res.sent} dispositivi degli admin.`);
      } else {
        setMessage('Controllo non riuscito. Riprova.');
      }
    } catch {
      setMessage('Controllo non riuscito. Controlla la connessione.');
    } finally {
      setLoadingDevices(false);
    }
  };

  const platformLabel = (p: string) => (p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : p === 'desktop' ? 'PC' : p);

  const handleTest = async () => {
    setTesting(true);
    setMessage('');
    try {
      const res = await callNotifyApi({ type: 'test' });
      if (res.ok && Number(res.devices) > 0) {
        setMessage(`Notifica di prova inviata a ${res.sent}/${res.devices} tuoi dispositivi.`);
      } else if (res.ok) {
        setMessage('Nessun tuo dispositivo registrato: attiva prima le notifiche dal tuo Profilo.');
      } else if (res.error === 'not_configured') {
        setMessage('Il server non è ancora configurato per le notifiche (mancano le chiavi su Vercel).');
      } else {
        setMessage('Invio non riuscito. Riprova.');
      }
    } catch {
      setMessage('Invio non riuscito. Controlla la connessione.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            Notifiche ai giocatori
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Destinatari: <strong className={mode === 'all' ? 'text-emerald-300' : mode === 'admins' ? 'text-violet-300' : 'text-slate-300'}>{MODES.find((m) => m.value === mode)?.label}</strong>
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
      <div className="space-y-4 border-t border-slate-800 pt-4">
      <p className="text-xs text-slate-400">
        Iscrizioni aperte (a tutti i registrati), sei entrato tra i titolari (a chi sale dalla lista d&apos;attesa), partita confermata, squadre cambiate, chi subentra a chi (ai 10
        della partita) e voto MVP aperto (a tutti i registrati). Agli admin arriva anche l&apos;avviso quando una partita raggiunge 10 iscritti. Gratuite (Firebase Cloud Messaging).
      </p>

      <div className="space-y-2" role="radiogroup" aria-label="Chi riceve le notifiche">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => handleMode(m.value)}
            disabled={saving}
            className={`w-full text-left p-3 rounded-2xl border transition-all ${
              mode === m.value ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
            }`}
          >
            <span className="block text-sm font-bold text-white">{m.label}</span>
            <span className="block text-xs text-slate-400 mt-0.5">{m.help}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 disabled:opacity-60"
      >
        {testing ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> : <Send className="h-4 w-4 text-emerald-400" />}
        Manda una notifica di prova a me
      </button>
      {message && <p className="text-xs text-slate-300">{message}</p>}

      {/* Telefoni degli admin */}
      <div className="border-t border-slate-800 pt-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadDevices('admin_devices')}
            disabled={loadingDevices}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 disabled:opacity-60"
          >
            {loadingDevices ? 'Controllo…' : 'Controlla i telefoni degli admin'}
          </button>
          <button
            type="button"
            onClick={() => loadDevices('test_admins')}
            disabled={loadingDevices}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 disabled:opacity-60"
          >
            Manda una prova a tutti gli admin
          </button>
        </div>
        {devices && (
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d.name} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span className="font-bold text-white truncate">{d.name}</span>
                {d.count > 0 ? (
                  <span className="text-right text-emerald-300">
                    {d.count} {d.count === 1 ? 'telefono' : 'dispositivi'} ({d.platforms.map(platformLabel).join(', ')})
                    {d.last && (
                      <span className="block text-slate-500">
                        aggiornato {new Date(d.last).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-right text-amber-300">nessun telefono: deve attivare le notifiche dal Profilo</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
