'use client';

import { PageSkeleton } from '@/components/ui/Skeleton';
import { askConfirm } from '@/components/ui/Feedback';

import { getStatValue, computeMatchStats, EMPTY_MATCH_STATS } from '@/lib/utils/statUtils';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { FieldPosition, FIELD_POSITIONS, sortStatsByCanonicalOrder } from '@/types/database';
import { RadarChart } from '@/components/RadarChart';
import { StatBadge } from '@/components/StatBadge';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { useForms } from '@/lib/hooks/useForms';
import { formatForm } from '@/lib/utils/formUtils';
import { subscribeMatches } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { Match } from '@/types/database';
import { photoToAvatarDataUrl } from '@/lib/utils/imageUtils';
import {
  User,
  Save,
  Trophy,
  Check,
  Sparkles,
  Mail,
  ArrowRight,
  Camera,
  Loader2,
} from 'lucide-react';
import { btn, textLink } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';

export default function ProfiloPage() {
  const { user, profile, isAdmin, updateProfile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations('profile');
  const labels = usePlayerLabels();
  const [fullName, setFullName] = useState(profile?.full_name || t('playerFallback'));
  const [position, setPosition] = useState<FieldPosition>(profile?.position || 'Esterno');
  const categories = useStatCategories();
  const { forms } = useForms();
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
      setFullName(profile.full_name || t('playerFallback'));
      setPosition(profile.position || 'Esterno');
    }
  }, [profile]);

  if (!mounted) return <PageSkeleton />;

  if (!profile) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="p-4 bg-accent/15 text-accent-text rounded-2xl border border-accent/30">
          <User className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-bold text-primary">{t('loginTitle')}</h2>
        <p className="text-xs text-secondary max-w-sm">
          {t('loginText')}
        </p>
        <Link
          href="/login"
          className={btn.primary}
        >
          {t('goLogin')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const record = computeMatchStats(matches).get(profile.id) ?? EMPTY_MATCH_STATS;

  // Stato forma (ultime 3 partite, se attivato dall'admin): si aggiunge a ogni parametro e all'OVR
  const myForm = forms.get(profile.id) || 0;

  // Mappatura dinamica delle statistiche per includere in tempo reale ogni categoria attiva
  const profileStats: Record<string, number> = {};
  categories.forEach((cat) => {
    const base = getStatValue(profile?.stats, cat.name, cat.default_value ?? 6);
    profileStats[cat.name] = myForm !== 0 ? Math.max(1, Math.min(10, Math.round((base + myForm) * 10) / 10)) : base;
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
      setErrorMsg(err instanceof Error ? err.message : t('photoFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!(await askConfirm(t('confirmRemovePhoto')))) return;
    await updateProfile({ avatar_url: null });
  };

  // Salvataggio modifiche
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg(t('nameEmpty'));
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
    } catch {
      setErrorMsg(t('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Titolo della pagina (senza riquadro) */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>
          <p className="text-sm text-secondary max-w-xl leading-relaxed">{t('intro')}</p>
        </div>

        {saveSuccess && (
          <div className="px-4 py-2 bg-accent/20 border border-accent/40 text-accent-text rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="h-4 w-4 text-accent-text" />
            <span>{t('saved')}</span>
          </div>
        )}
      </header>

      {/* SCHEDA DATI PERSONALI & UPLOAD FOTO */}
      <form onSubmit={handleSaveProfile} className="bg-card border border-line rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Foto profilo */}
          <div className="flex flex-col items-center space-y-2">
            {profile.avatar_url && !profile.avatar_url.startsWith('data:image/svg') ? (
              <img
                src={profile.avatar_url}
                alt={t('photoAlt', { name: fullName })}
                referrerPolicy="no-referrer"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-4 ring-accent/40"
              />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-card-hover border-2 border-line-strong flex items-center justify-center font-bold text-3xl text-accent-text">
                {fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={handleImageUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-2 bg-card-hover hover:bg-line-strong text-primary font-bold rounded-xl text-xs border border-line-strong disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-accent-text" /> : <Camera className="h-4 w-4 text-accent-text" />}
              {profile.avatar_url ? t('changePhoto') : t('uploadPhoto')}
            </button>
            {profile.avatar_url && (
              <button type="button" onClick={handleRemovePhoto} className="text-[11px] text-muted hover:text-danger underline">
                {t('removePhoto')}
              </button>
            )}
          </div>

          {/* Sezione Dati Nome, Email e Ruolo */}
          <div className="flex-1 w-full space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-secondary mb-1.5">
                  {t('displayName')}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm font-semibold focus:outline-none focus:border-accent"
                  placeholder={t('namePlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-secondary mb-1.5">
                  {t('email')}
                </label>
                <div className="px-3.5 py-2.5 bg-app/60 border border-line rounded-xl text-secondary text-sm font-mono flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted" />
                  <span className="truncate">{profile.email || t('noGoogle')}</span>
                </div>
              </div>
            </div>

            {/* Posizione Tattica in Campo (Separata dal ruolo applicativo) */}
            <div>
              <label className="block text-xs font-bold text-secondary mb-1.5">
                {t('position')}
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as FieldPosition)}
                className="w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm font-semibold focus:outline-none focus:border-accent"
              >
                {FIELD_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {labels.position(pos)} ({labels.positionAbbr(pos)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">{t('platformRole')}</span>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                    isStrictAdmin
                      ? 'bg-amber-500/15 text-warning border border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {isStrictAdmin ? t('admin') : t('player')}
                </span>
                <StatBadge score={profile.overall_rating || 6.0} size="md" />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className={btn.primary}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t('save')}
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-danger rounded-xl text-xs">
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      </form>

      {/* SEZIONE STATISTICHE E BILANCIO PARTITE (AFFIANCATE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLONNA 1: OTTAGONO ABILITÀ STILE FIFA/PES */}
        <div className="bg-card border border-line rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent-text" />
                <h2 className="text-base font-bold text-primary">
                  {t('skills')}
                </h2>
              </div>
              <span className="text-xs font-mono font-bold text-warning bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                OVR {Math.round(Math.max(1, Math.min(10, (profile.overall_rating || 6.0) + myForm)) * 10)}
              </span>
            </div>
            <p className="text-xs text-secondary mt-2">
              {t('radarHint')}
            </p>
            {myForm > 0 && (
              <p className="mt-2 text-xs text-orange-700 dark:text-orange-300 bg-orange-500/10 border border-orange-400/30 rounded-xl p-2.5">
                🔥 {t.rich('inForm', { value: formatForm(myForm), delta: formatForm(myForm).slice(1), b: (c) => <strong>{c}</strong> })}
              </p>
            )}
            {myForm < 0 && (
              <p className="mt-2 text-xs text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-400/30 rounded-xl p-2.5">
                ❄️ {t.rich('outOfForm', { value: formatForm(myForm), delta: formatForm(myForm).slice(1), b: (c) => <strong>{c}</strong> })}
              </p>
            )}
          </div>

          <div className="py-2 flex justify-center">
            <RadarChart stats={profileStats} size={220} color="emerald" showLabels={true} />
          </div>

          {/* Dettaglio barre statistiche in ordine canonico fisso */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line">
            {sortStatsByCanonicalOrder(Object.keys(profileStats)).map((statName) => {
              const val = profileStats[statName] ?? 6;
              return (
                <div key={statName} className="bg-app/70 border border-line p-2 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-secondary">{labels.statName(statName)}</span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      val >= 8 ? 'text-accent-text' : val >= 6 ? 'text-primary' : 'text-danger'
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
        <div className="bg-card border border-line rounded-2xl p-5 space-y-5">
          <div className="border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-warning" />
              <h2 className="text-base font-bold text-primary">{t('myStats')}</h2>
            </div>
            <p className="text-xs text-secondary mt-2">
              {t('statsHint', { count: record.played })}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-accent/10 border border-accent/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-bold text-accent-text">{t('won')}</div>
              <div className="text-3xl font-bold text-accent-text font-mono">{record.won}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-bold text-warning">{t('drawn')}</div>
              <div className="text-3xl font-bold text-warning font-mono">{record.drawn}</div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-bold text-danger">{t('lost')}</div>
              <div className="text-3xl font-bold text-danger font-mono">{record.lost}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-app/80 border border-line p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-bold text-secondary">{t('goals')}</div>
              <div className="text-3xl font-bold text-primary font-mono">{record.goals}</div>
            </div>
            <div className="bg-app/80 border border-line p-3.5 rounded-2xl space-y-1">
              <div className="text-xs font-bold text-secondary">{t('mvp')}</div>
              <div className="text-3xl font-bold text-warning font-mono">{record.mvp}</div>
            </div>
          </div>

          <Link href="/history" className={`${textLink} w-full justify-center`}>
            {t('seeLeaderboard')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/settings?sezione=notifiche"
          className="flex items-center justify-between gap-3 bg-card hover:bg-card-hover/80 rounded-2xl p-4 text-sm"
        >
          <span>
            <span className="block font-semibold text-primary">{t('notifications')}</span>
            <span className="text-xs text-secondary">{t('notificationsHint')}</span>
          </span>
          <span className="text-muted" aria-hidden="true">›</span>
        </Link>
        <Link
          href="/settings?sezione=account"
          className="flex items-center justify-between gap-3 bg-card hover:bg-card-hover/80 rounded-2xl p-4 text-sm"
        >
          <span>
            <span className="block font-semibold text-primary">{t('account')}</span>
            <span className="text-xs text-secondary">{t('accountHint')}</span>
          </span>
          <span className="text-muted" aria-hidden="true">›</span>
        </Link>
      </div>
    </div>
  );
}
