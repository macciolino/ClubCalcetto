'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { AccountRemovalMode, DELETE_REASONS, deleteMyAccount } from '@/lib/services/accountService';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

/**
 * Bottom of the profile: the player deletes their own account. Always asks for a reason (sent to the
 * developer as feedback) and for a final confirmation. The super admin account cannot be deleted.
 */
export function DeleteAccountSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AccountRemovalMode>('deactivate');
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
    const question =
      mode === 'deactivate'
        ? 'Confermi la disattivazione del tuo account? Non potrai più entrare finché un amministratore non lo riattiva.'
        : 'Confermi l’eliminazione DEFINITIVA del tuo account e di tutti i tuoi dati? Non si può annullare.';
    if (!confirm(question)) return;
    setBusy(true);
    try {
      const res = await deleteMyAccount(reason, details.trim(), mode);
      if (res.ok) {
        alert(
          mode === 'deactivate'
            ? 'Il tuo account è stato disattivato. Per tornare chiedi a un amministratore di riattivarlo.'
            : 'Il tuo account è stato eliminato. Grazie per aver giocato con noi!'
        );
        await signOut();
        return;
      }
      setError(
        res.error === 'not_configured'
          ? 'Operazione non disponibile al momento: contatta un amministratore.'
          : 'Operazione non riuscita. Riprova tra poco.'
      );
    } catch {
      setError('Operazione non riuscita. Controlla la connessione e riprova.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-slate-900 border border-rose-500/30 rounded-3xl p-5 space-y-4" aria-labelledby="delete-account-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="delete-account-title" className="text-sm font-black text-rose-300 uppercase tracking-wider flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Disattiva o elimina account
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Metti in pausa il tuo account oppure cancellalo con tutti i dati.</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-300 border border-rose-500/40 hover:bg-rose-500/10"
          >
            Disattiva o elimina
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-white mb-1">Cosa vuoi fare?</legend>
            {(
              [
                ['deactivate', 'Disattiva (posso tornare)', 'Non potrai più entrare, ma scheda, parametri e statistiche restano salvati: un amministratore può riattivare l’account e ritrovi tutto.'],
                ['delete', 'Elimina tutto', 'Accesso, scheda, parametri e statistiche vengono cancellati. Nelle partite giocate resta solo il tuo nome. Non si può annullare.'],
              ] as const
            ).map(([value, label, help]) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-3 rounded-xl border text-sm cursor-pointer ${
                  mode === value ? 'border-rose-400 bg-rose-500/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="removal-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="accent-rose-500 h-4 w-4 mt-0.5"
                />
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-xs text-slate-400 mt-0.5">{help}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-300" /> In entrambi i casi vengono tolte le tue iscrizioni e le notifiche.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-white mb-1">Perché lasci? (obbligatorio)</legend>
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
              {mode === 'deactivate' ? 'Disattiva account' : 'Elimina definitivamente'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
