'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { notify, askConfirm } from '@/components/ui/Feedback';
import { useFormSettings } from '@/lib/hooks/useForms';
import { useAuth } from '@/lib/context/AuthContext';
import { useMatchFormats } from '@/lib/hooks/useMatchFormats';
import { MatchResultFields, MatchResultValue, validateScorers } from '@/components/MatchResultFields';
import { MatchFormatPicker } from '@/components/MatchFormatPicker';
import { reconcileTeams, toTeamPlayer } from '@/lib/utils/teamUtils';
import { cashHeadCount, cashPayers, cashSummary } from '@/lib/utils/cashUtils';
import { FORMAT_INFO, dayFormat, maxPlayersFor, perHead } from '@/lib/utils/matchFormat';
import {
  effectiveMatchCost,
  effectiveMatchLocation,
  effectiveMatchTime,
  fieldCostFor,
  fieldLabel,
  matchField,
  standardCostFor,
} from '@/lib/utils/matchUtils';
import { CalendarDay, formatLongDate, shortDayParts, toDateString } from '@/lib/utils/dateUtils';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { copyToClipboard, getWhatsAppShareUrl } from '@/lib/utils/whatsapp';
import { initialsOf } from '@/lib/utils/playerUtils';
import {
  countMvpVotes,
  saveMatchFields,
  saveMatchResult,
  subscribeAppSettings,
  subscribeGeneratedTeams,
  subscribeMatch,
  subscribeMatches,
  subscribeMvpVotes,
  subscribePresencesRange,
  subscribeTeamDatesSince,
} from '@/lib/firebase/firestoreService';
import { getCachedMatchPayments, setPlayersPaid, subscribeMatchPayments } from '@/lib/services/paymentService';
import { AppSettings, GeneratedTeamRecord, Match, MatchPaymentRecord, Presence, Profile, SportField } from '@/types/database';
import { btn, btnInline, textLink } from '@/components/ui/buttons';
import { ArrowRight, Check, Clock, Coins, Loader2, RotateCcw, Send, Settings2, Share2, Star, Trophy } from 'lucide-react';

const EMPTY_RESULT: MatchResultValue = { scoreWhite: 0, scoreBlack: 0, mvpPlayerId: '', scorers: [] };

type DayStatus = 'Ufficiale' | 'In programma' | 'Da chiudere' | 'Archiviata';
type TabId = 'org' | 'cash' | 'result';

const STATUS_TONE: Record<DayStatus, string> = {
  Ufficiale: 'bg-accent/15 text-accent-text',
  'In programma': 'bg-card-hover text-secondary',
  'Da chiudere': 'bg-amber-500/15 text-warning',
  Archiviata: 'bg-line-strong/70 text-primary',
};

const TABS: { id: TabId; icon: React.ElementType }[] = [
  { id: 'org', icon: Settings2 },
  { id: 'cash', icon: Coins },
  { id: 'result', icon: Trophy },
];

/** Status (internal Italian id) → dictionary key matchDay.status.* */
const STATUS_KEY: Record<DayStatus, string> = {
  Ufficiale: 'official',
  'In programma': 'scheduled',
  'Da chiudere': 'toClose',
  Archiviata: 'archived',
};

interface TabOverviewMatchProps {
  /** Days of the presences calendar (this week and next) */
  days: CalendarDay[];
  /** Official match day (the one shown in Home, Presenze, Squadre) */
  activeDate: string;
  /** Makes a day the official one */
  onSelectDate: (dateString: string) => void;
  /** Removes the official day ('' = no match shown to everyone) */
  onClearOfficial?: () => void;
  players: Profile[];
  /** Not used anymore: this page reads the presences of every day it shows */
  presences?: Presence[];
  generatedTeamRecord?: GeneratedTeamRecord | null;
  /** Club standard cost of a 5vs5 */
  totalMatchCost?: number;
  fields?: SportField[];
  defaultFieldId?: string;
}

/**
 * Impostazioni → Partita della settimana. One day at a time:
 *  - on top the day selector (recent and coming matches, with status and sign-ups): everything below is ONLY that match;
 *  - three tabs (phone) = the life of a match: Organizzazione (official day, field, time, notes, format),
 *    Cassa (who paid), Risultato (score, scorers, MVP, archive). On a computer the panels sit side by side.
 */
