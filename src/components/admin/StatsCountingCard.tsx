'use client';

import React, { useState } from 'react';
import { saveAppSettingsDoc } from '@/lib/firebase/firestoreService';
import { useStatsCounting } from '@/lib/hooks/useStatsCounting';
import { BarChart3, Star } from 'lucide-react';

/**
 * Admin → Campi & Parametri: whether scorers' goals and MVP awards count in the statistics
 * (Storico leaderboard and players' profiles). Always open (not collapsible).
 */
export function StatsCountingCard() {
  const { countGoals, countMvp } = useStatsCounting();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const toggle = async (key: 'count_goals' | 'count_mvp', next: boolean) => {
    setSaving(key);
    setError('');
    try {
      await saveAppSettingsDoc({ [key]: next });
    } catch {
      setError('Salvataggio non riuscito. Riprova.');
    } finally {
      setSaving(null);
    }
  };

  const rows: { key: 'count_goals' | 'count_mvp'; on: boolean; label: string; help: string; icon: React.ReactNode }[] = [
    {
      key: 'count_goals',
      on: countGoals,
      label: 'Gol dei marcatori',
      help: 'Colonna e ordinamento "Gol" nella classifica dello Storico e "Gol segnati" nel profilo.',
      icon: <span className="text-base">⚽</span>,
    },
    {
      key: 'count_mvp',
      on: countMvp,
      label: 'MVP',
      help: 'Colonna e ordinamento "MVP" nella classifica dello Storico e "MVP" nel profilo.',
      icon: <Star className="h-4 w-4 text-amber-400" />,
    },
  ];

  return (
    <div className="bg-slate-900 border border-emerald-500/30 p-4 sm:p-5 rounded-3xl shadow-xl space-y-4">
      <div>
        <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          Cosa conta nelle statistiche
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Vittorie, pareggi e sconfitte contano sempre. Gol e MVP si inseriscono comunque a fine partita e restano salvati:
          se spegni un interruttore spariscono solo dalle statistiche, se lo riaccendi ricompaiono.
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
              aria-label={`${r.label} nelle statistiche`}
              disabled={saving !== null}
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
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
