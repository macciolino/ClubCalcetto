'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';

/**
 * App-styled replacements for the browser's alert() and confirm().
 *   notify('Presenza salvata')            → short message at the bottom (disappears by itself)
 *   if (!(await askConfirm('Vuoi…?'))) return;   → dialog with Annulla / Conferma
 * <FeedbackHost /> is mounted once in layout.tsx.
 */
type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}
interface ConfirmRequest {
  message: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

let pushToast: ((t: Omit<Toast, 'id'>) => void) | null = null;
let openConfirm: ((r: ConfirmRequest) => void) | null = null;

// Without an explicit kind: failures are errors, notices ("Solo…", "Prima…", "… non …") are info, the rest is success
const ERROR_WORDS = /non riuscit|impossibile|errore|interrott/i;
const INFO_WORDS = /^(solo |prima |questo account|profilo non)|(^|\s)non\s/i;
const DANGER_WORDS = /elimin|cancell|azzer|disattiv|rimuov|ritir|definitiv/i;

export function notify(message: string, kind?: ToastKind) {
  const k: ToastKind = kind || (ERROR_WORDS.test(message) ? 'error' : INFO_WORDS.test(message) ? 'info' : 'success');
  if (pushToast) pushToast({ message, kind: k });
  else if (typeof window !== 'undefined') window.alert(message);
}

export function askConfirm(message: string, opts: { danger?: boolean } = {}): Promise<boolean> {
  if (!openConfirm) return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false);
  return new Promise((resolve) => openConfirm?.({ message, danger: opts.danger ?? DANGER_WORDS.test(message), resolve }));
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let next = 1;
    pushToast = (t) => {
      const id = next++;
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.kind === 'error' ? 6000 : 3500);
    };
    openConfirm = (r) => setRequest(r);
    return () => {
      pushToast = null;
      openConfirm = null;
    };
  }, []);

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return (
    <>
      {/* Messaggi: in basso, sopra la barra del telefono */}
      <div
        className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none bottom-[calc(var(--bottom-nav-h)+var(--safe-bottom)+0.75rem)] md:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = t.kind === 'error' ? AlertCircle : t.kind === 'info' ? Info : CheckCircle2;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto w-full max-w-md flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                t.kind === 'error'
                  ? 'bg-card border-rose-500/40 text-rose-100'
                  : 'bg-card border-line-strong text-primary'
              }`}
            >
              <Icon
                className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  t.kind === 'error' ? 'text-rose-400' : t.kind === 'info' ? 'text-sky-400' : 'text-accent-text'
                }`}
              />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
                aria-label="Chiudi messaggio"
                className="text-muted hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Conferma */}
      {request && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 lg:bg-app/70 lg:backdrop-blur-sm flex items-end lg:items-center justify-center lg:p-6 animate-fade"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-describedby="confirm-message"
            className="w-full lg:max-w-sm bg-card border border-line border-b-0 lg:border-b rounded-t-3xl lg:rounded-2xl px-5 pt-2 lg:pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:pb-5 space-y-5 shadow-2xl sheet-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lg:hidden mx-auto h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
            <p id="confirm-message" className="text-sm text-primary leading-relaxed whitespace-pre-line">
              {request.message}
            </p>
            <div className="flex flex-col-reverse lg:flex-row lg:justify-end gap-2 [&>*]:w-full lg:[&>*]:w-auto">
              <button
                type="button"
                onClick={() => close(false)}
                className={btnInline.secondary}
              >
                Annulla
              </button>
              <button
                ref={confirmBtn}
                type="button"
                onClick={() => close(true)}
                className={request.danger ? btnInline.dangerSolid : btnInline.primary}
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
