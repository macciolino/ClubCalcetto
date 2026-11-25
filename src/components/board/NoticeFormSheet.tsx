'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Megaphone, Save } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';
import { subscribeAppSettings, subscribeOfficialMatchDate } from '@/lib/firebase/firestoreService';
import { subscribeSportFields } from '@/lib/services/fieldService';
import { createMatchNotice, updateMatchNotice } from '@/lib/services/matchNoticeService';
import { FORMAT_INFO, MATCH_FORMATS, fieldFormatCost } from '@/lib/utils/matchFormat';
import { DEFAULT_MATCH_TIME, standardCostFor } from '@/lib/utils/matchUtils';
import { MAX_SPOTS, romeTime, romeToIso } from '@/lib/utils/matchNotice';
import type { AppSettings, MatchFormat, SportField } from '@/types/database';
import { NOTICE_ROLES, SHIRT_COLORS, type MatchNotice, type MatchNoticeInput, type NoticeRole, type ShirtColor } from '@/types/matchNotice';

const input =
  'w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent';
const label = 'block text-xs font-medium text-secondary mb-1.5';
const num = (v: string) => Number(v.replace(',', '.'));
const money = (n: number | undefined) => (n && n > 0 ? String(Math.round(n * 100) / 100).replace('.', ',') : '');

/**
 * New notice for a match of the ACTIVE league, or changes to one (managers and platform staff).
 *  - from the board: starts from the league's data (official day, standard time, default field and its price);
 *  - from the match ("Cerca giocatori esterni"): `prefill` carries that match (day, time, field, format, cost,
 *    missing players), the manager only confirms spots, role, shirt and notes.
 */
