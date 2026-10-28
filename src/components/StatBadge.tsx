import React from 'react';

interface StatBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
}

export function StatBadge({ score, size = 'md', showLabel = false, label }: StatBadgeProps) {
  const rounded = Number(score.toFixed(1));

  // Colore in stile card calcistica
  let colorClasses = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
  if (rounded >= 8.0) {
    colorClasses = 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-emerald-500/20';
  } else if (rounded >= 7.0) {
    colorClasses = 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-amber-500/20';
  } else if (rounded >= 6.0) {
    colorClasses = 'bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-blue-500/20';
  } else {
    colorClasses = 'bg-rose-500/20 text-rose-300 border-rose-400/40 shadow-rose-500/20';
  }

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 rounded font-semibold',
    md: 'text-sm px-2.5 py-1 rounded-md font-bold',
    lg: 'text-base px-3 py-1.5 rounded-lg font-black shadow-md',
  }[size];

  return (
    <div className="inline-flex items-center gap-1.5">
      {showLabel && label && (
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      )}
      <span
        className={`border inline-flex items-center justify-center font-mono tabular-nums ${sizeClasses} ${colorClasses}`}
      >
        {rounded}
      </span>
    </div>
  );
}
