import React from 'react';

/**
 * Club logo shown in the top bar and on the login page.
 * To go back to the previous logo (green square with the ⚽ emoji) set LOGO_STYLE = 'classic'.
 * Source images: assets/logo-header-source.png (current), assets/logo-source.png (logo with bell, used inside notifications).
 */
const LOGO_STYLE: 'image' | 'classic' = 'image';

export function BrandLogo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  if (LOGO_STYLE === 'classic') {
    return (
      <div
        className={`inline-flex ${box} items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 text-slate-950 shadow-lg shadow-emerald-500/25`}
      >
        <span className={size === 'lg' ? 'text-2xl' : 'text-xl'}>⚽</span>
      </div>
    );
  }
  return (
    <img
      src={size === 'lg' ? '/brand/logo-header-192.png' : '/brand/logo-header-128.png'}
      alt="ClubCalcetto"
      width={size === 'lg' ? 56 : 40}
      height={size === 'lg' ? 56 : 40}
      className={`${box} object-contain drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)]`}
    />
  );
}
