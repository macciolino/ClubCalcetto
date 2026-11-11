'use client';

import React, { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { PitchLines, useScreenPitchHeight } from '@/components/PitchLines';

const KEY = 'cc_splash_seen';

/**
 * Opening screen: the pitch draws itself with the logo in the centre circle, then fades out.
 * Only once per app opening (sessionStorage) and never on /login (which has its own pitch).
 * Rendered by the server and hidden before paint by the inline script in layout.tsx when not needed,
 * so the page never flashes underneath it.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show');
  const pitchH = useScreenPitchHeight();

  useEffect(() => {
    if (document.documentElement.classList.contains('no-splash')) {
      setPhase('gone');
      return;
    }
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* private mode: show it anyway */
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setPhase('leave'), reduce ? 300 : 1300);
    const t2 = setTimeout(() => setPhase('gone'), reduce ? 500 : 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div
      id="cc-splash"
      aria-hidden="true"
      className={`fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center transition-opacity duration-300 ${
        phase === 'leave' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Campo a tutto schermo, proporzionato al telefono in uso */}
      <div className="absolute inset-0 pitch-fast">
        <PitchLines className="absolute inset-0 h-full w-full" lineClass="text-emerald-400/45" height={pitchH} fit="meet" />
      </div>
      <div className="relative flex flex-col items-center animate-in">
        <BrandLogo size="lg" />
        <span className="mt-[4.5rem] text-xl font-bold tracking-tight text-white">
          Club <span className="text-emerald-400">Soccer</span>
        </span>
      </div>
    </div>
  );
}

/** Inline script (runs before paint): hide the splash if already seen in this session or on /login. */
export const SPLASH_GUARD = `try{if(sessionStorage.getItem('${KEY}')||location.pathname.indexOf('/login')===0)document.documentElement.classList.add('no-splash')}catch(e){}`;
