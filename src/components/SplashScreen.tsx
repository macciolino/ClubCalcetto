'use client';

import React, { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { PitchLines } from '@/components/PitchLines';

const KEY = 'cc_splash_seen';

/**
 * Opening screen: the pitch draws itself with the logo in the centre circle, then fades out.
 * Only once per app opening (sessionStorage) and never on /login (which has its own pitch).
 * Rendered by the server and hidden before paint by the inline script in layout.tsx when not needed,
 * so the page never flashes underneath it.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show');

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
      <div className="relative pitch-fast w-44 aspect-[2/3]">
        <PitchLines className="absolute inset-0 h-full w-full" lineClass="text-emerald-400/50" />
        <div className="absolute inset-0 flex items-center justify-center animate-in">
          <BrandLogo size="lg" />
        </div>
      </div>
      <span className="absolute bottom-[18%] text-lg font-bold tracking-tight text-white animate-in">
        Club <span className="text-emerald-400">Soccer</span>
      </span>
    </div>
  );
}

/** Inline script (runs before paint): hide the splash if already seen in this session or on /login. */
export const SPLASH_GUARD = `try{if(sessionStorage.getItem('${KEY}')||location.pathname.indexOf('/login')===0)document.documentElement.classList.add('no-splash')}catch(e){}`;
