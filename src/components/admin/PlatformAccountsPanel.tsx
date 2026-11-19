'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { DeactivatedAccountsList } from '@/components/admin/DeactivatedAccountsList';
import { DeletionFeedbackCard } from '@/components/admin/DeletionFeedbackCard';
import { EmailPrivacyCard } from '@/components/admin/EmailPrivacyCard';
import { LeagueMigrationCard } from '@/components/admin/LeagueMigrationCard';
import { useAuth } from '@/lib/context/AuthContext';
import { subscribeProfiles } from '@/lib/firebase/firestoreService';
import { manageAccountAsSuperAdmin } from '@/lib/services/accountService';
import type { Profile } from '@/types/database';

/**
 * Impostazioni → "Account e piattaforma": platform super admin only (never a league role).
 * Deactivated accounts (reactivate / delete for good), email privacy, league migration, why people leave.
 * League roles are managed only in Impostazioni → Lega → Membri e ruoli.
 */
export function PlatformAccountsPanel() {
  const { isSuperAdmin } = useAuth();
  const t = useTranslations('adminSections');
  const [deactivated, setDeactivated] = useState<Profile[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsub = subscribeProfiles((list) => setDeactivated(list.filter((p) => !p.archived_at)), 'deactivated');
    return () => unsub();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  const reactivate = async (player: Profile) => {
    if (!(await askConfirm(t('confirmReactivate', { name: player.full_name })))) return;
    const res = await manageAccountAsSuperAdmin(player.id, 'reactivate');
    if (res.ok) setDeactivated((prev) => prev.filter((p) => p.id !== player.id));
    else notify(t('reactivateFailed'));
  };

  const remove = async (player: Profile) => {
    if (!(await askConfirm(t('confirmDelete', { name: player.full_name })))) return;
    const res = await manageAccountAsSuperAdmin(player.id, 'delete');
    if (res.ok) setDeactivated((prev) => prev.filter((p) => p.id !== player.id));
    else notify(t('deleteFailed'));
  };

  return (
    <div className="space-y-6">
      <DeactivatedAccountsList deactivatedPlayers={deactivated} onReactivatePlayer={reactivate} onDeleteDeactivatedPlayer={remove} />
      <EmailPrivacyCard />
      <LeagueMigrationCard />
      <DeletionFeedbackCard />
    </div>
  );
}
