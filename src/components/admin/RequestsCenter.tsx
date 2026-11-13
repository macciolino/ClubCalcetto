'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { db, auth as firebaseAuth, isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeProfiles } from '@/lib/firebase/firestoreService';
import { useAuth } from '@/lib/context/AuthContext';
import { AdminRequest, InboxNotification, Profile, StatCategory } from '@/types/database';
import { Sheet } from '@/components/ui/Sheet';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { btn, btnInline } from '@/components/ui/buttons';
import { initialsOf, uploadedPhoto } from '@/lib/utils/playerUtils';
import { Bell, Check, Link2, Loader2, RotateCcw, UserPlus, UserX, Eraser, ClipboardCheck, ChevronDown, Lightbulb } from 'lucide-react';
import { useMatchFormats } from '@/lib/hooks/useMatchFormats';
import { FORMAT_INFO, dayFormat, isMatchFormat } from '@/lib/utils/matchFormat';
import { formatLongDate } from '@/lib/utils/dateUtils';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { StatRatingFields, ovrOf, orderedCategories } from '@/components/StatRatingFields';

/** Lowercase, no accents, single spaces. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 0..1: how much two names look alike (same words in any order count a lot, typos a little). */
export function nameSimilarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  const tx = x.split(' ');
  const ty = y.split(' ');
  const shared = tx.filter((t) => ty.some((u) => u === t || (t.length > 2 && u.length > 2 && (u.startsWith(t) || t.startsWith(u))))).length;
  const words = shared / Math.max(tx.length, ty.length);
  const chars = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  return Math.max(words, chars * 0.9);
}

type Msg = { alreadyDone: string; failed: string };
async function resolve(msg: Msg, id: string, action: string, guestId?: string): Promise<boolean> {
  try {
    const token = await firebaseAuth.currentUser?.getIdToken();
    const res = await fetch('/api/admin/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action, guestId }),
    });
    const data = await res.json();
    if (!data?.ok) {
      notify(data?.error === 'already_done' ? msg.alreadyDone : msg.failed);
      return false;
    }
    return true;
  } catch {
    notify(msg.failed);
    return false;
  }
}

function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  const src = uploadedPhoto(photo || null);
  return src ? (
    <img src={src} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
  ) : (
    <span className="h-9 w-9 rounded-full bg-card-hover flex items-center justify-center text-xs font-bold text-accent-text flex-shrink-0">
      {initialsOf(name)}
    </span>
  );
}

const when = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '');

/** New player after the first match: the admin corrects the self-assessment and saves (needs_stat_review → false). */
function StatReviewCard({ player, categories, reviewerId }: { player: Profile; categories: StatCategory[]; reviewerId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const tr = useTranslations('requests');
  const [values, setValues] = useState<Record<string, number>>(() => {
    const v: Record<string, number> = {};
    categories.forEach((c) => (v[c.name] = Number(player.stats?.[c.name] ?? c.default_value ?? 6)));
    return v;
  });
  const played = (player.matches_won || 0) + (player.matches_drawn || 0) + (player.matches_lost || 0);

  const save = async () => {
    setSaving(true);
    try {
      const stats: Record<string, number> = { ...(player.stats || {}) };
      orderedCategories(categories).forEach((c) => (stats[c.name] = Number(values[c.name])));
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'profiles', player.id), {
        stats,
        overall_rating: ovrOf(values),
        needs_stat_review: false,
        stat_reviewed_at: now,
        stat_reviewed_by: reviewerId,
        updated_at: now,
      });
      notify(tr('reviewSaved', { name: player.full_name }));
    } catch {
      notify(tr('saveFailed'));
      setSaving(false);
    }
  };

  return (
    <li className="rounded-2xl bg-app/50 p-4 space-y-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 text-left" aria-expanded={open}>
        <Avatar name={player.full_name} photo={player.avatar_url} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-primary truncate">{player.full_name}</span>
          <span className="block text-xs text-muted">
            {tr('played', { count: played })} · {player.self_stats ? tr('selfRated') : tr('notSelfRated')}
          </span>
        </span>
        <span className="text-right flex-shrink-0">
          <span className="block text-[10px] font-semibold tracking-wider text-muted">OVR</span>
          <span className="block text-lg font-semibold text-primary tabular-nums leading-tight">{Math.round(ovrOf(values) * 10)}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4 pt-1">
          <p className="text-sm text-secondary">
            {tr('reviewHint')}
          </p>
          <StatRatingFields
            categories={categories}
            values={values}
            onChange={setValues}
            reference={player.self_stats}
            disabled={saving}
          />
          <button type="button" onClick={save} disabled={saving} className={btn.primary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {tr('saveReview')}
          </button>
        </div>
      )}
    </li>
  );
}

