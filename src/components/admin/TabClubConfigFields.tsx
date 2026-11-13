'use client';

import { askConfirm } from '@/components/ui/Feedback';
import { StatParametersCard } from '@/components/admin/StatParametersCard';
import { FormSettingsCard } from '@/components/admin/FormSettingsCard';
import { NumberInput } from '@/components/NumberInput';
import React, { useState, useEffect } from 'react';
import { AppSettings, SportField, StatCategory } from '@/types/database';
import { FORMAT_INFO, MatchFormat } from '@/lib/utils/matchFormat';
import { FieldModal } from './FieldModal';
import { StatsLegendModal } from './StatsLegendModal';
import { MapPin, Phone, Plus, ExternalLink, Edit3, Trash2, Check, Star } from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';

interface TabClubConfigFieldsProps {
  fields: SportField[];
  onAddField: (field: Omit<SportField, 'id'>) => void;
  onUpdateField: (field: SportField) => void;
  onDeleteField: (id: string) => void;
  defaultFieldId?: string;
  onSetDefaultFieldId: (id: string) => void;
  categories: StatCategory[];
  onReset8Categories: () => void;
  standardCost: number;
  /** Club standard cost of 7vs7, 8vs8, 11vs11 (empty = proportional to the 5vs5) */
  standardCosts?: AppSettings['standard_costs'];
  standardTime: string;
  onSaveEconomicConfig: (cost: number, time: string, costs?: AppSettings['standard_costs']) => void;
  timelockEnabled: boolean;
  timelockHours: number;
  onUpdateTimelock: (enabled: boolean, hours: number) => void;
  /** Impostazioni: 'campi' = campi, costi, orario · 'regole' = blocco ritiri, portiere · 'params' = parametri e stato forma */
  part: 'campi' | 'regole' | 'params';
}

