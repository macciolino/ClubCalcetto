'use client';

import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Copy, Link2, Loader2, RefreshCw, Save, Search, Share2, Trash2, UserCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { lcol } from '@/lib/league/leagueRefs';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { btn } from '@/components/ui/buttons';
import { LeagueRoleBadge } from '@/components/league/LeagueSwitcher';
import { DeleteLeagueSheet } from '@/components/league/DeleteLeagueSheet';
import { fetchInviteCode, inviteUrl, leagueAdminRequest } from '@/lib/services/leagueService';
import { CALCETTARI_LEAGUE_ID, type League, type LeagueMemberPlayer, type LeagueRole, type LeagueVisibility } from '@/types/league';

const card = 'bg-card p-4 sm:p-5 rounded-2xl space-y-3';
const field = 'w-full rounded-xl border border-line bg-app px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-60';
const ROLES: LeagueRole[] = ['PRESIDENT', 'COLLABORATOR', 'PLAYER'];

/** The active league document (name, visibility…), live. */
function useLeagueDoc(leagueId: string | null): League | null {
  const [league, setLeague] = useState<League | null>(null);
  useEffect(() => {
    if (!leagueId || !isFirebaseConfigured) return;
    return onSnapshot(doc(db, 'leagues', leagueId), (s) => setLeague(s.exists() ? ({ ...(s.data() as League), id: s.id }) : null), () => setLeague(null));
  }, [leagueId]);
  return league;
}

/** Multi-league step 3 — Impostazioni → Lega: invite link, league details, members and roles, "I play too". */
export function LeaguePanel() {
  const { activeLeagueId, canManageMatchesAndCash, isPresident } = useActiveLeague();
  const league = useLeagueDoc(activeLeagueId);
  return (
    <div className="space-y-4">
      {canManageMatchesAndCash && <InviteCard leagueName={league?.name || ''} />}
      <LeagueDetailsCard league={league} editable={isPresident} />
      {/* Own playing status on top: on a phone nobody has to scroll a 30-player list to find it */}
      <PlayingCard />
      <MembersCard editable={isPresident} />
      {/* Presidents only (the server checks it too); the base league "I Calcettari" can never be deleted */}
      {isPresident && league && league.id !== CALCETTARI_LEAGUE_ID && <DeleteLeagueCard league={league} />}
    </div>
  );
}

/** Danger zone: delete the league for good, after typing its exact name. */
function DeleteLeagueCard({ league }: { league: League }) {
  const t = useTranslations('league.delete');
  const [open, setOpen] = useState(false);
  const remove = async (typedName: string) => {
    const res = await leagueAdminRequest({ action: 'delete', confirmName: typedName });
    if (res !== 'ok') return res;
    setOpen(false);
    notify(t('done', { name: league.name }));
    return 'ok';
  };
  return (
    <section className="bg-card rounded-2xl p-4 sm:p-5 space-y-3 border border-rose-500/25" aria-labelledby="delete-league">
      <h2 id="delete-league" className="text-base font-bold text-danger">{t('zone')}</h2>
      <p className="text-sm text-secondary">{t('intro')}</p>
      <button type="button" onClick={() => setOpen(true)} className={btn.danger}>
        <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('open')}
      </button>
      {open && <DeleteLeagueSheet leagueName={league.name} onDelete={remove} onClose={() => setOpen(false)} />}
    </section>
  );
}

