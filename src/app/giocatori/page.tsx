'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { Profile, StatCategory } from '@/types/database';
import { subscribeProfiles, subscribeStatCategories, deleteProfileDoc } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredPlayers, removeStoredPlayer, saveStoredPlayers, getPlayerMatchRecord } from '@/lib/services/playerService';
import { getStoredCategories } from '@/lib/services/statCategoryService';
import { StatBadge } from '@/components/StatBadge';
import { PlayerModal } from '@/components/PlayerModal';
import { StatCategoriesManager } from '@/components/StatCategoriesManager';
import { PlayerCardFifa } from '@/components/PlayerCardFifa';
import { 
  Users, 
  Search, 
  UserPlus, 
  Settings2, 
  Edit3, 
  Trash2, 
  SlidersHorizontal,
  Shield,
  Star,
  LayoutGrid,
  Table as TableIcon,
  Trophy,
  Sparkles
} from 'lucide-react';

const DEFAULT_CATEGORIES: StatCategory[] = [
  { id: '1', name: 'Resistenza', label: 'Resistenza', default_value: 6 },
  { id: '2', name: 'Velocità', label: 'Velocità', default_value: 6 },
  { id: '3', name: 'Difesa', label: 'Difesa', default_value: 6 },
  { id: '4', name: 'Tiro', label: 'Tiro', default_value: 6 },
  { id: '5', name: 'Passaggio', label: 'Passaggio', default_value: 6 },
  { id: '6', name: 'Tecnica', label: 'Tecnica', default_value: 6 },
  { id: '7', name: 'Fisico', label: 'Fisico', default_value: 6 },
  { id: '8', name: 'Dribbling', label: 'Dribbling', default_value: 6 },
];

