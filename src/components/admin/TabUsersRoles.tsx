'use client';

import React, { useState } from 'react';
import { Profile, FIELD_POSITION_ABBR } from '@/types/database';
import { StatBadge } from '@/components/StatBadge';
import { getPlayerMatchRecord } from '@/lib/services/playerService';
import { 
  Users, 
  Search, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  Edit3, 
  Trash2, 
  Shield, 
  Filter,
  Check,
  Star,
  User,
  ArrowUpDown
} from 'lucide-react';

interface TabUsersRolesProps {
  players: Profile[];
  onOpenAddModal: () => void;
  onOpenEditModal: (player: Profile) => void;
  onTogglePlayerRole: (player: Profile) => void;
  onDeletePlayer: (playerId: string, name: string) => void;
  /** Solo il super admin può promuovere/retrocedere admin */
  canManageRoles?: boolean;
  /** Super admin only: deactivated accounts (hidden everywhere else), with reactivate / delete for good */
  deactivatedPlayers?: Profile[];
  onReactivatePlayer?: (player: Profile) => void;
  onDeleteDeactivatedPlayer?: (player: Profile) => void;
}

export function TabUsersRoles({
  players,
  onOpenAddModal,
  onOpenEditModal,
  onTogglePlayerRole,
  onDeletePlayer,
  canManageRoles = false,
  deactivatedPlayers = [],
  onReactivatePlayer,
  onDeleteDeactivatedPlayer,
}: TabUsersRolesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'player' | 'guest' | 'google' | 'deactivated'>('all');

  // Filtra giocatori
  const filteredPlayers = players.filter((player) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      player.full_name.toLowerCase().includes(q) ||
      (player.email && player.email.toLowerCase().includes(q));

    if (!matchesQuery) return false;

    if (roleFilter === 'admin') return player.role === 'admin';
    if (roleFilter === 'player') return player.role === 'player';
    if (roleFilter === 'guest') return player.is_guest;
    if (roleFilter === 'google') return !player.is_guest;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* HEADER & AZIONE PRIMARIA "+ NUOVO OSPITE" */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              Anagrafica Utenti, Ruoli & Gestione Permessi
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestisci la rosa giocatori, promuovi a ruolo Admin e aggiorna le valutazioni radar.
          </p>
        </div>

        {/* CTA Primaria: Nuovo Ospite */}
        <button
          type="button"
          onClick={onOpenAddModal}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>+ Nuovo Ospite</span>
        </button>
      </div>

      {/* BARRA DI RICERCA & CHIP DI FILTRAGGIO */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Input Ricerca */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Cerca per nome o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Chip Filtri */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              roleFilter === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tutti ({players.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('admin')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              roleFilter === 'admin'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            ★ Admin ({players.filter((p) => p.role === 'admin').length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('player')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              roleFilter === 'player'
                ? 'bg-blue-500 text-white shadow-md font-black'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Giocatori ({players.filter((p) => p.role === 'player').length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('google')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              roleFilter === 'google'
                ? 'bg-purple-500 text-white shadow-md font-black'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Google Auth ({players.filter((p) => !p.is_guest).length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('guest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              roleFilter === 'guest'
                ? 'bg-slate-700 text-white shadow-md font-black'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Ospiti Manuali ({players.filter((p) => p.is_guest).length})
          </button>
          {canManageRoles && deactivatedPlayers.length > 0 && (
            <button
              type="button"
              onClick={() => setRoleFilter('deactivated')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                roleFilter === 'deactivated'
                  ? 'bg-rose-500 text-white shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Disattivati ({deactivatedPlayers.length})
            </button>
          )}
        </div>
      </div>

      {/* ACCOUNT DISATTIVATI (solo super admin): riattiva o elimina definitivamente */}
      {roleFilter === 'deactivated' && (
        <ul className="space-y-2">
          {deactivatedPlayers.map((p) => (
            <li
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm text-white truncate">{p.full_name}</div>
                <div className="text-xs text-slate-400 truncate">{p.email || 'Nessuna mail'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Disattivato {p.deactivated_by === 'self' ? 'dal giocatore' : 'dal super admin'}
                  {p.deactivated_at ? ` il ${new Date(p.deactivated_at).toLocaleDateString('it-IT')}` : ''} · OVR {p.overall_rating} ·{' '}
                  {p.matches_won ?? 0}V-{p.matches_drawn ?? 0}P-{p.matches_lost ?? 0}S
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onReactivatePlayer?.(p)}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider"
                >
                  Riattiva
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDeactivatedPlayer?.(p)}
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
      )}

      {/* TABELLA ADVANCED DATAGRID (DESKTOP) E CARD COLLAPSED (MOBILE) */}
      <div className={`bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden ${roleFilter === 'deactivated' ? 'hidden' : ''}`}>
        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center">#</th>
                <th className="py-3.5 px-4">Giocatore & Contatto</th>
                <th className="py-3.5 px-3 text-center">Ruolo Sistema</th>
                <th className="py-3.5 px-3 text-center">Posizione Campo</th>
                <th className="py-3.5 px-3 text-center">OVR</th>
                <th className="py-3.5 px-3 text-center">Record (V-P-S)</th>
                <th className="sticky right-0 z-20 py-3.5 px-4 text-center bg-slate-950 border-l border-slate-800 shadow-[-8px_0_12px_rgba(0,0,0,0.8)] min-w-[200px]">
                  Azioni Admin
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 italic">
                    Nessun giocatore corrisponde ai criteri di ricerca.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player, idx) => {
                  const rec = getPlayerMatchRecord(player);
                  const isSuperAdmin = player.email?.toLowerCase().includes('macciolino84');

                  return (
                    <tr
                      key={player.id}
                      className="hover:bg-slate-850/50 transition-colors group"
                    >
                      <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-bold">
                        {idx + 1}
                      </td>

                      {/* Giocatore */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {player.avatar_url ? (
                              <img
                                src={player.avatar_url}
                                alt={player.full_name}
                                className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-700"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                                {player.full_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {player.role === 'admin' && (
                              <span
                                className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[8px] font-black rounded-full h-3.5 w-3.5 flex items-center justify-center ring-1 ring-slate-950"
                                title="Amministratore"
                              >
                                ★
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{player.full_name}</span>
                              {player.is_guest && (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-medium">
                                  Ospite
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                              {player.email || 'Nessun account Google'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Ruolo Sistema */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            player.role === 'admin'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {player.role === 'admin' ? '★ Admin' : 'Giocatore'}
                        </span>
                      </td>

                      {/* Posizione Campo */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                          {FIELD_POSITION_ABBR[player.position || 'Esterno']}
                        </span>
                      </td>

                      {/* OVR Rating */}
                      <td className="py-3.5 px-3 text-center">
                        <StatBadge score={player.overall_rating || 6.0} size="md" />
                      </td>

                      {/* Record V-P-S */}
                      <td className="py-3.5 px-3 text-center font-mono text-[11px] whitespace-nowrap">
                        <span className="text-emerald-400 font-bold">{rec.won}V</span>
                        <span className="text-slate-500 mx-1">-</span>
                        <span className="text-amber-400 font-bold">{rec.drawn}P</span>
                        <span className="text-slate-500 mx-1">-</span>
                        <span className="text-rose-400 font-bold">{rec.lost}S</span>
                      </td>

                      {/* Azioni Inline Sticky */}
                      <td className="sticky right-0 z-20 py-3.5 px-4 text-center border-l border-slate-800 bg-slate-900 shadow-[-8px_0_12px_rgba(0,0,0,0.8)] min-w-[200px]">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Promuovi / Degrada Ruolo */}
                          <button
                            type="button"
                            onClick={() => onTogglePlayerRole(player)}
                            disabled={isSuperAdmin || !canManageRoles}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                              player.role === 'admin'
                                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            title={
                              isSuperAdmin
                                ? 'Admin Principale (Non modificabile)'
                                : !canManageRoles
                                ? 'Solo il super admin può cambiare i ruoli'
                                : player.role === 'admin'
                                ? 'Rendi Giocatore Ordinario'
                                : 'Promuovi ad Amministratore'
                            }
                          >
                            <ShieldCheck className="h-3 w-3" />
                            <span>{player.role === 'admin' ? 'Rendi Player' : 'Fai Admin'}</span>
                          </button>

                          {/* Modifica Scheda & Ottagono */}
                          <button
                            type="button"
                            onClick={() => onOpenEditModal(player)}
                            className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-lg transition-all cursor-pointer"
                            title="Modifica abilità ottagono radar"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>

                          {/* Elimina Giocatore */}
                          <button
                            type="button"
                            onClick={() => onDeletePlayer(player.id, player.full_name)}
                            disabled={isSuperAdmin || (!player.is_guest && !canManageRoles)}
                            className="p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                            title={
                              player.is_guest
                                ? 'Elimina ospite'
                                : canManageRoles
                                ? 'Disattiva account (i dati restano salvati)'
                                : 'Solo il super admin può eliminare un account registrato'
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE RESPONSIVE CARDS */}
        <div className="md:hidden divide-y divide-slate-800 p-3 space-y-3">
          {filteredPlayers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 italic">
              Nessun giocatore trovato.
            </div>
          ) : (
            filteredPlayers.map((player) => {
              const rec = getPlayerMatchRecord(player);
              const isSuperAdmin = player.email?.toLowerCase().includes('macciolino84');

              return (
                <div
                  key={player.id}
                  className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 flex-shrink-0 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-400 text-sm">
                        {player.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-1.5">
                          <span>{player.full_name}</span>
                          {player.role === 'admin' && (
                            <span className="text-[10px] text-amber-400 font-bold">★ Admin</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 break-all">
                          {player.email || (player.is_guest ? 'Ospite, nessuna mail' : 'Nessuna mail')}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {FIELD_POSITION_ABBR[player.position || 'Esterno']}
                        </span>
                      </div>
                    </div>

                    <StatBadge score={player.overall_rating || 6.0} size="md" />
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-800/80">
                    <span className="text-slate-500">Record:</span>
                    <span>
                      <strong className="text-emerald-400">{rec.won}V</strong> -{' '}
                      <strong className="text-amber-400">{rec.drawn}P</strong> -{' '}
                      <strong className="text-rose-400">{rec.lost}S</strong>
                    </span>
                  </div>

                  {/* Azioni Mobile */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => onTogglePlayerRole(player)}
                      disabled={isSuperAdmin || !canManageRoles}
                      className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {player.role === 'admin' ? 'Rendi Player' : 'Promuovi Admin'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenEditModal(player)}
                        className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePlayer(player.id, player.full_name)}
                        disabled={isSuperAdmin || (!player.is_guest && !canManageRoles)}
                        aria-label={player.is_guest ? 'Elimina ospite' : 'Elimina account'}
                        className="p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