function InviteCard({ leagueName }: { leagueName: string }) {
  const t = useTranslations('league.invite');
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchInviteCode().then((c) => {
      if (!alive) return;
      setCode(c);
      setState(c ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, []);

  const url = code ? inviteUrl(code) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify(t('copied'));
    } catch {
      notify(url);
    }
  };
  const regenerate = async () => {
    if (busy.current || !(await askConfirm(t('regenerateConfirm')))) return;
    busy.current = true;
    setState('loading');
    const c = await fetchInviteCode(true);
    busy.current = false;
    setCode(c ?? code);
    setState(c ? 'ready' : 'error');
    notify(c ? t('regenerated') : t('failed'));
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t('share', { name: leagueName, url }))}`;

  return (
    <section className={card} aria-labelledby="invite-title">
      <div>
        <h2 id="invite-title" className="text-sm font-bold text-primary flex items-center gap-2">
          <Link2 className="h-5 w-5 text-accent-text" aria-hidden="true" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-0.5">{t('intro')}</p>
      </div>
      {state === 'loading' && (
        <p className="text-xs text-secondary flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('loading')}
        </p>
      )}
      {state === 'error' && <p className="text-xs text-danger">{t('failed')}</p>}
      {state === 'ready' && code && (
        <>
          <input readOnly value={url} aria-label={t('title')} onFocus={(e) => e.target.select()} className={`${field} font-mono text-xs`} />
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={copy} className={btn.primary}>
              <Copy className="h-4 w-4" aria-hidden="true" /> {t('copy')}
            </button>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
              <Share2 className="h-4 w-4" aria-hidden="true" /> {t('whatsapp')}
            </a>
            <button type="button" onClick={regenerate} className={btn.secondary}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t('regenerate')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function LeagueDetailsCard({ league, editable }: { league: League | null; editable: boolean }) {
  const t = useTranslations('league.details');
  const tc = useTranslations('league.create');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<LeagueVisibility>('private');
  const [saving, setSaving] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Form filled once per league (live updates do not overwrite what is being typed)
  useEffect(() => {
    if (!league || loadedFor.current === league.id) return;
    loadedFor.current = league.id;
    setName(league.name);
    setVisibility(league.visibility);
  }, [league]);

  if (!league) return null;
  const changed = name.trim() !== league.name || visibility !== league.visibility;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    const res = await leagueAdminRequest({ action: 'settings', name: name.trim(), visibility });
    setSaving(false);
    notify(res === 'ok' ? t('saved') : t('failed'));
  };

  return (
    <form onSubmit={save} className={card} aria-labelledby="details-title">
      <h2 id="details-title" className="text-sm font-bold text-primary">
        {t('title')}
      </h2>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-secondary">{t('name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} disabled={!editable} className={field} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-secondary">{t('visibility')}</span>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as LeagueVisibility)} disabled={!editable} className={field}>
          <option value="private">{tc('private')}</option>
          <option value="public">{tc('public')}</option>
        </select>
      </label>
      {editable ? (
        <button type="submit" disabled={!changed || saving || name.trim().length < 2} className={btn.primary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} {t('save')}
        </button>
      ) : (
        <p className="text-xs text-muted">{t('onlyPresident')}</p>
      )}
    </form>
  );
}

function MembersCard({ editable }: { editable: boolean }) {
  const t = useTranslations('league.members');
  const tr = useTranslations('league.roles');
  const { member } = useActiveLeague();
  const [cards, setCards] = useState<LeagueMemberPlayer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      lcol('players'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as LeagueMemberPlayer), id: d.id }))
          .filter((p) => p.userId && !p.deactivated_at && !p.archived_at && !p.removed_at)
          .sort((a, b) => ROLES.indexOf(a.leagueRole) - ROLES.indexOf(b.leagueRole) || a.full_name.localeCompare(b.full_name));
        setCards(list);
      },
      () => setCards([])
    );
  }, []);

  const needle = normalizeName(query);
  const shown = needle ? cards.filter((p) => normalizeName(p.full_name).includes(needle)) : cards;

  const changeRole = async (p: LeagueMemberPlayer, role: LeagueRole) => {
    if (busyId || role === p.leagueRole) return;
    setBusyId(p.id);
    const res = await leagueAdminRequest({ action: 'role', playerId: p.id, role });
    setBusyId(null);
    notify(res === 'ok' ? t('changed', { name: p.full_name, role: tr(role) }) : t(`errors.${res}`));
  };

  return (
    <section className={card} aria-labelledby="members-title">
      <div>
        <h2 id="members-title" className="text-sm font-bold text-primary flex items-center gap-2">
          <Users className="h-5 w-5 text-accent-text" aria-hidden="true" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-0.5">{t('intro')}</p>
      </div>
      {cards.length > 6 && (
        <label className="relative block">
          <span className="sr-only">{t('search')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={`${field} pl-9`}
          />
        </label>
      )}
      {shown.length === 0 && <p className="text-xs text-muted">{t('noResults')}</p>}
      <ul className="divide-y divide-line">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">
                {p.full_name}
                {p.id === member?.id && <span className="ml-1.5 text-xs font-normal text-muted">({t('you')})</span>}
              </p>
              {p.isActivePlayer === false && <p className="text-xs text-muted">{t('organiser')}</p>}
            </div>
            {editable ? (
              <select
                value={p.leagueRole}
                onChange={(e) => changeRole(p, e.target.value as LeagueRole)}
                disabled={busyId !== null}
                aria-label={t('roleOf', { name: p.full_name })}
                className="rounded-lg border border-line bg-app px-2 py-1.5 text-xs font-semibold text-primary focus:outline-none focus:border-accent"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
              </select>
            ) : (
              <LeagueRoleBadge role={p.leagueRole} />
            )}
            {busyId === p.id && <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Name search ignoring case and accents ("nicolo" finds "Nicolò"). */
const normalizeName = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** "Gioco anch'io": the member's own playing status in the active league (any role). */
function PlayingCard() {
  const t = useTranslations('league.members');
  const { member } = useActiveLeague();
  const [saving, setSaving] = useState(false);
  if (!member) return null;
  const toggle = async (active: boolean) => {
    if (saving) return;
    setSaving(true);
    const res = await leagueAdminRequest({ action: 'playing', active });
    setSaving(false);
    if (res !== 'ok') notify(t(`errors.${res}`));
  };
  return (
    <section className={card} aria-labelledby="playing-title">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={member.isActivePlayer !== false}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent-primary))]"
        />
        <span className="flex-1">
          <span id="playing-title" className="text-sm font-semibold text-primary flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-accent-text" aria-hidden="true" /> {t('playing')}
          </span>
          <span className="block text-xs text-secondary mt-0.5">{t('playingHint')}</span>
        </span>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-hidden="true" />}
      </label>
    </section>
  );
}
