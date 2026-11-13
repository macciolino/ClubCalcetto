'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db, auth as firebaseAuth, isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeProfiles } from '@/lib/firebase/firestoreService';
import { useAuth } from '@/lib/context/AuthContext';
import { AdminRequest, Profile, StatCategory } from '@/types/database';
import { Sheet } from '@/components/ui/Sheet';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { btn, btnInline } from '@/components/ui/buttons';
import { initialsOf, uploadedPhoto } from '@/lib/utils/playerUtils';
import { Bell, Check, Link2, Loader2, RotateCcw, UserPlus, UserX, Eraser, ClipboardCheck, ChevronDown, Lightbulb } from 'lucide-react';
import { useMatchFormats } from '@/lib/hooks/useMatchFormats';
import { FORMAT_INFO, dayFormat, isMatchFormat } from '@/lib/utils/matchFormat';
import { formatItalianDate } from '@/lib/utils/dateUtils';
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

async function resolve(id: string, action: string, guestId?: string): Promise<boolean> {
  try {
    const token = await firebaseAuth.currentUser?.getIdToken();
    const res = await fetch('/api/admin/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action, guestId }),
    });
    const data = await res.json();
    if (!data?.ok) {
      notify(data?.error === 'already_done' ? 'Richiesta già gestita da un altro admin.' : 'Operazione non riuscita, riprova.');
      return false;
    }
    return true;
  } catch {
    notify('Operazione non riuscita, riprova.');
    return false;
  }
}

function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  const src = uploadedPhoto(photo || null);
  return src ? (
    <img src={src} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
  ) : (
    <span className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-emerald-300 flex-shrink-0">
      {initialsOf(name)}
    </span>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '');

