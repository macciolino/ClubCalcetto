'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { DELETE_REASONS, deleteMyAccount } from '@/lib/services/accountService';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

/**
 * Bottom of the profile: the player deletes their own account. Always asks for a reason (sent to the
 * developer as feedback) and for a final confirmation. The super admin account cannot be deleted.
 */
export function DeleteAccountSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isSuperAdmin) {
    return (
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-xs text-slate-400">
        L&apos;account del super amministratore non si può eliminare dall&apos;app.
      </section>
    );
  }

  const handleDelete = async () => {
    setError('');
    if (!reason) {
      setError('Scegli un motivo: ci aiuta a migliorare l’app.');
      return;
    }
    if (reason === 'Altro' && !details.trim()) {
      setError('Scrivi in breve il motivo.');
      return;
    }
    if (!confirm('Confermi l’eliminazione DEFINITIVA del tuo account? Non si può annullare.')) return;
    setBusy(true);
    try {
      const res = await deleteMyAccount(reason, details.trim());
      if (res.ok) {
        alert('Il tuo account è stato eliminato. Grazie per aver giocato con noi!');
        await signOut();
        return;
      }
      setError(
        res.error === 'not_configured'
          ? 'Eliminazione non disponibile al momento: contatta un amministratore.'
          : 'Eliminazione non riuscita. Riprova tra poco.'
      );
    } catch {
      setError('Eliminazione non riuscita. Controlla la connessione e riprova.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-slate-900 border border-rose-500/30 rounded-3xl p-5 space-y-4" aria-labelledby="delete-account-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="delete-account-title" className="text-sm font-black text-rose-300 uppercase tracking-wider flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Elimina account
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Cancella il tuo account e i tuoi dati da ClubCalcetto.</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-300 border border-rose-500/40 hover:bg-rose-500/10"
          >
            Elimina il mio account
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4">
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-100 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Cosa succede
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>vengono cancellati il tuo accesso, la tua scheda giocatore, le tue iscrizioni e le notifiche;</li>
              <li>nelle partite già giocate resta solo il tuo nome, così lo storico del gruppo non cambia;</li>
              <li>l&apos;operazione non si può annullare: per tornare dovrai registrarti di nuovo.</li>
            </ul>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-white mb-1">Perché vuoi eliminare l&apos;account? (obbligatorio)</legend>
            {DELETE_REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer ${
                  reason === r ? 'border-rose-400 bg-rose-500/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="delete-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-rose-500 h-4 w-4"
                />
                {r}
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-xs font-bold text-white">
              Vuoi aggiungere qualcosa? {reason === 'Altro' ? '(obbligatorio)' : '(facoltativo)'}
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Il tuo commento arriva allo sviluppatore dell'app."
              className="mt-1 w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-rose-400"
            />
          </label>

          {error && <p className="text-xs text-rose-300">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
              disabled={busy}
              className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs font-bold text-slate-300 border border-slate-700 hover:bg-slate-800"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Elimina definitivamente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
