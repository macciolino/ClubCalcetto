'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { notify, askConfirm } from '@/components/ui/Feedback';

import { DeletionFeedbackCard } from '@/components/admin/DeletionFeedbackCard';
import { DeactivatedAccountsList } from '@/components/admin/DeactivatedAccountsList';
import { manageAccountAsSuperAdmin } from '@/lib/services/accountService';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { StatCategory, Profile, Presence, SportField, GeneratedTeamRecord } from '@/types/database';
import { TabOverviewMatch } from '@/components/admin/TabOverviewMatch';
import { AdminsCard } from '@/components/admin/AdminsCard';
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


/** Admin sections shown in Impostazioni (each one was a part of the old /admin page). */
export type AdminSection = 'partita' | 'campi' | 'regole' | 'parametri' | 'notifiche-club' | 'accessi';

export function AdminSections({ section }: { section: AdminSection }) {
  const { user, profile, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);


  // Stato Dati Globali
  const [upcomingDays] = useState(() => getCalendarDays());
  const [activeDate, setActiveDate] = useState<string>(() => getOfficialMatchDate());
  const [categories, setCategories] = useState<StatCategory[]>(() => getStoredCategories());
  const [players, setPlayers] = useState<Profile[]>(() => getStoredPlayers());
  const [presences, setPresences] = useState<Presence[]>([]);
  const [fields, setFields] = useState<SportField[]>(() => getStoredFields());
  const [appSettings, setAppSettingsState] = useState(() => getAppSettings());
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeamRecord | null>(null);


  // Email Test State

  // 1. ISOLAMENTO RIGIDO: Controllo autorizzazione amministratore
  const isStrictAdmin = Boolean(mounted && !isLoading && user && (profile?.role === 'admin' || isAdmin));


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
    if (!isSuperAdmin || section !== 'accessi') return;
    setDeactivatedPlayers([]);
    const unsub = subscribeProfiles((list) => setDeactivatedPlayers(list.filter((p) => !p.archived_at)), 'deactivated');
    return () => unsub();
  }, [isSuperAdmin, section]);

  if (!isStrictAdmin) {
    return (
      <div className="space-y-4" role="status" aria-label="Verifica permessi in corso">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
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
      notify('Solo il super admin può promuovere o retrocedere gli amministratori.');
      return;
    }
    const isMarco = targetPlayer.email?.toLowerCase().includes('macciolino84');
    if (isMarco && targetPlayer.role === 'admin') {
      notify('Non è possibile retrocedere l\'amministratore principale.');
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

  const handleReactivatePlayer = async (player: Profile) => {
    if (!(await askConfirm(`Riattivare l'account di "${player.full_name}"? Potrà di nuovo entrare e ritroverà scheda, parametri e statistiche.`))) return;
    const res = await manageAccountAsSuperAdmin(player.id, 'reactivate');
    if (res.ok) setDeactivatedPlayers((prev) => prev.filter((p) => p.id !== player.id));
    else notify('Riattivazione non riuscita. Riprova.');
  };

  const handleDeleteDeactivatedPlayer = async (player: Profile) => {
    if (!(await askConfirm(`Eliminare DEFINITIVAMENTE l'account di "${player.full_name}"? Scheda, parametri e statistiche verranno cancellati. Non si può annullare.`))) return;
    const res = await manageAccountAsSuperAdmin(player.id, 'delete');
    if (res.ok) setDeactivatedPlayers((prev) => prev.filter((p) => p.id !== player.id));
    else notify('Eliminazione non riuscita. Riprova.');
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



  const configProps = {
    fields,
    onAddField: handleAddField,
    onUpdateField: handleUpdateField,
    onDeleteField: handleDeleteField,
    defaultFieldId: appSettings.default_field_id,
    onSetDefaultFieldId: handleSetDefaultFieldId,
    categories,
    onReset8Categories: handleReset8Categories,
    standardCost: appSettings.standard_total_cost || 80,
    standardTime: appSettings.standard_match_time || '20:30',
    onSaveEconomicConfig: handleSaveEconomicConfig,
    timelockEnabled: Boolean(appSettings.timelock_enabled),
    timelockHours: appSettings.timelock_hours_before || 4,
    onUpdateTimelock: handleUpdateTimelock,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {section === 'partita' && (
        <>
          <TabOverviewMatch
            days={upcomingDays}
            activeDate={activeDate}
            onSelectDate={handleSelectOfficialDate}
            players={players}
            presences={presences}
            generatedTeamRecord={generatedTeams}
            totalMatchCost={appSettings.standard_total_cost || 80}
            fields={fields}
            defaultFieldId={appSettings.default_field_id}
          />
        </>
      )}

      {section === 'notifiche-club' && <NotificationSettingsCard defaultOpen />}

      {section === 'campi' && <TabClubConfigFields {...configProps} part="campi" />}

      {section === 'regole' && <TabClubConfigFields {...configProps} part="regole" />}

      {section === 'parametri' && <TabClubConfigFields {...configProps} part="params" />}

      {section === 'accessi' && isSuperAdmin && (
        <>
          <AdminsCard players={players} onToggleRole={handleTogglePlayerRole} />
          <DeactivatedAccountsList
            deactivatedPlayers={deactivatedPlayers}
            onReactivatePlayer={handleReactivatePlayer}
            onDeleteDeactivatedPlayer={handleDeleteDeactivatedPlayer}
          />
          <DeletionFeedbackCard />
        </>
      )}

    </div>
  );
}