/** New player after the first match: the admin corrects the self-assessment and saves (needs_stat_review → false). */
function StatReviewCard({ player, categories, reviewerId }: { player: Profile; categories: StatCategory[]; reviewerId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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
      notify(`Valutazione di ${player.full_name} salvata`);
    } catch {
      notify('Salvataggio non riuscito, riprova.');
      setSaving(false);
    }
  };

  return (
    <li className="rounded-2xl bg-slate-950/50 p-4 space-y-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 text-left" aria-expanded={open}>
        <Avatar name={player.full_name} photo={player.avatar_url} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white truncate">{player.full_name}</span>
          <span className="block text-xs text-slate-500">
            {played === 1 ? 'Prima partita giocata' : `${played} partite giocate`} ·{' '}
            {player.self_stats ? 'si è autovalutato' : 'autovalutazione non compilata'}
          </span>
        </span>
        <span className="text-right flex-shrink-0">
          <span className="block text-[10px] font-semibold tracking-wider text-slate-500">OVR</span>
          <span className="block text-lg font-semibold text-white tabular-nums leading-tight">{Math.round(ovrOf(values) * 10)}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4 pt-1">
          <p className="text-sm text-slate-400">
            Correggi i voti in base a quello che hai visto in campo. Sotto ogni parametro c&apos;è il voto che si è dato.
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
            Salva valutazione
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Admins only: bell in the header with the number of pending requests, and the sheet to handle them
 * (new sign-up to link to a guest, closed account that wants to come back, account closed by a player).
 * The push notification for a request opens the app with ?richieste=1, which opens the sheet.
 */
export function RequestsBell() {
  const { profile, isAdmin } = useAuth();
  const admin = Boolean(isAdmin || profile?.role === 'admin');
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

  if (!admin) return null;
  const count = requests.length + reviews.length;

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
        <p className="text-sm text-slate-400">
          Si è registrato senza link di invito. È uno degli ospiti già in rosa? Collegandolo, le sue partite, gol, MVP, presenze e valutazioni
          passano al nuovo account.
        </p>
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-500">Non ci sono più ospiti senza account.</p>
        ) : (
          <ul className="rounded-xl bg-slate-950/50 divide-y divide-slate-800 max-h-64 overflow-y-auto">
            {ranked.map(({ g, score }, i) => (
              <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={g.full_name} photo={g.avatar_url} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white truncate">{g.full_name}</span>
                  <span className="block text-xs text-slate-500">
                    Ospite · {(g.matches_won || 0) + (g.matches_drawn || 0) + (g.matches_lost || 0)} partite
                    {i === 0 && score >= 0.5 && <span className="ml-1.5 text-emerald-300">· nome simile</span>}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (
                      !(await askConfirm(
                        `Collegare ${r.name} all'ospite "${g.full_name}"?\nPartite, gol, MVP, presenze e valutazioni di ${g.full_name} passano all'account di ${r.name}; il profilo ospite viene eliminato.`
                      ))
                    )
                      return;
                    run(`${r.id}:${g.id}`, () => resolve(r.id, 'link', g.id), `${r.name} collegato a ${g.full_name}`);
                  }}
                  className={`${btnInline.secondary} !px-3 !py-2 flex-shrink-0`}
                >
                  {busy === `${r.id}:${g.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Collega
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(r.id, () => resolve(r.id, 'new'), `${r.name} è un nuovo giocatore`)}
          className={btn.secondary}
        >
          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Nuovo giocatore (non collegare)
        </button>
      </>
    );
  };

  const restoreCard = (r: AdminRequest) => (
    <>
      <p className="text-sm text-slate-400">
        Aveva chiuso l&apos;account e ha provato a rientrare. Ora vede &quot;Bentornato&quot; e aspetta la tua scelta.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(`${r.id}:restore`, () => resolve(r.id, 'restore'), `Profilo di ${r.name} ripristinato`)}
          className={btn.primary}
        >
          {busy === `${r.id}:restore` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Ripristina profilo e storico
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            if (
              !(await askConfirm(
                `Far ripartire ${r.name} da zero?\nLe partite giocate restano nello storico con il suo nome, ma non contano più per il nuovo account: 0 partite e parametri di base.`,
                { danger: true }
              ))
            )
              return;
            run(`${r.id}:reset`, () => resolve(r.id, 'reset'), `${r.name} riparte da zero`);
          }}
          className={btn.secondary}
        >
          {busy === `${r.id}:reset` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
          Riparti da zero
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
        <p className="text-sm text-slate-400">
          {already
            ? `La partita è già ${FORMAT_INFO[current!].label}: puoi chiudere l'avviso.`
            : `Con il ${FORMAT_INFO[next].label} i primi ${FORMAT_INFO[next].players} iscritti diventano titolari e ricevono la notifica. Le squadre già fatte vanno rigenerate.`}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          {!already && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run(`${r.id}:apply`, () => resolve(r.id, 'apply_format'), `Partita del ${formatItalianDate(r.date!)}: ${FORMAT_INFO[next].label}`)
              }
              className={btn.primary}
            >
              {busy === `${r.id}:apply` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Passa al {FORMAT_INFO[next].label}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run(r.id, () => resolve(r.id, 'dismiss'), already ? 'Avviso chiuso' : `Resta ${FORMAT_INFO[current || '5v5'].label}`)}
            className={btn.secondary}
          >
            {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {already ? 'Chiudi avviso' : `Resta ${FORMAT_INFO[current || '5v5'].label}`}
          </button>
        </div>
      </>
    );
  };

  const closedCard = (r: AdminRequest) => (
    <>
      <p className="text-sm text-slate-400">
        {r.mode === 'delete'
          ? 'Account eliminato: i dati sono stati cancellati, le partite archiviate restano con il suo nome.'
          : 'Account disattivato: dati e storico sono conservati. Se torna, ti arriva una richiesta di rientro.'}
        {r.reason && <span className="block mt-1 text-slate-500">Motivo: {r.reason}</span>}
      </p>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run(r.id, () => resolve(r.id, 'dismiss'), 'Segnato come letto')}
        className={btn.secondary}
      >
        {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Segna come letto
      </button>
    </>
  );

  const META: Record<AdminRequest['type'], { icon: React.ElementType; tone: string; title: (r: AdminRequest) => string }> = {
    new_signup: { icon: UserPlus, tone: 'bg-emerald-500/15 text-emerald-300', title: (r) => `Nuovo iscritto: ${r.name}` },
    restore: { icon: RotateCcw, tone: 'bg-amber-500/15 text-amber-300', title: (r) => `Richiesta di rientro: ${r.name}` },
    format_proposal: {
      icon: Lightbulb,
      tone: 'bg-sky-500/15 text-sky-300',
      title: (r) =>
        `${r.count} iscritti per ${r.date ? formatItalianDate(r.date) : 'la partita'}: passare al ${
          isMatchFormat(r.format) ? FORMAT_INFO[r.format].label : r.format
        }?`,
    },
    account_closed: {
      icon: UserX,
      tone: 'bg-slate-800 text-slate-300',
      title: (r) => `${r.name} ha ${r.mode === 'delete' ? 'eliminato' : 'disattivato'} il proprio account`,
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
        className="relative p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        aria-label={count ? `Richieste da gestire: ${count}` : 'Centro notifiche'}
        title="Richieste e avvisi"
      >
        <Bell className="h-5 w-5" />
        {denied && count === 0 && (
          <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-950" aria-hidden="true" />
        )}
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-slate-950 tabular-nums">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <Sheet
          onClose={() => setOpen(false)}
          title="Richieste e avvisi"
          subtitle={count ? `${count} da gestire` : 'Tutto in ordine'}
          size="lg"
          locked={busy !== null}
        >
          {reviews.length > 0 && (
            <section className="space-y-2" aria-label="Valutazioni da rivedere">
              <h3 className="px-1 text-xs font-semibold text-slate-500">Valutazioni da rivedere · dopo la prima partita</h3>
              <ul className="space-y-3">
                {reviews.map((p) => (
                  <StatReviewCard key={p.id} player={p} categories={categories} reviewerId={profile?.id || ''} />
                ))}
              </ul>
            </section>
          )}
          {denied ? (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 text-sm text-amber-200 leading-relaxed">
              Non riesco a leggere le richieste: le regole Firestore aggiornate non risultano pubblicate. Pubblica il file firestore.rules
              dalla console Firebase (Firestore → Regole) e riapri questa finestra.
            </div>
          ) : sorted.length === 0 && reviews.length > 0 ? null : sorted.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-emerald-400">
                <Check className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-white">Nessuna richiesta in sospeso</p>
              <p className="text-sm text-slate-400">Qui arrivano nuovi iscritti da collegare, valutazioni da rivedere, richieste di rientro e account chiusi.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sorted.map((r) => {
                const m = META[r.type];
                const Icon = m.icon;
                return (
                  <li key={r.id} className="rounded-2xl bg-slate-950/50 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${m.tone}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{m.title(r)}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {r.email ? `${r.email} · ` : ''}
                          {when(r.created_at)}
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
        </Sheet>
      )}
    </>
  );
}
