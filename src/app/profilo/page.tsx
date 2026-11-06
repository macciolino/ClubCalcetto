'use client';

import { getStatValue } from '@/lib/utils/statUtils';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { FieldPosition, FIELD_POSITIONS, FIELD_POSITION_ABBR, sortStatsByCanonicalOrder } from '@/types/database';
import { RadarChart } from '@/components/RadarChart';
import { StatBadge } from '@/components/StatBadge';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { subscribeMatches } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { Match } from '@/types/database';
import { NotificationGuide } from '@/components/NotificationGuide';
import { photoToAvatarDataUrl } from '@/lib/utils/imageUtils';
import { 
  User, 
  Upload, 
  Save, 
  Trophy, 
  Swords, 
  Check, 
  Sparkles, 
  ShieldCheck, 
  Mail, 
  ArrowLeft,
  Camera,
  Percent,
  Flame,
  Loader2
} from 'lucide-react';

export default function ProfiloPage() {
  const { user, profile, isAdmin, updateProfile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || 'Giocatore');
  const [position, setPosition] = useState<FieldPosition>(profile?.position || 'Esterno');
  const categories = useStatCategories();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Statistiche globali calcolate dalle partite archiviate (le stesse dello Storico)
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeMatches((list) => setMatches(list.filter((m) => m.status === 'completed')));
    return () => unsub();
  }, []);

  const isStrictAdmin = Boolean(mounted && user && (profile?.role === 'admin' || isAdmin));

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || 'Giocatore');
      setPosition(profile.position || 'Esterno');
    }
  }, [profile]);


  if (!mounted) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Caricamento profilo...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="p-4 bg-emerald-500/15 text-emerald-400 rounded-3xl border border-emerald-500/30">
          <User className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-bold text-white">Effettua il Login</h2>
        <p className="text-xs text-slate-400 max-w-sm">
          Per visualizzare e modificare il tuo profilo personale, accedi con il tuo account Google.
        </p>
        <Link
          href="/login"
          className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg transition-all"
        >
          Vai al Login
        </Link>
      </div>
    );
  }

  const record = (() => {
    let won = 0, drawn = 0, lost = 0, goals = 0, mvp = 0;
    for (const m of matches) {
      const w = m.score_white ?? 0;
      const b = m.score_black ?? 0;
      const inWhite = (m.team_white || []).some((p) => p.id === profile.id);
      const inBlack = (m.team_black || []).some((p) => p.id === profile.id);
      if (inWhite || inBlack) {
        if (w === b) drawn += 1;
        else if (inWhite === w > b) won += 1;
        else lost += 1;
      }
      goals += (m.scorers || []).filter((s) => s.player_id === profile.id).reduce((acc, s) => acc + (s.goals || 0), 0);
      if (m.mvp_player_id === profile.id) mvp += 1;
    }
    return { won, drawn, lost, goals, mvp, total: won + drawn + lost };
  })();

  // Mappatura dinamica delle statistiche per includere in tempo reale ogni categoria attiva
  const profileStats: Record<string, number> = {};
  categories.forEach((cat) => {
    profileStats[cat.name] = getStatValue(profile?.stats, cat.name, cat.default_value ?? 6);
  });

  // Foto profilo: solo una foto scelta dal giocatore (niente immagini preimpostate), rimpicciolita e salvata nel profilo
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploading(true);
    setErrorMsg('');
    try {
      const dataUrl = await photoToAvatarDataUrl(file);
      await updateProfile({ avatar_url: dataUrl });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Impossibile caricare la foto.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!confirm('Vuoi togliere la tua foto?')) return;
    await updateProfile({ avatar_url: null });
  };

  // Salvataggio modifiche
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Il nome non può essere vuoto.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      await updateProfile({
        full_name: fullName.trim(),
        position,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setErrorMsg('Errore durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Header Pagina */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/presenze"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
            title="Torna alle presenze"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <User className="h-6 w-6 text-emerald-400" />
              Il Mio Profilo Giocatore
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              I tuoi dati, le tue abilità e le tue statistiche di tutte le partite archiviate.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>Profilo aggiornato con successo!</span>
          </div>
        )}
      </div>

      {/* SCHEDA DATI PERSONALI & UPLOAD FOTO */}
      <form onSubmit={handleSaveProfile} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Foto profilo */}
          <div className="flex flex-col items-center space-y-2">
            {profile.avatar_url && !profile.avatar_url.startsWith('data:image/svg') ? (
              <img
                src={profile.avatar_url}
                alt={`Foto di ${fullName}`}
                referrerPolicy="no-referrer"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover ring-4 ring-emerald-500/40 shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-3xl text-emerald-400 shadow-xl">
                {fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={handleImageUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> : <Camera className="h-4 w-4 text-emerald-400" />}
              {profile.avatar_url ? 'Cambia foto' : 'Carica la tua foto'}
            </button>
            {profile.avatar_url && (
              <button type="button" onClick={handleRemovePhoto} className="text-[11px] text-slate-500 hover:text-rose-400 underline">
                Togli foto
              </button>
            )}
          </div>

          {/* Sezione Dati Nome, Email e Ruolo */}
          <div className="flex-1 w-full space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nome Giocatore Visualizzato
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm font-semibold focus:outline-none focus:border-emerald-500"
                  placeholder="Il tuo nome in campo"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Email Account
                </label>
                <div className="px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-400 text-sm font-mono flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <span className="truncate">{profile.email || 'Nessun account Google'}</span>
                </div>
              </div>
            </div>

            {/* Posizione Tattica in Campo (Separata dal ruolo applicativo) */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Posizione Tattica Preferita (Campetto & Rombo 1-1-2-1)
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as FieldPosition)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm font-semibold focus:outline-none focus:border-emerald-500"
              >
                {FIELD_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos} ({FIELD_POSITION_ABBR[pos]})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Ruolo Piattaforma:</span>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    isStrictAdmin
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {isStrictAdmin ? '★ Amministratore' : 'Giocatore'}
                </span>
                <StatBadge score={profile.overall_rating || 6.0} size="md" />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salva Modifiche
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      </form>

      {/* SEZIONE STATISTICHE E BILANCIO PARTITE (AFFIANCATE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLONNA 1: OTTAGONO ABILITÀ STILE FIFA/PES */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                <h2 className="text-base font-black text-white uppercase tracking-wider">
                  Le Mie Abilità Tecniche
                </h2>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                OVR {Math.round((profile.overall_rating || 6.0) * 10)}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Poligono radar ottagonale generato sui tuoi 8 attributi calcistici.
            </p>
          </div>

          <div className="py-2 flex justify-center">
            <RadarChart stats={profileStats} size={220} color="emerald" showLabels={true} />
          </div>

          {/* Dettaglio barre statistiche in ordine canonico fisso */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
            {sortStatsByCanonicalOrder(Object.keys(profileStats)).map((statName) => {
              const val = profileStats[statName] ?? 6;
              return (
                <div key={statName} className="bg-slate-950/70 border border-slate-800 p-2 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300">{statName}</span>
                  <span
                    className={`text-xs font-mono font-black ${
                      val >= 8 ? 'text-emerald-400' : val >= 6 ? 'text-white' : 'text-rose-400'
                    }`}
                  >
                    {val}/10
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLONNA 2: LE MIE STATISTICHE GLOBALI */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-black text-white uppercase tracking-wider">Le Mie Statistiche</h2>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Totali di tutte le partite archiviate ({record.total} giocate).
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">Vinte</div>
              <div className="text-3xl font-black text-emerald-300 font-mono">{record.won}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-amber-400 uppercase tracking-wider">Pareggiate</div>
              <div className="text-3xl font-black text-amber-300 font-mono">{record.drawn}</div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-rose-400 uppercase tracking-wider">Perse</div>
              <div className="text-3xl font-black text-rose-300 font-mono">{record.lost}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-slate-300 uppercase tracking-wider">⚽ Gol segnati</div>
              <div className="text-3xl font-black text-white font-mono">{record.goals}</div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-slate-300 uppercase tracking-wider">★ MVP</div>
              <div className="text-3xl font-black text-amber-300 font-mono">{record.mvp}</div>
            </div>
          </div>

          <Link href="/history" className="block text-center text-xs text-emerald-400 underline">
            Vedi la classifica completa nello Storico
          </Link>
        </div>
      </div>

      <NotificationGuide />
    </div>
  );
}
