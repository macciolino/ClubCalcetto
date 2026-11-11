'use client';

import React from 'react';
import { STAT_DETAILS, STAT_CANONICAL_ORDER } from '@/types/database';
import { X, Sparkles, Zap, Shield, Eye, Flame, Activity, Footprints, Target } from 'lucide-react';

interface StatsLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STAT_ICON_MAP: Record<string, React.ReactNode> = {
  VEL: <Zap className="h-5 w-5 text-amber-400" />,
  FIS: <Shield className="h-5 w-5 text-orange-400" />,
  RES: <Activity className="h-5 w-5 text-emerald-400" />,
  TIR: <Target className="h-5 w-5 text-rose-400" />,
  PAS: <Footprints className="h-5 w-5 text-cyan-400" />,
  DRI: <Flame className="h-5 w-5 text-purple-400" />,
  DIF: <Shield className="h-5 w-5 text-blue-400" />,
  VIS: <Eye className="h-5 w-5 text-indigo-400" />,
};

export function StatsLegendModal({ isOpen, onClose }: StatsLegendModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-safe bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        {/* Header Modale */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl ring-1 ring-emerald-500/30">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Legenda Parametri Ottagono Calcetto 5v5
              </h2>
              <p className="text-xs text-slate-400">
                Significato tattico degli 8 parametri ottimizzati per le partite di calcetto a 5.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Griglia delle 8 statistiche con spiegazioni */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {STAT_CANONICAL_ORDER.filter((k) => k !== 'Tecnica').map((statName) => {
              const detail = STAT_DETAILS[statName];
              if (!detail) return null;
              const icon = STAT_ICON_MAP[detail.code] || <Zap className="h-5 w-5 text-emerald-400" />;

              return (
                <div
                  key={detail.code}
                  className="bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 p-4 rounded-2xl space-y-2 transition-all hover:bg-slate-950"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                        {icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            {detail.code}
                          </span>
                          <span className="font-bold text-white text-sm">{detail.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block font-medium">
                          {detail.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed pt-1">
                    {detail.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl text-xs text-slate-300 flex items-start gap-3">
            <span className="text-lg">💡</span>
            <div>
              <strong className="text-white block mb-0.5">Come influiscono sul bilanciamento 5v5:</strong>
              L&apos;algoritmo calcola la media pesata di questi 8 valori per ogni giocatore, confrontando
              poi le combinazioni possibili di squadre per minimizzare lo scarto totale e bilanciare sia la
              fase difensiva che quella offensiva.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Chiudi Legenda
          </button>
        </div>
      </div>
    </div>
  );
}
