'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { 
  CalendarDays, 
  Users, 
  ShieldAlert, 
  LogOut, 
  Sparkles,
  Trophy,
  User
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { user, profile, isAdmin, signOut, setMockRole } = useAuth();

  if (pathname === '/login') {
    return null;
  }

  const navItems = [
    { href: '/presenze', label: 'Presenze', icon: CalendarDays },
    { href: '/giocatori', label: 'Giocatori', icon: Users },
    { href: '/squadre', label: 'Squadre', icon: Trophy },
    { href: '/profilo', label: 'Profilo', icon: User },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: ShieldAlert }] : []),
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link href="/presenze" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 text-slate-950 shadow-lg shadow-emerald-500/25 transition-transform group-hover:scale-105">
              <span className="text-xl">⚽</span>
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                Club<span className="text-emerald-400">Calcetto</span>
              </span>
              <span className="hidden sm:block text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                5v5 League & Matchmaking
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Info & Actions */}
          <div className="flex items-center gap-3">
            {/* Ruolo Switcher per alternare vista Admin / User */}
            {setMockRole && (
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMockRole('user')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    !isAdmin ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Passa alla vista Giocatore (User)"
                >
                  User
                </button>
                <button
                  type="button"
                  onClick={() => setMockRole('admin')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    isAdmin ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Passa alla vista Amministratore (Admin)"
                >
                  Admin
                </button>
              </div>
            )}

            {/* Profilo Badge con link a /profilo */}
            <div className="flex items-center gap-2.5">
              <Link
                href="/profilo"
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group"
                title="Gestisci il tuo Profilo"
              >
                <div className="relative">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-emerald-500/40 group-hover:ring-emerald-400 transition-all"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm group-hover:border-emerald-500 transition-colors">
                      {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  {isAdmin && (
                    <span
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-slate-950 ring-2 ring-slate-950"
                      title="Amministratore"
                    >
                      ★
                    </span>
                  )}
                </div>

                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-white leading-tight max-w-[120px] truncate group-hover:text-emerald-300 transition-colors">
                    {profile?.full_name || 'Ospite'}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    {isAdmin ? 'Admin' : 'Giocatore'}
                  </div>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => signOut()}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors"
                title="Disconnetti"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 pb-safe">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                  isActive
                    ? 'text-emerald-400 font-bold scale-105'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className={`p-1 rounded-lg ${isActive ? 'bg-emerald-500/20' : ''}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
