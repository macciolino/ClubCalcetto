'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Check, Loader2, UserPlus, X } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';
import { MatchResultFields, type MatchResultValue, validateScorers } from '@/components/MatchResultFields';
import { saveMatchResult, saveProfileDoc } from '@/lib/firebase/firestoreService';
import { subscribeSportFields } from '@/lib/services/fieldService';
import { useFormSettings } from '@/lib/hooks/useForms';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { FORMAT_INFO, MATCH_FORMATS } from '@/lib/utils/matchFormat';
import { manualMatchError, newGuestId } from '@/lib/utils/manualMatch';
import { toDateString } from '@/lib/utils/dateUtils';
import { toTeamPlayer } from '@/lib/utils/teamUtils';
import type { MatchFormat, MatchTeamPlayer, Profile, SportField } from '@/types/database';

const input =
  'w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent';
const label = 'block text-xs font-medium text-secondary mb-1.5';
const EMPTY: MatchResultValue = { scoreWhite: 0, scoreBlack: 0, mvpPlayerId: '', scorers: [], penaltySaves: [] };

interface Props {
  /** Players of the league (cards), to pick from */
  profiles: Profile[];
  /** Days that already have an archived match */
  archivedDates: Set<string>;
  closedBy: string;
  onClose: () => void;
}

/**
 * "Aggiungi partita" (Storico, presidents / collaborators / staff): a past match that was never archived — forgotten,
 * or written on paper before the league used the app. Players come from the league, or are created on the spot as
 * guests; saved like any archived match (W/D/L on the cards, leaderboard, form), cash not involved.
 */
