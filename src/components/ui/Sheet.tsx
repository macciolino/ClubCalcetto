'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { btn } from '@/components/ui/buttons';

interface SheetProps {
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small icon buttons in the header, before the X (e.g. edit, "⋯" menu) */
  headerActions?: React.ReactNode;
  /** Action buttons: always visible at the bottom (sticky footer) */
  footer?: React.ReactNode;
  /** Desktop width: md ≈ 512px, lg ≈ 672px */
  size?: 'md' | 'lg';
  /** Phone: 'tall' = 80% of the screen; 'auto' = as tall as the content (max 90%) */
  height?: 'auto' | 'tall';
  /** Clicking outside / Esc / drag down do nothing (e.g. while saving) */
  locked?: boolean;
  children: React.ReactNode;
}

/**
 * The one modal of the app.
 * Phone and tablet (< 1024px): bottom sheet that slides up, with drag bar (drag down to close), scrollable body
 * and a sticky footer for the actions. Desktop (≥ 1024px): classic centred modal box on a blurred backdrop.
 * Rendered in a portal on <body>, so no parent can clip it or shift it.
 */
export function Sheet({ onClose, title, subtitle, headerActions, footer, size = 'md', height = 'auto', locked = false, children }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    // La pagina sotto non scorre mentre la finestra è aperta
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !locked && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, locked]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!locked) startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current !== null) setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  };
  const onTouchEnd = () => {
    if (dragY > 100) onClose();
    else setDragY(0);
    startY.current = null;
  };

  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/60 lg:bg-slate-950/70 lg:backdrop-blur-sm flex items-end lg:items-center justify-center lg:p-6 animate-fade"
      onClick={() => !locked && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className={`w-full flex flex-col bg-slate-900 border border-slate-800 border-b-0 lg:border-b rounded-t-3xl lg:rounded-2xl shadow-2xl sheet-panel ${
          height === 'tall' ? 'h-[80dvh] lg:h-auto' : ''
        } max-h-[90dvh] lg:max-h-[85vh] ${size === 'lg' ? 'lg:max-w-2xl' : 'lg:max-w-lg'}`}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra da trascinare (solo telefono/tablet) + intestazione */}
        <div className="flex-shrink-0 px-5 lg:px-6 pt-2 lg:pt-5" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="lg:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-700" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="min-w-0">
              <h2 id="sheet-title" className="text-lg font-semibold text-white">
                {title}
              </h2>
              {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex-shrink-0 flex items-center gap-1 -m-1">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                disabled={locked}
                aria-label="Chiudi"
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Contenuto che scorre */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 lg:px-6 py-5 space-y-6">{children}</div>

        {/* Azioni sempre visibili in basso */}
        {footer && (
          <div className="flex-shrink-0 border-t border-slate-800 px-5 lg:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-4 flex flex-col-reverse lg:flex-row lg:justify-end gap-2 [&>*]:w-full lg:[&>*]:w-auto">
            {footer}
          </div>
        )}
        {!footer && <div className="flex-shrink-0 pb-[env(safe-area-inset-bottom)] lg:pb-0" />}
      </div>
    </div>,
    document.body
  );
}

/** Standard footer buttons: the design-system buttons (see ui/buttons.ts) */
export const sheetBtn = btn;