const DEFAULT_PLAYERS_LIST: Profile[] = [
  {
    id: 'p-1',
    user_id: 'u-1',
    email: 'macciolino84@gmail.com',
    full_name: 'Marco B. (Tu)',
    avatar_url: null,
    role: 'admin',
    is_guest: false,
    stats: { Resistenza: 8, Velocità: 8, Difesa: 7, Tiro: 8, Passaggio: 8, Tecnica: 9, Fisico: 7, Dribbling: 8 },
    overall_rating: 7.9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-2',
    user_id: null,
    email: null,
    full_name: 'Luca B.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 9, Velocità: 8, Difesa: 8, Tiro: 7, Passaggio: 7, Tecnica: 7, Fisico: 8, Dribbling: 7 },
    overall_rating: 7.8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-3',
    user_id: null,
    email: null,
    full_name: 'Andrea M.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 9, Difesa: 6, Tiro: 8, Passaggio: 8, Tecnica: 9, Fisico: 6, Dribbling: 9 },
    overall_rating: 7.6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-4',
    user_id: null,
    email: null,
    full_name: 'Giovanni R.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 6, Difesa: 9, Tiro: 6, Passaggio: 7, Tecnica: 6, Fisico: 9, Dribbling: 6 },
    overall_rating: 6.9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-5',
    user_id: null,
    email: null,
    full_name: 'Davide P.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 8, Velocità: 7, Difesa: 7, Tiro: 8, Passaggio: 7, Tecnica: 7, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-6',
    user_id: null,
    email: null,
    full_name: 'Matteo C.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 7, Difesa: 8, Tiro: 6, Passaggio: 8, Tecnica: 8, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-7',
    user_id: null,
    email: null,
    full_name: 'Francesco L.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 7, Difesa: 6, Tiro: 9, Passaggio: 7, Tecnica: 8, Fisico: 6, Dribbling: 8 },
    overall_rating: 7.1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-8',
    user_id: null,
    email: null,
    full_name: 'Alessandro S.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 9, Velocità: 8, Difesa: 7, Tiro: 7, Passaggio: 8, Tecnica: 8, Fisico: 8, Dribbling: 8 },
    overall_rating: 7.9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-9',
    user_id: null,
    email: null,
    full_name: 'Simone T.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 8, Velocità: 6, Difesa: 8, Tiro: 6, Passaggio: 7, Tecnica: 7, Fisico: 8, Dribbling: 6 },
    overall_rating: 7.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-10',
    user_id: null,
    email: null,
    full_name: 'Federico N.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 8, Difesa: 7, Tiro: 8, Passaggio: 8, Tecnica: 8, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function GiocatoriPage() {
  const { user, profile, isAdmin } = useAuth();
  const [players, setPlayers] = useState<Profile[]>(() => getStoredPlayers());
  const [categories, setCategories] = useState<StatCategory[]>(() => getStoredCategories());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayerToEdit, setSelectedPlayerToEdit] = useState<Profile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'ovr' | 'wins' | 'name'>('ovr');

  useEffect(() => {
    // 1. Carica dallo store locale
    setPlayers(getStoredPlayers());
    setCategories(getStoredCategories());

    const handlePlayersChanged = () => {
      setPlayers(getStoredPlayers());
    };
    const handleCategoriesChanged = () => {
      setCategories(getStoredCategories());
    };

    window.addEventListener('clubcalcetto_players_changed', handlePlayersChanged);
    window.addEventListener('clubcalcetto_categories_changed', handleCategoriesChanged);

    // 2. Realtime listener da Firebase Firestore
    let unsubProfs = () => {};
    let unsubCats = () => {};

    if (isFirebaseConfigured) {
      unsubProfs = subscribeProfiles((remotePlayers) => {
        if (remotePlayers && remotePlayers.length > 0) {
          setPlayers(remotePlayers);
          saveStoredPlayers(remotePlayers);
        }
      });

      unsubCats = subscribeStatCategories((remoteCats) => {
        if (remoteCats && remoteCats.length > 0) {
          setCategories(remoteCats);
        }
      });
    }

    return () => {
      window.removeEventListener('clubcalcetto_players_changed', handlePlayersChanged);
      window.removeEventListener('clubcalcetto_categories_changed', handleCategoriesChanged);
      unsubProfs();
      unsubCats();
    };
  }, []);

  const handleOpenNewGuestModal = () => {
    setSelectedPlayerToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (player: Profile) => {
    setSelectedPlayerToEdit(player);
    setIsModalOpen(true);
  };

  const handlePlayerSaved = (saved: Profile) => {
    setPlayers(getStoredPlayers());
  };

  const handleDeletePlayer = async (playerId: string, name: string) => {
    if (!isAdmin) {
      alert('Solo l\'amministratore può eliminare i giocatori.');
      return;
    }
    if (!confirm(`Sei sicuro di voler eliminare il giocatore "${name}"?`)) return;

    try {
      removeStoredPlayer(playerId);
      setPlayers(getStoredPlayers());
      await deleteProfileDoc(playerId);
    } catch (err) {
      console.error('Delete player error:', err);
    }
  };

  // Filtraggio e ordinamento
  const filteredPlayers = players
    .filter((p) => p.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'ovr') {
        return (b.overall_rating || 0) - (a.overall_rating || 0);
      }
      if (sortBy === 'wins') {
        return (b.matches_won || 0) - (a.matches_won || 0);
      }
      return a.full_name.localeCompare(b.full_name);
    });

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Azioni */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-emerald-400" />
              Profili Giocatori & Valutazioni
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {isAdmin
              ? 'Pannello Amministratore: gestisci abilità, analizza gli ottagoni radar ed elimina profili.'
              : 'Card stile FIFA/PES con radar ottagonale e statistiche di vittoria, pareggio e sconfitta.'}
          </p>
        </div>

        {/* Pulsanti Admin */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCatManager(!showCatManager)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 transition-colors cursor-pointer"
            >
              <Settings2 className="h-4 w-4 text-emerald-400" />
              {showCatManager ? 'Chiudi Categorie' : 'Gestisci Categorie'}
            </button>
            <button
              type="button"
              onClick={handleOpenNewGuestModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Nuovo Ospite
            </button>
          </div>
        )}
      </div>

      {/* Gestore Categorie Statistiche (Se attivato da Admin) */}
      {isAdmin && showCatManager && (
        <div className="animate-in fade-in duration-200">
          <StatCategoriesManager
            categories={categories}
            onCategoriesChanged={(newCats) => setCategories(newCats)}
          />
        </div>
      )}

      {/* Barra Ricerca, Ordinamento e Switcher Vista */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Cerca giocatore per nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          {/* Switcher Card FIFA vs Tabella */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Vista Card FIFA/PES con Ottagono"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Card FIFA</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Vista Tabella"
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tabella</span>
            </button>
          </div>

          {/* Ordinamento */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setSortBy('ovr')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                sortBy === 'ovr'
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Top OVR
            </button>
            <button
              type="button"
              onClick={() => setSortBy('wins')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                sortBy === 'wins'
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Vittorie
            </button>
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                sortBy === 'name'
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Nome A-Z
            </button>
          </div>
        </div>
      </div>

      {/* VISTA CONTENUTO: CARD FIFA/PES OPPURE TABELLA */}
      {viewMode === 'cards' ? (
        /* GRIGLIA DI CARD CON OTTAGONO E STATISTICHE V-P-S */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 animate-in fade-in duration-300">
          {filteredPlayers.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-500 italic bg-slate-900/60 border border-slate-800 rounded-3xl">
              Nessun giocatore trovato per la ricerca &quot;{searchQuery}&quot;.
            </div>
          ) : (
            filteredPlayers.map((player) => (
              <PlayerCardFifa
                key={player.id}
                player={player}
                isAdmin={isAdmin}
                onEdit={handleOpenEditModal}
                onDelete={(p) => handleDeletePlayer(p.id, p.full_name)}
              />
            ))
          )}
        </div>
      ) : (
        /* TABELLA GIOCATORI CLASSICA */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-4">Giocatore</th>
                  <th className="py-3.5 px-3 text-center">OVR</th>
                  <th className="py-3.5 px-3 text-center">V-P-S</th>
                  {categories.map((cat) => {
                    const shortName = cat.name.length > 5 ? cat.name.slice(0, 3).toUpperCase() : cat.name;
                    return (
                      <th
                        key={cat.id || cat.name}
                        className="py-3.5 px-2 text-center w-14 min-w-[54px]"
                        title={cat.label || cat.name}
                      >
                        <span className="block text-[10px] font-bold tracking-wider text-slate-300">
                          {shortName}
                        </span>
                      </th>
                    );
                  })}
                  {isAdmin && (
                    <th className="sticky right-0 z-20 py-3.5 px-4 text-center bg-slate-950 border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.6)] min-w-[96px]">
                      Azioni
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4 + categories.length + (isAdmin ? 1 : 0)}
                      className="py-8 text-center text-slate-500 italic"
                    >
                      Nessun giocatore trovato con questi filtri.
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player, idx) => {
                    const currentAuthId = (user as any)?.uid || (user as any)?.id;
                    const isCurrent = player.id === (profile?.id || currentAuthId);
                    const rec = getPlayerMatchRecord(player);

                    return (
                      <tr
                        key={player.id}
                        className={`hover:bg-slate-850/50 transition-colors ${
                          isCurrent ? 'bg-emerald-500/5' : ''
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-500">
                          {idx + 1}
                        </td>

                        {/* Info Giocatore */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
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
                                  title="Admin"
                                >
                                  ★
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{player.full_name}</span>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(player)}
                                    className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                    title="Modifica rapida giocatore"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </button>
                                )}
                                {player.is_guest && (
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-medium">
                                    Ospite
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                    Tu
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                                {player.email || (player.is_guest ? 'Giocatore Manuale' : 'Google Auth')}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Overall Rating (OVR) */}
                        <td className="py-3 px-3 text-center">
                          <StatBadge score={player.overall_rating || 6.0} size="md" />
                        </td>

                        {/* Record Partite V-P-S */}
                        <td className="py-3 px-3 text-center font-mono text-[11px] whitespace-nowrap">
                          <span className="text-emerald-400 font-bold">{rec.won}V</span>
                          <span className="text-slate-500 mx-1">-</span>
                          <span className="text-amber-400 font-bold">{rec.drawn}P</span>
                          <span className="text-slate-500 mx-1">-</span>
                          <span className="text-rose-400 font-bold">{rec.lost}S</span>
                        </td>

                        {/* Statistiche Individuali da 1 a 10 */}
                        {categories.map((cat) => {
                          const val = player.stats?.[cat.name] ?? cat.default_value ?? 6;
                          return (
                            <td
                              key={cat.id || cat.name}
                              className="py-3 px-2 text-center font-mono font-semibold w-14 min-w-[54px]"
                              title={`${cat.label || cat.name}: ${val}`}
                            >
                              <span
                                className={`inline-block w-7 py-0.5 rounded text-xs ${
                                  val >= 8
                                    ? 'text-emerald-400 bg-emerald-500/10 font-bold'
                                    : val >= 6
                                    ? 'text-slate-300 bg-slate-800/40'
                                    : 'text-rose-400 bg-rose-500/10'
                                }`}
                              >
                                {val}
                              </span>
                            </td>
                          );
                        })}

                        {/* Azioni Admin (PINNED STICKY RIGHT - MAI NASCOSTE) */}
                        {isAdmin && (
                          <td
                            className={`sticky right-0 z-10 py-3 px-4 text-center border-l border-slate-800 shadow-[-6px_0_12px_rgba(0,0,0,0.6)] min-w-[96px] ${
                              isCurrent ? 'bg-slate-900' : 'bg-slate-900 group-hover:bg-slate-850'
                            }`}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(player)}
                                className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-lg transition-all cursor-pointer shadow-sm"
                                title="Modifica voti e dettagli"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(player.id, player.full_name)}
                                className="p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition-all cursor-pointer"
                                title="Elimina giocatore"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Creazione / Modifica Giocatore */}
      <PlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        playerToEdit={selectedPlayerToEdit}
        statCategories={categories}
        onSaved={handlePlayerSaved}
      />
    </div>
  );
}
