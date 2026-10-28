'use client';

import React, { useState } from 'react';
import { StatCategory } from '@/types/database';
import { addStoredCategory, removeStoredCategory } from '@/lib/services/statCategoryService';
import { Plus, Trash2, Tag, Loader2 } from 'lucide-react';

interface StatCategoriesManagerProps {
  categories: StatCategory[];
  onCategoriesChanged: (newCategories: StatCategory[]) => void;
}

export function StatCategoriesManager({
  categories,
  onCategoriesChanged,
}: StatCategoriesManagerProps) {
  const [newCatName, setNewCatName] = useState('');
  const [newCatDefault, setNewCatDefault] = useState(6);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) return;

    if (categories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg('Questa categoria esiste già.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      // addStoredCategory aggiorna in tempo reale TUTTI i giocatori iscritti con la nuova statistica
      const updated = await addStoredCategory({
        name: cleanName,
        label: cleanName,
        default_value: newCatDefault,
      });

      onCategoriesChanged(updated);
      setNewCatName('');
      setNewCatDefault(6);
    } catch (err: unknown) {
      console.error('Errore aggiunta categoria:', err);
      const msg = err instanceof Error ? err.message : 'Errore';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string, catName: string) => {
    if (!confirm(`Sei sicuro di voler rimuovere la statistica "${catName}" da tutti i profili?`)) return;

    setIsLoading(true);
    try {
      const updated = await removeStoredCategory(categoryId, catName);
      onCategoriesChanged(updated);
    } catch (err) {
      console.error('Errore rimozione categoria:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Categorie Statistiche</h3>
            <p className="text-xs text-slate-400">
              Personalizza le abilità monitorate (Resistenza, Difesa, Visione, ecc.)
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold text-emerald-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
          {categories.length} Attive
        </span>
      </div>

      {errorMsg && (
        <div className="p-2.5 text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* Form Aggiunta Categoria */}
      <form onSubmit={handleAddCategory} className="flex flex-wrap sm:flex-nowrap gap-2.5">
        <input
          type="text"
          placeholder="Nuova statistica (es. Visione)"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          className="flex-1 min-w-[180px] px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          required
        />
        <div className="flex items-center gap-1.5 bg-slate-950 px-3 rounded-xl border border-slate-700">
          <span className="text-xs text-slate-400">Def:</span>
          <input
            type="number"
            min="1"
            max="10"
            value={newCatDefault}
            onChange={(e) => setNewCatDefault(parseInt(e.target.value, 10))}
            className="w-12 bg-transparent text-white font-mono text-sm text-center focus:outline-none font-bold"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !newCatName.trim()}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition-all disabled:opacity-50 shadow-md"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Aggiungi
        </button>
      </form>

      {/* Lista Categorie con badge e cancellazione */}
      <div className="flex flex-wrap gap-2 pt-2">
        {categories.map((cat) => (
          <div
            key={cat.id || cat.name}
            className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 group hover:border-slate-700 transition-colors"
          >
            <span>{cat.label || cat.name}</span>
            <span className="text-[10px] text-slate-500 font-mono">({cat.default_value})</span>
            <button
              type="button"
              onClick={() => handleDeleteCategory(cat.id, cat.name)}
              className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors ml-1"
              title="Rimuovi categoria"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
