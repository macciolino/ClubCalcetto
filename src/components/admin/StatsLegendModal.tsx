'use client';

import React from 'react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { STAT_DETAILS, STAT_CANONICAL_ORDER } from '@/types/database';
import { Zap, Shield, Eye, Flame, Activity, Footprints, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';

interface StatsLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STAT_ICON_MAP: Record<string, React.ReactNode> = {
  VEL: <Zap className="h-5 w-5 text-warning" />,
  FIS: <Shield className="h-5 w-5 text-orange-700 dark:text-orange-400" />,
  RES: <Activity className="h-5 w-5 text-accent-text" />,
  TIR: <Target className="h-5 w-5 text-danger" />,
  PAS: <Footprints className="h-5 w-5 text-cyan-400" />,
  DRI: <Flame className="h-5 w-5 text-purple-400" />,
  DIF: <Shield className="h-5 w-5 text-blue-700 dark:text-blue-400" />,
  VIS: <Eye className="h-5 w-5 text-indigo-700 dark:text-indigo-400" />,
};

const STAT_IDS: Record<string, string> = {
  Velocità: 'velocita',
  Fisico: 'fisico',
  Resistenza: 'resistenza',
  Tiro: 'tiro',
  Passaggio: 'passaggio',
  Dribbling: 'dribbling',
  Difesa: 'difesa',
  Visione: 'visione',
};

export function StatsLegendModal({ isOpen, onClose }: StatsLegendModalProps) {
  const t = useTranslations('statsLegend');
  const ts = useTranslations('statNames');
  const labels = usePlayerLabels();
  if (!isOpen) return null;

  return (
    <Sheet
      onClose={onClose}
      size="lg"
      height="tall"
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <button type="button" onClick={onClose} className={sheetBtn.secondary}>
          {t('close')}
        </button>
      }
    >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {STAT_CANONICAL_ORDER.filter((k) => k !== 'Tecnica').map((statName) => {
              const detail = STAT_DETAILS[statName];
              if (!detail) return null;
              const icon = STAT_ICON_MAP[detail.code] || <Zap className="h-5 w-5 text-accent-text" />;

              return (
                <div
                  key={detail.code}
                  className="bg-app/70 border border-line/90 hover:border-line-strong p-4 rounded-2xl space-y-2 transition-all hover:bg-app"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-card border border-line rounded-xl">
                        {icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-accent-text bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-md">
                            {labels.statCode(statName)}
                          </span>
                          <span className="font-bold text-primary text-sm">{labels.statName(statName)}</span>
                        </div>
                        <span className="text-[11px] text-secondary block font-medium">
                          {STAT_IDS[statName] ? ts(`${STAT_IDS[statName]}.label`) : detail.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-secondary leading-relaxed pt-1">
                    {STAT_IDS[statName] ? ts(`${STAT_IDS[statName]}.description`) : detail.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-accent/10 border border-accent/30 rounded-2xl text-xs text-secondary flex items-start gap-3">
            <span className="text-lg">💡</span>
            <div>
              <strong className="text-primary block mb-0.5">{t('balanceTitle')}</strong>
              {t('balanceText')}
            </div>
          </div>
    </Sheet>
  );
}
