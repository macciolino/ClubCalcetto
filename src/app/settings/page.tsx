'use client';

import { PageSkeleton } from '@/components/ui/Skeleton';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { onSnapshot } from 'firebase/firestore';
import { ldoc } from '@/lib/league/leagueRefs';
import { useAuth } from '@/lib/context/AuthContext';
import { NotificationGuide } from '@/components/NotificationGuide';
import { AccountSettings } from '@/components/AccountSettings';
import { PlatformAccountsPanel } from '@/components/admin/PlatformAccountsPanel';
import { LeaguePanel } from '@/components/league/LeaguePanel';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { ThemeSetting } from '@/components/settings/ThemeSetting';
import { LanguageSetting } from '@/components/settings/LanguageSetting';
import { BoardSetting } from '@/components/settings/BoardSetting';
import { AdminSection, AdminSections } from '@/components/admin/AdminSections';
import { AppSettings, Profile, SportField } from '@/types/database';
import { subscribeAppSettings, subscribeOfficialMatchDate, subscribeProfiles } from '@/lib/firebase/firestoreService';
import { subscribeSportFields } from '@/lib/services/fieldService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { useFormSettings } from '@/lib/hooks/useForms';
import { Bell, UserCog, Shield, Trophy, MapPin, Ruler, BarChart3, Megaphone, ShieldCheck, ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react';
import { btn } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';

type SectionId = 'notifiche' | 'account' | 'lega' | 'accessi' | AdminSection;

interface SectionDef {
  id: SectionId;
  icon: React.ElementType;
  access: 'all' | 'admin' | 'staff';
  group: 'account' | 'league' | 'match' | 'access';
}

/** Sections of Impostazioni, in menu order, grouped (names: settings.sections.<id>, settings.groups.<group>). */
const SECTIONS: SectionDef[] = [
  { id: 'notifiche', icon: Bell, access: 'all', group: 'account' },
  { id: 'account', icon: UserCog, access: 'all', group: 'account' },
  // Multi-league: everything about the ACTIVE league in one group (heading = "Lega · <name>"); no separate "Club" any more
  { id: 'lega', icon: Shield, access: 'all', group: 'league' },
  { id: 'campi', icon: MapPin, access: 'admin', group: 'league' },
  { id: 'regole', icon: Ruler, access: 'admin', group: 'league' },
  { id: 'parametri', icon: BarChart3, access: 'admin', group: 'league' },
  { id: 'notifiche-club', icon: Megaphone, access: 'admin', group: 'league' },
  { id: 'partita', icon: Trophy, access: 'admin', group: 'match' },
  // Platform staff (super admin, platform admin): accounts and platform tools (league roles live in Lega → Membri e ruoli)
  { id: 'accessi', icon: ShieldCheck, access: 'staff', group: 'access' },
];
const GROUPS: SectionDef['group'][] = ['account', 'league', 'match', 'access'];

/** Live values shown on the right of each row of the overview ("how the club is set up" at a glance). */
function useSummary(
  admin: boolean,
  superAdmin: boolean,
  email?: string | null
): { values: Partial<Record<SectionId, string>>; alerts: Partial<Record<SectionId, number>> } {
  const [settings, setSettings] = useState<AppSettings>({});
  const [fields, setFields] = useState<SportField[]>([]);
  // Account chiusi che hanno chiesto di rientrare (pallino su "Account e piattaforma", staff di piattaforma)
  const [returning, setReturning] = useState(0);
  const [notifyMode, setNotifyMode] = useState<string>('');
  const [officialDate, setOfficialDate] = useState('');
  const [permission, setPermission] = useState<string>('');
  const categories = useStatCategories();
  const form = useFormSettings();
  const t = useTranslations('settings');
  const { locale } = useLocaleSetting();
  const { leagues, activeLeagueId, leagueRole } = useActiveLeague();
  const tRole = useTranslations('league.roles');

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
        ldoc('settings', 'notifications'),
        (snap) => setNotifyMode(String(snap.data()?.mode || 'admins')),
        () => undefined
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [admin]);

  // Gli account chiusi li riattiva solo lo staff di piattaforma (Account e piattaforma → Account disattivati)
  useEffect(() => {
    if (!isFirebaseConfigured || !superAdmin) return;
    return subscribeProfiles((list: Profile[]) => setReturning((list || []).filter((p) => p.restore_requested_at && !p.archived_at).length), 'deactivated');
  }, [superAdmin]);

  const short = (d?: string) => {
    if (!d) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  };
  const def = fields.find((f) => f.id === settings.default_field_id) || fields[0];
  const anyForm = form.goals || form.mvp || form.results;
  const values: Partial<Record<SectionId, string>> = {
    notifiche: permission === 'granted' ? t('notifOn') : permission === 'denied' ? t('notifBlocked') : permission === 'unsupported' ? '' : t('notifOff'),
    account: email || '',
    lega: [leagues.find((l) => l.id === activeLeagueId)?.name, leagueRole ? tRole(leagueRole) : ''].filter(Boolean).join(' · '),
    partita: officialDate ? short(officialDate) : t('noOfficial'),
    campi: def ? `${def.name} · €${Number(def.cost || settings.standard_total_cost || 80)}` : '',
    regole: `${settings.timelock_enabled ? t('timelockOn', { hours: settings.timelock_hours_before || 4 }) : t('timelockOff')} · ${t('keeper', {
      mode: form.fixedKeeper ? t('keeperFixed') : t('keeperRotation'),
    })}`,
    parametri: t('params', { count: categories.length, state: anyForm ? t('formOn') : t('formOff') }),
    'notifiche-club': notifyMode === 'all' ? t('clubAll') : notifyMode === 'off' ? t('clubOff') : notifyMode ? t('clubAdmins') : '',
    accessi: returning ? t('returning', { count: returning }) : '',
  };
  return { values, alerts: { accessi: returning } };
}

