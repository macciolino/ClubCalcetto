'use client';

import { DeletionFeedbackCard } from '@/components/admin/DeletionFeedbackCard';
import { manageAccountAsSuperAdmin } from '@/lib/services/accountService';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { StatCategory, Profile, Presence, SportField, GeneratedTeamRecord } from '@/types/database';
import { PlayerModal } from '@/components/PlayerModal';
import { TabOverviewMatch } from '@/components/admin/TabOverviewMatch';
import { TabUsersRoles } from '@/components/admin/TabUsersRoles';
import { TabClubConfigFields } from '@/components/admin/TabClubConfigFields';
import { NotificationSettingsCard } from '@/components/admin/NotificationSettingsCard';
import { 
  subscribeProfiles, 
  subscribeStatCategories, 
  subscribePresencesRange,
  saveProfileDoc, 
  deleteProfileDoc, 
  saveOfficialMatchDateDoc,
  subscribeAppSettings,
  saveAppSettingsDoc,
  subscribeGeneratedTeams
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { 
  getStoredPlayers, 
  removeStoredPlayer, 
  updateStoredPlayer, 
  saveStoredPlayers 
} from '@/lib/services/playerService';
import { 
  getOfficialMatchDate, 
  setOfficialMatchDate, 
  getAppSettings, 
  saveAppSettings,
} from '@/lib/services/presenceService';
import { 
  getStoredCategories,
  saveStoredCategories,
  resetToDefault8Categories 
} from '@/lib/services/statCategoryService';
import { 
  getStoredFields, 
  addStoredField, 
  updateStoredField, 
  removeStoredField,
  subscribeSportFields 
} from '@/lib/services/fieldService';
import { getCalendarDays } from '@/lib/utils/dateUtils';
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Users, 
  Settings, 
  Loader2, 
  ArrowLeft,
  Sparkles,
  Trophy,
  Coins
} from 'lucide-react';

