'use client';

import React, { useEffect, useState } from 'react';

const W = 400;

/**
 * Height of the pitch drawing (width 400) that fills the current screen: on a phone held upright the pitch
 * takes the whole screen without distorting circles and areas; on wide screens it stays 2:3 (600).
 */
export function useScreenPitchHeight(): number {
  const [h, setH] = useState(600);
  useEffect(() => {
    const update = () => {
      const ratio = window.innerHeight / Math.max(1, window.innerWidth);
      setH(ratio >= 1.25 ? Math.round(W * ratio) : 600);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return h;
}

/**
 * Football pitch seen from above, with grass stripes. `height` is the drawing height for a width of 400
 * (600 = 2:3; taller for phones): the areas keep their size, the field gets longer.
 * The lines draw themselves on mount (`.pitch-draw` in globals.css); a `pitch-fast` parent draws them quicker.
 */
export function PitchLines({
  className = '',
  lineClass = 'text-emerald-400/30',
  grass = true,
  height = 600,
  fit = 'meet',
}: {
  className?: string;
  lineClass?: string;
  grass?: boolean;
  height?: number;
  /** 'meet' = whole pitch visible; 'slice' = fills the box (edges may be cut) */
  fit?: 'meet' | 'slice';
}) {
  const H = Math.max(500, height);
  const bottom = H - 20;
  const mid = H / 2;
  const stripes = Math.ceil((H - 40) / 70);
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={`xMidYMid ${fit}`} aria-hidden="true">
      {grass &&
        Array.from({ length: stripes }, (_, i) => (
          <rect
            key={i}
            x="20"
            y={20 + i * 70}
            width="360"
            height={Math.min(70, bottom - (20 + i * 70))}
            fill={i % 2 ? 'rgba(16,185,129,0.03)' : 'rgba(16,185,129,0.075)'}
          />
        ))}
      <g className={`pitch-draw ${lineClass}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {/* Linee esterne e metà campo */}
        <rect x="20" y="20" width="360" height={H - 40} rx="2" pathLength={1} />
        <line x1="20" y1={mid} x2="380" y2={mid} pathLength={1} />
        <circle cx="200" cy={mid} r="50" pathLength={1} />
        {/* Area di rigore, area piccola e lunetta (sopra) */}
        <rect x="90" y="20" width="220" height="90" pathLength={1} />
        <rect x="145" y="20" width="110" height="32" pathLength={1} />
        <path d="M156.7 110 A50 50 0 0 0 243.3 110" pathLength={1} />
        {/* Area di rigore, area piccola e lunetta (sotto) */}
        <rect x="90" y={bottom - 90} width="220" height="90" pathLength={1} />
        <rect x="145" y={bottom - 32} width="110" height="32" pathLength={1} />
        <path d={`M156.7 ${bottom - 90} A50 50 0 0 1 243.3 ${bottom - 90}`} pathLength={1} />
        {/* Bandierine */}
        <path d="M20 30 A10 10 0 0 0 30 20" pathLength={1} />
        <path d="M370 20 A10 10 0 0 0 380 30" pathLength={1} />
        <path d={`M20 ${bottom - 10} A10 10 0 0 1 30 ${bottom}`} pathLength={1} />
        <path d={`M370 ${bottom} A10 10 0 0 1 380 ${bottom - 10}`} pathLength={1} />
        {/* Porte */}
        <rect x="175" y="12" width="50" height="8" rx="1" pathLength={1} />
        <rect x="175" y={bottom} width="50" height="8" rx="1" pathLength={1} />
      </g>
      <g className={`pitch-dots ${lineClass}`} fill="currentColor">
        <circle cx="200" cy={mid} r="3" />
        <circle cx="200" cy="85" r="2.5" />
        <circle cx="200" cy={bottom - 65} r="2.5" />
      </g>
    </svg>
  );
}
