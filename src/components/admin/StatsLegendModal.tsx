'use client';

import React from 'react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { STAT_DETAILS, STAT_CANONICAL_ORDER } from '@/types/database';
import { Zap, Shield, Eye, Flame, Activity, Footprints, Target } from 'lucide-react';

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
    <Sheet
      onClose={onClose}
      size="lg"
      height="tall"
      title="Legenda dei parametri"
      subtitle="Cosa misura ognuno degli 8 parametri dell'ottagono"
      footer={
        <button type="button" onClick={onClose} className={sheetBtn.secondary}>
          Chiudi
        </button>
      }
    >
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
    </Sheet>
  );
}
