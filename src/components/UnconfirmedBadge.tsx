'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

/**
 * "Verificato": a discreet check once a president / collaborator confirmed the values (explicit `CONFIRMED` only: cards
 * that existed before the review flow show nothing).
 */
export function VerifiedMark({ status, className = '' }: { status?: 'UNCONFIRMED' | 'CONFIRMED'; className?: string }) {
  const t = useTranslations('unconfirmed');
  if (status !== 'CONFIRMED') return null;
  return (
    <span title={t('verifiedHint')} className={`inline-flex items-center gap-1 text-[11px] font-medium text-secondary whitespace-nowrap ${className}`}>
      <Check className="h-3 w-3 text-accent-text" aria-hidden="true" /> {t('verified')}
    </span>
  );
}

/**
 * "Da revisionare": the values on a league card are the person's own (Radar Base) or brought along, and no president or
 * collaborator has approved them yet (they do after the first match). Renders nothing once confirmed.
 */
export function UnconfirmedBadge({ status, className = '' }: { status?: 'UNCONFIRMED' | 'CONFIRMED'; className?: string }) {
  const t = useTranslations('unconfirmed');
  if (status !== 'UNCONFIRMED') return null;
  return (
    <span
      title={t('hint')}
      className={`inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning whitespace-nowrap ${className}`}
    >
      {t('label')}
    </span>
  );
}
