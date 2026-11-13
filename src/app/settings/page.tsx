'use client';

import { PageSkeleton } from '@/components/ui/Skeleton';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { NotificationGuide } from '@/components/NotificationGuide';
import { AccountSettings } from '@/components/AccountSettings';
import { ThemeSetting } from '@/components/settings/ThemeSetting';
import { AdminSection, AdminSections } from '@/components/admin/AdminSections';
import { AppSettings, Profile, SportField } from '@/types/database';
import { subscribeAppSettings, subscribeOfficialMatchDate, subscribeProfiles } from '@/lib/firebase/firestoreService';
import { subscribeSportFields } from '@/lib/services/fieldService';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { useFormSettings } from '@/lib/hooks/useForms';
import { Bell, UserCog, Trophy, MapPin, Ruler, BarChart3, Megaphone, ShieldCheck, ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react';
import { btn } from '@/components/ui/buttons';

type SectionId = 'notifiche' | 'account' | AdminSection;

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ElementType;
  access: 'all' | 'admin' | 'super';
  group: 'Tuo account' | 'Gestione partita' | 'Club' | 'Accessi';
}

/** Sections of Impostazioni, in menu order, grouped. */
const SECTIONS: SectionDef[] = [
  { id: 'notifiche', label: 'Notifiche', description: 'Le notifiche su questo dispositivo', icon: Bell, access: 'all', group: 'Tuo account' },
  { id: 'account', label: 'Account', description: 'Esci da tutti i dispositivi, disattiva o elimina l’account', icon: UserCog, access: 'all', group: 'Tuo account' },
  { id: 'partita', label: 'Partita della settimana', description: 'Un giorno alla volta: organizzazione, cassa e risultato', icon: Trophy, access: 'admin', group: 'Gestione partita' },
  { id: 'campi', label: 'Campi e costi', description: 'Campi, costo di ogni campo, orario e costo standard', icon: MapPin, access: 'admin', group: 'Club' },
  { id: 'regole', label: 'Regole di gioco', description: 'Blocco ritiri e portiere', icon: Ruler, access: 'admin', group: 'Club' },
  { id: 'parametri', label: 'Parametri e forma', description: 'Parametri dell’ottagono e stato forma', icon: BarChart3, access: 'admin', group: 'Club' },
  { id: 'notifiche-club', label: 'Notifiche del club', description: 'Chi riceve le notifiche, prova, telefoni degli admin', icon: Megaphone, access: 'admin', group: 'Club' },
  { id: 'accessi', label: 'Admin e account', description: 'Chi è admin, account disattivati, motivi di chi lascia', icon: ShieldCheck, access: 'admin', group: 'Accessi' },
];
const GROUPS: SectionDef['group'][] = ['Tuo account', 'Gestione partita', 'Club', 'Accessi'];

/** Live values shown on the right of each row of the overview ("how the club is set up" at a glance). */
function useSummary(
  admin: boolean,
  superAdmin: boolean,
  email?: string | null
): { values: Partial<Record<SectionId, string>>; alerts: Partial<Record<SectionId, number>> } {
  const [settings, setSettings] = useState<AppSettings>({});
  const [fields, setFields] = useState<SportField[]>([]);
  const [admins, setAdmins] = useState<number | null>(null);
  // Account chiusi che hanno chiesto di rientrare (pallino su "Admin e account")
  const [returning, setReturning] = useState(0);
  const [notifyMode, setNotifyMode] = useState<string>('');
  const [officialDate, setOfficialDate] = useState('');
  const [permission, setPermission] = useState<string>('');
  const categories = useStatCategories();
  const form = useFormSettings();

  useEffect(() => {
    try {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    } catch {
      setPermission('unsupported');
    }
    if (!isFirebaseConfigured || !admin) return;
    const unsubs = [
      subscribeAppSettings((s) => setSettings(s || {})),
      subscribeSportFields((list) => setFields(list || [])),
      subscribeOfficialMatchDate(setOfficialDate),
      onSnapshot(
        doc(db, 'settings', 'notifications'),
        (snap) => setNotifyMode(String(snap.data()?.mode || 'admins')),
        () => undefined
      ),
    ];
    unsubs.push(subscribeProfiles((list: Profile[]) => setAdmins((list || []).filter((p) => p.role === 'admin').length)));
    unsubs.push(
      subscribeProfiles((list: Profile[]) => setReturning((list || []).filter((p) => p.restore_requested_at && !p.archived_at).length), 'deactivated')
    );
    return () => unsubs.forEach((u) => u());
  }, [admin, superAdmin]);

  const short = (d?: string) => {
    if (!d) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  };
  const def = fields.find((f) => f.id === settings.default_field_id) || fields[0];
  const anyForm = form.goals || form.mvp || form.results;
  const values: Partial<Record<SectionId, string>> = {
    notifiche: permission === 'granted' ? 'attive' : permission === 'denied' ? 'bloccate' : permission === 'unsupported' ? '' : 'spente',
    account: email || '',
    partita: officialDate ? short(officialDate) : 'nessun giorno ufficiale',
    campi: def ? `${def.name} · €${Number(def.cost || settings.standard_total_cost || 80)}` : '',
    regole: `${settings.timelock_enabled ? `ritiri bloccati ${settings.timelock_hours_before || 4}h prima` : 'ritiri liberi'} · portiere ${
      form.fixedKeeper ? 'fisso' : 'a rotazione'
    }`,
    parametri: `${categories.length} parametri · forma ${anyForm ? 'attiva' : 'spenta'}`,
    'notifiche-club': notifyMode === 'all' ? 'a tutti' : notifyMode === 'off' ? 'spente' : notifyMode ? 'solo admin' : '',
    accessi:
      admins === null
        ? ''
        : `${admins} admin${returning ? ` · ${returning} ${returning === 1 ? 'vuole' : 'vogliono'} rientrare` : ''}`,
  };
  return { values, alerts: { accessi: returning } };
}

