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
  LogOut,
  Trophy,
  User,
  History,
  Home,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { menu } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';
import { RequestsBell } from '@/components/admin/RequestsCenter';
import { SelfRatingPrompt } from '@/components/SelfRatingPrompt';

export function Navbar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
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
    { href: '/', label: t('home'), icon: Home },
    { href: '/attendance', label: t('attendance'), icon: CalendarDays },
    { href: '/players', label: t('players'), icon: Users },
    { href: '/teams', label: t('teams'), icon: Trophy },
    { href: '/history', label: t('history'), icon: History },
    // Profilo: si apre dal menu dell'utente (icona in alto a destra), non serve nella barra
    // Admin: non è più nella barra. Si entra da Impostazioni (menu dell'icona), che per gli admin apre la partita della settimana
  ];

  const displayName = mounted && profile?.full_name ? profile.full_name : t('guest');
  const roleLabel = isStrictAdmin ? t('admin') : t('player');
  const showAdminBadge = isStrictAdmin;
  const avatarChar = mounted && profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U';
  const avatarUrl = mounted ? profile?.avatar_url : null;

  return (
    <>
      {/* Top Header */}
      {/* Header + menu delle pagine restano fissi in alto mentre si scorre */}
      <div className="sticky top-0 z-40">
      {/* relative z-20: il menu utente (dentro l'header) deve stare SOPRA la barra delle pagine qui sotto */}
      <header className="relative z-20 w-full border-b border-line bg-app/90 backdrop-blur-md pt-safe">
        {/* Logo con nome a sinistra, profilo a destra */}
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 hover:opacity-90">
            <BrandLogo />
            <span className="text-lg sm:text-xl font-black tracking-tight text-primary whitespace-nowrap">
              Club <span className="text-accent-text">Soccer</span>
            </span>
          </Link>
          {/* User Info & Actions */}
          <div className="flex items-center justify-end gap-3 min-w-0">
            {/* Campanella: notifiche per tutti, più le richieste da gestire per gli admin */}
            <RequestsBell />
            {/* Nuovo giocatore: autovalutazione dei parametri (una volta) */}
            <SelfRatingPrompt />
            {/* Icona, nome e ruolo: aprono il menu dell'utente */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls="user-menu"
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group cursor-pointer"
                title={t('userMenu')}
              >
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-accent/40 group-hover:ring-accent transition-all"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-card-hover border border-line-strong flex items-center justify-center font-bold text-accent-text text-sm group-hover:border-accent transition-colors">
                      {avatarChar}
                    </div>
                  )}
                  {showAdminBadge && (
                    <span
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-on-accent ring-2 ring-app"
                      title={t('administrator')}
                    >
                      ★
                    </span>
                  )}
                </div>

                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-primary leading-tight max-w-[120px] truncate group-hover:text-accent-text transition-colors">
                    {displayName}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-accent-text">
                    {roleLabel}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-secondary transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {menuOpen && (
                <div
                  id="user-menu"
                  role="menu"
                  className={`absolute right-0 top-full mt-2 w-52 z-50 ${menu.panel}`}
                >
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className={menu.item}
                  >
                    <User className="h-4 w-4 text-accent-text" /> {t('profile')}
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className={menu.item}
                  >
                    <Settings className="h-4 w-4 text-accent-text" /> {t('settings')}
                  </Link>
                  <div className={menu.divider} />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className={menu.danger}
                  >
                    <LogOut className="h-4 w-4" /> {t('logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </header>

      {/* Menu delle pagine (PC e tablet): sotto l'header, largo come le card */}
      <div className="relative z-10 hidden md:block bg-app/90 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3">
        {/* Desktop Navigation */}
          <nav aria-label={t('mainNav')} className="flex items-center gap-1 bg-card/80 p-1.5 rounded-xl border border-line/80">
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
                      ? 'bg-accent text-on-accent shadow-md shadow-accent/20'
                      : 'text-secondary hover:text-primary hover:bg-card-hover/60'
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
      <div role="navigation" aria-label={t('mainNav')} className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-app/95 backdrop-blur-lg border-t border-line/80 pt-1.5 pb-safe">
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
                    ? 'text-accent-text font-bold scale-105'
                    : 'text-secondary hover:text-primary font-medium'
                }`}
              >
                <div className={`p-1 rounded-lg ${isActive ? 'bg-accent/20' : ''}`}>
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