type AdminTab = 'overview' | 'users' | 'config';

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Navigazione a 4 Tab Orizzontali
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Stato Dati Globali
  const [upcomingDays] = useState(() => getCalendarDays());
  const [activeDate, setActiveDate] = useState<string>(() => getOfficialMatchDate());
  const [categories, setCategories] = useState<StatCategory[]>(() => getStoredCategories());
  const [players, setPlayers] = useState<Profile[]>(() => getStoredPlayers());
  const [presences, setPresences] = useState<Presence[]>([]);
  const [fields, setFields] = useState<SportField[]>(() => getStoredFields());
  const [appSettings, setAppSettingsState] = useState(() => getAppSettings());
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeamRecord | null>(null);

  // Modale Giocatore (Aggiunta / Modifica)
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [playerToEdit, setPlayerToEdit] = useState<Profile | null>(null);

  // Email Test State

  // 1. ISOLAMENTO RIGIDO: Controllo autorizzazione amministratore
  const isStrictAdmin = Boolean(mounted && !isLoading && user && (profile?.role === 'admin' || isAdmin));

  useEffect(() => {
    if (mounted && !isLoading && !isStrictAdmin) {
      router.replace('/presenze');
    }
  }, [mounted, isLoading, isStrictAdmin, router]);

  // 2. Sottoscrizioni e Caricamento Iniziale
  useEffect(() => {
    setMounted(true);
    setPlayers(getStoredPlayers());
    setCategories(getStoredCategories());
    setFields(getStoredFields());
    setAppSettingsState(getAppSettings());

    const handlePlayers = () => setPlayers(getStoredPlayers());
    const handleCats = () => setCategories(getStoredCategories());
    const handleFields = () => setFields(getStoredFields());
    const handleSettings = (e: any) => {
      if (e.detail) setAppSettingsState(e.detail);
      else setAppSettingsState(getAppSettings());
    };
    const handleDate = (e: any) => {
      const d = e.detail?.date || getOfficialMatchDate();
      if (d) setActiveDate(d);
    };

    window.addEventListener('clubcalcetto_players_changed', handlePlayers);
    window.addEventListener('clubcalcetto_categories_changed', handleCats);
    window.addEventListener('clubcalcetto_fields_changed', handleFields);
    window.addEventListener('clubcalcetto_settings_changed', handleSettings);
    window.addEventListener('clubcalcetto_match_date_changed', handleDate);

    // Sottoscrizioni Realtime Firebase
    let unsubProfs = () => {};
    let unsubCats = () => {};
    let unsubFields = () => {};
    let unsubSettings = () => {};

    if (isFirebaseConfigured) {
      unsubProfs = subscribeProfiles((remote) => {
        if (remote && remote.length > 0) {
          setPlayers(remote);
          saveStoredPlayers(remote);
        }
      });
      unsubCats = subscribeStatCategories((remote) => {
        setCategories(remote);
        saveStoredCategories(remote);
      });
      unsubFields = subscribeSportFields((remote) => {
        if (remote && remote.length > 0) setFields(remote);
      });
      unsubSettings = subscribeAppSettings((remote) => {
        if (remote) {
          setAppSettingsState((prev) => ({ ...prev, ...remote }));
          if (remote.official_match_date) setActiveDate(remote.official_match_date);
        }
      });
    }

    return () => {
      window.removeEventListener('clubcalcetto_players_changed', handlePlayers);
      window.removeEventListener('clubcalcetto_categories_changed', handleCats);
      window.removeEventListener('clubcalcetto_fields_changed', handleFields);
      window.removeEventListener('clubcalcetto_settings_changed', handleSettings);
      window.removeEventListener('clubcalcetto_match_date_changed', handleDate);
      unsubProfs();
      unsubCats();
      unsubFields();
      unsubSettings();
    };
  }, []);

  // Sottoscrizione Presenze e Squadre per la data attiva
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Presenze del calendario visibile (+ la data attiva, anche se passata), in tempo reale
    const first = upcomingDays[0]?.dateString || activeDate;
    const last = upcomingDays[upcomingDays.length - 1]?.dateString || activeDate;
    const unsubPres = subscribePresencesRange(
      activeDate < first ? activeDate : first,
      activeDate > last ? activeDate : last,
      (list) => setPresences(list)
    );

    const unsubTeams = subscribeGeneratedTeams(activeDate, (record) => {
      setGeneratedTeams(record);
    });

    return () => {
      unsubPres();
      unsubTeams();
    };
  }, [activeDate]);

  // Se non admin o in caricamento, mostra esclusivamente spinner
  // Account disattivati (solo super admin): elenco per Anagrafica → Disattivati.
  // (gli hook devono stare PRIMA del return qui sotto)
  const [deactivatedPlayers, setDeactivatedPlayers] = useState<Profile[]>([]);
  useEffect(() => {
    if (!isSuperAdmin) return;
    setDeactivatedPlayers([]);
    const unsub = subscribeProfiles((list) => setDeactivatedPlayers(list), 'deactivated');
    return () => unsub();
  }, [isSuperAdmin]);

  if (!isStrictAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Verifica permessi amministratore in corso...</p>
      </div>
    );
  }

  // Handlers Tab 1: Selezione Data Ufficiale
  const handleSelectOfficialDate = (dateString: string) => {
    setActiveDate(dateString);
    setOfficialMatchDate(dateString);
    saveOfficialMatchDateDoc(dateString);
  };

  // Blocco ritiri (impostazione in Campi & Parametri)
  const handleUpdateTimelock = (enabled: boolean, hours: number) => {
    const updated = saveAppSettings({
      timelock_enabled: enabled,
      timelock_hours_before: hours,
    });
    setAppSettingsState(updated);
    saveAppSettingsDoc({
      timelock_enabled: enabled,
      timelock_hours_before: hours,
    });
  };

  // Handlers Tab 3: Anagrafica & Ruoli
  const handleTogglePlayerRole = async (targetPlayer: Profile) => {
    if (!isSuperAdmin) {
      alert('Solo il super admin può promuovere o retrocedere gli amministratori.');
      return;
    }
    const isMarco = targetPlayer.email?.toLowerCase().includes('macciolino84');
    if (isMarco && targetPlayer.role === 'admin') {
      alert('Non è possibile retrocedere l\'amministratore principale.');
      return;
    }

    const nextRole: 'admin' | 'player' = targetPlayer.role === 'admin' ? 'player' : 'admin';
    const updated: Profile = {
      ...targetPlayer,
      role: nextRole,
      updated_at: new Date().toISOString(),
    };

    updateStoredPlayer(updated);
    setPlayers(getStoredPlayers());
    await saveProfileDoc(updated);
  };

  // Ospiti: si cancella la scheda. Account registrati: solo il super admin, eliminazione completa dal server
  // (accesso Google, scheda, telefoni per le notifiche e iscrizioni; nello storico resta il nome).
  const handleDeletePlayer = async (playerId: string, name: string) => {
    const target = players.find((p) => p.id === playerId);
    if (playerId === 'p-1') return;
    if (target?.is_guest) {
      if (!confirm(`Eliminare l'ospite "${name}"? Nelle partite già giocate resta il nome.`)) return;
      removeStoredPlayer(playerId);
      setPlayers(getStoredPlayers());
      await deleteProfileDoc(playerId);
      return;
    }
    if (!isSuperAdmin) {
      alert('Solo il super admin può disattivare un account registrato.');
      return;
    }
    if (!confirm(`Disattivare l'account di "${name}"? Non potrà più entrare e sparirà dalle pagine; scheda, parametri e statistiche restano salvati. Potrai riattivarlo o eliminarlo del tutto da Admin → Anagrafica Rosa → Disattivati.`)) return;
    const res = await manageAccountAsSuperAdmin(playerId, 'deactivate');
    if (res.ok) {
      removeStoredPlayer(playerId);
      setPlayers(getStoredPlayers());
      alert(`Account di "${name}" disattivato.`);
    } else {
      alert(res.error === 'not_configured' ? 'Operazione non disponibile: server non configurato.' : 'Operazione non riuscita. Riprova.');
    }
  };

  const handleReactivatePlayer = async (player: Profile) => {
    if (!confirm(`Riattivare l'account di "${player.full_name}"? Potrà di nuovo entrare e ritroverà scheda, parametri e statistiche.`)) return;
    const res = await manageAccountAsSuperAdmin(player.id, 'reactivate');
    if (res.ok) setDeactivatedPlayers((prev) => prev.filter((p) => p.id !== player.id));
    else alert('Riattivazione non riuscita. Riprova.');
  };

  const handleDeleteDeactivatedPlayer = async (player: Profile) => {
    if (!confirm(`Eliminare DEFINITIVAMENTE l'account di "${player.full_name}"? Scheda, parametri e statistiche verranno cancellati. Non si può annullare.`)) return;
    const res = await manageAccountAsSuperAdmin(player.id, 'delete');
    if (res.ok) setDeactivatedPlayers((prev) => prev.filter((p) => p.id !== player.id));
    else alert('Eliminazione non riuscita. Riprova.');
  };

  // Handlers Tab 4: Configurazione Club & Campi
  const handleAddField = async (fieldData: Omit<SportField, 'id'>) => {
    await addStoredField(fieldData);
    setFields(getStoredFields());
  };

  const handleUpdateField = async (field: SportField) => {
    await updateStoredField(field);
    setFields(getStoredFields());
  };

  const handleDeleteField = async (id: string) => {
    await removeStoredField(id);
    setFields(getStoredFields());
  };

  const handleSetDefaultFieldId = (id: string) => {
    const updated = saveAppSettings({ default_field_id: id });
    setAppSettingsState(updated);
    saveAppSettingsDoc({ default_field_id: id });
  };

  const handleReset8Categories = () => {
    const updated = resetToDefault8Categories();
    setCategories(updated);
  };

  const handleSaveEconomicConfig = (cost: number, time: string) => {
    const updated = saveAppSettings({
      standard_total_cost: cost,
      standard_match_time: time,
    });
    setAppSettingsState(updated);
    saveAppSettingsDoc({
      standard_total_cost: cost,
      standard_match_time: time,
    });
  };



  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* HEADER AMMINISTRAZIONE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl ring-1 ring-amber-500/30">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Pannello Amministratore
              </h1>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                ClubCalcetto - {profile?.full_name || 'Amministratore'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/giocatori"
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold rounded-xl text-xs transition-all border border-slate-700 shadow-md"
          >
            <ArrowLeft className="h-4 w-4 text-emerald-400" />
            <span>Pagina Giocatori</span>
          </Link>
          <Link
            href={`/squadre?date=${activeDate}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all hover:scale-105"
          >
            <Trophy className="h-4 w-4" />
            <span>Squadre 5v5</span>
          </Link>
        </div>
      </div>

      {/* Notifiche (a tendina, in alto) */}
      <NotificationSettingsCard />

      {/* 4 TAB ORIZZONTALI PRINCIPALI */}
      <div className="bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
          {/* Tab 1: Panoramica, Match & Cassa */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center justify-start md:justify-center gap-2.5 py-2.5 md:py-3 px-3.5 md:px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 scale-[1.01]'
                : 'text-slate-400 hover:text-white hover:bg-slate-850/60'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
            <span className="text-left md:text-center leading-tight">1. Match & Cassa</span>
          </button>

          {/* Tab 3: Anagrafica Utenti & Ruoli */}
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center justify-start md:justify-center gap-2.5 py-2.5 md:py-3 px-3.5 md:px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 scale-[1.01]'
                : 'text-slate-400 hover:text-white hover:bg-slate-850/60'
            }`}
          >
            <Users className="h-4 w-4 flex-shrink-0" />
            <span className="text-left md:text-center leading-tight">2. Anagrafica Rosa</span>
          </button>

          {/* Tab 4: Configurazione & Gestione Campi */}
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`w-full flex items-center justify-start md:justify-center gap-2.5 py-2.5 md:py-3 px-3.5 md:px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'config'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 scale-[1.01]'
                : 'text-slate-400 hover:text-white hover:bg-slate-850/60'
            }`}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            <span className="text-left md:text-center leading-tight">3. Campi & Parametri</span>
          </button>
        </div>
      </div>

      {/* CONTENUTO SCHEDA ATTIVA */}
      <div className="pt-1">
        {activeTab === 'overview' && (
          <TabOverviewMatch
            days={upcomingDays}
            activeDate={activeDate}
            onSelectDate={handleSelectOfficialDate}
            players={players}
            presences={presences}
            generatedTeamRecord={generatedTeams}
            totalMatchCost={appSettings.standard_total_cost || 80}
          />
        )}

        {activeTab === 'users' && (
          <TabUsersRoles
            players={players}
            onOpenAddModal={() => {
              setPlayerToEdit(null);
              setIsPlayerModalOpen(true);
            }}
            onOpenEditModal={(p) => {
              setPlayerToEdit(p);
              setIsPlayerModalOpen(true);
            }}
            onTogglePlayerRole={handleTogglePlayerRole}
            onDeletePlayer={handleDeletePlayer}
            canManageRoles={isSuperAdmin}
            deactivatedPlayers={isSuperAdmin ? deactivatedPlayers : []}
            onReactivatePlayer={handleReactivatePlayer}
            onDeleteDeactivatedPlayer={handleDeleteDeactivatedPlayer}
          />
        )}
        {activeTab === 'users' && isSuperAdmin && (
          <div className="mt-6">
            <DeletionFeedbackCard />
          </div>
        )}

        {activeTab === 'config' && (
          <TabClubConfigFields
            fields={fields}
            onAddField={handleAddField}
            onUpdateField={handleUpdateField}
            onDeleteField={handleDeleteField}
            defaultFieldId={appSettings.default_field_id}
            onSetDefaultFieldId={handleSetDefaultFieldId}
            categories={categories}
            onReset8Categories={handleReset8Categories}
            standardCost={appSettings.standard_total_cost || 80}
            standardTime={appSettings.standard_match_time || '20:30'}
            onSaveEconomicConfig={handleSaveEconomicConfig}
            timelockEnabled={Boolean(appSettings.timelock_enabled)}
            timelockHours={appSettings.timelock_hours_before || 4}
            onUpdateTimelock={handleUpdateTimelock}
          />
        )}
      </div>

      {/* MODALE CREAZIONE / MODIFICA GIOCATORE */}
      <PlayerModal
        isOpen={isPlayerModalOpen}
        onClose={() => setIsPlayerModalOpen(false)}
        playerToEdit={playerToEdit}
        statCategories={categories}
        onSaved={() => {
          setPlayers(getStoredPlayers());
        }}
      />
    </div>
  );
}
