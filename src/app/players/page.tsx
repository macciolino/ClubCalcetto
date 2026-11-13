'use client';

import { initialsOf, uploadedPhoto, POSITION_BADGE, ovrDisplay, ovrTone } from '@/lib/utils/playerUtils';
import { notify, askConfirm } from '@/components/ui/Feedback';

import { manageAccountAsSuperAdmin } from '@/lib/services/accountService';
import { useForms } from '@/lib/hooks/useForms';
import React, { useState, useEffect, useMemo } from 'react';
import { computeMatchStats } from '@/lib/utils/statUtils';
import { lastCompletedMatches } from '@/components/FormDots';
import { PlayerCompare } from '@/components/PlayerCompare';
import { useAuth } from '@/lib/context/AuthContext';
import { Profile, StatCategory, Match, STAT_CANONICAL_ORDER } from '@/types/database';
import { subscribeProfiles, subscribeStatCategories, subscribeMatches, deleteProfileDoc, saveProfileDoc } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured, auth as firebaseAuth } from '@/lib/firebase/config';
import { getStoredPlayers, removeStoredPlayer, updateStoredPlayer, saveStoredPlayers, getPlayerMatchRecord } from '@/lib/services/playerService';
import { getStoredCategories, saveStoredCategories, DEFAULT_BASE_CATEGORIES } from '@/lib/services/statCategoryService';
import { PlayerModal } from '@/components/PlayerModal';
import { PlayerCardFifa, PlayerDetailSheet } from '@/components/PlayerCardFifa';
import { 
  Search, 
  UserPlus, 
  Plus,
  GitCompare,
  Edit3, 
  Trash2, 
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';

const DEFAULT_CATEGORIES: StatCategory[] = DEFAULT_BASE_CATEGORIES;

export default function GiocatoriPage() {
  const { user, profile, isAdmin, isSuperAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<StatCategory[]>(DEFAULT_CATEGORIES);
  const { forms } = useForms();
  const t = useTranslations('players');
  const labels = usePlayerLabels();
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
  const [roleFilter, setRoleFilter] = useState<'all' | 'Portiere' | 'Difensore' | 'Centrocampista' | 'Esterno' | 'Punta'>('all');
  const [compareOpen, setCompareOpen] = useState(false);
  // Giocatore aperto nel dettaglio (finestra), da card, elenco o tabella
  const [detailId, setDetailId] = useState<string | null>(null);
  // Vista tabella: si ordina cliccando le intestazioni (primo clic decrescente, secondo crescente; il nome parte da A-Z)
  const [tableSort, setTableSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'ovr', dir: 'desc' });
  // Chi comanda l'ordine: il menu "Ordina per" oppure (tabella su PC) l'ultima intestazione cliccata
  const [sortSource, setSortSource] = useState<'menu' | 'table'>('menu');
  const handleTableSort = (key: string) => {
    setSortSource('table');
    setTableSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );
  };

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

  const handlePlayerSaved = () => {
    setPlayers(getStoredPlayers());
  };

  // Ospiti: un admin cancella la scheda. Account registrati: solo il super admin, eliminazione completa
  const handleDeletePlayer = async (playerId: string, name: string) => {
    if (!isStrictAdmin || playerId === 'p-1') return;
    const target = players.find((p) => p.id === playerId);
    try {
      if (target?.is_guest) {
        if (!(await askConfirm(t('confirmDeleteGuest', { name })))) return;
        removeStoredPlayer(playerId);
        setPlayers(getStoredPlayers());
        await deleteProfileDoc(playerId);
        return;
      }
      if (!isSuperAdmin) {
        notify(t('onlySuperAdmin'));
        return;
      }
      if (!(await askConfirm(t('confirmDeactivate', { name })))) return;
      const res = await manageAccountAsSuperAdmin(playerId, 'deactivate');
      if (!res.ok) {
        notify(t('failed'));
        return;
      }
      removeStoredPlayer(playerId);
      setPlayers(getStoredPlayers());
    } catch (err) {
      console.error('Delete player error:', err);
    }
  };

  // Super admin: rende admin un giocatore registrato o gli toglie i permessi
  // Ospite: link di invito su WhatsApp (si registra e tiene partite e statistiche)
  const handleInviteGuest = async (p: Profile) => {
    // La finestra si apre subito (dopo un'attesa i telefoni la bloccano), poi si riempie con WhatsApp
    const win = window.open('', '_blank');
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseAuth.currentUser?.getIdToken()}` },
        body: JSON.stringify({ guestId: p.id }),
      });
      const data = await res.json();
      if (!data?.ok || !data.token) throw new Error(data?.error || 'invite');
      const link = `${window.location.origin}/login?invite=${data.token}`;
      const first = p.full_name.split(' ')[0];
      const text = `${t('inviteText', { first })}
${link}`;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      notify(t('inviteFailed'));
    }
  };

  const handleToggleAdmin = async (p: Profile) => {
    if (!isClientAdmin || p.is_guest || p.id === 'p-1') return;
    const next: 'admin' | 'player' = p.role === 'admin' ? 'player' : 'admin';
    const msg =
      next === 'admin'
        ? t('confirmMakeAdmin', { name: p.full_name })
        : t('confirmRemoveAdmin', { name: p.full_name });
    if (!(await askConfirm(msg))) return;
    const updated: Profile = { ...p, role: next, updated_at: new Date().toISOString() };
    try {
      await saveProfileDoc(updated);
      updateStoredPlayer(updated);
      setPlayers(getStoredPlayers());
      notify(next === 'admin' ? t('nowAdmin', { name: p.full_name }) : t('noLongerAdmin', { name: p.full_name }));
    } catch {
      notify(t('failed'));
    }
  };

  // Filtraggio e ordinamento (card: pulsanti in alto; tabella: intestazioni cliccabili)
  const POSITION_ORDER = ['Portiere', 'Difensore', 'Centrocampista', 'Esterno', 'Punta'];
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
      if (viewMode === 'table' && sortSource === 'table') {
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
      { key: 'goals', icon: '⚽', title: t('topScorer'), titleShort: t('topScorerShort'), ...best((p) => matchStats.get(p.id)?.goals || 0), unitShort: t('goalsUnit') },
      { key: 'mvp', icon: '⭐', title: t('mostMvp'), titleShort: t('mostMvpShort'), ...best((p) => matchStats.get(p.id)?.mvp || 0), unitShort: t('mvpUnit') },
      { key: 'played', icon: '📅', title: t('mostPlayed'), titleShort: t('mostPlayedShort'), ...best((p) => matchStats.get(p.id)?.played || 0), unitShort: t('playedUnit') },
    ].filter((l) => l.p);
  })();
  const sortHeader = ({ k, label, title, className = '' }: { k: string; label: string; title?: string; className?: string }) => (
    <th key={k} className={`p-0 ${className}`} aria-sort={tableSort.key === k ? (tableSort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => handleTableSort(k)}
        title={t('sortByTitle', { what: title || label })}
        className={`w-full py-3.5 px-3 font-bold whitespace-nowrap ${k === 'name' ? 'text-left px-4' : 'text-center'} ${
          tableSort.key === k ? 'text-accent-text' : 'hover:text-primary'
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
      <header className="flex items-center justify-between gap-4 min-h-[2.5rem]">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>

        {/* PC: "Nuovo ospite" in alto a destra, solo admin (su telefono è il "+" nella ricerca) */}
        {isClientAdmin && (
          <button
            type="button"
            onClick={handleOpenNewGuestModal}
            className={`${btnInline.primary} hidden lg:inline-flex`}
          >
            <UserPlus className="h-4 w-4" />
            {t('newGuest')}
          </button>
        )}
      </header>

      {/* Leader: tre card su una riga, stesso stile delle card dei giocatori (solo informative) */}
      {leaders.length > 0 && (
        <section aria-label={t('leadersAria')} className="grid grid-cols-3 gap-2 sm:gap-3">
          {leaders.map((l) => {
            const [first, ...rest] = (l.p?.full_name || '').trim().split(/\s+/);
            const short = rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
            return (
              <div key={l.key} className="min-w-0 rounded-2xl bg-card px-3 py-3 sm:px-4">
                <span className="flex items-center gap-1.5 text-xs text-secondary min-w-0">
                  <span aria-hidden="true">{l.icon}</span>
                  <span className="truncate sm:hidden">{l.titleShort}</span>
                  <span className="truncate hidden sm:inline">{l.title}</span>
                </span>
                <span className="block mt-1.5 text-2xl font-bold text-primary tabular-nums leading-none">
                  {l.v}
                  <span className="ml-1 text-xs font-normal text-secondary">{l.unitShort}</span>
                </span>
                <span className="block mt-1.5 text-sm text-secondary truncate" title={l.p?.full_name}>
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{l.p?.full_name}</span>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Comandi. Telefono: ricerca, poi Ruolo · Ordina · Confronta · Card/Elenco. Da tablet in su: una riga. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="search"
            placeholder={t('search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 ${isClientAdmin ? 'pr-12 lg:pr-4' : 'pr-4'} py-2.5 bg-card border border-line rounded-full text-primary text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors`}
          />
          {isClientAdmin && (
            <button
              type="button"
              onClick={handleOpenNewGuestModal}
              aria-label={t('newGuest')}
              title={t('newGuest')}
              className="lg:hidden absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-accent hover:bg-accent/90 text-on-accent flex items-center justify-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            aria-label={t('roleFilter')}
            className="flex-1 sm:flex-none sm:w-32 min-w-0 bg-card border border-line rounded-xl px-2.5 py-2.5 text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value="all">{t('allRoles')}</option>
            {POSITION_ORDER.map((pos) => (
              <option key={pos} value={pos}>
                {labels.positionPlural(pos)}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as typeof sortBy);
              setSortSource('menu');
            }}
            aria-label={t('sortBy')}
            className="flex-1 sm:flex-none sm:w-36 min-w-0 bg-card border border-line rounded-xl px-2.5 py-2.5 text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value="ovr">{t('sortOvr')}</option>
            <option value="goals">{t('sortGoals')}</option>
            <option value="mvp">{t('sortMvp')}</option>
            <option value="played">{t('sortPlayed')}</option>
            <option value="wins">{t('sortWins')}</option>
            <option value="name">{t('sortName')}</option>
          </select>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            disabled={players.length < 2}
            aria-label={t('compareTwo')}
            title={t('compareTwo')}
            className="flex-shrink-0 h-[42px] flex items-center justify-center gap-1.5 px-3 rounded-xl text-sm font-semibold border border-line bg-card text-primary hover:bg-card-hover disabled:opacity-40"
          >
            <GitCompare className="h-4 w-4" />
            <span className="hidden lg:inline">{t('compare')}</span>
          </button>
          <div className="flex-shrink-0 flex items-center bg-card p-1 rounded-xl border border-line" role="radiogroup" aria-label={t('view')}>
            {(
              [
                ['cards', t('viewCards'), LayoutGrid],
                ['table', t('viewList'), TableIcon],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={viewMode === mode}
                aria-label={label}
                title={label}
                onClick={() => setViewMode(mode)}
                className={`h-8 w-9 flex items-center justify-center rounded-lg transition-colors ${
                  viewMode === mode ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {compareOpen && (
        <PlayerCompare players={players} categories={sortedCategories} initialA={profile?.id} onClose={() => setCompareOpen(false)} />
      )}

      {/* VISTA CONTENUTO: CARD FIFA/PES OPPURE TABELLA */}
      {viewMode === 'cards' ? (
        /* GRIGLIA DI CARD CON OTTAGONO E STATISTICHE V-P-S */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 animate-in">
          {filteredPlayers.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-muted">{t('noneFound')}</p>
          ) : (
            filteredPlayers.map((player) => (
              <PlayerCardFifa
                key={player.id}
                player={player}
                form={forms.get(player.id)}
                recentMatches={recentMatches}
                isCurrent={player.id === profile?.id}
                onOpen={(p) => setDetailId(p.id)}
              />
            ))
          )}
        </div>
      ) : (
        /* TABELLA GIOCATORI (PC/tablet) + ELENCO COMPATTO (telefono) */
        <>
        {/* Telefono e tablet: elenco a colonne (giocatore | ruolo | V·P·S | OVR) */}
        <div className="lg:hidden animate-in">
          {filteredPlayers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">{t('noneFound')}</p>
          ) : (
            <div className="bg-card rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_2.25rem] items-center gap-2 px-3 py-2 border-b border-line text-[11px] font-medium text-muted">
                <span>{t('count', { count: filteredPlayers.length })}</span>
                <span className="text-center">{t('role')}</span>
                <span className="text-center">{t('wdl')}</span>
                <span className="text-right">OVR</span>
              </div>
              <ul className="divide-y divide-line">
                {filteredPlayers.map((player) => {
                  const isCurrent = player.id === profile?.id;
                  const photo = uploadedPhoto(player.avatar_url);
                  const f = forms.get(player.id) || 0;
                  const ovr = ovrDisplay(player.overall_rating, f);
                  const ms = matchStats.get(player.id);
                  const pos = player.position || 'Esterno';
                  return (
                    <li key={player.id}>
                      <button
                        type="button"
                        onClick={() => setDetailId(player.id)}
                        className="w-full grid grid-cols-[minmax(0,1fr)_3rem_4.5rem_2.25rem] items-center gap-2 px-3 py-2 min-h-[52px] text-left hover:bg-card-hover/60 focus:outline-none focus-visible:bg-card-hover"
                      >
                      <span className="flex items-center gap-2.5 min-w-0">
                        {photo ? (
                          <img src={photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-card-hover flex items-center justify-center font-bold text-accent-text text-[10px] flex-shrink-0">
                            {initialsOf(player.full_name)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className={`block truncate text-sm font-medium ${isCurrent ? 'text-accent-text' : 'text-primary'}`}>
                            {player.full_name}
                          </span>
                          {player.is_guest && <span className="block text-[11px] text-muted">{t('guestLower')}</span>}
                        </span>
                      </span>
                      <span className="flex justify-center">
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${POSITION_BADGE[pos] || POSITION_BADGE.Esterno}`}>
                          {labels.positionAbbr(pos)}
                        </span>
                      </span>
                      <span className="text-center text-xs font-semibold tabular-nums" aria-label={t('wdlAria', { won: ms?.won || 0, drawn: ms?.drawn || 0, lost: ms?.lost || 0 })}>
                        <span className={ms?.won ? 'text-accent-text' : 'text-muted'}>{ms?.won || 0}</span>
                        <span className="text-muted"> · </span>
                        <span className={ms?.drawn ? 'text-warning' : 'text-muted'}>{ms?.drawn || 0}</span>
                        <span className="text-muted"> · </span>
                        <span className={ms?.lost ? 'text-danger' : 'text-muted'}>{ms?.lost || 0}</span>
                      </span>
                      <span className={`text-right text-base font-bold tabular-nums ${ovrTone(ovr)}`}>{ovr}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="hidden lg:block bg-card border border-line rounded-2xl overflow-hidden animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line bg-app/70 text-[11px] font-bold text-secondary uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  {sortHeader({ k: 'name', label: t('colPlayer'), title: t('colPlayerTitle') })}
                  {sortHeader({ k: 'position', label: t('role') })}
                  {sortHeader({ k: 'ovr', label: 'OVR' })}
                  {isClientAdmin && sortHeader({ k: 'wins', label: t('colWdl'), title: t('colWdlTitle') })}
                  {isClientAdmin && sortedCategories.map((cat) => {
                    return sortHeader({
                      k: `stat:${cat.name}`,
                      label: labels.statCode(cat.name),
                      title: labels.statName(cat.name),
                      className: 'w-14 min-w-[54px]',
                    });
                  })}
                  {isClientAdmin && (
                    <th className="sticky right-0 z-30 py-3.5 px-4 text-center bg-app border-l border-line shadow-[-8px_0_12px_rgba(0,0,0,0.8)] min-w-[100px]">
                      {t('actions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 text-xs">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isClientAdmin ? 6 + sortedCategories.length : 4}
                      className="py-8 text-center text-muted italic"
                    >
                      {t('noneFound')}
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
                          isCurrent ? 'bg-accent/5 shadow-[inset_3px_0_0_0_rgb(52,211,153)]' : ''
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-muted">
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
                                  className="w-9 h-9 rounded-full object-cover ring-1 ring-line-strong"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-card-hover border border-line-strong flex items-center justify-center font-bold text-accent-text text-xs">
                                  {initialsOf(player.full_name)}
                                </div>
                              )}
                              {player.role === 'admin' && (
                                <span
                                  className="absolute -bottom-1 -right-1 bg-amber-500 text-on-accent text-[8px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center ring-1 ring-app"
                                  title={t('admin')}
                                >
                                  ★
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-primary flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDetailId(player.id)}
                                  className="leading-tight text-left hover:text-accent-text"
                                >
                                  <span className="block">{firstName}</span>
                                  {surname && <span className="block">{surname}</span>}
                                  {isClientAdmin && player.email && (
                                    <span className="block text-[11px] font-normal text-muted mt-0.5">{player.email}</span>
                                  )}
                                </button>
                                {isClientAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(player)}
                                    className="p-1 text-muted hover:text-accent-text hover:bg-card-hover rounded transition-colors cursor-pointer"
                                    title={t('quickEdit')}
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </button>
                                )}
                                {player.is_guest && (
                                  <span className="text-[10px] bg-card-hover text-secondary px-1.5 py-0.2 rounded font-medium">
                                    {t('guest')}
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="text-[10px] bg-accent/20 text-accent-text px-1.5 py-0.2 rounded font-bold">
                                    {t('you')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Ruolo in campo */}
                        <td className="py-3 px-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${POSITION_BADGE[player.position || 'Esterno']}`}>
                            {labels.positionAbbr(player.position)}
                          </span>
                        </td>

                        {/* Overall Rating (OVR) */}
                        <td className="py-3 px-3 text-center">
                          {(() => {
                            const o = ovrDisplay(player.overall_rating, forms.get(player.id) || 0);
                            return <span className={`text-base font-bold tabular-nums ${ovrTone(o)}`}>{o}</span>;
                          })()}
                        </td>

                        {/* Record Partite V-P-S (solo admin) */}
                        {isClientAdmin && (
                        <td className="py-3 px-3 text-center tabular-nums text-xs whitespace-nowrap">
                          <span className={rec.won ? 'text-accent-text font-semibold' : 'text-muted'}>{t('wonShort', { n: rec.won })}</span>
                          <span className="text-muted mx-1">-</span>
                          <span className={rec.drawn ? 'text-warning font-semibold' : 'text-muted'}>{t('drawnShort', { n: rec.drawn })}</span>
                          <span className="text-muted mx-1">-</span>
                          <span className={rec.lost ? 'text-danger font-semibold' : 'text-muted'}>{t('lostShort', { n: rec.lost })}</span>
                        </td>
                        )}

                        {/* Statistiche Individuali da 1 a 10 in Ordine Canonico */}
                        {isClientAdmin && sortedCategories.map((cat) => {
                          const val = player.stats?.[cat.name] ?? cat.default_value ?? 6;
                          return (
                            <td
                              key={cat.id || cat.name}
                              className="py-3 px-2 text-center font-mono font-semibold w-14 min-w-[54px]"
                              title={`${labels.statName(cat.name)}: ${val}`}
                            >
                              <span className="block text-xs tabular-nums text-primary">{val}</span>
                              <span className="mt-1 mx-auto block h-1 w-8 rounded-full bg-card-hover overflow-hidden" aria-hidden="true">
                                <span className="block h-full rounded-full bg-accent/80" style={{ width: `${Number(val) * 10}%` }} />
                              </span>
                            </td>
                          );
                        })}

                        {/* Azioni Admin (PINNED STICKY RIGHT - MAI NASCOSTE) */}
                        {isClientAdmin && (
                          <td className="sticky right-0 z-20 py-3 px-4 text-center border-l border-line bg-card shadow-[-8px_0_12px_rgba(0,0,0,0.8)] min-w-[100px]">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(player)}
                                className="p-1.5 bg-accent/10 text-accent-text hover:bg-accent hover:text-on-accent rounded-lg transition-all cursor-pointer"
                                title={t('editRatings')}
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              {(player.is_guest || isSuperAdmin) && player.id !== 'p-1' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeletePlayer(player.id, player.full_name)}
                                  className="p-1.5 bg-card-hover text-secondary hover:text-danger hover:bg-rose-500/15 rounded-lg transition-all cursor-pointer"
                                  title={player.is_guest ? t('deleteGuest') : t('deleteAccount')}
                                  aria-label={player.is_guest ? t('deleteGuest') : t('deleteAccount')}
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
      {(() => {
        const dp = players.find((p) => p.id === detailId);
        if (!dp) return null;
        return (
          <PlayerDetailSheet
            player={dp}
            categories={sortedCategories}
            form={forms.get(dp.id)}
            matchStats={matchStats.get(dp.id)}
            recentMatches={recentMatches}
            isAdmin={isClientAdmin}
            showEmail={isClientAdmin}
            onToggleAdmin={isClientAdmin ? handleToggleAdmin : undefined}
            onInvite={isClientAdmin ? handleInviteGuest : undefined}
            onClose={() => setDetailId(null)}
            onEdit={(p) => {
              setDetailId(null);
              handleOpenEditModal(p);
            }}
            onDelete={
              dp.is_guest || isSuperAdmin
                ? (p) => {
                    setDetailId(null);
                    handleDeletePlayer(p.id, p.full_name);
                  }
                : undefined
            }
          />
        );
      })()}

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
