'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { 
  ShieldCheck, 
  Users, 
  Trophy, 
  Sparkles, 
  Loader2, 
  ArrowRight, 
  CheckCircle2, 
  LogOut
} from 'lucide-react';

export default function LoginPage() {
  const { signInWithGoogle, profile, isAdmin, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error('Login error:', err);
      const msg = err instanceof Error ? err.message : 'Errore durante il login con Google';
      if (
        msg.toLowerCase().includes('unauthorized-domain') ||
        msg.toLowerCase().includes('auth/unauthorized-domain')
      ) {
        setErrorMessage(
          'Questo dominio non è ancora autorizzato su Firebase Console. Aggiungi il tuo dominio (es. *.vercel.app) in Firebase Console -> Authentication -> Settings -> Authorized Domains.'
        );
      } else if (
        msg.toLowerCase().includes('popup-closed-by-user') ||
        msg.toLowerCase().includes('cancelled-popup-request')
      ) {
        // Nessun messaggio di errore se l'utente ha solo chiuso la finestra
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-7 relative overflow-hidden">
        {/* Glow Effetto Sfondo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Intestazione e Logo */}
        <div className="text-center space-y-3 relative">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-400 text-slate-950 shadow-xl shadow-emerald-500/30">
            <span className="text-3xl">⚽</span>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Club<span className="text-emerald-400">Calcetto</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
              Piattaforma ufficiale per la partita settimanale 5v5
            </p>
          </div>
        </div>

        {/* Notifica sessione attiva se l'utente è già loggato */}
        {profile ? (
          <div className="p-5 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl space-y-4">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div className="text-xs">
                  <span className="text-slate-400">Attualmente collegato: </span>
                  <div className="text-white font-bold text-sm">{profile.full_name}</div>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {isAdmin ? '★ Super Amministratore' : 'Giocatore'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-semibold p-1.5 hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
                title="Disconnetti"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Esci</span>
              </button>
            </div>

            {/* Navigazione rapida per chi è già loggato */}
            <div className="flex flex-col gap-2 pt-1">
              <Link
                href="/presenze"
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md hover:scale-[1.01]"
              >
                <span>Vai alle Presenze (Pagina Utenti)</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/giocatori"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors"
                >
                  <Users className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Rosa Giocatori</span>
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold rounded-xl text-xs transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                    <span>Pannello Admin</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Se non collegato: SOLO Accesso Google */
          <div className="space-y-4">
            {errorMessage && (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-2xl text-xs space-y-1 animate-in fade-in">
                <div className="font-bold flex items-center gap-1.5 text-rose-400">
                  <span>⚠️ Errore di Accesso</span>
                </div>
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            )}

            {/* UNICO PULSANTE DI LOGIN: GOOGLE AUTH */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl text-sm transition-all shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Accedi con Google</span>
            </button>

            <p className="text-[11px] text-center text-slate-400 leading-relaxed px-2">
              L&apos;accesso alla piattaforma avviene <strong>esclusivamente tramite account Google</strong>. L&apos;indirizzo <strong>macciolino84@gmail.com</strong> accede come Super Admin, tutti gli altri amici accedono come Giocatori.
            </p>
          </div>
        )}

        {/* Box Caratteristiche Chiave */}
        <div className="grid grid-cols-1 gap-2.5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <Users className="h-3.5 w-3.5" />
            </div>
            <span>
              <strong>Presenze Live:</strong> Quorum 10 titolari e subentro waitlist automatico
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <Trophy className="h-3.5 w-3.5" />
            </div>
            <span>
              <strong>Squadre Eque:</strong> Bilanciamento deterministico con statistiche FIFA
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <span>
              <strong>Super Amministratore:</strong> <span className="text-emerald-400 font-bold">macciolino84@gmail.com</span> (Marco B.)
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>ClubCalcetto 5v5 con Firebase Google Authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
}
