'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

/**
 * "Da confermare": the values on a league card are the person's own (Radar Base) or brought along, and no president or
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
