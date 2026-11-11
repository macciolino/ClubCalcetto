'use client';

import React, { useState } from 'react';
import { StatCategory } from '@/types/database';
import { addStatParameter, removeStatParameter } from '@/lib/firebase/firestoreService';
import { NumberInput } from '@/components/NumberInput';
import { CollapsibleCard } from '@/components/CollapsibleCard';
import { Sliders, Plus, Trash2, Loader2, Info, Check } from 'lucide-react';

const DEFAULT_PARAMETER_VALUE = 6;

interface StatParametersCardProps {
  categories: StatCategory[];
  onOpenLegend?: () => void;
}

/**
 * Admin → Campi & Parametri: the player parameters (abilities) used for cards, radar and team balancing.
 * The ONLY place where parameters are added or removed.
 */
export function StatParametersCard({ categories, onOpenLegend }: StatParametersCardProps) {
  const [name, setName] = useState('');
  const [defaultValue, setDefaultValue] = useState(DEFAULT_PARAMETER_VALUE);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    setError('');
    setMessage('');
    if (!clean) return;
    if (clean.length > 30 || /[.~*/[\]`]/.test(clean)) {
      setError('Usa un nome breve, senza simboli (es. Tecnica, Visione, Portiere).');
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      setError(`"${clean}" esiste già.`);
      return;
    }
    if (!confirm(`Aggiungere il parametro "${clean}"? Tutti i giocatori che non ce l'hanno riceveranno il valore ${defaultValue}.`)) return;
    setBusy('add');
    try {
      const updated = await addStatParameter(clean, defaultValue);
      setMessage(
        updated > 0
          ? `"${clean}" aggiunto: ${updated} giocatori hanno ricevuto il valore ${defaultValue}.`
          : `"${clean}" aggiunto: tutti i giocatori avevano già un valore salvato, che è stato mantenuto.`
      );
      setName('');
      setDefaultValue(DEFAULT_PARAMETER_VALUE);
    } catch (err) {
      console.warn('[Parametri] aggiunta non riuscita:', err);
      setError('Aggiunta non riuscita. Controlla la connessione e riprova.');
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (cat: StatCategory) => {
    setError('');
    setMessage('');
    if (!confirm(`Togliere "${cat.name}"? Non verrà più mostrato né usato per OVR e squadre. I valori dei giocatori restano salvati: se lo rimetti tornano quelli di prima.`)) return;
    setBusy(cat.id);
    try {
      await removeStatParameter(cat.id);
      setMessage(`"${cat.name}" tolto.`);
    } catch (err) {
      console.warn('[Parametri] rimozione non riuscita:', err);
      setError('Rimozione non riuscita. Riprova.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <CollapsibleCard
      title="Parametri dei giocatori"
      icon={<Sliders className="h-5 w-5 text-emerald-400" />}
      summary={categories.length ? categories.map((c) => c.name).join(' · ') : 'Nessun parametro'}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <p className="text-xs text-slate-400">
          Le abilità di ogni giocatore (card, radar e bilanciamento squadre). Si aggiungono e tolgono solo qui.
        </p>
        {onOpenLegend && (
          <button
            type="button"
            onClick={onOpenLegend}
            className="self-start flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-bold rounded-xl text-xs border border-indigo-500/30"
          >
            <Info className="h-3.5 w-3.5" /> Cosa misurano
          </button>
        )}
      </div>

      {/* Legenda: cosa succede quando aggiungi o togli */}
      <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 sm:p-4 space-y-1.5 text-xs text-slate-300">
        <p className="font-bold text-white flex items-center gap-1.5">
          <Info className="h-4 w-4 text-emerald-400" /> Come funziona
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Aggiungi:</strong> ogni giocatore riceve il valore predefinito (di solito 6). Poi lo cambi dalla scheda
            del giocatore.
          </li>
          <li>
            <strong>Il voto generale (OVR) non cambia</strong> quando aggiungi un parametro: si ricalcola solo quando
            modifichi e salvi quel giocatore. Così le squadre restano bilanciate come prima.
          </li>
          <li>
            <strong>Togli:</strong> il parametro sparisce dalle schermate e dal calcolo, ma i valori restano salvati. Se lo
            aggiungi di nuovo con lo stesso nome, tornano i valori di prima.
          </li>
        </ul>
      </div>

      {/* Elenco parametri */}
      {categories.length === 0 ? (
        <p className="text-sm text-amber-300">Nessun parametro: aggiungine almeno uno qui sotto.</p>
      ) : (
        <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl pl-3 pr-1 py-1 min-h-[48px]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{cat.name}</div>
                <div className="text-[11px] text-slate-500">predefinito {cat.default_value}</div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(cat)}
                disabled={busy !== null}
                aria-label={`Togli ${cat.name}`}
                className="h-11 w-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
              >
                {busy === cat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aggiunta */}
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1 min-w-0">
          <span className="sr-only">Nome del nuovo parametro</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nuovo parametro (es. Tecnica)"
            maxLength={30}
            className="w-full px-3.5 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-slate-950 px-3 rounded-xl border border-slate-700 flex-1 sm:flex-none">
            <span className="text-xs text-slate-400 whitespace-nowrap">Valore iniziale</span>
            <NumberInput
              min={1}
              max={10}
              value={defaultValue}
              onValueChange={setDefaultValue}
              className="w-12 py-3 bg-transparent text-white font-mono text-sm text-center focus:outline-none font-bold"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null || !name.trim()}
            className="flex items-center justify-center gap-1.5 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs disabled:bg-slate-800 disabled:text-slate-500"
          >
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Aggiungi
          </button>
        </div>
      </form>

      {message && (
        <p className="text-xs text-emerald-300 flex items-start gap-1.5">
          <Check className="h-4 w-4 flex-shrink-0" /> {message}
        </p>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </CollapsibleCard>
  );
}
