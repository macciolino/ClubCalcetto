'use client';

import { NumberInput } from '@/components/NumberInput';
import { getStatValue } from '@/lib/utils/statUtils';
import React, { useState, useEffect } from 'react';
import { Profile, StatCategory, FieldPosition, FIELD_POSITIONS, STAT_CANONICAL_ORDER } from '@/types/database';
import { addStoredPlayer, updateStoredPlayer } from '@/lib/services/playerService';
import { saveProfileDoc } from '@/lib/firebase/firestoreService';
import { photoToAvatarDataUrl } from '@/lib/utils/imageUtils';
import { Upload, Save, Loader2 } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { useTranslations } from 'next-intl';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerToEdit: Profile | null;
  statCategories: StatCategory[];
  onSaved: (savedPlayer: Profile) => void;
}

export function PlayerModal({
  isOpen,
  onClose,
  playerToEdit,
  statCategories,
  onSaved,
}: PlayerModalProps) {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState<FieldPosition>('Esterno');
  const [isGuest, setIsGuest] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [matchesWon, setMatchesWon] = useState<number>(0);
  const [matchesDrawn, setMatchesDrawn] = useState<number>(0);
  const [matchesLost, setMatchesLost] = useState<number>(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const t = useTranslations('playerModal');
  const tc = useTranslations('common');
  const tpc = useTranslations('playerCard');
  const labels = usePlayerLabels();

  // Ordina categorie secondo l'ordine canonico
  const sortedCategories = [...statCategories].sort((a, b) => {
    const idxA = STAT_CANONICAL_ORDER.indexOf(a.name as any);
    const idxB = STAT_CANONICAL_ORDER.indexOf(b.name as any);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    if (playerToEdit) {
      setFullName(playerToEdit.full_name || '');
      setPosition(playerToEdit.position || 'Esterno');
      setIsGuest(playerToEdit.is_guest || false);
      setAvatarUrl(playerToEdit.avatar_url || '');
      setMatchesWon(playerToEdit.matches_won ?? 0);
      setMatchesDrawn(playerToEdit.matches_drawn ?? 0);
      setMatchesLost(playerToEdit.matches_lost ?? 0);

      const initialStats: Record<string, number> = {};
      statCategories.forEach((cat) => {
        initialStats[cat.name] = Number(getStatValue(playerToEdit.stats, cat.name, cat.default_value ?? 6));
      });
      setStats(initialStats);
    } else {
      setFullName('');
      setPosition('Esterno');
      setIsGuest(true);
      setAvatarUrl('');
      setMatchesWon(0);
      setMatchesDrawn(0);
      setMatchesLost(0);

      const defaultStats: Record<string, number> = {};
      statCategories.forEach((cat) => {
        defaultStats[cat.name] = cat.default_value || 6;
      });
      setStats(defaultStats);
    }
    setErrorMsg('');
  }, [playerToEdit, statCategories, isOpen]);

  if (!isOpen) return null;

  const handleStatChange = (statName: string, value: number) => {
    setStats((prev) => ({
      ...prev,
      [statName]: Math.max(1, Math.min(10, value)),
    }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingAvatar(true);
      setErrorMsg('');

      setAvatarUrl(await photoToAvatarDataUrl(file));
      setUploadingAvatar(false);
    } catch (err) {
      console.error('Errore durante caricamento avatar:', err);
      setErrorMsg(err instanceof Error ? err.message : t('photoFailed'));
      setUploadingAvatar(false);
    }
  };

  const calculateOvr = (): number => {
    const values = Object.values(stats);
    if (values.length === 0) return 6.0;
    const sum = values.reduce((acc, curr) => acc + curr, 0);
    return Number((sum / values.length).toFixed(1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg(t('nameRequired'));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const calculatedOvr = calculateOvr();

      if (playerToEdit) {
        // Aggiorna giocatore esistente
        const updated: Profile = {
          ...playerToEdit,
          full_name: fullName.trim(),
          position,
          avatar_url: avatarUrl || null,
          stats,
          overall_rating: calculatedOvr,
          matches_won: Math.max(0, Number(matchesWon) || 0),
          matches_drawn: Math.max(0, Number(matchesDrawn) || 0),
          matches_lost: Math.max(0, Number(matchesLost) || 0),
          updated_at: new Date().toISOString(),
        };

        updateStoredPlayer(updated);
        saveProfileDoc(updated);
        onSaved(updated);
      } else {
        // Crea nuovo giocatore manuale / ospite (default role: 'player')
        const newGuestId = `guest-${Date.now()}`;
        const newPlayer: Profile = {
          id: newGuestId,
          user_id: null,
          email: null,
          full_name: fullName.trim(),
          avatar_url: avatarUrl || null,
          role: 'player',
          position,
          is_guest: true,
          stats,
          overall_rating: calculatedOvr,
          matches_won: Math.max(0, Number(matchesWon) || 0),
          matches_drawn: Math.max(0, Number(matchesDrawn) || 0),
          matches_lost: Math.max(0, Number(matchesLost) || 0),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        addStoredPlayer(newPlayer);
        saveProfileDoc(newPlayer);
        onSaved(newPlayer);
      }

      onClose();
    } catch (err: unknown) {
      console.error('Submit player error:', err);
      const msg = err instanceof Error ? err.message : t('saveFailed');
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentOvr = calculateOvr();

  return (
    <Sheet
      onClose={onClose}
      locked={isSubmitting}
      size="lg"
      height="tall"
      title={playerToEdit ? t('editTitle') : t('newTitle')}
      subtitle={playerToEdit ? t('editSubtitle') : t('newSubtitle')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isSubmitting} className={sheetBtn.secondary}>
            {tc('cancel')}
          </button>
          <button type="submit" form="player-form" disabled={isSubmitting || uploadingAvatar} className={sheetBtn.primary}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {playerToEdit ? t('saveChanges') : t('addPlayer')}
          </button>
        </>
      }
    >
      <form id="player-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {errorMsg && (
          <div className="lg:col-span-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-danger">{errorMsg}</div>
        )}

        {/* Colonna 1: chi è */}
        <div className="space-y-6">
          <section className="flex items-center gap-4">
            <div className="relative group flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-card-hover border-2 border-dashed border-line-strong flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-accent-text">{fullName.charAt(0).toUpperCase() || '⚽'}</span>
                )}
              </div>
              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity cursor-pointer rounded-2xl"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin text-accent-text" />
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-accent-text" />
                    <span className="text-[10px] text-primary mt-1">{t('upload')}</span>
                  </>
                )}
              </label>
              <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} className="hidden" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <label className="block">
                <span className="block text-xs font-medium text-secondary mb-1.5">{t('fullName')}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  className="w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                  required
                />
              </label>
              <p className="text-xs text-secondary">
                OVR <span className="ml-1 text-base font-bold text-primary tabular-nums">{currentOvr}</span>
              </p>
            </div>
          </section>

          <section className="space-y-1.5">
            <label htmlFor="player-position" className="block text-xs font-medium text-secondary">
              {t('position')}
            </label>
            <select
              id="player-position"
              value={position}
              onChange={(e) => setPosition(e.target.value as FieldPosition)}
              className="w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm focus:outline-none focus:border-accent transition-colors"
            >
              {FIELD_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {labels.position(pos)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">{t('positionHint')}</p>
          </section>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-medium text-secondary">{t('matches')}</h3>
              <span className="text-xs text-muted">
                {t('total', { n: Number(matchesWon || 0) + Number(matchesDrawn || 0) + Number(matchesLost || 0) })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  [tpc('won'), matchesWon, setMatchesWon, 'text-accent-text'],
                  [tpc('drawn'), matchesDrawn, setMatchesDrawn, 'text-warning'],
                  [tpc('lost'), matchesLost, setMatchesLost, 'text-danger'],
                ] as const
              ).map(([label, value, set, color]) => (
                <label key={label} className="block rounded-xl bg-app/60 border border-line p-2.5 text-center">
                  <span className={`block text-xs font-medium mb-1 ${color}`}>{label}</span>
                  <NumberInput
                    min={0}
                    value={value}
                    onValueChange={set}
                    className="w-full text-center bg-card border border-line rounded-lg py-1.5 text-primary font-semibold text-base tabular-nums focus:outline-none focus:border-accent"
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Colonna 2: parametri */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-medium text-secondary">{t('parameters')}</h3>
            <span className="text-xs text-muted">{t('dragHint')}</span>
          </div>
          <div className="space-y-4 rounded-xl bg-app/60 border border-line p-4">
            {sortedCategories.map((cat) => {
              const val = stats[cat.name] ?? cat.default_value ?? 6;
              return (
                <label key={cat.id || cat.name} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-secondary truncate">{labels.statName(cat.name)}</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={val}
                    onChange={(e) => handleStatChange(cat.name, parseInt(e.target.value, 10))}
                    className="flex-1 accent-emerald-500 h-2 cursor-pointer"
                  />
                  <span className="w-7 text-right font-semibold text-sm text-primary tabular-nums">{val}</span>
                </label>
              );
            })}
          </div>
        </section>
      </form>
    </Sheet>
  );
}
