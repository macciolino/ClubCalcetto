import React from 'react';

/**
 * Football pitch seen from above (viewBox 400x600, 2:3), with grass stripes.
 * The lines draw themselves on mount (`.pitch-draw` in globals.css); add `pitch-fast` to a parent for a quicker draw.
 */
export function PitchLines({ className = '', lineClass = 'text-emerald-400/30', grass = true }: { className?: string; lineClass?: string; grass?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {grass &&
        Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="20" y={20 + i * 70} width="360" height="70" fill={i % 2 ? 'rgba(16,185,129,0.03)' : 'rgba(16,185,129,0.075)'} />
        ))}
      <g className={`pitch-draw ${lineClass}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {/* Linee esterne e metà campo */}
        <rect x="20" y="20" width="360" height="560" rx="2" pathLength={1} />
        <line x1="20" y1="300" x2="380" y2="300" pathLength={1} />
        <circle cx="200" cy="300" r="50" pathLength={1} />
        {/* Area di rigore, area piccola e lunetta (sopra) */}
        <rect x="90" y="20" width="220" height="90" pathLength={1} />
        <rect x="145" y="20" width="110" height="32" pathLength={1} />
        <path d="M156.7 110 A50 50 0 0 0 243.3 110" pathLength={1} />
        {/* Area di rigore, area piccola e lunetta (sotto) */}
        <rect x="90" y="490" width="220" height="90" pathLength={1} />
        <rect x="145" y="548" width="110" height="32" pathLength={1} />
        <path d="M156.7 490 A50 50 0 0 1 243.3 490" pathLength={1} />
        {/* Bandierine */}
        <path d="M20 30 A10 10 0 0 0 30 20" pathLength={1} />
        <path d="M370 20 A10 10 0 0 0 380 30" pathLength={1} />
        <path d="M20 570 A10 10 0 0 1 30 580" pathLength={1} />
        <path d="M370 580 A10 10 0 0 1 380 570" pathLength={1} />
        {/* Porte */}
        <rect x="175" y="12" width="50" height="8" rx="1" pathLength={1} />
        <rect x="175" y="580" width="50" height="8" rx="1" pathLength={1} />
      </g>
      <g className={`pitch-dots ${lineClass}`} fill="currentColor">
        <circle cx="200" cy="300" r="3" />
        <circle cx="200" cy="85" r="2.5" />
        <circle cx="200" cy="515" r="2.5" />
      </g>
    </svg>
  );
}