/** "5 min fa" / "5 min ago", "3 h fa", "12 nov" — testi dal dizionario `bell` */
function ago(iso: string, tb: (key: string, values?: Record<string, number>) => string, locale: string): string {
  const t = Date.parse(iso);
  if (!t) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return tb('now');
  if (min < 60) return tb('minutesAgo', { n: min });
  if (min < 24 * 60) return tb('hoursAgo', { n: Math.round(min / 60) });
  return new Date(t).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short' }).replace(/\./g, '');
}

/**
 * The bell in the header, for EVERYONE: the notifications of the app (the same ones that arrive as push:
 * match confirmed, teams changed, substitution, you are a starter, sign-ups open, MVP vote, …) with the
 * number of unread ones. Admins also see "Da gestire" on top: requests (new sign-up, coming back, account closed,
 * format proposal) and parameters to review. A request's push opens the app with ?richieste=1 → opens the sheet.
 */
export function RequestsBell() {
  const { profile, isAdmin } = useAuth();
  const router = useRouter();
  const tb = useTranslations('bell');
  const tr = useTranslations('requests');
  const { locale } = useLocaleSetting();
  const msg: Msg = { alreadyDone: tr('alreadyDone'), failed: tr('failed') };
  const admin = Boolean(isAdmin || profile?.role === 'admin');
  const profileId = profile?.id;
  // Notifiche personali (ultime 30) e quelle non lette al momento dell'apertura (restano evidenziate)
  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Lettura negata: di solito le regole Firestore aggiornate non sono ancora pubblicate
  const [denied, setDenied] = useState(false);
  const categories = useStatCategories();
  const matchFormats = useMatchFormats();

  useEffect(() => {
    if (!admin || !isFirebaseConfigured) return;
    const unsub = onSnapshot(
      query(collection(db, 'admin_requests'), where('status', '==', 'open')),
      (snap) => {
        setDenied(false);
        setRequests(
          snap.docs.map((d) => ({ ...(d.data() as AdminRequest), id: d.id })).sort((a, b) => b.created_at.localeCompare(a.created_at))
        );
      },
      (err) => {
        console.warn('admin_requests:', err?.code || err);
        setDenied(true);
        setRequests([]);
      }
    );
    return () => unsub();
  }, [admin]);

  // Giocatori sempre in ascolto (servono anche per il contatore: valutazioni da rivedere)
  useEffect(() => {
    if (!admin) return;
    const unsub = subscribeProfiles((list) => setPlayers(list || []));
    return () => unsub();
  }, [admin]);

  useEffect(() => {
    if (!profileId || !isFirebaseConfigured) return;
    const unsub = onSnapshot(
      query(collection(db, 'profiles', profileId, 'notifications'), orderBy('created_at', 'desc'), limit(30)),
      (snap) => setInbox(snap.docs.map((d) => ({ ...(d.data() as InboxNotification), id: d.id }))),
      (err) => {
        console.warn('notifiche:', err?.code || err);
        setInbox([]);
      }
    );
    return () => unsub();
  }, [profileId]);

  // Aperta la campanella: le non lette diventano lette (restano evidenziate finché è aperta)
  useEffect(() => {
    if (!open || !profileId) return;
    const unread = inbox.filter((n) => !n.read);
    if (unread.length === 0) return;
    setFreshIds((prev) => new Set([...Array.from(prev), ...unread.map((n) => n.id)]));
    const t = setTimeout(() => {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, 'profiles', profileId, 'notifications', n.id), { read: true }));
      batch.commit().catch((err) => console.warn('notifiche lette:', err?.code || err));
    }, 800);
    return () => clearTimeout(t);
  }, [open, inbox, profileId]);
  useEffect(() => {
    if (!open) setFreshIds(new Set());
  }, [open]);

  useEffect(() => {
    if (!admin) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('richieste') === '1') {
        setOpen(true);
        url.searchParams.delete('richieste');
        window.history.replaceState(null, '', url.pathname + url.search);
      }
    } catch {
      /* ignore */
    }
  }, [admin]);

  const guests = useMemo(() => players.filter((p) => p.is_guest && !p.archived_at), [players]);
  // Nuovi giocatori che hanno giocato la prima partita: i parametri li rivede un admin
  const reviews = useMemo(
    () =>
      players.filter(
        (p) => p.needs_stat_review && !p.is_guest && (p.matches_won || 0) + (p.matches_drawn || 0) + (p.matches_lost || 0) >= 1
      ),
    [players]
  );

  if (!profile) return null;
  const todo = admin ? requests.length + reviews.length : 0;
  const unreadCount = inbox.filter((n) => !n.read).length;
  const count = todo + unreadCount;

  const run = async (key: string, fn: () => Promise<boolean>, done: string) => {
    setBusy(key);
    const ok = await fn();
    setBusy(null);
    if (ok) notify(done);
  };

  const signupCard = (r: AdminRequest) => {
    const ranked = guests
      .map((g) => ({ g, score: nameSimilarity(r.name, g.full_name) }))
      .sort((a, b) => b.score - a.score || a.g.full_name.localeCompare(b.g.full_name));
    return (
      <>
        <p className="text-sm text-secondary">
          {tr('signupHint')}
        </p>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted">{tr('noGuests')}</p>
        ) : (
          <ul className="rounded-xl bg-app/50 divide-y divide-line max-h-64 overflow-y-auto">
            {ranked.map(({ g, score }, i) => (
              <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={g.full_name} photo={g.avatar_url} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-primary truncate">{g.full_name}</span>
                  <span className="block text-xs text-muted">
                    {tr('guestMatches', { count: (g.matches_won || 0) + (g.matches_drawn || 0) + (g.matches_lost || 0) })}
                    {i === 0 && score >= 0.5 && <span className="ml-1.5 text-accent-text">{tr('similar')}</span>}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (
                      !(await askConfirm(
                        tr('confirmLink', { name: r.name, guest: g.full_name })
                      ))
                    )
                      return;
                    run(`${r.id}:${g.id}`, () => resolve(msg, r.id, 'link', g.id), tr('linked', { name: r.name, guest: g.full_name }));
                  }}
                  className={`${btnInline.secondary} !px-3 !py-2 flex-shrink-0`}
                >
                  {busy === `${r.id}:${g.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {tr('link')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(r.id, () => resolve(msg, r.id, 'new'), tr('isNew', { name: r.name }))}
          className={btn.secondary}
        >
          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {tr('newPlayer')}
        </button>
      </>
    );
  };

  const restoreCard = (r: AdminRequest) => (
    <>
      <p className="text-sm text-secondary">
        {tr('restoreHint')}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(`${r.id}:restore`, () => resolve(msg, r.id, 'restore'), tr('restored', { name: r.name }))}
          className={btn.primary}
        >
          {busy === `${r.id}:restore` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {tr('restore')}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            if (
              !(await askConfirm(
                tr('confirmReset', { name: r.name }),
                { danger: true }
              ))
            )
              return;
            run(`${r.id}:reset`, () => resolve(msg, r.id, 'reset'), tr('resetDone', { name: r.name }));
          }}
          className={btn.secondary}
        >
          {busy === `${r.id}:reset` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
          {tr('reset')}
        </button>
      </div>
    </>
  );

  // Proposta di cambio formato: tanti iscritti per un giorno
  const formatCard = (r: AdminRequest) => {
    const next = isMatchFormat(r.format) ? r.format : null;
    const current = r.date ? dayFormat(matchFormats, r.date).format : null;
    const already = next && current && FORMAT_INFO[current].players >= FORMAT_INFO[next].players;
    if (!next || !r.date) return null;
    return (
      <>
        <p className="text-sm text-secondary">
          {already
            ? tr('formatAlready', { label: FORMAT_INFO[current!].label })
            : tr('formatHint', { label: FORMAT_INFO[next].label, n: FORMAT_INFO[next].players })}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          {!already && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run(`${r.id}:apply`, () => resolve(msg, r.id, 'apply_format'), tr('formatApplied', { date: formatLongDate(r.date!, locale), label: FORMAT_INFO[next].label }))
              }
              className={btn.primary}
            >
              {busy === `${r.id}:apply` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {tr('switchTo', { label: FORMAT_INFO[next].label })}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run(r.id, () => resolve(msg, r.id, 'dismiss'), already ? tr('dismissed') : tr('stay', { label: FORMAT_INFO[current || '5v5'].label }))}
            className={btn.secondary}
          >
            {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {already ? tr('closeNotice') : tr('stay', { label: FORMAT_INFO[current || '5v5'].label })}
          </button>
        </div>
      </>
    );
  };

  const closedCard = (r: AdminRequest) => (
    <>
      <p className="text-sm text-secondary">
        {r.mode === 'delete'
          ? tr('deletedInfo')
          : tr('deactivatedInfo')}
        {r.reason && <span className="block mt-1 text-muted">{tr('reason', { reason: r.reason })}</span>}
      </p>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run(r.id, () => resolve(msg, r.id, 'dismiss'), tr('markedRead'))}
        className={btn.secondary}
      >
        {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {tr('markRead')}
      </button>
    </>
  );

  const META: Record<AdminRequest['type'], { icon: React.ElementType; tone: string; title: (r: AdminRequest) => string }> = {
    new_signup: { icon: UserPlus, tone: 'bg-accent/15 text-accent-text', title: (r) => tr('tNewSignup', { name: r.name }) },
    restore: { icon: RotateCcw, tone: 'bg-amber-500/15 text-warning', title: (r) => tr('tRestore', { name: r.name }) },
    format_proposal: {
      icon: Lightbulb,
      tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
      title: (r) =>
        tr('tFormat', {
          count: r.count ?? 0,
          date: r.date ? formatLongDate(r.date, locale) : tr('theMatch'),
          label: isMatchFormat(r.format) ? FORMAT_INFO[r.format].label : String(r.format || ''),
        }),
    },
    account_closed: {
      icon: UserX,
      tone: 'bg-card-hover text-secondary',
      title: (r) => (r.mode === 'delete' ? tr('tDeleted', { name: r.name }) : tr('tDeactivated', { name: r.name })),
    },
  };
  // Prima le richieste che aspettano una scelta (rientro, nuovi iscritti), poi gli avvisi
  const order = { format_proposal: 0, restore: 1, new_signup: 2, account_closed: 3 } as const;
  const sorted = [...requests].sort((a, b) => order[a.type] - order[b.type]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-full text-secondary hover:text-primary hover:bg-card-hover transition-colors"
        aria-label={count ? tb('labelWithCount', { count }) : tb('label')}
        title={tb('label')}
      >
        <Bell className="h-5 w-5" />
        {admin && denied && count === 0 && (
          <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-app" aria-hidden="true" />
        )}
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-app tabular-nums">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <Sheet
          onClose={() => setOpen(false)}
          title={tb('title')}
          subtitle={
            todo
              ? unreadCount
                ? tb('toHandleAndNew', { todo, count: unreadCount })
                : tb('toHandle', { count: todo })
              : unreadCount
              ? tb('newCount', { count: unreadCount })
              : tb('allGood')
          }
          size="lg"
          locked={busy !== null}
        >
          {admin && (todo > 0 || denied) && <h3 className="px-1 -mb-3 text-xs font-semibold text-muted">{tb('sectionToHandle')}</h3>}
          {admin && reviews.length > 0 && (
            <section className="space-y-2" aria-label={tr('reviewsAria')}>
              <h3 className="px-1 text-xs font-semibold text-muted">{tr('reviewsTitle')}</h3>
              <ul className="space-y-3">
                {reviews.map((p) => (
                  <StatReviewCard key={p.id} player={p} categories={categories} reviewerId={profile?.id || ''} />
                ))}
              </ul>
            </section>
          )}
          {!admin ? null : denied ? (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 text-sm text-warning leading-relaxed">
              {tr('denied')}
            </div>
          ) : sorted.length === 0 ? null : (
            <ul className="space-y-3">
              {sorted.map((r) => {
                const m = META[r.type];
                const Icon = m.icon;
                return (
                  <li key={r.id} className="rounded-2xl bg-app/50 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${m.tone}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary">{m.title(r)}</p>
                        <p className="text-xs text-muted truncate">
                          {r.email ? `${r.email} · ` : ''}
                          {when(r.created_at, locale)}
                        </p>
                      </div>
                    </div>
                    {r.type === 'new_signup'
                      ? signupCard(r)
                      : r.type === 'restore'
                      ? restoreCard(r)
                      : r.type === 'format_proposal'
                      ? formatCard(r)
                      : closedCard(r)}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Notifiche personali: le stesse che arrivano sul telefono */}
          <section className="space-y-2" aria-label={tr('notificationsAria')}>
            {admin && todo > 0 && <h3 className="px-1 text-xs font-semibold text-muted">{tb('sectionNotifications')}</h3>}
            {inbox.length === 0 ? (
              todo > 0 ? (
                <p className="px-1 text-sm text-muted">{tb('none')}</p>
              ) : (
                <div className="py-10 text-center space-y-2">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-card-hover text-accent-text">
                    <Check className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-semibold text-primary">{tb('emptyTitle')}</p>
                  <p className="text-sm text-secondary">
                    {tb('emptyText')}
                  </p>
                </div>
              )
            ) : (
              <ul className="rounded-2xl bg-app/50 divide-y divide-line overflow-hidden">
                {inbox.map((n) => {
                  const isNew = !n.read || freshIds.has(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          if (n.url) router.push(n.url);
                        }}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-card-hover/60 ${isNew ? 'bg-accent/[0.06]' : ''}`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isNew ? 'bg-accent/90' : 'bg-transparent'}`}
                          aria-label={isNew ? tb('new') : undefined}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={`text-sm truncate ${isNew ? 'font-semibold text-primary' : 'font-medium text-primary'}`}>{n.title}</span>
                            <span className="flex-shrink-0 text-[11px] text-muted tabular-nums">{ago(n.created_at, tb, locale)}</span>
                          </span>
                          <span className="block text-sm text-secondary leading-snug mt-0.5">{n.body}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </Sheet>
      )}
    </>
  );
}
