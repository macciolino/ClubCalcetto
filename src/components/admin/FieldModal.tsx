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

  useEffect(() => {
    if (fieldToEdit) {
      setName(fieldToEdit.name || '');
      setAddress(fieldToEdit.address || '');
      setMapsUrl(fieldToEdit.maps_url || '');
      setPhone(fieldToEdit.phone || '');
      setCourtType(fieldToEdit.court_type || 'Erba Sintetica 4G Outdoor');
      setNotes(fieldToEdit.notes || '');
    } else {
      setName('');
      setAddress('');
      setMapsUrl('');
      setPhone('');
      setCourtType('Erba Sintetica 4G Outdoor');
      setNotes('');
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
      });
    } else {
      onSave({
        name: name.trim(),
        address: address.trim(),
        maps_url: computedMapsUrl,
        phone: phone.trim() || undefined,
        court_type: courtType.trim() || undefined,
        notes: notes.trim() || undefined,
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
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Nome del centro</label>
            <input
              type="text"
              required
              placeholder="Es. Centro Sportivo Green Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Indirizzo</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                required
                placeholder="Es. Via dello Sport 12, Milano"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Telefono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Es. +39 02 8765432"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Fondo</label>
              <select
                value={courtType}
                onChange={(e) => setCourtType(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
              >
                <option value="Erba Sintetica 4G Outdoor">Sintetico 4G Outdoor</option>
                <option value="Erba Sintetica 5G Intaso Naturale">Sintetico 5G Intaso Naturale</option>
                <option value="Indoor Parquet Professionale">Indoor Parquet Professionale</option>
                <option value="Indoor Gomma / Resina">Indoor Gomma / Resina</option>
                <option value="Erba Naturale">Erba Naturale</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Note</label>
            <textarea
              rows={2}
              placeholder="Es. Campo 3 coperto, spogliatoi con phon a gettone, parcheggio interno."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

        </form>
    </Sheet>
  );
}
