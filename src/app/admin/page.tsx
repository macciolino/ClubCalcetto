'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { StatCategory, Profile, Presence } from '@/types/database';
import { StatCategoriesManager } from '@/components/StatCategoriesManager';
import { PlayerModal } from '@/components/PlayerModal';
import { StatBadge } from '@/components/StatBadge';
import { 
  subscribeProfiles, 
  subscribeStatCategories, 
  subscribePresences, 
  deletePresenceDoc, 
  clearPresencesForDate, 
  saveProfileDoc, 
  deleteProfileDoc, 
  saveOfficialMatchDateDoc 
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { 
  getStoredPlayers, 
  removeStoredPlayer, 
  updateStoredPlayer, 
  saveStoredPlayers 
} from '@/lib/services/playerService';
import { 
  getStoredPresences, 
  saveStoredPresences, 
  resetStoredPresences,
  getOfficialMatchDate,
  setOfficialMatchDate
} from '@/lib/services/presenceService';
import { getStoredCategories } from '@/lib/services/statCategoryService';
import { formatItalianDate, getUpcomingDays } from '@/lib/utils/dateUtils';
import { 
  ShieldAlert, 
  RotateCcw, 
  UserPlus, 
  Mail, 
  Settings, 
  Check, 
  AlertTriangle, 
  Database, 
  Sliders, 
  Loader2, 
  Users, 
  Search, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  UserX,
  UserCheck,
  UserMinus,
  Calendar,
  CalendarDays,
  Sparkles,
  Trophy,
  ArrowLeft,
  User
} from 'lucide-react';

export default function AdminPage() {
  const { user, profile, isAdmin } = useAuth();
  const [categories, setCategories] = useState<StatCategory[]>(() => getStoredCategories());
  const [players, setPlayers] = useState<Profile[]>(() => getStoredPlayers());
  const [presences, setPresences] = useState<Presence[]>(() => getStoredPresences());
  const [searchQuery, setSearchQuery] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailSuccess, setTestEmailSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Profile | null>(null);

  const upcomingDays = getUpcomingDays(7);
  const [activeDate, setActiveDate] = useState<string>(() => getOfficialMatchDate());

  useEffect(() => {
    // 1. Carica dallo store locale
    setPlayers(getStoredPlayers());
    setCategories(getStoredCategories());
    setPresences(getStoredPresences());

    const handlePlayersChanged = () => {
      setPlayers(getStoredPlayers());
    };
    const handlePresencesChanged = () => {
      setPresences(getStoredPresences());
    };
    const handleCategoriesChanged = () => {
      setCategories(getStoredCategories());
    };
    const handleMatchDateChange = (e: any) => {
      const newDate = e.detail?.date || getOfficialMatchDate();
      if (newDate) {
        setActiveDate(newDate);
      }
    };

    window.addEventListener('clubcalcetto_players_changed', handlePlayersChanged);
    window.addEventListener('clubcalcetto_presences_changed', handlePresencesChanged);
    window.addEventListener('clubcalcetto_categories_changed', handleCategoriesChanged);
    window.addEventListener('clubcalcetto_match_date_changed', handleMatchDateChange);

    // 2. Real-time Firebase Firestore
    let unsubProfs = () => {};
    let unsubCats = () => {};
    let unsubPres = () => {};

    if (isFirebaseConfigured) {
      unsubProfs = subscribeProfiles((pList) => {
        if (pList && pList.length > 0) {
          setPlayers(pList);
          saveStoredPlayers(pList);
        }
      });
      unsubCats = subscribeStatCategories((cList) => {
        if (cList && cList.length > 0) {
          setCategories(cList);
        }
      });
      unsubPres = subscribePresences(activeDate, (presList) => {
        if (presList && presList.length > 0) {
          setPresences((prev) => {
            const others = prev.filter((p) => p.date !== activeDate);
            const merged = [...others, ...presList];
            saveStoredPresences(merged);
            return merged;
          });
        }
      });
    }

    return () => {
      window.removeEventListener('clubcalcetto_players_changed', handlePlayersChanged);
      window.removeEventListener('clubcalcetto_presences_changed', handlePresencesChanged);
      window.removeEventListener('clubcalcetto_categories_changed', handleCategoriesChanged);
      window.removeEventListener('clubcalcetto_match_date_changed', handleMatchDateChange);
      unsubProfs();
      unsubCats();
      unsubPres();
    };
  }, [activeDate]);

  // Cambio giorno attivo e sincronizzazione con Squadre e Presenze
  const handleSelectAdminDate = (dateString: string) => {
    setActiveDate(dateString);
    setOfficialMatchDate(dateString);
    saveOfficialMatchDateDoc(dateString);
  };

  // Rimozione singola presenza da parte dell'Admin
  const handleRemovePresence = async (presenceId: string, playerName: string) => {
    if (!confirm(`Vuoi rimuovere la presenza di "${playerName}" per la partita del ${formatItalianDate(activeDate)}?`)) {
      return;
    }

    const remaining = presences.filter((p) => p.id !== presenceId);
    // Riordina le presenze del giorno attivo: le prime 10 sono confirmed, le altre waitlist
    const activeRemaining = remaining
      .filter((p) => p.date === activeDate)
      .sort((a, b) => a.order_index - b.order_index)
      .map((p, idx) => ({
        ...p,
        order_index: idx + 1,
        status: (idx < 10 ? 'confirmed' : 'waitlist') as 'confirmed' | 'waitlist',
      }));

    const updatedPresences = [
      ...remaining.filter((p) => p.date !== activeDate),
      ...activeRemaining,
    ];

    saveStoredPresences(updatedPresences);
    setPresences(updatedPresences);
    deletePresenceDoc(presenceId);
  };

  // Azzera tutte le votazioni della settimana
  const handleResetWeeklyVotes = async () => {
    const confirmed = confirm(
      '⚠️ ATTENZIONE: Sei sicuro di voler azzerare TUTTE le presenze e votazioni della settimana? Questa azione non può essere annullata.'
    );
    if (!confirmed) return;

    setIsResetting(true);
    setResetSuccess(false);

    try {
      resetStoredPresences();
      setPresences([]);
      await clearPresencesForDate(activeDate);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 5000);
    } catch (err) {
      console.error('Reset presenze error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Test invio email di notifica
  const handleTestEmail = async () => {
    setTestEmailLoading(true);
    setTestEmailSuccess('');
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ten_players_reached',
          date: new Date().toISOString().split('T')[0],
          playerName: 'Test Player',
          totalConfirmed: 10,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestEmailSuccess(`Notifica inviata con successo! (Modalità: ${data.mode})`);
      } else {
        setTestEmailSuccess(`Errore: ${data.error || 'Invio non riuscito'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore';
      setTestEmailSuccess(`Errore: ${msg}`);
    } finally {
      setTestEmailLoading(false);
      setTimeout(() => setTestEmailSuccess(''), 6000);
    }
  };

  // Cambio ruolo utente (Promuovi ad Admin / Rendi User)
  const handleToggleUserRole = async (targetPlayer: Profile) => {
    if (targetPlayer.email && targetPlayer.email.toLowerCase().includes('macciolino84')) {
      alert('Non è possibile modificare il ruolo di Marco B. (Super Amministratore permanente).');
      return;
    }

    const newRole = targetPlayer.role === 'admin' ? 'user' : 'admin';
    const updated: Profile = { ...targetPlayer, role: newRole };

    updateStoredPlayer(updated);
    setPlayers(getStoredPlayers());
    saveProfileDoc(updated);
  };

  // Eliminazione giocatore
  const handleDeletePlayer = async (targetPlayer: Profile) => {
    if (targetPlayer.email && targetPlayer.email.toLowerCase().includes('macciolino84')) {
      alert('Impossibile eliminare Marco B. (Super Amministratore).');
      return;
    }

    if (!confirm(`Sei sicuro di voler eliminare definitivamente "${targetPlayer.full_name}"?`)) {
      return;
    }

    removeStoredPlayer(targetPlayer.id);
    setPlayers(getStoredPlayers());
    deleteProfileDoc(targetPlayer.id);
  };

  const handleOpenAddModal = () => {
    setEditingPlayer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Profile) => {
    setEditingPlayer(p);
    setIsModalOpen(true);
  };

  const filteredPlayers = players.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  });

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="p-4 bg-rose-500/15 text-rose-400 rounded-3xl border border-rose-500/30">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-bold text-white">Accesso Riservato agli Amministratori</h2>
        <p className="text-xs text-slate-400 max-w-sm">
          Questa sezione è protetta. Accedi con l&apos;account amministratore <strong className="text-emerald-400">macciolino84@gmail.com</strong> per visualizzare il pannello.
        </p>
        <Link
          href="/presenze"
          className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Vai alla Pagina Giocatori (Presenze)</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header Pannello Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-400" />
              Pannello Amministratore ClubCalcetto
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gestisci utenti registrati, categorie abilità, giocatori ospiti e manutenzione delle presenze.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/presenze"
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-all border border-slate-700 shadow-md"
          >
            <ArrowLeft className="h-4 w-4 text-emerald-400" />
            <span>Pagine Giocatori</span>
          </Link>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Aggiungi Ospite</span>
          </button>
        </div>
      </div>

      {/* Barra di Navigazione Rapida Utenti per l'Admin */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 text-xs">
        <span className="text-slate-400 font-medium px-2">Accedi subito alle pagine dei giocatori:</span>
        <Link
          href="/presenze"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-emerald-400 font-bold rounded-lg border border-slate-800 hover:border-emerald-500/40 transition-colors"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Presenze Partita</span>
        </Link>
        <Link
          href="/giocatori"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-blue-400 font-bold rounded-lg border border-slate-800 hover:border-blue-500/40 transition-colors"
        >
          <Users className="h-3.5 w-3.5" />
          <span>Rosa Giocatori & Card FIFA</span>
        </Link>
        <Link
          href="/squadre"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-amber-400 font-bold rounded-lg border border-slate-800 hover:border-amber-500/40 transition-colors"
        >
          <Trophy className="h-3.5 w-3.5" />
          <span>Campo & Squadre 5v5</span>
        </Link>
        <Link
          href="/profilo"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-purple-400 font-bold rounded-lg border border-slate-800 hover:border-purple-500/40 transition-colors"
        >
          <User className="h-3.5 w-3.5" />
          <span>Profilo Personale</span>
        </Link>
      </div>

      {/* Sezione Statistiche Rapide Database */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-bold uppercase">Giocatori Totali</div>
            <div className="text-xl font-black text-white">{players.length} iscritti</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-bold uppercase">Presenze Prossima Partita</div>
            <div className="text-xl font-black text-white">
              {presences.filter((p) => p.date === activeDate && p.status === 'confirmed').length}/10 titolari
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-bold uppercase">Statistiche Abilità</div>
            <div className="text-xl font-black text-white">{categories.length} Categorie</div>
          </div>
        </div>
      </div>

      {/* SEZIONE: PRESENZE ATTIVE PER LA PROSSIMA PARTITA */}
      {(() => {
        const activeDayPresences = presences
          .filter((p) => p.date === activeDate)
          .sort((a, b) => a.order_index - b.order_index);
        const confirmedPresences = activeDayPresences.filter((p) => p.status === 'confirmed');
        const waitlistPresences = activeDayPresences.filter((p) => p.status === 'waitlist');

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-lg font-black text-white">
                    Presenze Attive per la Partita del {formatItalianDate(activeDate)}
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Elenco in tempo reale dei giocatori confermati (titolari 1-10) e delle riserve in panchina per la prossima gara.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                    confirmedPresences.length >= 10
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {confirmedPresences.length}/10 Titolari Pronti
                </span>
                {waitlistPresences.length > 0 && (
                  <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300">
                    +{waitlistPresences.length} in Riserva
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetWeeklyVotes}
                  disabled={isResetting || activeDayPresences.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                  title="Azzera le presenze di questa data"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Azzera Voti
                </button>
              </div>
            </div>

            {/* Selettore Rapido Date della Settimana (Sincronizzato con Squadre e Presenze) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0 mr-1">
                Data Partita:
              </span>
              {upcomingDays.map((d) => {
                const dayCount = presences.filter(
                  (p) => p.date === d.dateString && p.status === 'confirmed'
                ).length;
                const isCur = activeDate === d.dateString;
                const hasQuorum = dayCount >= 10;

                return (
                  <button
                    key={d.dateString}
                    type="button"
                    onClick={() => handleSelectAdminDate(d.dateString)}
                    className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isCur
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-lg ring-2 ring-emerald-300'
                        : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span>{d.dayName.slice(0, 3)} {d.dayNumber} {d.monthName.slice(0, 3)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-black ${
                        isCur
                          ? 'bg-slate-950 text-emerald-400'
                          : hasQuorum
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {dayCount}/10
                    </span>
                    {isCur && <span className="text-[11px] text-amber-300">★</span>}
                  </button>
                );
              })}
            </div>

            {/* Tabella Presenze Attive */}
            {activeDayPresences.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs italic space-y-2">
                <UserX className="h-8 w-8 mx-auto text-slate-600 opacity-60" />
                <p>Nessun giocatore attualmente segnato per questa data.</p>
                <p className="text-[11px] text-slate-600">I giocatori possono dare la propria presenza nella sezione &quot;Presenze&quot;.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 px-3 text-center w-12">#</th>
                      <th className="py-2.5 px-3">Giocatore</th>
                      <th className="py-2.5 px-3 text-center">Ruolo</th>
                      <th className="py-2.5 px-3 text-center">OVR</th>
                      <th className="py-2.5 px-3 text-center">Stato Presenza</th>
                      <th className="py-2.5 px-3 text-right">Azione Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activeDayPresences.map((pres, idx) => {
                      const player = players.find(
                        (p) => p.id === pres.player_id || p.user_id === pres.player_id
                      );
                      const isStarter = pres.status === 'confirmed';
                      const displayName = player?.full_name || 'Giocatore';
                      const avatar = player?.avatar_url;

                      return (
                        <tr
                          key={pres.id}
                          className={`hover:bg-slate-850/40 transition-colors ${
                            isStarter ? 'bg-emerald-500/[0.03]' : 'bg-amber-500/[0.03]'
                          }`}
                        >
                          {/* Slot Order */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                                isStarter
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </td>

                          {/* Info Giocatore */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="relative">
                                {avatar ? (
                                  <img
                                    src={avatar}
                                    alt={displayName}
                                    className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-700"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                                    {displayName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                {player?.role === 'admin' && (
                                  <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[7px] font-black rounded-full h-3 w-3 flex items-center justify-center ring-1 ring-slate-950">
                                    ★
                                  </span>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-white text-xs">{displayName}</div>
                                {player?.email && (
                                  <div className="text-[10px] text-slate-500">{player.email}</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Ruolo */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                player?.role === 'admin'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : player?.is_guest
                                  ? 'bg-blue-500/15 text-blue-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {player?.role === 'admin' ? 'Admin' : player?.is_guest ? 'Ospite' : 'Iscritto'}
                            </span>
                          </td>

                          {/* OVR */}
                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-400">
                            {player?.overall_rating || 6.0}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                isStarter
                                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isStarter ? 'bg-emerald-400' : 'bg-amber-400'
                                }`}
                              />
                              {isStarter ? 'Titolare' : 'In Panchina'}
                            </span>
                          </td>

                          {/* Azione Rimozione Presenza */}
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemovePresence(pres.id, displayName)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title={`Rimuovi ${displayName} dalle presenze`}
                            >
                              <UserMinus className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* SEZIONE CRUCIALE: ELENCO DI TUTTE LE PERSONE REGISTRATE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-black text-white">
                Elenco Utenti & Giocatori Registrati
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Tutte le persone registrate nella web app (Google Auth) e i giocatori ospiti inseriti manualmente.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca per nome o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52 sm:w-64"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Nuovo</span>
            </button>
          </div>
        </div>

        {/* Tabella Utenti */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Giocatore</th>
                <th className="py-3 px-4">Email Account</th>
                <th className="py-3 px-4">Ruolo Piattaforma</th>
                <th className="py-3 px-4">Tipo Profilo</th>
                <th className="py-3 px-4 text-center">Media OVR</th>
                <th className="py-3 px-4 text-right">Azioni Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nessun utente o giocatore trovato per la ricerca &quot;{searchQuery}&quot;.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((p) => {
                  const isMarcoSuperAdmin = p.email && p.email.toLowerCase().includes('macciolino84');
                  const isPlayerAdmin = p.role === 'admin';

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Avatar e Nome */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.avatar_url ? (
                            <img
                              src={p.avatar_url}
                              alt={p.full_name}
                              className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-700"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                              {p.full_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{p.full_name}</span>
                              {isMarcoSuperAdmin && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-mono font-bold">
                                  ★ Super Admin
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">ID: {p.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                        {p.email ? (
                          <span className="text-slate-300">{p.email}</span>
                        ) : (
                          <span className="text-slate-600 italic">Nessun account Google (Ospite)</span>
                        )}
                      </td>

                      {/* Ruolo */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isPlayerAdmin
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {isPlayerAdmin ? '★ Admin' : 'User'}
                        </span>
                      </td>

                      {/* Tipo Profilo */}
                      <td className="py-3 px-4">
                        {p.is_guest ? (
                          <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                            Ospite Manuale
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1 w-max">
                            <span>Google Auth</span>
                          </span>
                        )}
                      </td>

                      {/* Overall Rating */}
                      <td className="py-3 px-4 text-center">
                        <StatBadge score={p.overall_rating || 6.0} size="sm" />
                      </td>

                      {/* Azioni Admin */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Pulsante Cambio Ruolo (Promuovi / Demote) */}
                          {!isMarcoSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleToggleUserRole(p)}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                                isPlayerAdmin
                                  ? 'bg-slate-800 hover:bg-slate-700 text-amber-300'
                                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                              }`}
                              title={isPlayerAdmin ? 'Rendi utente standard' : 'Promuovi ad Admin'}
                            >
                              {isPlayerAdmin ? 'Rendi User' : 'Fai Admin'}
                            </button>
                          )}

                          {/* Modifica Voti */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Modifica Statistiche"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          {/* Elimina Giocatore */}
                          {!isMarcoSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeletePlayer(p)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Elimina Giocatore"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AZIONE CRITICA: AZZERA TUTTE LE VOTAZIONI DELLA SETTIMANA */}
      <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-2xl">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Azzera Tutte le Votazioni della Settimana
            </h2>
            <p className="text-xs text-slate-400">
              Svuota l&apos;elenco dei presenti e delle waitlist per tutti i giorni del calendario (utile all&apos;inizio di ogni nuovo ciclo settimanale).
            </p>
          </div>
        </div>

        {resetSuccess && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2">
            <Check className="h-4 w-4" />
            Tutte le presenze della settimana sono state azzerate con successo!
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Questa operazione azzera i titolari e le riserve correnti in tutte le sezioni.</span>
          </div>

          <button
            type="button"
            onClick={handleResetWeeklyVotes}
            disabled={isResetting}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-rose-600/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isResetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Azzera Votazioni Settimana
          </button>
        </div>
      </div>

      {/* GESTIONE CATEGORIE STATISTICHE */}
      <StatCategoriesManager
        categories={categories}
        onCategoriesChanged={(newCats) => setCategories(newCats)}
      />

      {/* SISTEMA NOTIFICHE EMAIL & RESEND */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Notifiche Automatiche Email Admin</h2>
            <p className="text-xs text-slate-400">
              Invia un&apos;email immediata all&apos;Admin quando un giorno raggiunge 10 titolari o se un titolare si ritira.
            </p>
          </div>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Destinatario Notifiche:</span>
            <span className="font-mono text-emerald-400 font-bold">
              {process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@clubcalcetto.it'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Stato Provider Email:</span>
            <span className="font-mono text-slate-300">
              Resend API / Server Console Log (Pronto all&apos;invio)
            </span>
          </div>
        </div>

        {testEmailSuccess && (
          <div className="p-3 bg-slate-950 border border-slate-700 text-emerald-300 rounded-xl text-xs font-mono">
            {testEmailSuccess}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleTestEmail}
            disabled={testEmailLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            {testEmailLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            ) : (
              <Mail className="h-4 w-4 text-emerald-400" />
            )}
            Invia Email di Test
          </button>
        </div>
      </div>

      {/* Modal Aggiunta / Modifica Giocatore */}
      <PlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        playerToEdit={editingPlayer}
        statCategories={categories}
        onSaved={(savedPlayer) => {
          setPlayers(getStoredPlayers());
        }}
      />
    </div>
  );
}
