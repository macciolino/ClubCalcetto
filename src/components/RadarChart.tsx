'use client';

import React from 'react';
import { sortStatsByCanonicalOrder } from '@/types/database';

interface RadarStat {
  key: string;
  label: string;
  value: number; // 1 - 10
}

interface RadarChartProps {
  stats: Record<string, number>;
  size?: number;
  color?: string; // 'emerald' | 'amber' | 'blue'
  showLabels?: boolean;
  /**
   * Second shape drawn as an outline over the first one:
   * 'form'    → the values with the "Stato forma" (light green, dashed)
   * 'compare' → another player (blue)
   */
  overlay?: { stats: Record<string, number>; kind: 'form' | 'compare' };
  /** Value under each label (off when the values are shown elsewhere, e.g. bars below the radar) */
  showValues?: boolean;
}

const STAT_ABBR_MAP: Record<string, string> = {
  Velocità: 'VEL',
  Fisico: 'FIS',
  Resistenza: 'RES',
  Tiro: 'TIR',
  Passaggio: 'PAS',
  Dribbling: 'DRI',
  Difesa: 'DIF',
  Visione: 'VIS',
  Tecnica: 'TEC',
};

export function RadarChart({
  stats,
  size = 200,
  color = 'emerald',
  showLabels = true,
  overlay,
  showValues = true,
}: RadarChartProps) {
  const statKeys = sortStatsByCanonicalOrder(Object.keys(stats));
  const totalAxes = Math.max(statKeys.length, 3);

  const radius = size * 0.36;
  const center = size / 2;

  // Calcolo angoli per poligono regolare (Ottagono per 8 statistiche)
  const getCoordinates = (index: number, valueRatio: number, r: number = radius) => {
    const angle = (index * 2 * Math.PI) / totalAxes - Math.PI / 2;
    return {
      x: center + r * valueRatio * Math.cos(angle),
      y: center + r * valueRatio * Math.sin(angle),
    };
  };

  // Punti del poligono del giocatore
  const polygonPoints = statKeys
    .map((key, i) => {
      const val = Math.max(1, Math.min(10, stats[key] ?? 6));
      const ratio = val / 10;
      const { x, y } = getCoordinates(i, ratio);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const overlayPoints = overlay
    ? statKeys
        .map((key, i) => {
          const val = Math.max(1, Math.min(10, overlay.stats[key] ?? 6));
          const { x, y } = getCoordinates(i, val / 10);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  // Guide concentriche (25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const strokeColor =
    color === 'amber' ? '#f59e0b' : color === 'blue' ? '#3b82f6' : '#10b981';
  const fillColor =
    color === 'amber' ? 'rgba(245, 158, 11, 0.35)' : color === 'blue' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(16, 185, 129, 0.35)';

  return (
    <div className="flex items-center justify-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >

        {/* Poligoni concentrici della ragnatela / griglia */}
        {gridLevels.map((level, idx) => {
          const ringPoints = statKeys
            .map((_, i) => {
              const { x, y } = getCoordinates(i, level);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

          return (
            <polygon
              key={`grid-${idx}`}
              points={ringPoints}
              // Griglia nei colori del tema (le classi CSS leggono i token; gli attributi SVG no)
              className={level === 1.0 ? 'fill-app/50 stroke-line' : 'fill-none stroke-line'}
              strokeWidth="1"
            />
          );
        })}

        {/* Linee radiali dal centro ai vertici */}
        {statKeys.map((_, i) => {
          const { x, y } = getCoordinates(i, 1.0);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              className="stroke-line"
              strokeWidth="1"
            />
          );
        })}

        {/* Poligono delle statistiche del giocatore */}
        <polygon points={polygonPoints} fill={fillColor} stroke={strokeColor} strokeWidth="2" className="transition-all duration-300" />

        {/* Seconda forma: valori con la forma, oppure il giocatore da confrontare */}
        {overlay && (
          <polygon
            points={overlayPoints}
            fill={overlay.kind === 'compare' ? 'rgba(59, 130, 246, 0.18)' : 'none'}
            stroke={overlay.kind === 'compare' ? '#60a5fa' : '#6ee7b7'}
            strokeWidth="2"
            strokeDasharray={overlay.kind === 'form' ? '4,3' : undefined}
          />
        )}

        {/* Pallini sui vertici */}
        {statKeys.map((key, i) => {
          const val = Math.max(1, Math.min(10, stats[key] ?? 6));
          const ratio = val / 10;
          const { x, y } = getCoordinates(i, ratio);
          return (
            <circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={2.5}
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth="1.5"
            />
          );
        })}

        {/* Etichette esterne per vertice */}
        {showLabels &&
          statKeys.map((key, i) => {
            const shown = overlay?.kind === 'form' ? overlay.stats[key] ?? stats[key] : stats[key];
            const val = Math.max(1, Math.min(10, shown ?? 6));
            // Posiziona l'etichetta leggermente fuori dal raggio massimo
            const labelCoord = getCoordinates(i, 1.25);
            const abbr = STAT_ABBR_MAP[key] || key.slice(0, 3).toUpperCase();

            return (
              <g key={`label-${i}`} transform={`translate(${labelCoord.x}, ${labelCoord.y})`}>
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[9px] font-semibold fill-secondary"
                >
                  {abbr}
                </text>
{showValues && (
                <text
                  y="10"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[9px] font-semibold fill-primary"
                >
                  {val}
                </text>
                )}
              </g>
            );
          })}
      </svg>
    </div>
  );
}
