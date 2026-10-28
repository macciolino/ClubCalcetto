'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { getStoredPlayers } from '@/lib/services/playerService';
import { Profile } from '@/types/database';
import { 
  ShieldCheck, 
  Users, 
  Trophy, 
  Sparkles, 
  Loader2, 
  ArrowRight, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Lock,
  UserCheck,
  Mail
} from 'lucide-react';

export default function LoginPage() {
  const { 
    signInWithGoogle, 
    user, 
    profile, 
    isAdmin, 
    loginAsMarcoAdmin, 
    loginAsGuestUser, 
    loginAsPlayer,
    loginWithEmail,
    signOut 
  } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [playersList, setPlayersList] = useState<Profile[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLocal =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.search.includes('marco=true') ||
        window.location.search.includes('dev=true');
      setIsLocalhost(isLocal);
      setPlayersList(getStoredPlayers());
    }
  }, []);

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
          'Questo dominio non è ancora autorizzato su Firebase Console. Aggiungi il tuo dominio (es. *.vercel.app) in Firebase Console -> Authentication -> Settings -> Authorized Domains, oppure utilizza l\'accesso rapido sottostante!'
        );
      } else if (
        msg.toLowerCase().includes('popup-closed-by-user') ||
        msg.toLowerCase().includes('cancelled-popup-request')
      ) {
        // Finestra chiusa dall'utente, nessun errore grave
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    loginWithEmail(emailInput.trim(), nameInput.trim() || undefined);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center py-6 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
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
              Piattaforma per la partita settimanale tra amici
            </p>
          </div>
        </div>

        {/* Notifica sessione attiva se presente */}
        {profile && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div className="text-xs">
                  <span className="text-slate-400">Collegato come: </span>
                  <span className="text-white font-bold">{profile.full_name}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {isAdmin ? '★ Admin' : 'User'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-[11px] text-rose-400 hover:text-rose-300 underline font-semibold"
              >
                Cambia
              </button>
            </div>
            <div className="flex gap-2">
              <Link
                href="/presenze"
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md"
              >
                <span>Vai alle Presenze</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold rounded-xl text-xs transition-colors"
                >
                  <span>Pannello Admin</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Box Caratteristiche Chiave */}
        <div className="grid grid-cols-1 gap-2 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <Users className="h-3.5 w-3.5" />
            </div>
            <span>
              <strong>Presenze Real-Time:</strong> 10 Titolari e Waitlist
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <Trophy className="h-3.5 w-3.5" />
            </div>
            <span>
              <strong>Squadre Eque:</strong> Algoritmo 5v5 con statistiche FIFA
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="p-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <span>
              <strong>Super Admin:</strong> <span className="text-emerald-400 font-bold">macciolino84@gmail.com</span> (Marco B.)
            </span>
          </div>
        </div>

        {/* Form di Login */}
        <div className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-2xl text-xs space-y-1 animate-in fade-in">
              <div className="font-bold flex items-center gap-1.5 text-rose-400">
                <span>⚠️ Avviso di Accesso</span>
              </div>
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* 1. Pulsante Google (Firebase) */}
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
            <span>Continua con Google</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">oppure</span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* 2. Accesso Diretto Seleziona Giocatore dalla Lista (Super comodo per gli amici da cellulare!) */}
          <div>
            <button
              type="button"
              onClick={() => setShowPlayerPicker((prev) => !prev)}
              className="w-full flex items-center justify-between py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-all border border-slate-700"
            >
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-400" />
                <span>Seleziona il tuo nome dalla rosa amici</span>
              </span>
              {showPlayerPicker ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showPlayerPicker && (
              <div className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto space-y-1">
                {playersList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => loginAsPlayer(p)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-800 text-left transition-colors text-xs text-white group cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.avatar_url?.startsWith('http') ? '👤' : (p.avatar_url || '⚽')}</span>
                      <span className="font-semibold group-hover:text-emerald-400 transition-colors">{p.full_name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded">
                      {p.role === 'admin' || p.email?.includes('macciolino84') ? 'Admin' : 'Giocatore'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Accesso Diretto con Email / Nome */}
          <form onSubmit={handleEmailSubmit} className="space-y-2 pt-1">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="La tua email (es. mario@...)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors shrink-0 cursor-pointer"
              >
                Accedi
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500">
              Inserendo <strong>macciolino84@gmail.com</strong> si accede come <strong>Super Admin</strong>.
            </p>
          </form>

          {/* Accesso Riservato Sviluppatore / Marco B. (Visibile in localhost o con dev panel) */}
          {isLocalhost && (
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowDevPanel((prev) => !prev)}
                className="w-full flex items-center justify-between py-1.5 px-3 text-[11px] text-slate-500 hover:text-slate-300 font-semibold rounded-lg hover:bg-slate-800/40 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-amber-400" />
                  Accesso Rapido Riservato (Solo per Marco)
                </span>
                {showDevPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showDevPanel && (
                <div className="mt-2.5 p-3 bg-slate-950/80 border border-amber-500/20 rounded-2xl space-y-2 animate-in fade-in">
                  <button
                    type="button"
                    onClick={loginAsMarcoAdmin}
                    className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>👑 Entra come Marco B. (Admin Completo)</span>
                  </button>

                  <button
                    type="button"
                    onClick={loginAsGuestUser}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-slate-400" />
                    <span>Entra come Giocatore Semplice (User)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-800 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>ClubCalcetto 5v5 con Firebase Cloud Firestore</span>
          </div>
        </div>
      </div>
    </div>
  );
}
