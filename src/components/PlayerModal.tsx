'use client';

import React, { useState, useEffect } from 'react';
import { Profile, StatCategory } from '@/types/database';
import { addStoredPlayer, updateStoredPlayer } from '@/lib/services/playerService';
import { saveProfileDoc } from '@/lib/firebase/firestoreService';
import { uploadPlayerAvatar } from '@/lib/firebase/storageService';
import { X, Upload, Save, UserPlus, Loader2 } from 'lucide-react';

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
  const [isGuest, setIsGuest] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [matchesWon, setMatchesWon] = useState<number>(0);
  const [matchesDrawn, setMatchesDrawn] = useState<number>(0);
  const [matchesLost, setMatchesLost] = useState<number>(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (playerToEdit) {
      setFullName(playerToEdit.full_name || '');
      setIsGuest(playerToEdit.is_guest || false);
      setAvatarUrl(playerToEdit.avatar_url || '');
      setMatchesWon(playerToEdit.matches_won ?? 0);
      setMatchesDrawn(playerToEdit.matches_drawn ?? 0);
      setMatchesLost(playerToEdit.matches_lost ?? 0);

      const initialStats: Record<string, number> = {};
      statCategories.forEach((cat) => {
        initialStats[cat.name] = Number(playerToEdit.stats?.[cat.name] ?? cat.default_value ?? 6);
      });
      setStats(initialStats);
    } else {
      setFullName('');
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

      try {
        const publicUrl = await uploadPlayerAvatar(playerToEdit?.id || 'new', file);
        if (publicUrl) {
          setAvatarUrl(publicUrl);
          setUploadingAvatar(false);
          return;
        }
      } catch (err) {
        console.warn('Storage upload fallback reader:', err);
      }

      // Fallback per preview locale usando FileReader
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarUrl(event.target?.result as string);
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Errore durante caricamento avatar:', err);
      setErrorMsg('Impossibile caricare l\'immagine.');
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
      setErrorMsg('Il nome del giocatore è obbligatorio.');
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
          avatar_url: avatarUrl || null,
          stats,
          overall_rating: calculatedOvr,
          matches_won: Math.max(0, Number(matchesWon) || 0),
          matches_drawn: Math.max(0, Number(matchesDrawn) || 0),
          matches_lost: Math.max(0, Number(matchesLost) || 0),
          updated_at: new Date().toISOString(),
        };

        // Salva subito nello store locale e Firestore
        updateStoredPlayer(updated);
        saveProfileDoc(updated);
        onSaved(updated);
      } else {
        // Crea nuovo giocatore ospite/manuale
        const newGuestId = `guest-${Date.now()}`;
        const newPlayer: Profile = {
          id: newGuestId,
          user_id: null,
          email: null,
          full_name: fullName.trim(),
          avatar_url: avatarUrl || null,
          role: 'user',
          is_guest: true,
          stats,
          overall_rating: calculatedOvr,
          matches_won: Math.max(0, Number(matchesWon) || 0),
          matches_drawn: Math.max(0, Number(matchesDrawn) || 0),
          matches_lost: Math.max(0, Number(matchesLost) || 0),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Salva subito nello store locale e Firestore
        addStoredPlayer(newPlayer);
        saveProfileDoc(newPlayer);
        onSaved(newPlayer);
      }

      onClose();
    } catch (err: unknown) {
      console.error('Submit player error:', err);
      const msg = err instanceof Error ? err.message : 'Errore nel salvataggio';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentOvr = calculateOvr();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              {playerToEdit ? <Save className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {playerToEdit ? 'Modifica Scheda Giocatore' : 'Crea Giocatore Manuale / Ospite'}
              </h2>
              <p className="text-xs text-slate-400">
                {playerToEdit ? 'Aggiorna voti e parametri da 1 a 10' : 'Aggiungi un compagno senza account Google'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Dati Base & Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-20 h-20 rounded-2xl bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-emerald-400">
                    {fullName.charAt(0).toUpperCase() || '⚽'}
                  </span>
                )}
              </div>
              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-emerald-400" />
                    <span className="text-[10px] text-white mt-1">Carica</span>
                  </>
                )}
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
                className="hidden"
              />
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome e Cognome / Soprannome
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Es. Mario Rossi"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>

              <div className="flex items-center justify-between bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Valutazione Generale (OVR):</span>
                <span className="font-mono text-sm font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  {currentOvr}
                </span>
              </div>
            </div>
          </div>

          {/* Storico Partite: Vittorie, Pareggi, Sconfitte */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Storico Partite (Vittorie / Pareggi / Sconfitte)
              </h3>
              <span className="text-[11px] text-slate-500">
                Totale: {Number(matchesWon || 0) + Number(matchesDrawn || 0) + Number(matchesLost || 0)} partite
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-2.5 text-center">
                <label className="block text-[11px] font-bold text-emerald-400 mb-1">
                  Vittorie (V)
                </label>
                <input
                  type="number"
                  min="0"
                  value={matchesWon}
                  onChange={(e) => setMatchesWon(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full text-center bg-slate-900 border border-emerald-500/30 rounded-lg py-1 text-emerald-300 font-mono font-bold text-base focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-2.5 text-center">
                <label className="block text-[11px] font-bold text-amber-400 mb-1">
                  Pareggi (P)
                </label>
                <input
                  type="number"
                  min="0"
                  value={matchesDrawn}
                  onChange={(e) => setMatchesDrawn(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full text-center bg-slate-900 border border-amber-500/30 rounded-lg py-1 text-amber-300 font-mono font-bold text-base focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-2.5 text-center">
                <label className="block text-[11px] font-bold text-rose-400 mb-1">
                  Sconfitte (S)
                </label>
                <input
                  type="number"
                  min="0"
                  value={matchesLost}
                  onChange={(e) => setMatchesLost(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full text-center bg-slate-900 border border-rose-500/30 rounded-lg py-1 text-rose-300 font-mono font-bold text-base focus:outline-none focus:border-rose-400"
                />
              </div>
            </div>
          </div>

          {/* Griglia Valutazioni Statistiche 1-10 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Statistiche Abilità (Scala da 1 a 10)
              </h3>
              <span className="text-[11px] text-slate-500">Trascina lo slider o digita</span>
            </div>

            <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
              {statCategories.map((cat) => {
                const val = stats[cat.name] ?? cat.default_value ?? 6;
                return (
                  <div key={cat.id || cat.name} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-semibold text-slate-300 truncate">
                      {cat.label || cat.name}
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={val}
                      onChange={(e) => handleStatChange(cat.name, parseInt(e.target.value, 10))}
                      className="flex-1 accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <span className="w-8 text-right font-mono font-bold text-sm text-emerald-400 bg-slate-800 px-1 py-0.5 rounded">
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isSubmitting || uploadingAvatar}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {playerToEdit ? 'Salva Modifiche' : 'Aggiungi Giocatore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
