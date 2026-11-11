'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { NotificationGuide } from '@/components/NotificationGuide';
import { AdminSection, AdminSections } from '@/components/admin/AdminSections';
import {
  Settings,
  Bell,
  Trophy,
  Users,
  Megaphone,
  Ruler,
  BarChart3,
  Lock,
  ChevronRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

type SectionId = 'notifiche' | AdminSection;

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ElementType;
  access: 'all' | 'admin' | 'super';
}

/** Sections of Impostazioni, in menu order. The admin ones contain what used to be the /admin page. */
const SECTIONS: SectionDef[] = [
  { id: 'notifiche', label: 'Notifiche', description: 'Attiva o disattiva le notifiche su questo dispositivo', icon: Bell, access: 'all' },
  { id: 'partita', label: 'Partita della settimana', description: 'Giorno ufficiale, cassa e pagamenti, chiusura partita', icon: Trophy, access: 'admin' },
  { id: 'rosa', label: 'Rosa giocatori', description: 'Elenco, ruoli, ospiti e schede dei giocatori', icon: Users, access: 'admin' },
  { id: 'notifiche-club', label: 'Notifiche del club', description: 'Chi riceve le notifiche, prova, telefoni degli admin', icon: Megaphone, access: 'admin' },
  { id: 'regole', label: 'Regole partita', description: 'Campi sportivi, blocco ritiri, costo e orario', icon: Ruler, access: 'admin' },
  { id: 'parametri', label: 'Parametri e forma', description: 'Parametri dei giocatori, Stato forma e portiere', icon: BarChart3, access: 'admin' },
  { id: 'account', label: 'Account chiusi', description: 'Account disattivati e motivi di chi lascia', icon: Lock, access: 'super' },
];

function SettingsContent() {
  const { user, profile, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const params = useSearchParams();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
      </div>
    );
  }
  if (!user || !profile) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
        <p className="text-sm text-slate-400">Accedi per gestire le tue impostazioni.</p>
        <Link href="/login" className="px-5 py-2.5 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs">
          Vai al login
        </Link>
      </div>
    );
  }

  const admin = isAdmin || profile.role === 'admin';
  const visible = SECTIONS.filter((s) => s.access === 'all' || (s.access === 'admin' && admin) || (s.access === 'super' && isSuperAdmin));
  const requested = visible.find((s) => s.id === params.get('sezione'));
  // Su PC senza sezione scelta si apre la prima; su telefono si vede l'elenco
  const current = requested || visible[0];
  const groups = [
    { title: 'Personali', items: visible.filter((s) => s.access === 'all') },
    { title: 'Amministrazione', items: visible.filter((s) => s.access !== 'all') },
  ].filter((g) => g.items.length > 0);

  const menu = (
    <nav aria-label="Sezioni delle impostazioni" className="space-y-4">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.title}</p>
          {g.items.map((s) => {
            const Icon = s.icon;
            const active = s.id === current.id;
            return (
              <Link
                key={s.id}
                href={`/impostazioni?sezione=${s.id}`}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  active ? 'md:bg-emerald-500 md:text-slate-950 text-slate-200' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'md:text-slate-950 text-emerald-400' : 'text-emerald-400'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{s.label}</span>
                  <span className="block md:hidden text-[11px] font-normal text-slate-500 truncate">{s.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-600 md:hidden" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="space-y-6 pb-16">
      <header className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Impostazioni</h1>
        <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
          {admin ? `Club Soccer - ${profile.full_name}` : 'Le tue preferenze per Club Soccer.'}
        </p>
      </header>

      <div className="md:grid md:grid-cols-[240px_1fr] md:gap-6 md:items-start">
        {/* Elenco sezioni: colonna a sinistra su PC; su telefono solo finché non se ne apre una */}
        <aside className={`bg-slate-900 border border-slate-800 rounded-2xl p-2 md:sticky md:top-36 ${requested ? 'hidden md:block' : ''}`}>
          {menu}
        </aside>

        <section className={`space-y-4 min-w-0 ${requested ? '' : 'hidden md:block'}`} aria-labelledby="settings-section-title">
          <div className="flex items-center gap-3">
            <Link
              href="/impostazioni"
              className="md:hidden flex items-center gap-1 text-xs font-bold text-emerald-400"
              aria-label="Torna all'elenco delle impostazioni"
            >
              <ArrowLeft className="h-4 w-4" /> Impostazioni
            </Link>
          </div>
          <div>
            <h2 id="settings-section-title" className="text-lg font-bold text-white">
              {current.label}
            </h2>
            <p className="text-xs text-slate-400">{current.description}</p>
          </div>

          {current.id === 'notifiche' ? <NotificationGuide /> : <AdminSections section={current.id} />}
        </section>
      </div>
    </div>
  );
}

export default function ImpostazioniPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
