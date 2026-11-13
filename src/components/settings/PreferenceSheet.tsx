'use client';

import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';

export interface PreferenceOption<T extends string> {
  id: T;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

/** Settings row (icon, name, current value on the right) that opens a choice sheet. Shared by Tema and Lingua. */
export function PreferenceRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="w-full flex items-center gap-3 px-3.5 py-3 text-sm text-left text-primary hover:bg-card-hover/60 transition-colors"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-card-hover text-accent-text">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{label}</span>
        {value && <span className="sm:hidden block text-xs text-secondary truncate">{value}</span>}
      </span>
      {value && <span className="hidden sm:block text-xs text-secondary text-right">{value}</span>}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}

/**
 * Choice sheet: one option per row (vertical stack — bottom sheet on phone, centred modal on desktop),
 * the active one highlighted in green with a check.
 */
export function PreferenceSheet<T extends string>({
  title,
  subtitle,
  options,
  value,
  activeLabel,
  footnote,
  onChoose,
  onClose,
}: {
  title: string;
  subtitle: string;
  options: PreferenceOption<T>[];
  value: T;
  activeLabel: string;
  footnote?: string;
  onChoose: (id: T) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} title={title} subtitle={subtitle}>
      <div role="radiogroup" aria-label={title} className="space-y-2">
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChoose(o.id)}
              className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                active ? 'bg-accent/10 ring-2 ring-accent' : 'bg-app/60 hover:bg-card-hover'
              }`}
            >
              <span
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                  active ? 'bg-accent text-on-accent' : 'bg-card-hover text-secondary'
                }`}
              >
                {o.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-primary">{o.label}</span>
                <span className="block text-xs text-secondary">{o.hint}</span>
              </span>
              {active && (
                <span className="flex items-center gap-1 text-xs font-semibold text-accent-text">
                  <Check className="h-4 w-4" /> <span className="hidden sm:inline">{activeLabel}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {footnote && <p className="text-xs text-muted">{footnote}</p>}
    </Sheet>
  );
}
