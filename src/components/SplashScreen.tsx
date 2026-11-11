'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { PitchLines, useScreenPitchHeight } from '@/components/PitchLines';

/** Event that asks the splash to play (e.g. right after login, when the page does not reload). */
export const SHOW_SPLASH_EVENT = 'cc-show-splash';
/** After this long in the background, coming back to the app plays the splash again. */
const RESUME_AFTER_MS = 10 * 60 * 1000;

/**
 * Opening animation: the pitch draws itself full screen with the logo in the centre circle, then fades out.
 * Plays when the app is opened (every full load), right after login, and when the app comes back after
 * 10+ minutes in the background. Never on /login (which has its own pitch).
 * Rendered by the server and hidden before paint by the inline script in layout.tsx on /login.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show');
  const [run, setRun] = useState(0); // cambia a ogni riproduzione: il campo si ridisegna da capo
  const pitchH = useScreenPitchHeight();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = useCallback(() => {
    if (location.pathname.startsWith('/login')) return;
    document.documentElement.classList.remove('no-splash');
    timers.current.forEach(clearTimeout);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setRun((r) => r + 1);
    setPhase('show');
    timers.current = [
      setTimeout(() => setPhase('leave'), reduce ? 300 : 1300),
      setTimeout(() => setPhase('gone'), reduce ? 500 : 1700),
    ];
  }, []);

  useEffect(() => {
    // Apertura dell'app (caricamento completo): si vede, salvo sul login
    if (document.documentElement.classList.contains('no-splash')) setPhase('gone');
    else play();

    // Subito dopo il login (navigazione senza ricaricare)
    const onShow = () => play();
    window.addEventListener(SHOW_SPLASH_EVENT, onShow);

    // Ritorno nell'app dopo un po' in background
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= RESUME_AFTER_MS) play();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener(SHOW_SPLASH_EVENT, onShow);
      document.removeEventListener('visibilitychange', onVisibility);
      timers.current.forEach(clearTimeout);
    };
  }, [play]);

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
      <div key={run} className="absolute inset-0 pitch-fast">
        <PitchLines className="absolute inset-0 h-full w-full" lineClass="text-emerald-400/45" height={pitchH} fit="meet" />
      </div>
      <div key={`logo-${run}`} className="relative flex flex-col items-center animate-in">
        <BrandLogo size="lg" />
        <span className="mt-[4.5rem] text-xl font-bold tracking-tight text-white">
          Club <span className="text-emerald-400">Soccer</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Inline script (runs before paint):
 * - no splash on /login;
 * - the installed app (standalone) that starts on the old address /presenze (phones keep the start address they had
 *   when the app was added to the home screen) goes to the Home instead. Only on a fresh launch: not on reload,
 *   not when a notification opens /presenze?da=notifica, not when navigating inside the app.
 */
export const SPLASH_GUARD = `try{var d=document.documentElement;if(location.pathname.indexOf('/login')===0)d.classList.add('no-splash');var sa=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;var nav=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];if(sa&&location.pathname==='/presenze'&&!location.search&&!document.referrer&&(!nav||nav.type==='navigate'))location.replace('/')}catch(e){}`;
