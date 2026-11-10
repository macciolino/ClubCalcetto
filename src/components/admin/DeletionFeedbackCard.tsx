'use client';

import React, { useEffect, useState } from 'react';
import { DeletionFeedback, fetchDeletionFeedback } from '@/lib/services/accountService';
import { MessageSquareWarning, Loader2 } from 'lucide-react';

/** Super admin only (Admin → Anagrafica Rosa): why players deleted their account. Collapsible. */
export function DeletionFeedbackCard() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DeletionFeedback[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || items) return;
    setLoading(true);
    fetchDeletionFeedback()
      .then((list) => (list ? setItems(list) : setError('Impossibile caricare i feedback.')))
      .catch(() => setError('Impossibile caricare i feedback.'))
      .finally(() => setLoading(false));
  }, [open, items]);

  return (
    <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-rose-300" /> Feedback account chiusi
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Solo per te (super admin): i motivi lasciati da chi ha disattivato o eliminato l&apos;account.</p>
        </div>
        <span className="text-xs text-slate-400">{open ? 'Chiudi' : 'Apri'}</span>
      </button>
      {open && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
          {loading && (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </p>
          )}
          {error && <p className="text-xs text-rose-300">{error}</p>}
          {items && items.length === 0 && <p className="text-xs text-slate-400">Nessun account chiuso finora.</p>}
          {items?.map((f) => (
            <div key={f.id} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-white">{f.name}</span>
                <span className="text-slate-500">
                  {new Date(f.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {f.mode === 'deactivate' ? ' · disattivato' : ' · eliminato'}
                  {f.deletedBy === 'super_admin' ? ' da te' : ''}
                </span>
              </div>
              <div className="text-rose-200">Motivo: {f.reason}</div>
              {f.details && <div className="text-slate-300 italic">&quot;{f.details}&quot;</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