/** Old addresses (before the reorganisation) → new sections */
const ALIASES: Record<string, string> = { rosa: 'accessi', 'account-chiusi': 'accessi' };

function SettingsContent() {
  const { user, profile, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const params = useSearchParams();
  const admin = Boolean(isAdmin || profile?.role === 'admin');
  const { values: summary, alerts } = useSummary(admin, Boolean(isSuperAdmin), user?.email);

  const raw = params.get('sezione') || '';

  if (isLoading) return <PageSkeleton />;
  if (!user || !profile) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
        <p className="text-sm text-slate-400">Accedi per gestire le tue impostazioni.</p>
        <Link href="/login" className={btn.primary}>
          Vai al login <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const visible = SECTIONS.filter((s) => s.access === 'all' || (s.access === 'admin' && admin) || (s.access === 'super' && isSuperAdmin));
  const wanted = ALIASES[raw] || raw;
  const requested = visible.find((s) => s.id === wanted);
  const current = requested || visible[0];
  const groups = GROUPS.map((g) => ({ title: g, items: visible.filter((s) => s.group === g) })).filter((g) => g.items.length > 0);

  // Riga del menu: icona, nome, (schermata generale) valore attuale a destra
  const row = (s: SectionDef, withValue: boolean) => {
    const Icon = s.icon;
    const active = Boolean(requested) && s.id === current.id;
    return (
      <Link
        key={s.id}
        href={`/settings?sezione=${s.id}`}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 px-3.5 py-3 text-sm transition-colors ${
          active ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 text-emerald-400">
          <Icon className="h-4 w-4" />
          {Boolean(alerts[s.id]) && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" aria-label="Da gestire" />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{s.label}</span>
          {withValue && summary[s.id] && <span className="sm:hidden block text-xs text-slate-400 truncate">{summary[s.id]}</span>}
        </span>
        {withValue && summary[s.id] && (
          <span className="hidden sm:block max-w-[45%] truncate text-xs text-slate-400 text-right">{summary[s.id]}</span>
        )}
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-600" aria-hidden="true" />
      </Link>
    );
  };

  const groupList = (withValue: boolean) => (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.title} className="space-y-1.5" aria-label={g.title}>
          <h2 className="px-1 text-xs font-semibold text-slate-500">{g.title}</h2>
          <div className="bg-slate-900 rounded-2xl overflow-hidden divide-y divide-slate-800">
            {g.items.map((s) => (
              <div key={s.id}>{row(s, withValue)}</div>
            ))}
            {/* Tema: si sceglie in una finestra, senza aprire una pagina */}
            {g.title === 'Tuo account' && <ThemeSetting />}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 pb-16">
      <header className="min-h-[2.5rem] flex items-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Impostazioni</h1>
      </header>

      {!requested ? (
        /* Schermata generale: gruppi di righe con il valore attuale (telefono, tablet e PC) */
        <div className="max-w-2xl">{groupList(true)}</div>
      ) : (
        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8 lg:items-start">
          {/* PC: elenco delle sezioni a sinistra, fisso */}
          <aside className="hidden lg:block lg:sticky lg:top-36">{groupList(false)}</aside>

          <section className="space-y-4 min-w-0" aria-labelledby="settings-section-title">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-emerald-300"
              aria-label="Torna alla schermata generale delle impostazioni"
            >
              <ArrowLeft className="h-4 w-4" /> Impostazioni
            </Link>
            <div>
              <h2 id="settings-section-title" className="text-xl font-semibold text-white">
                {current.label}
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">{current.description}</p>
            </div>

            {current.id === 'notifiche' ? (
              <NotificationGuide />
            ) : current.id === 'account' ? (
              <AccountSettings />
            ) : (
              <AdminSections section={current.id} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function ImpostazioniPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
