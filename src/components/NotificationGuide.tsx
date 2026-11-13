'use client';

import { notify } from '@/components/ui/Feedback';

import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { PushStatus, getPushStatus, enablePush, disablePush } from '@/lib/services/pushService';
import { useTranslations } from 'next-intl';

type Platform = 'android' | 'ios';

/** Simple step-by-step guide to enable notifications on Android and iPhone (shown in the profile). */
export function NotificationGuide() {
  const { profile } = useAuth();
  const t = useTranslations('notifGuide');
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const handleEnable = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      setStatus(await enablePush(profile.id));
    } catch (err) {
      console.warn('[Push] attivazione:', err);
      notify(t('enableFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    await disablePush();
    setStatus(await getPushStatus());
    setBusy(false);
  };

  const [platform, setPlatform] = useState<Platform>(() => {
    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
    return 'android';
  });

  return (
    <section className="bg-card border border-line rounded-2xl p-5 space-y-4" aria-labelledby="notif-guide-title">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Bell className="h-5 w-5 text-accent-text" />
        <h2 id="notif-guide-title" className="text-base font-bold text-primary">
          {t('title')}
        </h2>
      </div>
      <div className="text-xs text-secondary space-y-1">
        <p>{t('weTell')}</p>
        <ul className="list-disc pl-5 space-y-0.5">
          {(['w1', 'w2', 'w3', 'w4', 'w5'] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <p>{t('free')}</p>
      </div>

      {status && (
        <div
          className={`rounded-2xl border p-3 space-y-2 ${
            status === 'on' ? 'border-accent/40 bg-accent/10' : 'border-line-strong bg-app'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-primary flex items-center gap-2">
              {status === 'on' ? <Bell className="h-4 w-4 text-accent-text" /> : <BellOff className="h-4 w-4 text-secondary" />}
              {t('onDevice')}
            </p>
            {(status === 'on' || status === 'off') && (
              <button
                type="button"
                role="switch"
                aria-checked={status === 'on'}
                aria-label={t('onDevice')}
                onClick={status === 'on' ? handleDisable : handleEnable}
                disabled={busy || !profile}
                className={`relative flex-shrink-0 h-8 w-14 rounded-full transition-colors disabled:opacity-60 ${
                  status === 'on' ? 'bg-accent' : 'bg-line-strong'
                }`}
              >
                {busy ? (
                  <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span
                    className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      status === 'on' ? 'translate-x-6' : ''
                    }`}
                  />
                )}
              </button>
            )}
          </div>
          <p className="text-xs text-secondary">{t(`status.${status}`)}</p>
        </div>
      )}

      <p className="text-xs font-bold text-secondary pt-1">{t('howTo')}</p>
      <div className="flex items-center gap-1 bg-app border border-line p-1 rounded-xl text-sm">
        {(['android', 'ios'] as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            aria-pressed={platform === p}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-bold transition-all ${
              platform === p ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary'
            }`}
          >
            <Smartphone className="h-4 w-4" /> {p === 'android' ? 'Android' : 'iPhone'}
          </button>
        ))}
      </div>

      <ol className="space-y-2.5">
        {(t.raw(platform) as string[]).map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-primary">
            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/15 border border-accent/40 text-accent-text text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

    </section>
  );
}
