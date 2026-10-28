'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { RadarChart } from '@/components/RadarChart';
import { StatBadge } from '@/components/StatBadge';
import { getPlayerMatchRecord } from '@/lib/services/playerService';
import { getStoredCategories } from '@/lib/services/statCategoryService';
import { uploadPlayerAvatar } from '@/lib/firebase/storageService';
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

const PRESET_AVATARS = ['⚽', '🧤', '🏃', '🥇', '🦁', '⚡', '👑', '🎯'];

export default function ProfiloPage() {
  const { user, profile, isAdmin, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || 'Giocatore');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [categories, setCategories] = useState(() => getStoredCategories());
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || 'Giocatore');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  useEffect(() => {
    const handleCategoriesChanged = () => {
      setCategories(getStoredCategories());
    };
    window.addEventListener('clubcalcetto_categories_changed', handleCategoriesChanged);
    return () => {
      window.removeEventListener('clubcalcetto_categories_changed', handleCategoriesChanged);
    };
  }, []);

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

  const record = getPlayerMatchRecord(profile);

  // Mappatura dinamica delle statistiche per includere in tempo reale ogni categoria attiva
  const profileStats: Record<string, number> = {};
  categories.forEach((cat) => {
    profileStats[cat.name] = profile?.stats?.[cat.name] ?? cat.default_value ?? 6;
  });

  // Caricamento immagine dal dispositivo
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg('');

    try {
      // 1. Prova upload su Firebase Storage se configurato
      try {
        const publicUrl = await uploadPlayerAvatar(profile.id, file);
        if (publicUrl) {
          setAvatarUrl(publicUrl);
          await updateProfile({ avatar_url: publicUrl });
          setIsUploading(false);
          return;
        }
      } catch (storageErr) {
        console.warn('Firebase Storage upload warning, uso fallback base64:', storageErr);
      }

      // 2. Fallback istantaneo FileReader (Base64) per visualizzazione locale persistente
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        setAvatarUrl(base64Url);
        await updateProfile({ avatar_url: base64Url });
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      console.warn('Fallback caricamento immagine:', err);
      setErrorMsg('Impossibile caricare l\'immagine.');
      setIsUploading(false);
    }
  };

  // Selezione avatar preset rapido
  const handleSelectPresetAvatar = async (emoji: string) => {
    // Genera un avatar SVG data url con emoji
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f172a"/><text x="50%" y="55%" font-size="50" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    setAvatarUrl(dataUrl);
    await updateProfile({ avatar_url: dataUrl });
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
        avatar_url: avatarUrl || null,
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
              Personalizza la tua immagine profilo e analizza le tue statistiche e il record partite.
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
          {/* Sezione Avatar & Upload */}
          <div className="flex flex-col items-center space-y-3">
            <div className="relative group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover ring-4 ring-emerald-500/40 shadow-xl"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-3xl text-emerald-400 shadow-xl">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Tasto Camera Upload Sovrimpresso */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 bg-slate-950/60 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                ) : (
                  <>
                    <Camera className="h-6 w-6 text-emerald-400 mb-1" />
                    <span>Cambia Foto</span>
                  </>
                )}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-slate-700"
            >
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
              <span>Carica Foto</span>
            </button>

            {/* Scelta rapida emoji avatar */}
            <div className="flex items-center gap-1">
              {PRESET_AVATARS.slice(0, 4).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectPresetAvatar(emoji)}
                  className="h-7 w-7 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-sm cursor-pointer transition-colors"
                  title={`Imposta avatar ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Ruolo Piattaforma:</span>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {isAdmin ? '★ Amministratore' : 'Giocatore'}
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

          {/* Dettaglio barre statistiche */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
            {Object.entries(profileStats).map(([statName, val]) => (
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
            ))}
          </div>
        </div>

        {/* COLONNA 2: TABELLA RECORD PARTITE (VITTORIE, PAREGGI, SCONFITTE) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                <h2 className="text-base font-black text-white uppercase tracking-wider">
                  Record Partite & Palmarès
                </h2>
              </div>
              <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-md">
                {record.winRate}% Win Rate
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Statistiche storiche sul rendimento nelle partite settimanali di calcetto.
            </p>
          </div>

          {/* Box Vittorie / Pareggi / Sconfitte */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">Vittorie</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono">
                {record.won}
              </div>
              <div className="text-[10px] text-emerald-400/80 font-semibold">+3 pt cad.</div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-amber-400 uppercase tracking-wider">Pareggi</div>
              <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                {record.drawn}
              </div>
              <div className="text-[10px] text-amber-400/80 font-semibold">+1 pt cad.</div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-black text-rose-400 uppercase tracking-wider">Sconfitte</div>
              <div className="text-2xl sm:text-3xl font-black text-rose-300 font-mono">
                {record.lost}
              </div>
              <div className="text-[10px] text-rose-400/80 font-semibold">0 pt</div>
            </div>
          </div>

          {/* Tabella Riassuntiva Bilancio */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Partite Disputate Totali:</span>
              <span className="font-mono font-bold text-white text-sm">{record.total} partite</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Punti Classifica Conquistati:</span>
              <span className="font-mono font-bold text-amber-400 text-sm">{record.points} punti</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Media Punti a Partita:</span>
              <span className="font-mono font-bold text-emerald-400">
                {record.total > 0 ? (record.points / record.total).toFixed(2) : '0.00'} pt/match
              </span>
            </div>

            {/* Barra Visuale Rapporto V / P / S */}
            {record.total > 0 && (
              <div className="pt-2">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Distribuzione Esiti</span>
                  <span>{record.winRate}% V / {Math.round((record.drawn / record.total) * 100)}% P / {Math.round((record.lost / record.total) * 100)}% S</span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${(record.won / record.total) * 100}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Vittorie: ${record.won}`}
                  />
                  <div
                    style={{ width: `${(record.drawn / record.total) * 100}%` }}
                    className="bg-amber-400 h-full"
                    title={`Pareggi: ${record.drawn}`}
                  />
                  <div
                    style={{ width: `${(record.lost / record.total) * 100}%` }}
                    className="bg-rose-500 h-full"
                    title={`Sconfitte: ${record.lost}`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
