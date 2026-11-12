'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { auth as firebaseAuth } from '@/lib/firebase/config';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';
import { StatRatingFields, ovrOf, orderedCategories } from '@/components/StatRatingFields';
import { Check, Loader2 } from 'lucide-react';

const LATER_KEY = 'cc_self_rating_later';

/**
 * New player (just signed up, `self_rating_pending`): rates their own parameters 1–10, once.
 * "Più tardi" hides it for this session only; it comes back at the next opening until it is done.
 * After the first match an admin reviews the values (Richieste e avvisi → Valutazioni da rivedere).
 */
export function SelfRatingPrompt() {
  const { profile, refreshProfile } = useAuth();
  const categories = useStatCategories();
  const [later, setLater] = useState(true);
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      setLater(sessionStorage.getItem(LATER_KEY) === '1');
    } catch {
      setLater(false);
    }
  }, []);

  const pending = Boolean(profile?.self_rating_pending && !profile.is_guest);
  useEffect(() => {
    if (!pending) return;
    const start: Record<string, number> = {};
    categories.forEach((c) => (start[c.name] = Number(c.default_value ?? 6)));
    setValues((v) => (Object.keys(v).length ? v : start));
  }, [pending, categories]);

  if (!pending || later || categories.length === 0) return null;

  const close = () => {
    try {
      sessionStorage.setItem(LATER_KEY, '1');
    } catch {
      /* ignore */
    }
    setLater(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const stats: Record<string, number> = {};
      orderedCategories(categories).forEach((c) => (stats[c.name] = Number(values[c.name] ?? c.default_value ?? 6)));
      const res = await fetch('/api/account/self-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseAuth.currentUser?.getIdToken()}` },
        body: JSON.stringify({ stats }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error);
      await refreshProfile();
      notify('Autovalutazione salvata. Dopo la tua prima partita un admin la conferma.');
    } catch {
      notify('Salvataggio non riuscito, riprova.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      onClose={close}
      title="Come te la cavi in campo?"
      subtitle="Dai un voto da 1 a 10 a ogni abilità. Servono per fare squadre equilibrate."
      height="tall"
      locked={saving}
      footer={
        <>
          <button type="button" onClick={close} disabled={saving} className={sheetBtn.secondary}>
            Più tardi
          </button>
          <button type="button" onClick={save} disabled={saving} className={sheetBtn.primary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salva
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between rounded-xl bg-slate-950/60 px-4 py-3">
        <span className="text-sm text-slate-400">Il tuo OVR di partenza</span>
        <span className="text-2xl font-bold text-white tabular-nums">{Math.round(ovrOf(values) * 10)}</span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        Sii sincero: dopo la tua prima partita un admin rivede i voti in base a quello che ha visto in campo.
      </p>
      <StatRatingFields categories={categories} values={values} onChange={setValues} showHelp disabled={saving} />
    </Sheet>
  );
}
