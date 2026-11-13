'use client';

import React from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { askConfirm } from '@/components/ui/Feedback';
import { DeleteAccountSection } from '@/components/DeleteAccountSection';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Impostazioni → Account: who you are signed in as, logout from every device, deactivate / delete the account. */
export function AccountSettings() {
  const { user, profile, signOut } = useAuth();
  const t = useTranslations('account');
  const isSuper = Boolean(user?.emailVerified && user?.email?.toLowerCase() === 'macciolino84@gmail.com');
  return (
    <div className="space-y-4">
      <section className="bg-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-primary">{t('access')}</h3>
          <p className="text-sm text-secondary mt-0.5">
            {t.rich('signedInAs', { name: profile?.full_name || '', b: (c) => <span className="text-primary">{c}</span> })}
            {user?.email ? <> · {user.email}</> : null}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-secondary">{t('signOutAllHint')}</p>
          <button
            type="button"
            onClick={async () => {
              if (await askConfirm(t('confirmSignOutAll'))) await signOut();
            }}
            className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-line-strong text-primary hover:bg-card-hover"
          >
            <LogOut className="h-4 w-4" /> {t('signOutAll')}
          </button>
        </div>
      </section>
      <DeleteAccountSection isSuperAdmin={isSuper} />
    </div>
  );
}
