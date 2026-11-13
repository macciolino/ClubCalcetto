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
    <section className="bg-slate-900 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {help && <p className="text-sm text-slate-400 mt-0.5">{help}</p>}
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
    'w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500';

  return (
    <div className="space-y-4">
      {part === 'campi' && (
        <>
          <SettingsBlock
            title="Campi"
            help="Dove gioca il club. Ogni campo può avere il suo costo; il predefinito si usa quando la partita non ne ha uno."
            action={
              <button
                type="button"
                onClick={() => {
                  setEditingField(null);
                  setIsFieldModalOpen(true);
                }}
                className={`${btnInline.primary} flex-shrink-0`}
              >
                <Plus className="h-4 w-4" /> Campo
              </button>
            }
          >
            {fields.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun campo: aggiungine uno.</p>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-xl bg-slate-950/50">
                {fields.map((field) => {
                  const isDefault = defaultFieldId === field.id;
                  return (
                    <li key={field.id} className="px-3.5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{field.name}</span>
                          {isDefault && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Predefinito</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 tabular-nums">
                          {field.cost ? (
                            <>
                              5vs5 {euro(field.cost)} · <span className="text-slate-400">{euro(field.cost / 10)} a testa</span>
                            </>
                          ) : (
                            <span className="text-slate-400">5vs5: costo standard del club ({euro(standardCost)})</span>
                          )}
                        </p>
                        {BIG.some((f) => Number(field.costs?.[f]) > 0) && (
                          <p className="flex flex-wrap gap-x-3 text-xs text-slate-400 tabular-nums">
                            {BIG.filter((f) => Number(field.costs?.[f]) > 0).map((f) => (
                              <span key={f}>
                                {FORMAT_INFO[f].label} {euro(Number(field.costs![f]))}
                              </span>
                            ))}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{field.address}</span>
                          {field.maps_url && (
                            <a href={field.maps_url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300" title="Apri su Google Maps">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                        {(field.phone || field.court_type) && (
                          <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                            {field.court_type && <span>{field.court_type}</span>}
                            {field.phone && (
                              <a href={`tel:${field.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1 hover:text-white">
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
                            className="p-2 rounded-lg text-slate-500 hover:text-emerald-300 hover:bg-slate-800"
                            title="Imposta come predefinito"
                            aria-label={`Imposta ${field.name} come predefinito`}
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
                          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                          title="Modifica campo"
                          aria-label={`Modifica ${field.name}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (await askConfirm(`Eliminare il campo "${field.name}"?`)) onDeleteField(field.id);
                          }}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-slate-800"
                          title="Elimina campo"
                          aria-label={`Elimina ${field.name}`}
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
            title="Orario e costo standard"
            help="L'orario di ogni partita e il costo usato quando il campo non ne ha uno suo. Per una sola partita si cambiano in Squadre."
          >
            <form onSubmit={handleSaveDefaults} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-300 mb-1.5">Orario</span>
                  <input type="time" value={timeInput} onChange={(e) => setTimeInput(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-300 mb-1.5">Costo standard (€)</span>
                  <NumberInput min={30} max={300} value={costInput} onValueChange={setCostInput} decimal className={`${inputCls} tabular-nums`} />
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300">Costo standard degli altri formati (€)</p>
                <div className="grid grid-cols-3 gap-2">
                  {BIG.map((f) => {
                    const v = Number(String(bigCosts[f] || '').replace(',', '.'));
                    const auto = (Number(costInput || 80) / 10) * FORMAT_INFO[f].players;
                    return (
                      <label key={f} className="block rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 focus-within:border-emerald-500">
                        <span className="block text-xs font-semibold text-white">{FORMAT_INFO[f].label}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={bigCosts[f] || ''}
                          placeholder={String(Math.round(auto * 100) / 100).replace('.', ',')}
                          onChange={(e) => setBigCosts((c) => ({ ...c, [f]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                          aria-label={`Costo standard ${FORMAT_INFO[f].label}`}
                          className="mt-0.5 w-full bg-transparent text-white tabular-nums focus:outline-none placeholder:text-slate-600"
                        />
                        <span className="block text-[11px] text-slate-500 tabular-nums">{euro((v > 0 ? v : auto) / FORMAT_INFO[f].players)} a testa</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">Vuoto = stessa quota a testa del 5vs5.</p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-400 tabular-nums">5vs5: {euro(Number(costInput || 80) / 10)} a testa</span>
                <button type="submit" className={btnInline.primary}>
                  <Check className="h-4 w-4" /> {saved ? 'Salvato' : 'Salva'}
                </button>
              </div>
            </form>
          </SettingsBlock>
        </>
      )}

      {part === 'regole' && (
        <>
          <SettingsBlock
            title="Blocco ritiri"
            help="Se attivo, i giocatori non possono ritirarsi a ridosso della partita. Gli admin possono sempre modificare le presenze."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Blocca
                <select
                  value={timelockHours}
                  onChange={(e) => onUpdateTimelock(timelockEnabled, parseInt(e.target.value) || 4)}
                  disabled={!timelockEnabled}
                  className="bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="2">2 ore prima</option>
                  <option value="4">4 ore prima</option>
                  <option value="12">12 ore prima</option>
                  <option value="24">24 ore prima</option>
                </select>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={timelockEnabled}
                onClick={() => onUpdateTimelock(!timelockEnabled, timelockHours)}
                className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${timelockEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                aria-label="Blocco ritiri"
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