/** A block of a settings section: title, short help, content. No border (surface only). */
export function SettingsBlock({
  title,
  help,
  action,
  children,
}: {
  title: string;
  help?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-primary">{title}</h3>
          {help && <p className="text-sm text-secondary mt-0.5">{help}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const euro = (n: number) => `€${Number(n).toFixed(Number(n) % 1 ? 2 : 0).replace('.', ',')}`;

export function TabClubConfigFields({
  fields,
  onAddField,
  onUpdateField,
  onDeleteField,
  defaultFieldId,
  onSetDefaultFieldId,
  categories,
  standardCost,
  standardCosts,
  standardTime,
  onSaveEconomicConfig,
  timelockEnabled,
  timelockHours,
  onUpdateTimelock,
  part,
}: TabClubConfigFieldsProps) {
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<SportField | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const t = useTranslations('clubConfig');

  const [costInput, setCostInput] = useState<number>(standardCost || 80);
  const [timeInput, setTimeInput] = useState<string>(standardTime || '20:30');
  const [saved, setSaved] = useState(false);
  const BIG: Exclude<MatchFormat, '5v5'>[] = ['7v7', '8v8', '11v11'];
  const [bigCosts, setBigCosts] = useState<Record<string, string>>({});
  useEffect(
    () => setBigCosts(Object.fromEntries(BIG.map((f) => [f, standardCosts?.[f] ? String(standardCosts[f]) : '']))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standardCosts]
  );
  useEffect(() => setCostInput(standardCost || 80), [standardCost]);
  useEffect(() => setTimeInput(standardTime || '20:30'), [standardTime]);

  const handleSaveField = (fieldData: Omit<SportField, 'id'> | SportField) => {
    if ('id' in fieldData) onUpdateField(fieldData);
    else onAddField(fieldData);
  };

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    const costs: NonNullable<AppSettings['standard_costs']> = {};
    BIG.forEach((f) => {
      const v = Number(String(bigCosts[f] || '').replace(',', '.'));
      if (v > 0) costs[f] = v;
    });
    onSaveEconomicConfig(costInput, timeInput, costs);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const inputCls =
    'w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary text-sm focus:outline-none focus:border-accent';

  return (
    <div className="space-y-4">
      {part === 'campi' && (
        <>
          <SettingsBlock
            title={t('fields')}
            help={t('fieldsHelp')}
            action={
              <button
                type="button"
                onClick={() => {
                  setEditingField(null);
                  setIsFieldModalOpen(true);
                }}
                className={`${btnInline.primary} flex-shrink-0`}
              >
                <Plus className="h-4 w-4" /> {t('addField')}
              </button>
            }
          >
            {fields.length === 0 ? (
              <p className="text-sm text-muted">{t('noFields')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl bg-app/50">
                {fields.map((field) => {
                  const isDefault = defaultFieldId === field.id;
                  return (
                    <li key={field.id} className="px-3.5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-primary">{field.name}</span>
                          {isDefault && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent-text">{t('default')}</span>
                          )}
                        </div>
                        <p className="text-sm text-secondary tabular-nums">
                          {field.cost ? (
                            <>
                              5vs5 {euro(field.cost)} · <span className="text-secondary">{t('perHead', { amount: euro(field.cost / 10) })}</span>
                            </>
                          ) : (
                            <span className="text-secondary">{t('standardFor5', { amount: euro(standardCost) })}</span>
                          )}
                        </p>
                        {BIG.some((f) => Number(field.costs?.[f]) > 0) && (
                          <p className="flex flex-wrap gap-x-3 text-xs text-secondary tabular-nums">
                            {BIG.filter((f) => Number(field.costs?.[f]) > 0).map((f) => (
                              <span key={f}>
                                {FORMAT_INFO[f].label} {euro(Number(field.costs![f]))}
                              </span>
                            ))}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5 text-xs text-secondary min-w-0">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{field.address}</span>
                          {field.maps_url && (
                            <a href={field.maps_url} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:text-accent-text" title={t('openMaps')}>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                        {(field.phone || field.court_type) && (
                          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                            {field.court_type && <span>{field.court_type}</span>}
                            {field.phone && (
                              <a href={`tel:${field.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1 hover:text-primary">
                                <Phone className="h-3 w-3" /> {field.phone}
                              </a>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-0.5">
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => onSetDefaultFieldId(field.id)}
                            className="p-2 rounded-lg text-muted hover:text-accent-text hover:bg-card-hover"
                            title={t('setDefault')}
                            aria-label={t('setDefaultAria', { name: field.name })}
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingField(field);
                            setIsFieldModalOpen(true);
                          }}
                          className="p-2 rounded-lg text-muted hover:text-primary hover:bg-card-hover"
                          title={t('editField')}
                          aria-label={t('editAria', { name: field.name })}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (await askConfirm(t('confirmDeleteField', { name: field.name }))) onDeleteField(field.id);
                          }}
                          className="p-2 rounded-lg text-muted hover:text-danger hover:bg-card-hover"
                          title={t('deleteField')}
                          aria-label={t('deleteAria', { name: field.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SettingsBlock>

          <SettingsBlock
            title={t('timeCost')}
            help={t('timeCostHelp')}
          >
            <form onSubmit={handleSaveDefaults} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-secondary mb-1.5">{t('time')}</span>
                  <input type="time" value={timeInput} onChange={(e) => setTimeInput(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-secondary mb-1.5">{t('standardCost')}</span>
                  <NumberInput min={30} max={300} value={costInput} onValueChange={setCostInput} decimal className={`${inputCls} tabular-nums`} />
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-secondary">{t('otherFormats')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {BIG.map((f) => {
                    const v = Number(String(bigCosts[f] || '').replace(',', '.'));
                    const auto = (Number(costInput || 80) / 10) * FORMAT_INFO[f].players;
                    return (
                      <label key={f} className="block rounded-xl bg-app border border-line px-3 py-2 focus-within:border-accent">
                        <span className="block text-xs font-semibold text-primary">{FORMAT_INFO[f].label}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={bigCosts[f] || ''}
                          placeholder={String(Math.round(auto * 100) / 100).replace('.', ',')}
                          onChange={(e) => setBigCosts((c) => ({ ...c, [f]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                          aria-label={t('standardCostAria', { label: FORMAT_INFO[f].label })}
                          className="mt-0.5 w-full bg-transparent text-primary tabular-nums focus:outline-none placeholder:text-muted"
                        />
                        <span className="block text-[11px] text-muted tabular-nums">{t('perHead', { amount: euro((v > 0 ? v : auto) / FORMAT_INFO[f].players) })}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">{t('emptySame')}</p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-secondary tabular-nums">{t('fivePerHead', { amount: euro(Number(costInput || 80) / 10) })}</span>
                <button type="submit" className={btnInline.primary}>
                  <Check className="h-4 w-4" /> {saved ? t('saved') : t('save')}
                </button>
              </div>
            </form>
          </SettingsBlock>
        </>
      )}

      {part === 'regole' && (
        <>
          <SettingsBlock
            title={t('timelock')}
            help={t('timelockHelp')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-secondary">
                {t('lock')}
                <select
                  value={timelockHours}
                  onChange={(e) => onUpdateTimelock(timelockEnabled, parseInt(e.target.value) || 4)}
                  disabled={!timelockEnabled}
                  className="bg-app border border-line text-primary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                >
                  {[2, 4, 12, 24].map((h) => (
                    <option key={h} value={h}>
                      {t('hoursBefore', { n: h })}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={timelockEnabled}
                onClick={() => onUpdateTimelock(!timelockEnabled, timelockHours)}
                className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${timelockEnabled ? 'bg-accent' : 'bg-line-strong'}`}
                aria-label={t('timelock')}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${timelockEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </SettingsBlock>
          <FormSettingsCard show="keeper" />
        </>
      )}

      {part === 'params' && (
        <>
          <FormSettingsCard show="form" />
          <StatParametersCard categories={categories} onOpenLegend={() => setIsLegendOpen(true)} />
        </>
      )}

      <FieldModal isOpen={isFieldModalOpen} onClose={() => setIsFieldModalOpen(false)} fieldToEdit={editingField} onSave={handleSaveField} />
      <StatsLegendModal isOpen={isLegendOpen} onClose={() => setIsLegendOpen(false)} />
    </div>
  );
}
