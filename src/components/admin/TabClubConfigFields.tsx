'use client';

import { NumberInput } from '@/components/NumberInput';
import React, { useState, useEffect } from 'react';
import { SportField, StatCategory, STAT_DETAILS, STAT_CANONICAL_ORDER } from '@/types/database';
import { FieldModal } from './FieldModal';
import { StatsLegendModal } from './StatsLegendModal';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Plus, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  Sliders, 
  Settings, 
  Mail, 
  Check, 
  Clock, 
  Coins, 
  Loader2, 
  Sparkles, 
  Info, 
  RotateCcw,
  ShieldCheck,
  Server
} from 'lucide-react';

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
  standardTime: string;
  onSaveEconomicConfig: (cost: number, time: string) => void;
  onSendTestEmail: () => Promise<void>;
  isSendingEmail: boolean;
  emailStatusMessage: string;
}

export function TabClubConfigFields({
  fields,
  onAddField,
  onUpdateField,
  onDeleteField,
  defaultFieldId,
  onSetDefaultFieldId,
  categories,
  onReset8Categories,
  standardCost,
  standardTime,
  onSaveEconomicConfig,
  onSendTestEmail,
  isSendingEmail,
  emailStatusMessage,
}: TabClubConfigFieldsProps) {
  // Modal Campo
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<SportField | null>(null);

  // Modal Legenda Statistiche
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  // Form Economico & Logistico
  const [costInput, setCostInput] = useState<number>(standardCost || 80);
  const [timeInput, setTimeInput] = useState<string>(standardTime || '20:30');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Allinea il modulo quando arrivano i valori salvati (es. caricamento da Firestore)
  useEffect(() => {
    setCostInput(standardCost || 80);
  }, [standardCost]);
  useEffect(() => {
    setTimeInput(standardTime || '20:30');
  }, [standardTime]);

  const costPerPerson = (Number(costInput || 80) / 10).toFixed(2);

  const handleOpenAddField = () => {
    setEditingField(null);
    setIsFieldModalOpen(true);
  };

  const handleOpenEditField = (field: SportField) => {
    setEditingField(field);
    setIsFieldModalOpen(true);
  };

  const handleSaveField = (fieldData: Omit<SportField, 'id'> | SportField) => {
    if ('id' in fieldData) {
      onUpdateField(fieldData);
    } else {
      onAddField(fieldData);
    }
  };

  const handleSaveEconomics = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveEconomicConfig(costInput, timeInput);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 4000);
  };

  return (
    <div className="space-y-6">
      {/* 1. ANAGRAFICA CENTRI SPORTIVI & CAMPI DA CALCIO */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-400" />
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                Anagrafica Centri Sportivi & Campi da Gioco
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Censisci i centri dove giochi abitualmente, con recapiti, tipo di erba e link navigatore.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenAddField}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ Aggiungi Campo</span>
          </button>
        </div>

        {/* Griglia Campi Censiti */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fields.map((field) => {
            const isDefault = defaultFieldId === field.id;
            return (
              <div
                key={field.id}
                className={`bg-slate-950/80 p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  isDefault
                    ? 'border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-black text-sm text-white">{field.name}</h3>
                    {isDefault ? (
                      <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                        ★ Predefinito
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSetDefaultFieldId(field.id)}
                        className="text-[10px] text-slate-400 hover:text-emerald-400 bg-slate-900 px-2 py-0.5 rounded-md font-semibold transition-colors"
                      >
                        Imposta Predefinito
                      </button>
                    )}
                  </div>

                  <span className="inline-block mt-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    {field.court_type || 'Erba Sintetica'}
                  </span>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{field.address}</span>
                      {field.maps_url && (
                        <a
                          href={field.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 ml-1 p-0.5"
                          title="Apri su Google Maps"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {field.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <a
                          href={`tel:${field.phone.replace(/\s+/g, '')}`}
                          className="text-slate-300 hover:text-white font-mono hover:underline"
                        >
                          {field.phone}
                        </a>
                      </div>
                    )}

                    {field.notes && (
                      <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800/80">
                        {field.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleOpenEditField(field)}
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                    title="Modifica campo"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Eliminare il campo "${field.name}"?`)) {
                        onDeleteField(field.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                    title="Elimina campo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. CONFIGURAZIONE CATEGORIE STATISTICHE (OTTAGONO A 8 PARAMETRI) */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-emerald-400" />
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                Parametri Ottagono Calcetto 5v5 (Abilità Ufficiali)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Il sistema calcola l&apos;OVR e l&apos;algoritmo di bilanciamento su questi 8 parametri chiave.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLegendOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-bold rounded-xl text-xs border border-indigo-500/30 transition-all cursor-pointer"
            >
              <Info className="h-3.5 w-3.5 text-indigo-400" />
              <span>Legenda Interattiva Parametri</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Ripristinare gli 8 parametri ufficiali per calcetto 5v5?')) {
                  onReset8Categories();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs border border-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Ripristina Default 8</span>
            </button>
          </div>
        </div>

        {/* Griglia 8 Parametri */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAT_CANONICAL_ORDER.filter((k) => k !== 'Tecnica').map((statName) => {
            const detail = STAT_DETAILS[statName];
            if (!detail) return null;

            return (
              <div
                key={detail.code}
                className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    {detail.code}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Scala 1-10</span>
                </div>
                <h4 className="font-black text-xs text-white">{detail.name}</h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {detail.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. PARAMETRI ECONOMICI E LOGISTICI + 4. NOTIFICHE & SYSTEM STATUS (2 COLONNE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Parametri Economici e Logistici */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-400" />
              Parametri Economici & Quota Campo
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Definisci il costo orario del campo e l&apos;orario predefinito della partita.
            </p>
          </div>

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <span>Parametri economici aggiornati!</span>
            </div>
          )}

          <form onSubmit={handleSaveEconomics} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Costo Totale Campo (€)</label>
                <NumberInput
                  min={30}
                  max={300}
                  value={costInput}
                  onValueChange={setCostInput}
                  decimal
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Quota Calcolata a Testa (€)</label>
                <div className="px-3.5 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-emerald-400 font-mono font-bold text-sm">
                  €{costPerPerson} a giocatore (10 titolari)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Orario Partita Standard</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="time"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-semibold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Campo Predefinito Attuale</label>
                <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-300 font-medium truncate">
                  {fields.find((f) => f.id === defaultFieldId)?.name || fields[0]?.name || 'Nessun campo'}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Salva Impostazioni Economiche</span>
            </button>
          </form>
        </div>

        {/* Notifiche Email & System Status */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-400" />
              Notifiche Email & System Status
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitora i provider di sistema e invia un messaggio di prova.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Email Notification Service</span>
                <span className="text-[11px] text-slate-400">Resend API Provider</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operativo
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Database & Storage Locale</span>
                <span className="text-[11px] text-slate-400">Firebase Firestore + Browser Cache</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Sincronizzato
              </span>
            </div>

            {emailStatusMessage && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <Check className="h-4 w-4 text-emerald-400" />
                <span>{emailStatusMessage}</span>
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                onClick={onSendTestEmail}
                disabled={isSendingEmail}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 transition-all cursor-pointer"
              >
                {isSendingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                ) : (
                  <Mail className="h-4 w-4 text-emerald-400" />
                )}
                <span>Invia Email di Test Admin</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALI: CAMPO SPORTIVO & LEGENDA STATISTICHE */}
      <FieldModal
        isOpen={isFieldModalOpen}
        onClose={() => setIsFieldModalOpen(false)}
        fieldToEdit={editingField}
        onSave={handleSaveField}
      />

      <StatsLegendModal
        isOpen={isLegendOpen}
        onClose={() => setIsLegendOpen(false)}
      />
    </div>
  );
}
