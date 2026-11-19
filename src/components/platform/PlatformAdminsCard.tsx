'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { btnInline } from '@/components/ui/buttons';
import { fetchPlatformStaff, setPlatformAdmin, type PlatformStaff } from '@/lib/services/leagueService';

/**
 * Platform console, super admin only: who helps run the platform (GLOBAL_ADMIN). Appointed by the EXACT email of
 * their account (nothing is searched or listed by name), revoked from the list. Platform roles are not league roles.
 */
export function PlatformAdminsCard() {
  const t = useTranslations('superAdmin.staff');
  const [staff, setStaff] = useState<PlatformStaff[] | null | 'loading'>('loading');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchPlatformStaff().then((res) => alive && setStaff(res));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (target: { email?: string; profileId?: string }, role: 'GLOBAL_ADMIN' | 'USER', confirmText: string) => {
    if (lock.current || !(await askConfirm(confirmText))) return;
    lock.current = true;
    setBusy(true);
    const res = await setPlatformAdmin(target, role);
    lock.current = false;
    setBusy(false);
    if (!res.ok) return notify(t(`errors.${res.error}`));
    notify(role === 'GLOBAL_ADMIN' ? t('appointed', { name: res.name }) : t('revoked', { name: res.name }));
    setEmail('');
    setStaff(await fetchPlatformStaff());
  };

  const appoint = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (clean) void run({ email: clean }, 'GLOBAL_ADMIN', t('confirmAppoint', { email: clean }));
  };

  return (
    <section aria-labelledby="platform-staff" className="bg-card rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="space-y-1">
        <h2 id="platform-staff" className="text-base font-bold text-primary">{t('title')}</h2>
        <p className="text-sm text-secondary">{t('intro')}</p>
      </div>

      {staff === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-label={t('loading')} />}
      {staff === null && <p className="text-sm text-danger">{t('failed')}</p>}
      {Array.isArray(staff) && (
        <ul className="divide-y divide-line" aria-label={t('title')}>
          {staff.map((s) => (
            <li key={s.profileId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{s.name}</p>
                <p className="text-xs text-secondary">{s.platformRole === 'SUPER_ADMIN' ? t('roleSuper') : t('roleGlobal')}</p>
              </div>
              {s.platformRole === 'GLOBAL_ADMIN' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run({ profileId: s.profileId }, 'USER', t('confirmRevoke', { name: s.name }))}
                  className={btnInline.danger}
                >
                  <UserMinus className="h-4 w-4" aria-hidden="true" /> {t('revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={appoint} className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="platform-staff-email" className="sr-only">
          {t('emailLabel')}
        </label>
        <input
          id="platform-staff-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          className="flex-1 min-w-0 rounded-xl border border-line bg-app px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button type="submit" disabled={busy || !email.trim()} className={btnInline.primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          {t('appoint')}
        </button>
      </form>
    </section>
  );
}
