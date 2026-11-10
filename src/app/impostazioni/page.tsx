'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { NotificationGuide } from '@/components/NotificationGuide';
import { Settings } from 'lucide-react';

/**
 * Impostazioni dell'utente (menu a tendina dell'header → Impostazioni).
 * Sottosezione "Notifiche" per ogni utente collegato: attiva / disattiva sul dispositivo.
 */
export default function ImpostazioniPage() {
  const { user, profile } = useAuth();

  if (!user || !profile) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
        <p className="text-sm text-slate-400">Accedi per gestire le tue impostazioni.</p>
        <Link href="/login" className="px-5 py-2.5 bg-emerald-500 text-slate-950 font-black rounded-xl text-xs uppercase">
          Vai al login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 max-w-3xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-emerald-400" />
          Impostazioni
        </h1>
        <p className="text-xs text-slate-400 mt-1">Le tue preferenze per Club Soccer.</p>
      </div>

      <NotificationGuide />
    </div>
  );
}
