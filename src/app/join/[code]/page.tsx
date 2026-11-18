'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { textLink } from '@/components/ui/buttons';

/**
 * Invite link `/join/[code]`. Step 2: the address exists (the welcome screen leads here); joining a league,
 * claiming a ghost player and the checks on the code arrive with step 3 — until then every code is "not valid".
 */
export default function JoinLeaguePage() {
  const t = useTranslations('league.join');
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <section className="w-full max-w-md bg-card rounded-2xl p-6 space-y-4 text-center">
        <LinkIcon className="h-8 w-8 mx-auto text-accent-text" aria-hidden="true" />
        <h1 className="text-xl font-black text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('invalid')}</p>
        <Link href="/" className={textLink}>
          {t('home')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
