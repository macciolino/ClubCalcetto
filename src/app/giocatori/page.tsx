'use client';

import { initialsOf, uploadedPhoto } from '@/lib/utils/playerUtils';
import { notify, askConfirm } from '@/components/ui/Feedback';

import { manageAccountAsSuperAdmin } from '@/lib/services/accountService';
import { useForms } from '@/lib/hooks/useForms';
import React, { useState, useEffect, useMemo } from 'react';
import { computeMatchStats } from '@/lib/utils/statUtils';
import { lastCompletedMatches } from '@/components/FormDots';
import { PlayerCompare } from '@/components/PlayerCompare';
import { useAuth } from '@/lib/context/AuthContext';
import { Profile, StatCategory, Match, FIELD_POSITION_ABBR, STAT_CANONICAL_ORDER } from '@/types/database';
import { subscribeProfiles, subscribeStatCategories, subscribeMatches, deleteProfileDoc } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredPlayers, removeStoredPlayer, saveStoredPlayers, getPlayerMatchRecord } from '@/lib/services/playerService';
import { getStoredCategories, saveStoredCategories, DEFAULT_BASE_CATEGORIES } from '@/lib/services/statCategoryService';
import { StatBadge } from '@/components/StatBadge';
import { PlayerModal } from '@/components/PlayerModal';
import { PlayerCardFifa } from '@/components/PlayerCardFifa';
import { 
  Search, 
  UserPlus, 
  Edit3, 
  Trash2, 
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';

const DEFAULT_CATEGORIES: StatCategory[] = DEFAULT_BASE_CATEGORIES;


export default function GiocatoriPage() {
  const { user, profile, isAdmin, isSuperAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<StatCategory[]>(DEFAULT_CATEGORIES);
  const { forms } = useForms();
  // Statistiche delle card (tab "Statistiche"): dalle partite archiviate, come Storico e Profilo
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeMatches((list) => setCompletedMatches(list.filter((m) => m.status === 'completed')));
    return () => unsub();
  }, []);
  const matchStats = useMemo(() => computeMatchStats(completedMatches), [completedMatches]);
  const recentMatches = useMemo(() => lastCompletedMatches(completedMatches), [completedMatches]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayerToEdit, setSelectedPlayerToEdit] = useState<Profile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'ovr' | 'wins' | 'name' | 'goals' | 'mvp' | 'played' | 'form'>('ovr');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Portiere' | 'Difensore' | 'Esterno' | 'Punta'>('all');
  const [compareOpen, setCompareOpen] = useState(false);
  // Vista tabella: si ordina cliccando le intestazioni (primo clic decrescente, secondo crescente; il nome parte da A-Z)
  const [tableSort, setTableSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'ovr', dir: 'desc' });
  const handleTableSort = (key: string) =>
    setTableSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );

  const isStrictAdmin = Boolean(mounted && user && (profile?.role === 'admin' || isAdmin));
  const isClientAdmin = isStrictAdmin;

  useEffect(() => {
    setMounted(true);
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
        setCategories(remoteCats);
        saveStoredCategories(remoteCats);
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

  // Ospiti: un admin cancella la scheda. Account registrati: solo il super admin, eliminazione completa
  const handleDeletePlayer = async (playerId: string, name: string) => {
    if (!isStrictAdmin || playerId === 'p-1') return;
    const target = players.find((p) => p.id === playerId);
    try {
      if (target?.is_guest) {
        if (!(await askConfirm(`Eliminare l'ospite "${name}"? Nelle partite già giocate resta il nome.`))) return;
        removeStoredPlayer(playerId);
        setPlayers(getStoredPlayers());
        await deleteProfileDoc(playerId);
        return;
      }
      if (!isSuperAdmin) {
        notify('Solo il super admin può disattivare un account registrato.');
        return;
      }
      if (!(await askConfirm(`Disattivare l'account di "${name}"? Non potrà più entrare e sparirà dalle pagine; scheda, parametri e statistiche restano salvati. Potrai riattivarlo o eliminarlo del tutto da Admin → Anagrafica Rosa → Disattivati.`))) return;
      const res = await manageAccountAsSuperAdmin(playerId, 'deactivate');
      if (!res.ok) {
        notify('Operazione non riuscita. Riprova.');
        return;
      }
      removeStoredPlayer(playerId);
      setPlayers(getStoredPlayers());
    } catch (err) {
      console.error('Delete player error:', err);
    }
  };

  // Filtraggio e ordinamento (card: pulsanti in alto; tabella: intestazioni cliccabili)
  const POSITION_ORDER = ['Portiere', 'Difensore', 'Esterno', 'Punta'];
  const tableValue = (p: Profile, key: string): number | string => {
    if (key === 'name') return p.full_name.toLowerCase();
    if (key === 'position') return POSITION_ORDER.indexOf(p.position || 'Esterno');
    if (key === 'ovr') return p.overall_rating || 0;
    if (key === 'wins') return p.matches_won || 0;
    const cat = categories.find((c) => `stat:${c.name}` === key);
    return cat ? Number(p.stats?.[cat.name] ?? cat.default_value ?? 6) : 0;
  };
  const filteredPlayers = players
    .filter((p) => p.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((p) => roleFilter === 'all' || (p.position || 'Esterno') === roleFilter)
    .sort((a, b) => {
      if (viewMode === 'table') {
        const va = tableValue(a, tableSort.key);
        const vb = tableValue(b, tableSort.key);
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
        return (tableSort.dir === 'asc' ? cmp : -cmp) || a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'ovr') {
        return (b.overall_rating || 0) - (a.overall_rating || 0);
      }
      if (sortBy === 'wins') {
        return (b.matches_won || 0) - (a.matches_won || 0);
      }
      if (sortBy === 'goals' || sortBy === 'mvp' || sortBy === 'played') {
        return (matchStats.get(b.id)?.[sortBy] || 0) - (matchStats.get(a.id)?.[sortBy] || 0) || a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'form') {
        return (forms.get(b.id) || 0) - (forms.get(a.id) || 0) || a.full_name.localeCompare(b.full_name);
      }
      return a.full_name.localeCompare(b.full_name);
    });

  // 1. Classifiche lampo: il migliore per gol, MVP, presenze e forma (tocca per ordinare l'elenco così)
  const leaders = (() => {
    const best = (value: (p: Profile) => number) =>
      players.reduce<{ p: Profile | null; v: number }>((acc, p) => (value(p) > acc.v ? { p, v: value(p) } : acc), { p: null, v: 0 });
    return [
      { key: 'goals', title: 'Capocannoniere', ...best((p) => matchStats.get(p.id)?.goals || 0), unitShort: 'gol' },
      { key: 'mvp', title: 'Più MVP', ...best((p) => matchStats.get(p.id)?.mvp || 0), unitShort: 'MVP' },
      { key: 'played', title: 'Più presenze', ...best((p) => matchStats.get(p.id)?.played || 0), unitShort: 'partite' },
    ].filter((l) => l.p);
  })();
  const SortHeader = ({ k, label, title, className = '' }: { k: string; label: string; title?: string; className?: string }) => (
    <th className={`p-0 ${className}`} aria-sort={tableSort.key === k ? (tableSort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => handleTableSort(k)}
        title={`Ordina per ${title || label}`}
        className={`w-full py-3.5 px-3 font-bold whitespace-nowrap ${k === 'name' ? 'text-left px-4' : 'text-center'} ${
          tableSort.key === k ? 'text-emerald-300' : 'hover:text-white'
        }`}
      >
        {label}
        <span className="inline-block w-3 text-[9px]" aria-hidden="true">
          {tableSort.key === k ? (tableSort.dir === 'desc' ? '▼' : '▲') : ''}
        </span>
      </button>
    </th>
  );

  // Ordinamento canonico fisso per le categorie statistiche
  const sortedCategories = [...categories].sort((a, b) => {
    const idxA = STAT_CANONICAL_ORDER.indexOf(a.name as any);
    const idxB = STAT_CANONICAL_ORDER.indexOf(b.name as any);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Titolo della pagina (senza riquadro) */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Giocatori</h1>
          <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
            {isClientAdmin
              ? 'Abilità, statistiche e schede di tutti i giocatori: da qui le modifichi.'
              : 'Le card di tutti i giocatori, con abilità e statistiche.'}
          </p>
        </div>

        {/* Pulsanti Admin */}
        {isClientAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNewGuestModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Nuovo Ospite
            </button>
          </div>
        )}
      </header>

      {/* 1. Leader: tre riquadri su una riga, solo informativi */}
      {leaders.length > 0 && (
        <section aria-label="I migliori" className="grid grid-cols-3 gap-2 sm:gap-3">
          {leaders.map((l) => {
            const [first, ...rest] = (l.p?.full_name || '').trim().split(/\s+/);
            return (
              <div key={l.key} className="min-w-0 bg-slate-900 border border-slate-800 rounded-2xl px-3 py-3 sm:p-4">
                <span className="block text-[11px] sm:text-xs text-slate-400 truncate">{l.title}</span>
                <span className="block mt-1 text-xl sm:text-2xl font-bold text-white tabular-nums leading-none">
                  {l.v}
                  <span className="ml-1 text-xs font-medium text-slate-400">{l.unitShort}</span>
                </span>
                <span className="block mt-1.5 text-xs sm:text-sm font-medium text-emerald-300 truncate" title={l.p?.full_name}>
                  {first}
                  {rest.length > 0 && <span className="hidden sm:inline"> {rest.join(' ')}</span>}
                  {rest.length > 0 && <span className="sm:hidden"> {rest[rest.length - 1][0]}.</span>}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* 2. Cerca + vista (card / elenco) */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="search"
            placeholder="Cerca giocatore"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-full text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
        <div className="flex-shrink-0 flex items-center bg-slate-900 p-1 rounded-full border border-slate-800" role="radiogroup" aria-label="Vista">
          {(
            [
              ['cards', 'Card', LayoutGrid],
              ['table', 'Elenco', TableIcon],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                viewMode === mode ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Ruoli: barra a scorrimento orizzontale + ordinamento e confronto */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtra per ruolo">
          {(
            [
              ['all', 'Tutti'],
              ['Portiere', 'Portieri'],
              ['Difensore', 'Difensori'],
              ['Esterno', 'Esterni'],
              ['Punta', 'Punte'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRoleFilter(value)}
              aria-pressed={roleFilter === value}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                roleFilter === value ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white bg-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-nowrap items-center justify-between gap-2 text-xs">
          {viewMode === 'cards' ? (
            <label className="flex items-center gap-2 text-slate-400 min-w-0 whitespace-nowrap">
              Ordina per
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 min-w-0 focus:outline-none focus:border-emerald-500"
              >
                <option value="ovr">OVR</option>
                <option value="goals">Gol</option>
                <option value="mvp">MVP</option>
                <option value="played">Presenze</option>
                <option value="wins">Vittorie</option>
                <option value="name">Nome A-Z</option>
              </select>
            </label>
          ) : (
            <span className="text-slate-500 hidden md:inline">Tocca le intestazioni per ordinare</span>
          )}
          {players.length >= 2 && (
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="ml-auto flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg font-semibold border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Confronta<span className="hidden sm:inline"> due giocatori</span>
            </button>
          )}
        </div>
      </div>
      {compareOpen && (
        <PlayerCompare players={players} categories={sortedCategories} initialA={profile?.id} onClose={() => setCompareOpen(false)} />
      )}

      {/* VISTA CONTENUTO: CARD FIFA/PES OPPURE TABELLA */}
      {viewMode === 'cards' ? (
        /* GRIGLIA DI CARD CON OTTAGONO E STATISTICHE V-P-S */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start animate-in">
          {filteredPlayers.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-slate-500">Nessun giocatore trovato con questi filtri.</p>
          ) : (
            filteredPlayers.map((player) => (
              <PlayerCardFifa
                key={player.id}
                player={player}
                isAdmin={isClientAdmin}
                categories={sortedCategories}
                form={forms.get(player.id)}
                matchStats={matchStats.get(player.id)}
                recentMatches={recentMatches}
                onEdit={handleOpenEditModal}
                onDelete={player.is_guest || isSuperAdmin ? (p) => handleDeletePlayer(p.id, p.full_name) : undefined}
              />
            ))
          )}
        </div>
      ) : (
        /* TABELLA GIOCATORI (PC/tablet) + ELENCO COMPATTO (telefono) */
        <>
        {/* Telefono: elenco denso a righe sottili (avatar piccolo, nome, ruolo, OVR) */}
        <div className="md:hidden animate-in">
          {filteredPlayers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nessun giocatore trovato con questi filtri.</p>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 pb-1.5 text-[11px] font-medium text-slate-500">
                <span>{filteredPlayers.length} giocatori</span>
                <span className={isClientAdmin ? 'pr-10' : ''}>OVR</span>
              </div>
              <ul className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 overflow-hidden">
                {filteredPlayers.map((player) => {
                  const isCurrent = player.id === profile?.id;
                  const photo = uploadedPhoto(player.avatar_url);
                  const f = forms.get(player.id) || 0;
                  const ovr = Math.round(Math.max(1, Math.min(10, (Number(player.overall_rating) || 6) + f)) * 10);
                  return (
                    <li key={player.id} className="flex items-center gap-3 px-3 py-2 min-h-[48px]">
                      {photo ? (
                        <img src={photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-300 text-[10px] flex-shrink-0">
                          {initialsOf(player.full_name)}
                        </span>
                      )}
                      <span className="flex-1 min-w-0 flex items-baseline gap-2">
                        <span className={`truncate text-sm font-medium ${isCurrent ? 'text-emerald-300' : 'text-white'}`}>
                          {player.full_name}
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-slate-500">
                          {FIELD_POSITION_ABBR[player.position || 'Esterno']}
                          {player.is_guest ? ' · osp.' : ''}
                        </span>
                      </span>
                      <span className="flex-shrink-0 w-8 text-right text-base font-bold text-white tabular-nums">{ovr}</span>
                      {isClientAdmin && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(player)}
                          aria-label={`Modifica ${player.full_name}`}
                          className="flex-shrink-0 -mr-1 p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <SortHeader k="name" label="Giocatore" title="nome" />
                  <SortHeader k="position" label="Ruolo" />
                  <SortHeader k="ovr" label="OVR" />
                  {isClientAdmin && <SortHeader k="wins" label="V-P-S" title="vittorie" />}
                  {isClientAdmin && sortedCategories.map((cat) => {
                    const shortName = cat.name.length > 5 ? cat.name.slice(0, 3).toUpperCase() : cat.name;
                    return (
                      <SortHeader
                        key={cat.id || cat.name}
                        k={`stat:${cat.name}`}
                        label={shortName}
                        title={cat.label || cat.name}
                        className="w-14 min-w-[54px]"
                      />
                    );
                  })}
                  {isClientAdmin && (
                    <th className="sticky right-0 z-30 py-3.5 px-4 text-center bg-slate-950 border-l border-slate-800 shadow-[-8px_0_12px_rgba(0,0,0,0.8)] min-w-[100px]">
                      Azioni
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isClientAdmin ? 6 + sortedCategories.length : 4}
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
                    // Il nome è un testo unico: prima parola sopra, il resto sotto
                    const [firstName, ...surnameParts] = player.full_name.trim().split(/\s+/);
                    const surname = surnameParts.join(' ');

                    return (
                      <tr
                        key={player.id}
                        className={`hover:bg-slate-850/50 transition-colors ${
                          isCurrent ? 'bg-emerald-500/5 shadow-[inset_3px_0_0_0_rgb(52,211,153)]' : ''
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
                              {uploadedPhoto(player.avatar_url) ? (
                                <img
                                  src={uploadedPhoto(player.avatar_url) as string}
                                  alt={player.full_name}
                                  className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-700"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                                  {initialsOf(player.full_name)}
                                </div>
                              )}
                              {player.role === 'admin' && (
                                <span
                                  className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[8px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center ring-1 ring-slate-950"
                                  title="Admin"
                                >
                                  ★
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span className="leading-tight">
                                  <span className="block">{firstName}</span>
                                  {surname && <span className="block">{surname}</span>}
                                </span>
                                {isClientAdmin && (
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
                            </div>
                          </div>
                        </td>

                        {/* Ruolo in campo */}
                        <td className="py-3 px-3 text-center">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                            {FIELD_POSITION_ABBR[player.position || 'Esterno']}
                          </span>
                        </td>

                        {/* Overall Rating (OVR) */}
                        <td className="py-3 px-3 text-center">
                          <StatBadge score={player.overall_rating || 6.0} size="md" />
                        </td>

                        {/* Record Partite V-P-S (solo admin) */}
                        {isClientAdmin && (
                        <td className="py-3 px-3 text-center font-mono text-[11px] whitespace-nowrap">
                          <span className="text-emerald-400 font-bold">{rec.won}V</span>
                          <span className="text-slate-500 mx-1">-</span>
                          <span className="text-amber-400 font-bold">{rec.drawn}P</span>
                          <span className="text-slate-500 mx-1">-</span>
                          <span className="text-rose-400 font-bold">{rec.lost}S</span>
                        </td>
                        )}

                        {/* Statistiche Individuali da 1 a 10 in Ordine Canonico */}
                        {isClientAdmin && sortedCategories.map((cat) => {
                          const val = player.stats?.[cat.name] ?? cat.default_value ?? 6;
                          return (
                            <td
                              key={cat.id || cat.name}
                              className="py-3 px-2 text-center font-mono font-semibold w-14 min-w-[54px]"
                              title={`${cat.label || cat.name}: ${val}`}
                            >
                              <span className="block text-xs tabular-nums text-slate-200">{val}</span>
                              <span className="mt-1 mx-auto block h-1 w-8 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                                <span className="block h-full rounded-full bg-emerald-500/80" style={{ width: `${Number(val) * 10}%` }} />
                              </span>
                            </td>
                          );
                        })}

                        {/* Azioni Admin (PINNED STICKY RIGHT - MAI NASCOSTE) */}
                        {isClientAdmin && (
                          <td className="sticky right-0 z-20 py-3 px-4 text-center border-l border-slate-800 bg-slate-900 shadow-[-8px_0_12px_rgba(0,0,0,0.8)] min-w-[100px]">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(player)}
                                className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-lg transition-all cursor-pointer"
                                title="Modifica voti e dettagli"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              {(player.is_guest || isSuperAdmin) && player.id !== 'p-1' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeletePlayer(player.id, player.full_name)}
                                  className="p-1.5 bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition-all cursor-pointer"
                                  title={player.is_guest ? 'Elimina ospite' : 'Elimina account'}
                                  aria-label={player.is_guest ? 'Elimina ospite' : 'Elimina account'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
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
        </>
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