export function NoticeFormSheet({ notice, prefill, onClose }: { notice?: MatchNotice; prefill?: Partial<MatchNoticeInput>; onClose: () => void }) {
  const t = useTranslations('board.form');
  const tb = useTranslations('board');
  const editing = Boolean(notice);
  const src: Partial<MatchNoticeInput> | undefined = notice || prefill;
  // Only a notice started from the board reads the league's settings; edits and match notices already have data
  const fromLeague = !src;
  const [fields, setFields] = useState<SportField[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [date, setDate] = useState(src?.matchId || '');
  const [time, setTime] = useState(src?.dateTime ? romeTime(src.dateTime) : '');
  const [fieldId, setFieldId] = useState('');
  const [locationName, setLocationName] = useState(src?.locationName || '');
  const [address, setAddress] = useState(src?.address || '');
  const [format, setFormat] = useState<MatchFormat>(src?.format || '5v5');
  const [totalCost, setTotalCost] = useState(money(src?.totalFieldCost));
  const [perHead, setPerHead] = useState(money(src?.costPerPlayer));
  const [spots, setSpots] = useState(String(src?.spotsNeeded || 1));
  const [role, setRole] = useState<NoticeRole>(src?.roleNeeded || 'ANY');
  const [shirt, setShirt] = useState<ShirtColor>(src?.shirtColor || 'DARK');
  const [notes, setNotes] = useState(src?.notes || '');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  // The league's data, only to fill a NEW notice (an edit keeps what was saved)
  useEffect(() => {
    if (!fromLeague) return;
    const offs = [
      subscribeSportFields(setFields),
      subscribeAppSettings(setSettings, { emptyIfMissing: true }),
      subscribeOfficialMatchDate((d) => setDate((cur) => cur || d)),
    ];
    return () => offs.forEach((off) => off());
  }, [fromLeague]);

  // Defaults from the settings and the default field, once they arrive, never over what the manager typed
  useEffect(() => {
    if (!fromLeague || !settings) return;
    const field = fields.find((f) => f.id === settings.default_field_id) || fields[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time defaults from data that arrives later
    setTime((cur) => cur || settings.standard_match_time || DEFAULT_MATCH_TIME);
    if (field) {
      setFieldId((cur) => cur || field.id);
      setLocationName((cur) => cur || field.name);
      setAddress((cur) => cur || field.address || '');
    }
  }, [fromLeague, settings, fields]);

  // Price of the field (or the club's standard) for the format, and the quota for that number of players
  useEffect(() => {
    if (!fromLeague || !settings) return;
    // Same price as the match: the field's for that format, otherwise the club standard (scaled to the players)
    const total = fieldFormatCost(fields.find((f) => f.id === fieldId), format) ?? standardCostFor(settings, format);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recomputed when field or format change
    setTotalCost(money(total));
    setPerHead(money(total / FORMAT_INFO[format].players));
  }, [fromLeague, settings, fields, fieldId, format]);

  const pickField = (id: string) => {
    setFieldId(id);
    const f = fields.find((x) => x.id === id);
    if (f) {
      setLocationName(f.name);
      setAddress(f.address || '');
    }
  };

  const dateTime = romeToIso(date, time);
  // "In the past" is checked on submit (the clock is not read while rendering)
  const [pastFor, setPastFor] = useState('');
  const errors = {
    when: !dateTime ? t('errWhen') : pastFor === dateTime ? t('errPast') : '',
    place: !locationName.trim() || !address.trim() ? t('errPlace') : '',
    cost: !(num(totalCost || '0') >= 0) || !(num(perHead || '0') >= 0) || num(perHead || '0') > num(totalCost || '0') ? t('errCost') : '',
    spots: !(Number.isInteger(Number(spots)) && Number(spots) >= 1 && Number(spots) <= MAX_SPOTS) ? t('errSpots', { max: MAX_SPOTS }) : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (invalid || busy) return;
    if (Date.parse(dateTime) <= Date.now()) return setPastFor(dateTime);
    setBusy(true);
    const data = {
      matchId: date,
      dateTime,
      locationName: locationName.trim(),
      address: address.trim(),
      format,
      totalFieldCost: num(totalCost || '0'),
      costPerPlayer: num(perHead || '0'),
      spotsNeeded: Number(spots),
      roleNeeded: role,
      shirtColor: shirt,
      notes: notes.trim(),
    };
    const res = notice ? await updateMatchNotice(notice.id, data) : await createMatchNotice(data);
    setBusy(false);
    const error = typeof res === 'string' ? (res === 'ok' ? null : res) : 'error' in res ? res.error : null;
    if (error) return notify(tb(`errors.${error}`), 'error');
    notify(notice ? t('saved') : t('published'), 'success');
    onClose();
  };

  const err = (msg: string) => (tried && msg ? <p className="mt-1 text-xs text-danger">{msg}</p> : null);

  return (
    <Sheet
      onClose={onClose}
      title={editing ? t('editTitle') : t('newTitle')}
      subtitle={t('subtitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className={sheetBtn.secondary}>
            {t('cancel')}
          </button>
          <button type="submit" form="notice-form" disabled={busy} className={sheetBtn.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
            {editing ? t('save') : t('publish')}
          </button>
        </>
      }
    >
      <form id="notice-form" noValidate onSubmit={submit} className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="notice-date" className={label}>{t('date')}</label>
            <input id="notice-date" type="date" value={date} disabled={!fromLeague} onChange={(e) => setDate(e.target.value)} className={`${input} disabled:opacity-60`} />
          </div>
          <div>
            <label htmlFor="notice-time" className={label}>{t('time')}</label>
            <input id="notice-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
          </div>
        </div>
        {err(errors.when)}

        {fromLeague && fields.length > 0 && (
          <div>
            <label htmlFor="notice-field" className={label}>{t('field')}</label>
            <select id="notice-field" value={fieldId} onChange={(e) => pickField(e.target.value)} className={`${input} min-w-0 focus:border-line-strong`}>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="">{t('fieldOther')}</option>
            </select>
          </div>
        )}
        {fromLeague && settings && fields.length === 0 && <p className="text-xs text-muted">{t('noFields')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="notice-place" className={label}>{t('place')}</label>
            <input id="notice-place" value={locationName} maxLength={80} onChange={(e) => setLocationName(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="notice-address" className={label}>{t('address')}</label>
            <input id="notice-address" value={address} maxLength={160} onChange={(e) => setAddress(e.target.value)} className={input} />
          </div>
        </div>
        {err(errors.place)}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="notice-format" className={label}>{t('format')}</label>
            <select id="notice-format" value={format} onChange={(e) => setFormat(e.target.value as MatchFormat)} className={`${input} min-w-0 focus:border-line-strong`}>
              {MATCH_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_INFO[f].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notice-spots" className={label}>{t('spots')}</label>
            <input id="notice-spots" inputMode="numeric" value={spots} onChange={(e) => setSpots(e.target.value.replace(/\D/g, ''))} className={`${input} tabular-nums`} />
          </div>
        </div>
        {err(errors.spots)}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="notice-total" className={label}>{t('totalCost')}</label>
            <input id="notice-total" inputMode="decimal" placeholder="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value.replace(/[^0-9.,]/g, ''))} className={`${input} tabular-nums`} />
          </div>
          <div>
            <label htmlFor="notice-head" className={label}>{t('perHead')}</label>
            <input id="notice-head" inputMode="decimal" placeholder="0" value={perHead} onChange={(e) => setPerHead(e.target.value.replace(/[^0-9.,]/g, ''))} className={`${input} tabular-nums`} />
          </div>
        </div>
        {err(errors.cost)}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="notice-role" className={label}>{t('role')}</label>
            <select id="notice-role" value={role} onChange={(e) => setRole(e.target.value as NoticeRole)} className={`${input} min-w-0 focus:border-line-strong`}>
              {NOTICE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tb(`roles.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notice-shirt" className={label}>{t('shirt')}</label>
            <select id="notice-shirt" value={shirt} onChange={(e) => setShirt(e.target.value as ShirtColor)} className={`${input} min-w-0 focus:border-line-strong`}>
              {SHIRT_COLORS.map((s) => (
                <option key={s} value={s}>
                  {tb(`shirts.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notice-notes" className={label}>{t('notes')}</label>
          <textarea id="notice-notes" rows={2} maxLength={300} placeholder={t('notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </div>
      </form>
    </Sheet>
  );
}
