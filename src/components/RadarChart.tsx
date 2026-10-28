'use client';

import React from 'react';

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
}

const STAT_ABBR_MAP: Record<string, string> = {
  Resistenza: 'RES',
  Velocità: 'VEL',
  Difesa: 'DIF',
  Tiro: 'TIR',
  Passaggio: 'PAS',
  Tecnica: 'TEC',
  Fisico: 'FIS',
  Dribbling: 'DRI',
};

export function RadarChart({
  stats,
  size = 200,
  color = 'emerald',
  showLabels = true,
}: RadarChartProps) {
  const statKeys = Object.keys(stats);
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
        <defs>
          <radialGradient id={`radarGrad-${color}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.15" />
          </radialGradient>
        </defs>

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
              fill={level === 1.0 ? 'rgba(15, 23, 42, 0.6)' : 'none'}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={level === 1.0 ? '1.5' : '1'}
              strokeDasharray={level === 1.0 ? 'none' : '2,2'}
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
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1"
            />
          );
        })}

        {/* Poligono delle statistiche del giocatore */}
        <polygon
          points={polygonPoints}
          fill={`url(#radarGrad-${color})`}
          stroke={strokeColor}
          strokeWidth="2.5"
          className="transition-all duration-300"
        />

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
            const val = Math.max(1, Math.min(10, stats[key] ?? 6));
            // Posiziona l'etichetta leggermente fuori dal raggio massimo
            const labelCoord = getCoordinates(i, 1.25);
            const abbr = STAT_ABBR_MAP[key] || key.slice(0, 3).toUpperCase();

            return (
              <g key={`label-${i}`} transform={`translate(${labelCoord.x}, ${labelCoord.y})`}>
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[9px] font-black fill-slate-300 tracking-wider"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                >
                  {abbr}
                </text>
                <text
                  y="10"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-[8px] font-mono font-bold fill-emerald-400"
                >
                  {val}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
