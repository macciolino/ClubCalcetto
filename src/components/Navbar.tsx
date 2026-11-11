'use client';

import { BrandLogo } from '@/components/BrandLogo';
import { refreshPushRegistration } from '@/lib/services/pushService';
import React, { useState, useEffect, useRef } from 'react';
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
  User,
  History,
  Home,
  Settings,
  ChevronDown
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { user, profile, isAdmin, signOut } = useAuth();

  // Rinnova la registrazione per le notifiche a ogni avvio (i telefoni cambiano il codice ogni tanto)
  const profileId = profile?.id;
  useEffect(() => {
    if (profileId) refreshPushRegistration(profileId);
  }, [profileId]);
  const [mounted, setMounted] = useState(false);

  // Menu utente a tendina: si chiude toccando fuori, con Esc o cambiando pagina
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (pathname === '/login') {
    return null;
  }

  // Condizionale Rigido nella UI (Navbar e Menu):
  // Il link o tab che porta a /admin viene renderizzato ESCLUSIVAMENTE se user && (profile.role === 'admin' || isAdmin).
  // Per chiunque altro (role === 'player' o non profilato) il link non esiste affatto nel DOM.
  const isStrictAdmin = Boolean(mounted && user && (profile?.role === 'admin' || isAdmin));

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/presenze', label: 'Presenze', icon: CalendarDays },
    { href: '/giocatori', label: 'Giocatori', icon: Users },
    { href: '/squadre', label: 'Squadre', icon: Trophy },
    { href: '/history', label: 'Storico', icon: History },
    // Profilo: si apre dal menu dell'utente (icona in alto a destra), non serve nella barra
    ...(isStrictAdmin ? [{ href: '/impostazioni?sezione=partita', label: 'Admin', icon: ShieldAlert }] : []),
  ];

  const displayName = mounted && profile?.full_name ? profile.full_name : 'Ospite';
  const roleLabel = isStrictAdmin ? 'Admin' : 'Giocatore';
  const showAdminBadge = isStrictAdmin;
  const avatarChar = mounted && profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U';
  const avatarUrl = mounted ? profile?.avatar_url : null;

  return (
    <>
      {/* Top Header */}
      {/* Header + menu delle pagine restano fissi in alto mentre si scorre */}
      <div className="sticky top-0 z-40">
      {/* relative z-20: il menu utente (dentro l'header) deve stare SOPRA la barra delle pagine qui sotto */}
      <header className="relative z-20 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md pt-safe">
        {/* Logo con nome a sinistra, profilo a destra */}
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 hover:opacity-90">
            <BrandLogo />
            <span className="text-lg sm:text-xl font-black tracking-tight text-white whitespace-nowrap">
              Club <span className="text-emerald-400">Soccer</span>
            </span>
          </Link>
          {/* User Info & Actions */}
          <div className="flex items-center justify-end gap-3 min-w-0">
            {/* Icona, nome e ruolo: aprono il menu dell'utente */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls="user-menu"
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group cursor-pointer"
                title="Menu utente"
              >
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-emerald-500/40 group-hover:ring-emerald-400 transition-all"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm group-hover:border-emerald-500 transition-colors">
                      {avatarChar}
                    </div>
                  )}
                  {showAdminBadge && (
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
                    {displayName}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    {roleLabel}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {menuOpen && (
                <div
                  id="user-menu"
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-50"
                >
                  <Link
                    href="/profilo"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <User className="h-4 w-4 text-emerald-400" /> Profilo
                  </Link>
                  <Link
                    href="/impostazioni"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <Settings className="h-4 w-4 text-emerald-400" /> Impostazioni
                  </Link>
                  <div className="my-1 border-t border-slate-800" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </header>

      {/* Menu delle pagine (PC e tablet): sotto l'header, largo come le card */}
      <div className="relative z-10 hidden md:block bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3">
        {/* Desktop Navigation */}
          <nav className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.split('?')[0]);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

      </div>
      </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 pt-1.5 pb-safe">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.split('?')[0]);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all ${
                  isActive
                    ? 'text-emerald-400 font-bold scale-105'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className={`p-1 rounded-lg ${isActive ? 'bg-emerald-500/20' : ''}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