export function AddMatchSheet({ profiles, archivedDates, closedBy, onClose }: Props) {
  const t = useTranslations('addMatch');
  const tc = useTranslations('common');
  const categories = useStatCategories();
  const fixedKeeper = Boolean(useFormSettings().fixedKeeper);
  const [today] = useState(() => toDateString(new Date()));
  const [fields, setFields] = useState<SportField[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [cost, setCost] = useState('');
  const [format, setFormat] = useState<MatchFormat>('5v5');
  const [white, setWhite] = useState<MatchTeamPlayer[]>([]);
  const [black, setBlack] = useState<MatchTeamPlayer[]>([]);
  // Guests created here, saved as cards of the league only when the match is saved
  const [newGuests, setNewGuests] = useState<MatchTeamPlayer[]>([]);
  const [result, setResult] = useState<MatchResultValue>(EMPTY);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => subscribeSportFields(setFields), []);

  const perTeam = FORMAT_INFO[format].perTeam;
  const roster = useMemo(() => profiles.map(toTeamPlayer).sort((a, b) => a.name.localeCompare(b.name)), [profiles]);
  const chosen = new Set([...white, ...black].map((p) => p.id));
  const available = [...roster, ...newGuests].filter((p) => !chosen.has(p.id));

  const error = manualMatchError({ date, today, archivedDates, white, black, perTeam });
  const scorers = validateScorers(result, white, black);

  // A player leaving the teams leaves MVP and scorers too
  const setTeams = (w: MatchTeamPlayer[], b: MatchTeamPlayer[]) => {
    setWhite(w);
    setBlack(b);
    const ids = new Set([...w, ...b].map((p) => p.id));
    setResult((r) => ({
      ...r,
      mvpPlayerId: ids.has(r.mvpPlayerId) ? r.mvpPlayerId : '',
      scorers: r.scorers.filter((s) => ids.has(s.player_id)),
      penaltySaves: (r.penaltySaves || []).filter((s) => ids.has(s.player_id)),
    }));
  };
  const add = (team: 'white' | 'black', p: MatchTeamPlayer) =>
    team === 'white' ? setTeams([...white, p], black) : setTeams(white, [...black, p]);
  const remove = (team: 'white' | 'black', id: string) =>
    team === 'white' ? setTeams(white.filter((p) => p.id !== id), black) : setTeams(white, black.filter((p) => p.id !== id));

  const save = async () => {
    setTried(true);
    if (error || scorers.error || saving) return;
    setSaving(true);
    try {
      // Guests first: the match adds W/D/L only to cards that exist
      const used = newGuests.filter((g) => chosen.has(g.id));
      const now = new Date().toISOString();
      const stats: Record<string, number> = {};
      categories.forEach((c) => (stats[c.name] = Number(c.default_value ?? 6)));
      await Promise.all(
        used.map((g) =>
          saveProfileDoc({
            id: g.id,
            user_id: null,
            email: null,
            full_name: g.name,
            avatar_url: null,
            role: 'player',
            position: 'Esterno',
            is_guest: true,
            stats,
            overall_rating: 6,
            matches_won: 0,
            matches_drawn: 0,
            matches_lost: 0,
            created_at: now,
            updated_at: now,
          } as Profile)
        )
      );
      await saveMatchResult({
        date,
        scoreWhite: result.scoreWhite,
        scoreBlack: result.scoreBlack,
        teamWhite: white,
        teamBlack: black,
        mvpPlayerId: result.mvpPlayerId || null,
        scorers: result.scorers,
        penaltySaves: result.penaltySaves || [],
        totalCost: Math.max(0, Number(cost.replace(',', '.')) || 0),
        players: white.length + black.length,
        closedBy,
        details: { location: place.trim(), match_time: time, entered_by_hand: true },
      });
      notify(t('saved'), 'success');
      onClose();
    } catch (err) {
      console.warn('[Storico] partita a mano non salvata:', err);
      notify(t('saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const team = (side: 'white' | 'black') => {
    const list = side === 'white' ? white : black;
    return (
      <TeamPicker
        title={t(side)}
        list={list}
        max={perTeam}
        available={available}
        onAdd={(p) => add(side, p)}
        onRemove={(id) => remove(side, id)}
        onNewGuest={(name) => {
          const g = { id: newGuestId(newGuests.length), name };
          setNewGuests((n) => [...n, g]);
          add(side, g);
        }}
      />
    );
  };

  return (
    <Sheet
      onClose={onClose}
      locked={saving}
      size="lg"
      height="tall"
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={sheetBtn.secondary}>
            {tc('cancel')}
          </button>
          <button type="button" onClick={save} disabled={saving} className={sheetBtn.primary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('save')}
          </button>
        </>
      }
    >
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-date" className={label}>{t('date')}</label>
            <input id="add-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="add-time" className={label}>{t('time')}</label>
            <input id="add-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="add-place" className={label}>{t('place')}</label>
            <input id="add-place" list="add-place-list" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder={t('placePh')} className={input} />
            <datalist id="add-place-list">
              {fields.map((f) => (
                <option key={f.id} value={f.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="add-cost" className={label}>{t('cost')}</label>
            <input id="add-cost" inputMode="decimal" value={cost} placeholder="0" onChange={(e) => setCost(e.target.value.replace(/[^0-9.,]/g, ''))} className={`${input} tabular-nums`} />
          </div>
        </div>
        <div>
          <label htmlFor="add-format" className={label}>{t('format')}</label>
          <select id="add-format" value={format} onChange={(e) => setFormat(e.target.value as MatchFormat)} className={`${input} focus:border-line-strong`}>
            {MATCH_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_INFO[f].label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-secondary">{t('teams')}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {team('white')}
          {team('black')}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-secondary">{t('result')}</h3>
        {white.length > 0 && black.length > 0 ? (
          <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={white} black={black} />
        ) : (
          <p className="text-xs text-muted">{t('resultAfterTeams')}</p>
        )}
      </section>

      {tried && error && (
        <p role="alert" className="text-sm text-danger flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0" /> {t(`errors.${error}`, { max: perTeam })}
        </p>
      )}
    </Sheet>
  );
}

/** One team: chosen players (removable), "Aggiungi giocatore" from the league, "Nuovo ospite" by name. */
function TeamPicker({
  title,
  list,
  max,
  available,
  onAdd,
  onRemove,
  onNewGuest,
}: {
  title: string;
  list: MatchTeamPlayer[];
  max: number;
  available: MatchTeamPlayer[];
  onAdd: (p: MatchTeamPlayer) => void;
  onRemove: (id: string) => void;
  onNewGuest: (name: string) => void;
}) {
  const t = useTranslations('addMatch');
  const [guest, setGuest] = useState('');
  const full = list.length >= max;
  const addGuest = () => {
    const name = guest.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name || full) return;
    onNewGuest(name);
    setGuest('');
  };
  return (
    <div className="rounded-xl bg-app p-3 space-y-2">
      <p className="text-sm font-semibold text-primary flex items-center justify-between">
        {title} <span className="text-xs font-normal text-muted tabular-nums">{list.length}/{max}</span>
      </p>
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs text-primary">
              {p.name}
              <button type="button" onClick={() => onRemove(p.id)} aria-label={t('removePlayer', { name: p.name })} className="text-muted hover:text-danger">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <>
          <select
            aria-label={t('addTo', { team: title })}
            value=""
            onChange={(e) => {
              const p = available.find((x) => x.id === e.target.value);
              if (p) onAdd(p);
            }}
            className="w-full min-w-0 px-3 py-2 bg-card border border-line rounded-xl text-sm text-primary focus:outline-none focus:border-line-strong"
          >
            <option value="">{t('addPlayer')}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGuest())}
              placeholder={t('guestPh')}
              aria-label={t('guestLabel', { team: title })}
              className="flex-1 min-w-0 px-3 py-2 bg-card border border-line rounded-xl text-sm text-primary focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={addGuest}
              disabled={!guest.trim()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-3 text-xs font-semibold text-primary hover:bg-card-hover disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> {t('newGuest')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
