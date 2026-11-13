'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { SportField } from '@/types/database';
import { MapPin, Phone, Save } from 'lucide-react';

interface FieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  fieldToEdit: SportField | null;
  onSave: (field: Omit<SportField, 'id'> | SportField) => void;
}

export function FieldModal({ isOpen, onClose, fieldToEdit, onSave }: FieldModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [courtType, setCourtType] = useState('Erba Sintetica 4G Outdoor');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  // Costi degli altri formati (casella vuota = il campo non ospita quel formato)
  const [costs, setCosts] = useState<Record<'7v7' | '8v8' | '11v11', string>>({ '7v7': '', '8v8': '', '11v11': '' });
  const num = (v: string) => Number(v.replace(',', '.'));
  const costsOut = () => {
    const out: NonNullable<SportField['costs']> = {};
    (['7v7', '8v8', '11v11'] as const).forEach((f) => num(costs[f]) > 0 && (out[f] = num(costs[f])));
    return Object.keys(out).length ? out : undefined;
  };

  useEffect(() => {
    if (fieldToEdit) {
      setName(fieldToEdit.name || '');
      setAddress(fieldToEdit.address || '');
      setMapsUrl(fieldToEdit.maps_url || '');
      setPhone(fieldToEdit.phone || '');
      setCourtType(fieldToEdit.court_type || 'Erba Sintetica 4G Outdoor');
      setNotes(fieldToEdit.notes || '');
      setCost(fieldToEdit.cost ? String(fieldToEdit.cost) : '');
      setCosts({
        '7v7': fieldToEdit.costs?.['7v7'] ? String(fieldToEdit.costs['7v7']) : '',
        '8v8': fieldToEdit.costs?.['8v8'] ? String(fieldToEdit.costs['8v8']) : '',
        '11v11': fieldToEdit.costs?.['11v11'] ? String(fieldToEdit.costs['11v11']) : '',
      });
    } else {
      setName('');
      setAddress('');
      setMapsUrl('');
      setPhone('');
      setCourtType('Erba Sintetica 4G Outdoor');
      setNotes('');
      setCost('');
      setCosts({ '7v7': '', '8v8': '', '11v11': '' });
    }
  }, [fieldToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;

    const computedMapsUrl =
      mapsUrl.trim() || `https://maps.google.com/?q=${encodeURIComponent(`${name} ${address}`)}`;

    if (fieldToEdit) {
      onSave({
        ...fieldToEdit,
        name: name.trim(),
        address: address.trim(),
        maps_url: computedMapsUrl,
        phone: phone.trim() || undefined,
        court_type: courtType.trim() || undefined,
        notes: notes.trim() || undefined,
        cost: Number(cost.replace(',', '.')) > 0 ? Number(cost.replace(',', '.')) : undefined,
        costs: costsOut(),
      });
    } else {
      onSave({
        name: name.trim(),
        address: address.trim(),
        maps_url: computedMapsUrl,
        phone: phone.trim() || undefined,
        court_type: courtType.trim() || undefined,
        notes: notes.trim() || undefined,
        cost: Number(cost.replace(',', '.')) > 0 ? Number(cost.replace(',', '.')) : undefined,
        costs: costsOut(),
      });
    }
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title={fieldToEdit ? 'Modifica campo' : 'Nuovo campo'}
      subtitle="Centro sportivo dove si gioca"
      footer={
        <>
          <button type="button" onClick={onClose} className={sheetBtn.secondary}>
            Annulla
          </button>
          <button type="submit" form="field-form" className={sheetBtn.primary}>
            <Save className="h-4 w-4" />
            {fieldToEdit ? 'Aggiorna campo' : 'Salva campo'}
          </button>
        </>
      }
    >
        <form id="field-form" onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Nome del centro</label>
            <input
              type="text"
              required
              placeholder="Es. Centro Sportivo Green Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Indirizzo</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                required
                placeholder="Es. Via dello Sport 12, Milano"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Telefono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                <input
                  type="text"
                  placeholder="Es. +39 02 8765432"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Fondo</label>
              <select
                value={courtType}
                onChange={(e) => setCourtType(e.target.value)}
                className="w-full px-3 py-2.5 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent"
              >
                <option value="Erba Sintetica 4G Outdoor">Sintetico 4G Outdoor</option>
                <option value="Erba Sintetica 5G Intaso Naturale">Sintetico 5G Intaso Naturale</option>
                <option value="Indoor Parquet Professionale">Indoor Parquet Professionale</option>
                <option value="Indoor Gomma / Resina">Indoor Gomma / Resina</option>
                <option value="Erba Naturale">Erba Naturale</option>
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="block text-xs font-medium text-secondary mb-1.5">Costo per formato (€, totale della partita)</legend>
            <p className="text-xs text-muted">
              Casella vuota = su questo campo non si gioca quel formato (il 5vs5 vuoto usa il costo standard del club).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['5v5', '5vs5', 10],
                  ['7v7', '7vs7', 14],
                  ['8v8', '8vs8', 16],
                  ['11v11', '11vs11', 22],
                ] as const
              ).map(([f, label, n]) => {
                const value = f === '5v5' ? cost : costs[f];
                const set = (v: string) => (f === '5v5' ? setCost(v) : setCosts((c) => ({ ...c, [f]: v })));
                return (
                  <label key={f} className="block rounded-xl bg-app border border-line px-3 py-2 focus-within:border-accent">
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-primary">{label}</span>
                      <span className="text-muted tabular-nums">
                        {num(value) > 0 ? `€${(num(value) / n).toFixed(2).replace('.', ',')} a testa` : f === '5v5' ? 'standard' : 'non disponibile'}
                      </span>
                    </span>
                    <input
                      id={f === '5v5' ? 'field-cost' : `field-cost-${f}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={value}
                      onChange={(e) => set(e.target.value.replace(/[^0-9.,]/g, ''))}
                      aria-label={`Costo ${label}`}
                      className="mt-0.5 w-full bg-transparent text-primary font-medium tabular-nums focus:outline-none"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Note</label>
            <textarea
              rows={2}
              placeholder="Es. Campo 3 coperto, spogliatoi con phon a gettone, parcheggio interno."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-app border border-line rounded-xl text-primary font-medium focus:outline-none focus:border-accent"
            />
          </div>

        </form>
    </Sheet>
  );
}
