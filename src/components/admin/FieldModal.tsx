'use client';

import React, { useState, useEffect } from 'react';
import { SportField } from '@/types/database';
import { X, MapPin, Phone, Building2, Save } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Building2 className="h-5 w-5" />
            </div>
            <h3 className="text-base font-black text-white">
              {fieldToEdit ? 'Modifica Campo da Gioco' : 'Aggiungi Nuovo Centro Sportivo'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Nome Centro / Struttura *</label>
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
            <label className="block text-slate-400 font-bold mb-1">Indirizzo Completo *</label>
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
              <label className="block text-slate-400 font-bold mb-1">Telefono Gestore / Campo</label>
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
              <label className="block text-slate-400 font-bold mb-1">Tipologia Fondo / Terreno</label>
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
            <label className="block text-slate-400 font-bold mb-1">Note & Specifiche Struttura</label>
            <textarea
              rows={2}
              placeholder="Es. Campo 3 coperto, spogliatoi con phon a gettone, parcheggio interno."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-500/25 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{fieldToEdit ? 'Aggiorna Campo' : 'Salva Campo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
