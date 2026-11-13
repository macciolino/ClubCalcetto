'use client';

import { notify, askConfirm } from '@/components/ui/Feedback';

import React, { useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { AccountRemovalMode, DELETE_REASONS, deleteMyAccount } from '@/lib/services/accountService';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Bottom of the profile: the player deletes their own account. Always asks for a reason (sent to the
 * developer as feedback) and for a final confirmation. The super admin account cannot be deleted.
 */
export function DeleteAccountSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AccountRemovalMode>('deactivate');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = useTranslations('account');
  // Motivi: si salvano in italiano (feedback per lo sviluppatore), si mostrano nella lingua dell'app
  const reasonLabels = t.raw('reasons') as string[];

  if (isSuperAdmin) {
    return (
      <section className="bg-card border border-line rounded-2xl p-5 text-xs text-secondary">
        {t('superCannot')}
      </section>
    );
  }

  const handleDelete = async () => {
    setError('');
    if (!reason) {
      setError(t('chooseReason'));
      return;
    }
    if (reason === 'Altro' && !details.trim()) {
      setError(t('writeReason'));
      return;
    }
    const question =
      mode === 'deactivate'
        ? t('confirmDeactivate')
        : t('confirmDelete');
    if (!(await askConfirm(question))) return;
    setBusy(true);
    try {
      const res = await deleteMyAccount(reason, details.trim(), mode);
      if (res.ok) {
        notify(
          mode === 'deactivate'
            ? t('deactivated')
            : t('deleted')
        );
        await signOut();
        return;
      }
      setError(
        res.error === 'not_configured'
          ? t('notAvailable')
          : t('failedLater')
      );
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-card border border-rose-500/30 rounded-2xl p-5 space-y-4" aria-labelledby="delete-account-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="delete-account-title" className="text-sm font-bold text-danger flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> {t('removeTitle')}
          </h2>
          <p className="text-xs text-secondary mt-0.5">{t('removeHint')}</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold text-danger border border-rose-500/40 hover:bg-rose-500/10"
          >
            {t('removeOpen')}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-primary mb-1">{t('whatToDo')}</legend>
            {(
              [
                ['deactivate', t('deactivateLabel'), t('deactivateHelp')],
                ['delete', t('deleteLabel'), t('deleteHelp')],
              ] as const
            ).map(([value, label, help]) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-3 rounded-xl border text-sm cursor-pointer ${
                  mode === value ? 'border-rose-400 bg-rose-500/10 text-primary' : 'border-line bg-app text-secondary'
                }`}
              >
                <input
                  type="radio"
                  name="removal-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="accent-rose-500 h-4 w-4 mt-0.5"
                />
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-xs text-secondary mt-0.5">{help}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-secondary flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-danger" /> {t('bothCases')}
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-primary mb-1">{t('whyLeave')}</legend>
            {DELETE_REASONS.map((r, i) => (
              <label
                key={r}
                className={`flex items-center gap-3 p-3 rounded-xl border text-sm cursor-pointer ${
                  reason === r ? 'border-rose-400 bg-rose-500/10 text-primary' : 'border-line bg-app text-secondary'
                }`}
              >
                <input
                  type="radio"
                  name="delete-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-rose-500 h-4 w-4"
                />
                {reasonLabels[i] || r}
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-xs font-bold text-primary">
              {t('addSomething', { required: reason === 'Altro' ? t('required') : t('optional') })}
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('commentPh')}
              className="mt-1 w-full px-3 py-2.5 bg-app border border-line-strong rounded-xl text-sm text-primary focus:outline-none focus:border-rose-400"
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
              disabled={busy}
              className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs font-bold text-secondary border border-line-strong hover:bg-card-hover"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {mode === 'deactivate' ? t('deactivateBtn') : t('deleteBtn')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
