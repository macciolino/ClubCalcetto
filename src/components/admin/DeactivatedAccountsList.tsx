'use client';

import React from 'react';
import { Profile } from '@/types/database';
import { Trash2 } from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';

interface DeactivatedAccountsListProps {
  deactivatedPlayers: Profile[];
  onReactivatePlayer: (player: Profile) => void;
  onDeleteDeactivatedPlayer: (player: Profile) => void;
}

/** Super admin (Impostazioni → Admin e account): deactivated accounts, data kept, with reactivate / delete for good. */
export function DeactivatedAccountsList({
  deactivatedPlayers,
  onReactivatePlayer,
  onDeleteDeactivatedPlayer,
}: DeactivatedAccountsListProps) {
  return (
      <ul className="space-y-2">
        {deactivatedPlayers.map((p) => (
          <li
            key={p.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 rounded-2xl p-4"
          >
            <div className="min-w-0">
              <div className="font-bold text-sm text-white truncate">{p.full_name}</div>
              <div className="text-xs text-slate-400 truncate">{p.email || 'Nessuna mail'}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Disattivato {p.deactivated_by === 'self' ? 'dal giocatore' : 'da un admin'}
                {p.deactivated_at ? ` il ${new Date(p.deactivated_at).toLocaleDateString('it-IT')}` : ''} · OVR {p.overall_rating} ·{' '}
                {p.matches_won ?? 0}V-{p.matches_drawn ?? 0}P-{p.matches_lost ?? 0}S
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onReactivatePlayer(p)}
                className={`${btnInline.primary} flex-1 sm:flex-none`}
              >
                Riattiva
              </button>
              <button
                type="button"
                onClick={() => onDeleteDeactivatedPlayer(p)}
                aria-label={`Elimina definitivamente ${p.full_name}`}
                title="Elimina definitivamente"
                className="px-3 py-2.5 rounded-xl text-rose-300 border border-rose-500/40 hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {deactivatedPlayers.length === 0 && <li className="text-xs text-slate-400">Nessun account disattivato.</li>}
      </ul>
  );
}
