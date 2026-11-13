'use client';

import React, { useState } from 'react';
import { Profile } from '@/types/database';
import { askConfirm } from '@/components/ui/Feedback';
import { initialsOf, uploadedPhoto } from '@/lib/utils/playerUtils';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { btn } from '@/components/ui/buttons';

const isSuper = (p: Profile) => Boolean(p.email?.toLowerCase().includes('macciolino84'));

/**
 * Admins (Impostazioni → Admin e account): who is admin (name + email), remove an admin,
 * make a registered player admin. Guests have no account, so they cannot become admins.
 */
export function AdminsCard({ players, onToggleRole }: { players: Profile[]; onToggleRole: (p: Profile) => Promise<void> | void }) {
  const admins = players.filter((p) => p.role === 'admin' || isSuper(p)).sort((a, b) => Number(isSuper(b)) - Number(isSuper(a)) || a.full_name.localeCompare(b.full_name));
  const candidates = players.filter((p) => p.role !== 'admin' && !isSuper(p) && !p.is_guest).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const [pick, setPick] = useState('');

  const promote = async () => {
    const p = candidates.find((c) => c.id === pick);
    if (!p) return;
    if (!(await askConfirm(`Rendere admin "${p.full_name}"? Potrà gestire presenze, squadre, partite e impostazioni del club.`))) return;
    await onToggleRole(p);
    setPick('');
  };

  return (
    <section className="bg-card rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-primary">Admin</h3>
        <p className="text-sm text-secondary mt-0.5">Chi gestisce il club. Ogni admin può aggiungere o togliere admin; il super admin non si può togliere.</p>
      </div>

      <ul className="divide-y divide-line rounded-xl bg-app/50">
        {admins.map((p) => {
          const photo = uploadedPhoto(p.avatar_url);
          return (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
              {photo ? (
                <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-xs font-bold text-accent-text flex-shrink-0">
                  {initialsOf(p.full_name)}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-primary truncate">{p.full_name}</span>
                <span className="block text-xs text-secondary truncate">{p.email || 'nessuna email'}</span>
              </span>
              {isSuper(p) ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-warning">Super admin</span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    if (await askConfirm(`Togliere i permessi di admin a "${p.full_name}"? Resterà un giocatore normale.`)) await onToggleRole(p);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-line-strong text-secondary hover:text-danger hover:border-rose-500/40"
                >
                  <ShieldOff className="h-3.5 w-3.5" /> Togli admin
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Giocatore da rendere admin"
          className="flex-1 min-w-0 bg-app border border-line rounded-xl px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-accent"
        >
          <option value="">Scegli un giocatore…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {p.email ? ` · ${p.email}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={promote}
          disabled={!pick}
          className={btn.primary}
        >
          <ShieldCheck className="h-4 w-4" /> Rendi admin
        </button>
      </div>
    </section>
  );
}
