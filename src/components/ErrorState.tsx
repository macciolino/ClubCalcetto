'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, RotateCcw, SearchX } from 'lucide-react';
import { btn } from '@/components/ui/buttons';

/** C9 — shared look of the error / not-found pages (texts are passed already translated). */
export function ErrorState({
  kind,
  title,
  body,
  retryLabel,
  homeLabel,
  onRetry,
}: {
  kind: 'error' | 'not-found';
  title: string;
  body: string;
  retryLabel?: string;
  homeLabel: string;
  onRetry?: () => void;
}) {
  const Icon = kind === 'error' ? AlertCircle : SearchX;
  return (
    <div className="max-w-md mx-auto py-16 text-center space-y-5" role={kind === 'error' ? 'alert' : undefined}>
      <span className="mx-auto h-14 w-14 rounded-2xl bg-card flex items-center justify-center">
        <Icon className={`h-7 w-7 ${kind === 'error' ? 'text-danger' : 'text-accent-text'}`} />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-primary">{title}</h1>
        <p className="text-sm text-secondary leading-relaxed">{body}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {onRetry && retryLabel && (
          <button type="button" onClick={onRetry} className={btn.primary}>
            <RotateCcw className="h-4 w-4" /> {retryLabel}
          </button>
        )}
        <Link href="/" className={onRetry ? btn.secondary : btn.primary}>
          {homeLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
