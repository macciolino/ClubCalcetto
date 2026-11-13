'use client';

import { askConfirm } from '@/components/ui/Feedback';

import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { useAuth } from '@/lib/context/AuthContext';
import { callNotifyApi } from '@/lib/services/pushService';
import { Bell, Loader2, Send, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';

type Mode = 'off' | 'admins' | 'all';

const MODES: Mode[] = ['off', 'admins', 'all'];

/** Impostazioni → Notifiche del club: who receives notifications + test notification to yourself. */
export function NotificationSettingsCard({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('admins');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const t = useTranslations('clubNotif');
  const { locale } = useLocaleSetting();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      doc(db, 'settings', 'notifications'),
      (snap) => {
        const m = snap.data()?.mode;
        setMode(m === 'off' || m === 'all' ? m : 'admins');
      },
      (err) => console.warn('[Notifiche] impostazioni:', err.message)
    );
  }, []);

  const handleMode = async (next: Mode) => {
    if (next === mode) return;
    if (next === 'all' && !(await askConfirm(t('confirmAll')))) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'settings', 'notifications'),
        { mode: next, updated_at: new Date().toISOString(), updated_by: profile?.id || '' },
        { merge: true }
      );
    } catch (err) {
      console.warn('[Notifiche] salvataggio modalità:', err);
      setMessage(t('modeFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Diagnostica: quali admin hanno un telefono registrato (per capire perché a qualcuno non arriva)
  type AdminDevice = { name: string; count: number; platforms: string[]; last: string | null };
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const loadDevices = async (type: 'admin_devices' | 'test_admins') => {
    setLoadingDevices(true);
    setMessage('');
    try {
      const res = await callNotifyApi({ type });
      if (res.ok) {
        setDevices((res.devices as AdminDevice[]) || []);
        if (type === 'test_admins') setMessage(t('testAdminsSent', { count: Number(res.sent) || 0 }));
      } else {
        setMessage(t('checkFailed'));
      }
    } catch {
      setMessage(t('checkFailedNet'));
    } finally {
      setLoadingDevices(false);
    }
  };

  const platformLabel = (p: string) => (p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : p === 'desktop' ? 'PC' : p);

  const handleTest = async () => {
    setTesting(true);
    setMessage('');
    try {
      const res = await callNotifyApi({ type: 'test' });
      if (res.ok && Number(res.devices) > 0) {
        setMessage(t('testSent', { sent: Number(res.sent) || 0, devices: Number(res.devices) || 0 }));
      } else if (res.ok) {
        setMessage(t('noDevice'));
      } else if (res.error === 'not_configured') {
        setMessage(t('notConfigured'));
      } else {
        setMessage(t('sendFailed'));
      }
    } catch {
      setMessage(t('sendFailedNet'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-card p-4 sm:p-5 rounded-2xl space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent-text flex-shrink-0" />
            {t('title')}
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            {t('recipients')} <strong className={mode === 'all' ? 'text-accent-text' : mode === 'admins' ? 'text-violet-700 dark:text-violet-300' : 'text-secondary'}>{t(`modes.${mode}.label`)}</strong>
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 text-secondary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
      <div className="space-y-4 border-t border-line pt-4">
      <p className="text-xs text-secondary">
        {t('intro')}
      </p>

      <div className="space-y-2" role="radiogroup" aria-label={t('whoAria')}>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => handleMode(m)}
            disabled={saving}
            className={`w-full text-left p-3 rounded-2xl border transition-all ${
              mode === m ? 'border-accent bg-accent/10' : 'border-line bg-app hover:border-line-strong'
            }`}
          >
            <span className="block text-sm font-bold text-primary">{t(`modes.${m}.label`)}</span>
            <span className="block text-xs text-secondary mt-0.5">{t(`modes.${m}.help`)}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="flex items-center gap-2 px-4 py-2.5 bg-card-hover hover:bg-line-strong text-primary font-bold rounded-xl text-xs border border-line-strong disabled:opacity-60"
      >
        {testing ? <Loader2 className="h-4 w-4 animate-spin text-accent-text" /> : <Send className="h-4 w-4 text-accent-text" />}
        {t('testMe')}
      </button>
      {message && <p className="text-xs text-secondary">{message}</p>}

      {/* Telefoni degli admin */}
      <div className="border-t border-line pt-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadDevices('admin_devices')}
            disabled={loadingDevices}
            className="px-4 py-2.5 bg-card-hover hover:bg-line-strong text-primary font-bold rounded-xl text-xs border border-line-strong disabled:opacity-60"
          >
            {loadingDevices ? t('checking') : t('checkAdmins')}
          </button>
          <button
            type="button"
            onClick={() => loadDevices('test_admins')}
            disabled={loadingDevices}
            className="px-4 py-2.5 bg-card-hover hover:bg-line-strong text-primary font-bold rounded-xl text-xs border border-line-strong disabled:opacity-60"
          >
            {t('testAllAdmins')}
          </button>
        </div>
        {devices && (
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d.name} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-app border border-line text-xs">
                <span className="font-bold text-primary truncate">{d.name}</span>
                {d.count > 0 ? (
                  <span className="text-right text-accent-text">
                    {t('devices', { count: d.count, platforms: d.platforms.map(platformLabel).join(', ') })}
                    {d.last && (
                      <span className="block text-muted">
                        {t('updated', {
                          when: new Date(d.last).toLocaleString(locale === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                        })}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-right text-warning">{t('noPhone')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