/** Old addresses (before the reorganisation) → new sections */
const ALIASES: Record<string, string> = { rosa: 'accessi', 'account-chiusi': 'accessi' };

function SettingsContent() {
  const { user, profile, isAdmin, isPlatformStaff, isLoading } = useAuth();
  const params = useSearchParams();
  const admin = Boolean(isAdmin || profile?.role === 'admin');
  const { values: summary, alerts } = useSummary(admin, Boolean(isPlatformStaff), user?.email);

  const raw = params.get('sezione') || '';
  const t = useTranslations('settings');
  const { leagues: myLeagues, activeLeagueId: currentLeagueId } = useActiveLeague();
  const activeLeagueName = myLeagues.find((l) => l.id === currentLeagueId)?.name;
  // The league group carries the active league's name ("Lega · I Calcettari")
  const groupTitle = (g: SectionDef['group']) => (g === 'league' && activeLeagueName ? `${t('groups.league')} · ${activeLeagueName}` : t(`groups.${g}`));
  const label = (s: SectionDef) => t(`sections.${s.id}.label`);

  if (isLoading) return <PageSkeleton />;
  if (!user || !profile) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
        <p className="text-sm text-secondary">{t('signInToManage')}</p>
        <Link href="/login" className={btn.primary}>
          {t('goLogin')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const visible = SECTIONS.filter((s) => s.access === 'all' || (s.access === 'admin' && admin) || (s.access === 'staff' && isPlatformStaff));
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
          active ? 'bg-card-hover text-primary' : 'text-primary hover:bg-card-hover/60'
        }`}
      >
        <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-card-hover text-accent-text">
          <Icon className="h-4 w-4" />
          {Boolean(alerts[s.id]) && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-card" aria-label={t('toHandle')} />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{label(s)}</span>
          {withValue && summary[s.id] && <span className="sm:hidden block text-xs text-secondary truncate">{summary[s.id]}</span>}
        </span>
        {withValue && summary[s.id] && (
          <span className="hidden sm:block max-w-[45%] truncate text-xs text-secondary text-right">{summary[s.id]}</span>
        )}
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true" />
      </Link>
    );
  };

  const groupList = (withValue: boolean) => (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.title} className="space-y-1.5" aria-label={groupTitle(g.title)}>
          <h2 className="px-1 text-xs font-semibold text-muted truncate">{groupTitle(g.title)}</h2>
          <div className="bg-card rounded-2xl overflow-hidden divide-y divide-line">
            {g.items.map((s) => (
              <div key={s.id}>{row(s, withValue)}</div>
            ))}
            {/* Lingua e tema: si scelgono in una finestra, senza aprire una pagina */}
            {g.title === 'account' && (
              <>
                <LanguageSetting />
                <ThemeSetting />
                <BoardSetting />
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 pb-16">
      <header className="min-h-[2.5rem] flex items-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>
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
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent-text"
              aria-label={t('backAria')}
            >
              <ArrowLeft className="h-4 w-4" /> {t('title')}
            </Link>
            <div>
              <h2 id="settings-section-title" className="text-xl font-semibold text-primary">
                {label(current)}
              </h2>
              <p className="text-sm text-secondary mt-0.5">{t(`sections.${current.id}.description`)}</p>
            </div>

            {current.id === 'notifiche' ? (
              <NotificationGuide />
            ) : current.id === 'account' ? (
              <AccountSettings />
            ) : current.id === 'lega' ? (
              <LeaguePanel />
            ) : current.id === 'accessi' ? (
              <PlatformAccountsPanel />
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
