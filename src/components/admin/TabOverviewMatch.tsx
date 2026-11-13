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
import { CalendarDay, formatItalianDate, toDateString } from '@/lib/utils/dateUtils';
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

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'org', label: 'Organizzazione', icon: Settings2 },
  { id: 'cash', label: 'Cassa', icon: Coins },
  { id: 'result', label: 'Risultato', icon: Trophy },
];

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
  const validation = teams ? validateScorers(result, teams.white, teams.black) : { error: null, warnings: [] };

  const handleArchive = async () => {
    if (!teams) return notify('Prima genera le squadre nella sezione Squadre.');
    if (validation.error) return notify(validation.error);
    if (
      isArchived &&
      !(await askConfirm('Questa partita è già archiviata. Aggiornare il risultato? Vittorie, pareggi e sconfitte vengono corretti, non sommati di nuovo.'))
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
      notify(`Partita del ${formatItalianDate(date)} archiviata: la trovi nello Storico.`);
    } catch (err) {
      console.error('Archiviazione fallita:', err);
      notify('Salvataggio non riuscito. Controlla la connessione e riprova.');
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
      .catch(() => notify('Salvataggio non riuscito, riprova.'));

  const shareInfo = async () => {
    const text = [
      `⚽ *Partita del ${formatItalianDate(date)}*`,
      `⏰ Ore ${time}`,
      `📍 ${location}${field?.maps_url ? `\n🗺️ ${field.maps_url}` : ''}`,
      `🏟️ ${info.label} · ${info.players} giocatori`,
      `💰 €${perHead(totalCost, info.players)} a testa`,
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
      `💰 *Quota partita del ${formatItalianDate(date)}*: €${perHead(totalCost, headCount)} a testa.`,
      `Mancano ancora: ${unpaid.map((p) => p.name).join(', ')}.`,
      'Grazie! ⚽',
    ].join('\n');
    await copyToClipboard(text);
    window.open(getWhatsAppShareUrl(text), '_blank');
  };

  // ---------- pannelli ----------
  const panel = 'bg-card rounded-2xl p-4 sm:p-5 space-y-4';
  const inputCls =
    'w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-60';
  const visible = (t: TabId) => (tab === t ? '' : 'hidden lg:block');
  const official = Boolean(activeDate) && date === activeDate;

  const orgPanel = (
    <section className={`${panel} ${visible('org')}`} aria-label="Organizzazione e campo">
      <h3 className="hidden lg:flex items-center gap-2 text-base font-semibold text-primary">
        <Settings2 className="h-4 w-4 text-accent-text" /> Organizzazione e campo
      </h3>

      {/* Giorno ufficiale */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-app/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
            <Star className={`h-4 w-4 ${official ? 'text-warning fill-amber-400' : 'text-muted'}`} /> Giorno ufficiale
          </p>
          <p className="text-xs text-secondary">
            {official
              ? 'È la partita mostrata a tutti in Home, Presenze e Squadre.'
              : activeDate
              ? `Ora è ${formatItalianDate(activeDate)}.`
              : 'Nessun giorno ufficiale: attivalo per mostrarlo a tutti.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={official}
          aria-label="Giorno ufficiale"
          disabled={(isArchived && !official) || (official && !onClearOfficial)}
          onClick={async () => {
            if (official) {
              if (await askConfirm('Togliere il giorno ufficiale? Home, Presenze e Squadre non metteranno in evidenza nessuna partita finché non ne scegli un altro.'))
                onClearOfficial?.();
              return;
            }
            if (await askConfirm(`Rendere ${formatItalianDate(date)} il giorno ufficiale della settimana?`)) onSelectDate(date);
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
          <span className="block text-xs font-medium text-secondary mb-1.5">Campo</span>
          <select
            value={field?.id || ''}
            disabled={isArchived}
            onChange={(e) => {
              const f = fields.find((x) => x.id === e.target.value);
              if (f) save({ location: fieldLabel(f) }, `Campo: ${f.name}`);
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
          <span className="block text-xs font-medium text-secondary mb-1.5">Orario</span>
          <input
            type="time"
            value={timeInput}
            disabled={isArchived}
            onChange={(e) => setTimeInput(e.target.value)}
            onBlur={() => timeInput && timeInput !== time && save({ match_time: timeInput, time_override: true }, `Orario: ${timeInput}`)}
            className={`${inputCls} tabular-nums`}
          />
        </label>
      </div>

      {/* Costo */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <label className="block flex-1 min-w-[10rem]">
          <span className="block text-xs font-medium text-secondary mb-1.5">Costo della partita (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={costInput}
            disabled={isArchived}
            placeholder={`${String(totalCost).replace('.', ',')} · dal campo`}
            onChange={(e) => setCostInput(e.target.value.replace(/[^0-9.,]/g, ''))}
            onBlur={() => {
              const v = Number(costInput.replace(',', '.'));
              if (v > 0 && v !== totalCost) save({ total_cost: v, cost_override: true }, 'Costo personalizzato per questa partita');
            }}
            className={`${inputCls} tabular-nums`}
          />
        </label>
        <div className="pb-2.5 text-sm text-secondary tabular-nums">€{perHead(totalCost, headCount)} a testa</div>
        {match?.cost_override && !isArchived && (
          <button type="button" onClick={() => save({ cost_override: false }, 'Costo del campo ripristinato')} className={`${textLink} pb-2.5`}>
            Usa il costo del campo
          </button>
        )}
      </div>

      {/* Note */}
      <label className="block">
        <span className="block text-xs font-medium text-secondary mb-1.5">Note e info utili</span>
        <textarea
          rows={2}
          value={notesInput}
          disabled={isArchived}
          placeholder="Es. portare maglia bianca e nera, ingresso dal retro…"
          onChange={(e) => setNotesInput(e.target.value)}
          onBlur={() => notesInput.trim() !== (match?.notes || '') && save({ notes: notesInput.trim() }, 'Note salvate')}
          className={`${inputCls} resize-none`}
        />
      </label>
      <button type="button" onClick={shareInfo} className={btn.secondary}>
        <Share2 className="h-4 w-4" /> Condividi info su WhatsApp
      </button>

      {/* Formato e modulo */}
      <div className="space-y-3 pt-4 border-t border-line">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-primary">
            Formato · {info.label} {fmt.formation}
          </p>
          <Link href={`/teams?date=${date}`} className={textLink}>
            Vai alle squadre <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {isArchived ? (
          <p className="text-sm text-secondary">Partita archiviata: il formato non si cambia più.</p>
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
    <section className={`${panel} ${visible('cash')} lg:sticky lg:top-36`} aria-label="Cassa e quote">
      <h3 className="hidden lg:flex items-center gap-2 text-base font-semibold text-primary">
        <Coins className="h-4 w-4 text-accent-text" /> Cassa e quote
      </h3>
      {/* Riepilogo */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-bold text-primary tabular-nums">
            €{perHead(collected, 1)} <span className="text-sm font-medium text-secondary">di €{perHead(totalCost, 1)}</span>
          </p>
          <p className="text-sm text-secondary tabular-nums">€{perHead(totalCost, headCount)} a testa</p>
        </div>
        <div className="h-2.5 rounded-full bg-app overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-secondary tabular-nums">
          {paidCount} su {payers.length} hanno pagato{unpaid.length ? ` · mancano ${unpaid.length}` : payers.length ? ' · tutto saldato' : ''}
        </p>
        <p className="text-xs text-muted">
          {cash.source === 'archive'
            ? 'Giocatori della partita archiviata: elenco bloccato.'
            : cash.source === 'teams'
            ? 'Giocatori delle squadre salvate in Squadre.'
            : 'Titolari iscritti: quando salvi le squadre l’elenco diventa quello delle squadre.'}
        </p>
      </div>

      {payers.length === 0 ? (
        <p className="rounded-xl bg-app/60 py-6 px-4 text-center text-sm text-secondary">
          Nessun titolare per questo giorno: le quote compaiono quando i giocatori si iscrivono.
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
              <Check className="h-4 w-4" /> Tutti pagati
            </button>
            <button type="button" onClick={remindUnpaid} disabled={unpaid.length === 0} className={`${btnInline.secondary} flex-1 sm:flex-none`}>
              <Send className="h-4 w-4" /> Sollecita
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await askConfirm('Azzerare la cassa di questa partita? Tutti tornano "da saldare".')) {
                  markPaid(payerIds, false);
                }
              }}
              aria-label="Azzera la cassa"
              title="Azzera la cassa"
              className="p-2.5 rounded-xl text-secondary hover:text-danger hover:bg-card-hover"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-app/60 p-1" role="radiogroup" aria-label="Filtro">
            {(
              [
                [false, `Tutti (${payers.length})`],
                [true, `Da saldare (${unpaid.length})`],
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
                      {paid ? 'Pagato' : 'Da saldare'}
                    </span>
                  </button>
                </li>
              );
            })}
            {onlyUnpaid && unpaid.length === 0 && <li className="px-4 py-4 text-center text-sm text-accent-text">Hanno pagato tutti 🎉</li>}
          </ul>
        </>
      )}
    </section>
  );

  const resultPanel = (
    <section className={`${panel} ${visible('result')}`} aria-label="Risultato e chiusura">
      <h3 className="hidden lg:flex items-center gap-2 text-base font-semibold text-primary">
        <Trophy className="h-4 w-4 text-warning" /> Risultato e chiusura
      </h3>
      {isArchived && (
        <p className="flex items-start gap-2 rounded-xl bg-app/60 px-3.5 py-2.5 text-sm text-secondary">
          <Check className="h-4 w-4 flex-shrink-0 text-accent-text mt-0.5" />
          <span>
            Archiviata {archived.get(date)?.score_white ?? 0} – {archived.get(date)?.score_black ?? 0}: puoi correggere e risalvare.{' '}
            <Link href="/history" className={textLink}>
              Storico <ArrowRight className="h-4 w-4" />
            </Link>
          </span>
        </p>
      )}
      {teams ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ['Bianchi', teams.white, 'h-[9px] w-[33px] bg-white ring-1 ring-line-strong'],
                ['Neri', teams.black, 'h-2.5 w-9 bg-slate-950 border border-slate-500'],
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
              <>Squadre archiviate: si correggono con la matita nello Storico.</>
            ) : (
              <>
                Squadre prese da{' '}
                <Link href={`/teams?date=${date}`} className="text-accent-text underline">
                  Squadre
                </Link>
                : se sono sbagliate correggile lì prima di salvare.
              </>
            )}
          </p>
          <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={teams.white} black={teams.black} mvpVotes={mvpVotes} />
          <button type="button" onClick={handleArchive} disabled={isArchiving || Boolean(validation.error)} className={`${btn.primary} sm:w-full`}>
            {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            {isArchived ? 'Aggiorna risultato' : 'Salva e archivia partita'}
          </button>
        </>
      ) : (
        <div className="rounded-xl bg-app/60 py-8 px-4 text-center space-y-3">
          <p className="text-sm font-semibold text-primary">Squadre non ancora pronte</p>
          <p className="text-sm text-secondary max-w-sm mx-auto">Il risultato si salva sulle squadre: prima generale ({info.label}) per questa partita.</p>
          <Link href={`/teams?date=${date}`} className={btn.primary}>
            Vai alle squadre <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      {/* 1. Selettore del giorno: tutto ciò che c'è sotto riguarda solo il giorno scelto */}
      <div ref={selectorRef} className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" role="radiogroup" aria-label="Partita">
        {allDays.map((d) => {
          const [, m, dd] = d.split('-').map(Number);
          const dt = new Date(Number(d.slice(0, 4)), m - 1, dd);
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
              aria-label={`${formatItalianDate(d)}: ${st}, ${count} su ${max}`}
              onClick={() => chooseDay(d)}
              className={`flex-shrink-0 w-[5.25rem] rounded-2xl px-2 py-2.5 text-center transition-colors ${
                selected ? 'bg-card-hover ring-2 ring-accent' : 'bg-card hover:bg-card-hover'
              }`}
            >
              <span className="block text-xs font-medium capitalize text-secondary">
                {dt.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="block text-xl font-bold leading-tight text-primary">{dd}</span>
              <span className="block text-[11px] capitalize text-muted">{dt.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}</span>
              <span className={`mt-1.5 block rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${STATUS_TONE[st]}`}>{st}</span>
              <span className={`mt-1 block text-[11px] font-semibold tabular-nums ${count >= max && max > 0 ? 'text-accent-text' : 'text-muted'}`}>
                {count}/{max}
              </span>
            </button>
          );
        })}
      </div>

      {/* Il giorno scelto in una riga */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <h2 className="text-lg font-semibold text-primary capitalize">{formatItalianDate(date)}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>{status}</span>
        <span className="text-secondary">
          · {time} · {field?.name || location} · {info.label}
        </span>
      </div>

      {/* 2. Le tre schede (telefono e tablet); su PC i pannelli sono affiancati */}
      <div className="lg:hidden grid grid-cols-3 gap-1 rounded-2xl bg-card p-1" role="tablist" aria-label="Sezioni della partita">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const badge = t.id === 'cash' && unpaid.length > 0 ? unpaid.length : null;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-semibold transition-colors ${
                active ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
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
