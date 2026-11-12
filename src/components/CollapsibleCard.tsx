'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleCardProps {
  title: string;
  icon?: React.ReactNode;
  /** Short line always visible, also when closed (e.g. "3 campi · predefinito: Centro X") */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Card with a header that opens/closes the content ("a tendina"). Closed by default. */
export function CollapsibleCard({ title, icon, summary, defaultOpen = false, children }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            {icon && <span className="flex-shrink-0">{icon}</span>}
            {title}
          </h2>
          {summary && <p className="text-xs text-slate-400 mt-0.5">{summary}</p>}
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">{children}</div>}
    </div>
  );
}
