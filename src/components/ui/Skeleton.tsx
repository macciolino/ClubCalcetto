'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

/** Grey pulsing shape shown where content is about to appear (instead of a spinner). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-card-hover/70 ${className}`} aria-hidden="true" />;
}

/** Generic page placeholder: title, subtitle and two cards. */
export function PageSkeleton() {
  const tc = useTranslations('common');
  return (
    <div className="space-y-6" role="status" aria-label={tc('loading')}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  );
}