export function TabOverviewMatch({
  days,
  activeDate,
  onSelectDate,
  onClearOfficial,
  players,
  totalMatchCost: standardMatchCost = 80,
  fields = [],
  defaultFieldId,
}: TabOverviewMatchProps) {
  const { profile } = useAuth();
  const t = useTranslations('matchDay');
  const { locale } = useLocaleSetting();
  const fmtDate = (d: string) => formatLongDate(d, locale);
  const stLabel = (st: DayStatus) => t(`status.${STATUS_KEY[st]}`);
  const fixedKeeper = Boolean(useFormSettings().fixedKeeper);
  const matchFormats = useMatchFormats();
  const today = toDateString(new Date());

  // ---------- giorni del selettore: calendario + partite degli ultimi 30 giorni ----------
  const [recentDates, setRecentDates] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const u1 = subscribeTeamDatesSince(toDateString(d), setRecentDates);
    const u2 = subscribeMatches(setMatches);
    return () => {
      u1();
      u2();
    };
  }, []);
  const archived = useMemo(() => {
    const m = new Map<string, Match>();
    matches.filter((x) => x.status === 'completed').forEach((x) => m.set(x.match_date || x.id, x));
    return m;
  }, [matches]);
  const allDays = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const from = toDateString(d);
    const archivedRecent = Array.from(archived.keys()).filter((x) => x >= from);
    return Array.from(new Set([...archivedRecent, ...recentDates, ...days.map((x) => x.dateString), activeDate].filter(Boolean))).sort();
  }, [archived, recentDates, days, activeDate]);

  // Iscritti di tutti i giorni mostrati (una sola lettura in tempo reale)
  const [presences, setPresences] = useState<Presence[]>([]);
  const rangeFrom = allDays[0] || activeDate;
  const rangeTo = allDays[allDays.length - 1] || activeDate;
  useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    const unsub = subscribePresencesRange(rangeFrom, rangeTo, setPresences);
    return () => unsub();
  }, [rangeFrom, rangeTo]);

  // ---------- giorno scelto: tutta la pagina parla solo di lui ----------
  const [date, setDate] = useState(activeDate || today);
  const lastActive = useRef(activeDate);
  useEffect(() => {
    // Se cambia il giorno ufficiale da fuori e stavi guardando il vecchio, segui il nuovo (tolto: resti dove sei)
    setDate((cur) => (activeDate && (cur === lastActive.current || !cur) ? activeDate : cur || today));
    lastActive.current = activeDate;
  }, [activeDate, today]);

  const statusOf = (d: string): DayStatus =>
    archived.has(d) ? 'Archiviata' : activeDate && d === activeDate ? 'Ufficiale' : d < today ? 'Da chiudere' : 'In programma';
  const status = statusOf(date);
  const [tab, setTab] = useState<TabId>('org');
  const chooseDay = (d: string) => {
    setDate(d);
    const st = statusOf(d);
    setTab(st === 'Da chiudere' || st === 'Archiviata' ? 'result' : 'org');
  };
  const selectorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectorRef.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [date, allDays.length]);

  const fmt = dayFormat(matchFormats, date);
  const info = FORMAT_INFO[fmt.format];

  // Partita, squadre e voti MVP del giorno scelto
  const [match, setMatch] = useState<Match | null>(null);
  const [teamRecord, setTeamRecord] = useState<GeneratedTeamRecord | null>(null);
  const [mvpVotes, setMvpVotes] = useState<{ playerId: string; count: number }[]>([]);
  useEffect(() => {
    setMatch(null);
    setTeamRecord(null);
    setMvpVotes([]);
    const u1 = subscribeMatch(date, setMatch);
    const u2 = subscribeGeneratedTeams(date, setTeamRecord);
    const u3 = subscribeMvpVotes(date, (v) => setMvpVotes(countMvpVotes(v)));
    return () => {
      u1();
      u2();
      u3();
    };
  }, [date]);

  // Valori standard del club (orario, costi per formato)
  const [settings, setSettings] = useState<AppSettings>({});
  useEffect(() => {
    const unsub = subscribeAppSettings((s) => setSettings(s || {}));
    return () => unsub();
  }, []);

  const location = effectiveMatchLocation(match, fields, defaultFieldId);
  const field = matchField(match, fields, defaultFieldId);
  const time = effectiveMatchTime(match, settings.standard_match_time);
  const totalCost = effectiveMatchCost(
    match,
    standardCostFor({ standard_total_cost: standardMatchCost, standard_costs: settings.standard_costs }, fmt.format),
    fieldCostFor(match, fields, defaultFieldId, undefined, fmt.format)
  );
  const isArchived = status === 'Archiviata';

  // Titolari del giorno (in ordine di iscrizione)
  const dayPresences = presences.filter((p) => p.date === date);
  const starterProfiles = dayPresences
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => (a.order_index ?? 99) - (b.order_index ?? 99))
    .map((pr) => players.find((p) => p.id === pr.player_id) || pr.profile)
    .filter((p): p is Profile => Boolean(p));

  // Squadre: archiviate così come sono; prima della partita quelle di Squadre con le sostituzioni
  const teams = (() => {
    const arch = archived.get(date);
    if (arch?.team_white?.length && arch?.team_black?.length) return { white: arch.team_white, black: arch.team_black, fromArchive: true };
    if (teamRecord?.team_white?.length && teamRecord?.team_black?.length) {
      if (date < today) return { white: teamRecord.team_white.map(toTeamPlayer), black: teamRecord.team_black.map(toTeamPlayer), fromArchive: false };
      const r = reconcileTeams(teamRecord, starterProfiles.map(toTeamPlayer));
      if (r.white.length === info.perTeam && r.black.length === info.perTeam) return { white: r.white, black: r.black, fromArchive: false };
    }
    return null;
  })();

  // ---------- cassa: chi paga ----------
  // 1. Partita archiviata → i giocatori delle squadre archiviate (elenco congelato, come lo storico).
  // 2. Squadre salvate in Squadre → i giocatori assegnati alle squadre (prima della partita con le sostituzioni;
  //    dopo la data così come sono state salvate), anche se una squadra è incompleta.
  // 3. Nessuna squadra → i titolari iscritti a quel giorno (quanti ne chiede il formato).
  const cash = cashPayers({
    date,
    today,
    archivedMatch: archived.get(date),
    teamRecord,
    starters: starterProfiles.map(toTeamPlayer),
  });
  const payers = cash.payers;
  const payerIds = payers.map((p) => p.id);
  // Quota: con le squadre fatte si divide per chi gioca davvero, altrimenti per i posti del formato
  const headCount = cashHeadCount(cash.source, payers.length, info.players);
  // Stato pagamenti: in tempo reale da Firestore (la copia locale serve solo per il primo istante; leggerla non scrive mai)
  const [payments, setPayments] = useState<MatchPaymentRecord>(() => getCachedMatchPayments(date));
  useEffect(() => {
    setPayments(getCachedMatchPayments(date));
    const unsub = subscribeMatchPayments(date, (remote) => setPayments(remote || getCachedMatchPayments(date)));
    return () => unsub();
  }, [date]);
  const markPaid = (ids: string[], paid: boolean) =>
    setPayments(setPlayersPaid(payments.date === date ? payments : getCachedMatchPayments(date), ids, paid, { totalCost, players: headCount }));
  const { paidCount, unpaid, collected, progress } = cashSummary(payers, payments, totalCost, headCount);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  // ---------- risultato ----------
  const [result, setResult] = useState<MatchResultValue>(EMPTY_RESULT);
  const [isArchiving, setIsArchiving] = useState(false);
  const prefilledFor = useRef<string | null>(null);
  const proposedFor = useRef<string | null>(null);
  useEffect(() => {
    prefilledFor.current = null;
    proposedFor.current = null;
    setResult(EMPTY_RESULT);
  }, [date]);
  useEffect(() => {
    if (match?.status === 'completed' && (match.match_date || match.id) === date && prefilledFor.current !== date) {
      prefilledFor.current = date;
      setResult({
        scoreWhite: match.score_white ?? 0,
        scoreBlack: match.score_black ?? 0,
        mvpPlayerId: match.mvp_player_id || '',
        scorers: match.scorers || [],
        penaltySaves: match.penalty_saves || [],
      });
    }
  }, [date, match]);
  useEffect(() => {
    // Il più votato dai giocatori viene proposto come MVP (l'admin può scegliere chiunque)
    if (proposedFor.current === date || match?.status === 'completed' || !mvpVotes[0]) return;
    proposedFor.current = date;
    setResult((r) => (r.mvpPlayerId ? r : { ...r, mvpPlayerId: mvpVotes[0].playerId }));
  }, [date, mvpVotes, match?.status]);
  const validation = teams ? validateScorers(result, teams.white, teams.black) : null;
  const tr = useTranslations('result');

  const handleArchive = async () => {
    if (!teams) return notify(t('needTeams'));
    const tooMany = validation?.issues.error;
    if (tooMany && tooMany.kind === 'tooMany') return notify(tr('errorTooMany', { scorers: tooMany.scorerGoals, total: tooMany.totalGoals }));
    if (
      isArchived &&
      !(await askConfirm(t('confirmUpdate')))
    )
      return;
    setIsArchiving(true);
    try {
      await saveMatchResult({
        date,
        scoreWhite: result.scoreWhite,
        scoreBlack: result.scoreBlack,
        teamWhite: teams.white,
        teamBlack: teams.black,
        mvpPlayerId: result.mvpPlayerId || null,
        scorers: result.scorers,
        penaltySaves: result.penaltySaves || [],
        totalCost,
        players: teams.white.length + teams.black.length,
        closedBy: profile?.id || '',
      });
      notify(t('archivedDone', { date: fmtDate(date) }));
    } catch (err) {
      console.error('Archiviazione fallita:', err);
      notify(t('saveFailed'));
    } finally {
      setIsArchiving(false);
    }
  };

  // ---------- organizzazione: campo, orario, note, costo ----------
  const [timeInput, setTimeInput] = useState(time);
  const [notesInput, setNotesInput] = useState('');
  const [costInput, setCostInput] = useState('');
  useEffect(() => setTimeInput(time), [time, date]);
  useEffect(() => setNotesInput(match?.notes || ''), [match?.notes, date]);
  useEffect(
    () => setCostInput(match?.cost_override && !isArchived ? String(match.total_cost) : ''),
    [match?.cost_override, match?.total_cost, date, isArchived]
  );
  const save = (patch: Partial<Match>, done?: string) =>
    saveMatchFields(date, patch)
      .then(() => done && notify(done))
      .catch(() => notify(t('saveFailedShort')));

  const shareInfo = async () => {
    const text = [
      t('shareTitle', { date: fmtDate(date) }),
      `⏰ ${t('timePrefix', { time })}`,
      `📍 ${location}${field?.maps_url ? `\n🗺️ ${field.maps_url}` : ''}`,
      t('sharePlayers', { label: info.label, players: info.players }),
      t('shareQuota', { amount: perHead(totalCost, info.players) }),
      notesInput.trim() ? `📝 ${notesInput.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await copyToClipboard(text);
    window.open(getWhatsAppShareUrl(text), '_blank');
  };

  const remindUnpaid = async () => {
    if (unpaid.length === 0) return;
    const text = [
      t('remindTitle', { date: fmtDate(date), amount: perHead(totalCost, headCount) }),
      t('remindMissing', { names: unpaid.map((p) => p.name).join(', ') }),
      t('remindThanks'),
    ].join('\n');
    await copyToClipboard(text);
    window.open(getWhatsAppShareUrl(text), '_blank');
  };

  // ---------- pannelli ----------
  const panel = 'bg-card rounded-2xl p-4 sm:p-5 space-y-4';
  const inputCls =
    'w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-60';
  const visible = (id: TabId) => (tab === id ? '' : 'hidden lg:block');
  const official = Boolean(activeDate) && date === activeDate;

  const orgPanel = (
    <section className={`${panel} ${visible('org')}`} aria-label={t('orgTitle')}>
      <h3 className="hidden lg:flex items-center gap-2 text-base font-semibold text-primary">
        <Settings2 className="h-4 w-4 text-accent-text" /> {t('orgTitle')}
      </h3>

      {/* Giorno ufficiale */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-app/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
            <Star className={`h-4 w-4 ${official ? 'text-warning fill-amber-400' : 'text-muted'}`} /> {t('officialDay')}
          </p>
          <p className="text-xs text-secondary">
            {official
              ? t('officialHint')
              : activeDate
              ? t('officialNow', { date: fmtDate(activeDate) })
              : t('officialNone')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={official}
          aria-label={t('officialDay')}
          disabled={(isArchived && !official) || (official && !onClearOfficial)}
          onClick={async () => {
            if (official) {
              if (await askConfirm(t('confirmRemoveOfficial')))
                onClearOfficial?.();
              return;
            }
            if (await askConfirm(t('confirmMakeOfficial', { date: fmtDate(date) }))) onSelectDate(date);
          }}
          className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:cursor-default ${
            official ? 'bg-accent' : 'bg-line-strong'
          } ${isArchived && !official ? 'opacity-40' : ''}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${official ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {/* Campo e orario */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8rem] gap-3">
        <label className="block min-w-0">
          <span className="block text-xs font-medium text-secondary mb-1.5">{t('field')}</span>
          <select
            value={field?.id || ''}
            disabled={isArchived}
            onChange={(e) => {
              const f = fields.find((x) => x.id === e.target.value);
              if (f) save({ location: fieldLabel(f) }, t('fieldSaved', { name: f.name }));
            }}
            className={inputCls}
          >
            {!field && <option value="">{location}</option>}
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-secondary mb-1.5">{t('time')}</span>
          <input
            type="time"
            value={timeInput}
            disabled={isArchived}
            onChange={(e) => setTimeInput(e.target.value)}
            onBlur={() => timeInput && timeInput !== time && save({ match_time: timeInput, time_override: true }, t('timeSaved', { time: timeInput }))}
            className={`${inputCls} tabular-nums`}
          />
        </label>
      </div>

      {/* Costo */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <label className="block flex-1 min-w-[10rem]">
          <span className="block text-xs font-medium text-secondary mb-1.5">{t('cost')}</span>
          <input
            type="text"
            inputMode="decimal"
            value={costInput}
            disabled={isArchived}
            placeholder={t('costPlaceholder', { cost: String(totalCost).replace('.', ',') })}
            onChange={(e) => setCostInput(e.target.value.replace(/[^0-9.,]/g, ''))}
            onBlur={() => {
              const v = Number(costInput.replace(',', '.'));
              if (v > 0 && v !== totalCost) save({ total_cost: v, cost_override: true }, t('costSaved'));
            }}
            className={`${inputCls} tabular-nums`}
          />
        </label>
        <div className="pb-2.5 text-sm text-secondary tabular-nums">{t('perHead', { amount: perHead(totalCost, headCount) })}</div>
        {match?.cost_override && !isArchived && (
          <button type="button" onClick={() => save({ cost_override: false }, t('costReset'))} className={`${textLink} pb-2.5`}>
            {t('useFieldCost')}
          </button>
        )}
      </div>

      {/* Note */}
      <label className="block">
        <span className="block text-xs font-medium text-secondary mb-1.5">{t('notes')}</span>
        <textarea
          rows={2}
          value={notesInput}
          disabled={isArchived}
          placeholder={t('notesPlaceholder')}
          onChange={(e) => setNotesInput(e.target.value)}
          onBlur={() => notesInput.trim() !== (match?.notes || '') && save({ notes: notesInput.trim() }, t('notesSaved'))}
          className={`${inputCls} resize-none`}
        />
      </label>
      <button type="button" onClick={shareInfo} className={btn.secondary}>
        <Share2 className="h-4 w-4" /> {t('shareInfo')}
      </button>

      {/* Formato e modulo */}
      <div className="space-y-3 pt-4 border-t border-line">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-primary">
            {t('format', { label: info.label, formation: fmt.formation })}
          </p>
          <Link href={`/teams?date=${date}`} className={textLink}>
            {t('goToTeams')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {isArchived ? (
          <p className="text-sm text-secondary">{t('formatLocked')}</p>
        ) : (
          <MatchFormatPicker
            date={date}
            format={fmt.format}
            formation={fmt.formation}
            field={field}
            hasTeams={Boolean(teamRecord?.team_white?.length)}
            adminId={profile?.id || ''}
          />
        )}
      </div>
    </section>
  );

  const cashPanel = (
    <section className={`${panel} ${visible('cash')} lg:sticky lg:top-36`} aria-label={t('cashTitle')}>
      <h3 className="hidden lg:flex items-center gap-2 text-base font-semibold text-primary">
        <Coins className="h-4 w-4 text-accent-text" /> {t('cashTitle')}
      </h3>
      {/* Riepilogo */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-bold text-primary tabular-nums">
            €{perHead(collected, 1)} <span className="text-sm font-medium text-secondary">{t('ofTotal', { total: perHead(totalCost, 1) })}</span>
          </p>
          <p className="text-sm text-secondary tabular-nums">{t('perHead', { amount: perHead(totalCost, headCount) })}</p>
        </div>
        <div className="h-2.5 rounded-full bg-app overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-secondary tabular-nums">
          {t('paidSummary', { paid: paidCount, total: payers.length })}
          {unpaid.length ? t('missing', { count: unpaid.length }) : payers.length ? t('allSettled') : ''}
        </p>
        <p className="text-xs text-muted">
          {cash.source === 'archive'
            ? t('sourceArchive')
            : cash.source === 'teams'
            ? t('sourceTeams')
            : t('sourceStarters')}
        </p>
      </div>

      {payers.length === 0 ? (
        <p className="rounded-xl bg-app/60 py-6 px-4 text-center text-sm text-secondary">
          {t('noStarters')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => markPaid(unpaid.map((p) => p.id), true)}
              disabled={unpaid.length === 0}
              className={`${btnInline.primary} flex-1 sm:flex-none`}
            >
              <Check className="h-4 w-4" /> {t('allPaid')}
            </button>
            <button type="button" onClick={remindUnpaid} disabled={unpaid.length === 0} className={`${btnInline.secondary} flex-1 sm:flex-none`}>
              <Send className="h-4 w-4" /> {t('remind')}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await askConfirm(t('confirmResetCash'))) {
                  markPaid(payerIds, false);
                }
              }}
              aria-label={t('resetCash')}
              title={t('resetCash')}
              className="p-2.5 rounded-xl text-secondary hover:text-danger hover:bg-card-hover"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-app/60 p-1" role="radiogroup" aria-label={t('filter')}>
            {(
              [
                [false, t('filterAll', { count: payers.length })],
                [true, t('filterUnpaid', { count: unpaid.length })],
              ] as const
            ).map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={onlyUnpaid === v}
                onClick={() => setOnlyUnpaid(v)}
                className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${onlyUnpaid === v ? 'bg-line-strong text-primary' : 'text-secondary hover:text-primary'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="rounded-xl bg-app/50 divide-y divide-line overflow-hidden">
            {(onlyUnpaid ? unpaid : payers).map((p) => {
              const paid = payments.payments[p.id] === true;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => markPaid([p.id], !paid)}
                    aria-pressed={paid}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-card-hover/60 transition-colors"
                  >
                    <span className="h-8 w-8 flex-shrink-0 rounded-full bg-card-hover flex items-center justify-center text-[11px] font-bold text-accent-text">
                      {initialsOf(p.name)}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-primary">{p.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        paid ? 'bg-accent text-on-accent' : 'bg-amber-500/15 text-warning'
                      }`}
                    >
                      {paid ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {paid ? t('paid') : t('unpaid')}
                    </span>
                  </button>
                </li>
              );
            })}
            {onlyUnpaid && unpaid.length === 0 && <li className="px-4 py-4 text-center text-sm text-accent-text">{t('everyonePaid')}</li>}
          </ul>
        </>
      )}
    </section>
  );

  const resultPanel = (
    <section className={`${panel} ${visible('result')}`} aria-label={t('resultTitle')}>
      <h3 className="hidden lg:flex items-center gap-2 text-base font-semibold text-primary">
        <Trophy className="h-4 w-4 text-warning" /> {t('resultTitle')}
      </h3>
      {isArchived && (
        <p className="flex items-start gap-2 rounded-xl bg-app/60 px-3.5 py-2.5 text-sm text-secondary">
          <Check className="h-4 w-4 flex-shrink-0 text-accent-text mt-0.5" />
          <span>
            {t('archivedInfo', { white: archived.get(date)?.score_white ?? 0, black: archived.get(date)?.score_black ?? 0 })}{' '}
            <Link href="/history" className={textLink}>
              {t('history')} <ArrowRight className="h-4 w-4" />
            </Link>
          </span>
        </p>
      )}
      {teams ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {(
              [
                [t('white'), teams.white, 'h-[9px] w-[33px] bg-white ring-1 ring-line-strong'],
                [t('black'), teams.black, 'h-2.5 w-9 bg-slate-950 border border-slate-500'],
              ] as const
            ).map(([title, list, oval]) => (
              <div key={title} className="rounded-xl bg-app/60 p-3 space-y-1 min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-secondary">
                  <span className={`rounded-full ${oval}`} aria-hidden="true" /> {title}
                </p>
                {list.map((p) => (
                  <p key={p.id} className="truncate text-primary">
                    {p.name}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            {teams.fromArchive ? (
              <>{t('teamsFromArchive')}</>
            ) : (
              <>
                {t('teamsFromSquads')}{' '}
                <Link href={`/teams?date=${date}`} className="text-accent-text underline">
                  {t('teamsFromSquadsLink')}
                </Link>
                {t('teamsFromSquadsEnd')}
              </>
            )}
          </p>
          <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={teams.white} black={teams.black} mvpVotes={mvpVotes} />
          <button type="button" onClick={handleArchive} disabled={isArchiving || Boolean(validation?.error)} className={`${btn.primary} sm:w-full`}>
            {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            {isArchived ? t('updateResult') : t('saveArchive')}
          </button>
        </>
      ) : (
        <div className="rounded-xl bg-app/60 py-8 px-4 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">{t('teamsNotReady')}</p>
          <p className="text-sm text-secondary max-w-sm mx-auto">{t('teamsNotReadyText', { label: info.label })}</p>
          <Link href={`/teams?date=${date}`} className={btn.primary}>
            {t('goToTeams')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      {/* 1. Selettore del giorno: tutto ciò che c'è sotto riguarda solo il giorno scelto */}
      <div ref={selectorRef} className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" role="radiogroup" aria-label={t('selectorAria')}>
        {allDays.map((d) => {
          const dd = Number(d.split('-')[2]);
          const st = statusOf(d);
          const selected = d === date;
          const arch = archived.get(d);
          const count = arch
            ? (arch.team_white?.length || 0) + (arch.team_black?.length || 0)
            : presences.filter((p) => p.date === d && p.status === 'confirmed').length;
          const max = arch ? count : maxPlayersFor(matchFormats, d);
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t('dayAria', { date: fmtDate(d), status: stLabel(st), count, max })}
              onClick={() => chooseDay(d)}
              className={`flex-shrink-0 w-[5.25rem] rounded-2xl px-2 py-2.5 text-center transition-colors ${
                selected ? 'bg-card-hover ring-2 ring-accent' : 'bg-card hover:bg-card-hover'
              }`}
            >
              <span className="block text-xs font-medium capitalize text-secondary">{shortDayParts(d, locale).weekday}</span>
              <span className="block text-xl font-bold leading-tight text-primary">{dd}</span>
              <span className="block text-[11px] capitalize text-muted">{shortDayParts(d, locale).month}</span>
              <span className={`mt-1.5 block rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${STATUS_TONE[st]}`}>{stLabel(st)}</span>
              <span className={`mt-1 block text-[11px] font-semibold tabular-nums ${count >= max && max > 0 ? 'text-accent-text' : 'text-muted'}`}>
                {count}/{max}
              </span>
            </button>
          );
        })}
      </div>

      {/* Il giorno scelto in una riga */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <h2 className="text-lg font-semibold text-primary capitalize">{fmtDate(date)}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>{stLabel(status)}</span>
        <span className="text-secondary">
          · {time} · {field?.name || location} · {info.label}
        </span>
      </div>

      {/* 2. Le tre schede (telefono e tablet); su PC i pannelli sono affiancati */}
      <div className="lg:hidden grid grid-cols-3 gap-1 rounded-2xl bg-card p-1" role="tablist" aria-label={t('tabs.aria')}>
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          const badge = tb.id === 'cash' && unpaid.length > 0 ? unpaid.length : null;
          return (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb.id)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-semibold transition-colors ${
                active ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(`tabs.${tb.id}`)}
              {badge !== null && (
                <span
                  className={`absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    active ? 'bg-app text-accent-text' : 'bg-amber-500 text-on-accent'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
        <div className="space-y-4 lg:space-y-6 min-w-0">
          {orgPanel}
          {resultPanel}
        </div>
        {cashPanel}
      </div>
    </div>
  );
}
