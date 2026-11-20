import type { CatalogField, SportField } from '@/types/database';

/**
 * Global fields catalog (field_catalog): pure helpers shared by the server and the app.
 * A league field LINKED to the catalog (catalog_id) takes these descriptive fields from it; the league only
 * owns its prices (price_override) and its notes.
 */
export const CATALOG_DESC_KEYS = ['name', 'address', 'maps_url', 'phone', 'court_type'] as const;
export type CatalogDescKey = (typeof CATALOG_DESC_KEYS)[number];

/** What a manager may still change on a linked league field (same list as firestore.rules). */
export const LINKED_EDITABLE_KEYS = ['cost', 'costs', 'notes', 'price_override', 'updated_at'] as const;

/** Lower case, no accents, no punctuation, common Italian street abbreviations expanded, single spaces. */
export function normalizeText(v: string | null | undefined): string {
  return String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(v le|vle)\b/g, 'viale')
    .replace(/\b(p za|pza|p zza|pzza)\b/g, 'piazza')
    .replace(/\b(c so|cso)\b/g, 'corso')
    .replace(/\bv\b/g, 'via')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Duplicate key of a field: normalized name + normalized address. */
export const dedupKey = (name: string, address: string) => `${normalizeText(name)}|${normalizeText(address)}`;

/**
 * Probably the same pitch: same key, or same normalized address, or same normalized name in the same city-ish
 * address (the last word of the address, usually the city).
 */
export function looksLikeSameField(a: { name: string; address: string }, b: { name: string; address: string }): boolean {
  const na = normalizeText(a.name);
  const nb = normalizeText(b.name);
  const aa = normalizeText(a.address);
  const ab = normalizeText(b.address);
  if (!na || !nb) return false;
  if (aa && aa === ab) return true;
  if (na !== nb) return false;
  const cityA = aa.split(' ').pop() || '';
  const cityB = ab.split(' ').pop() || '';
  return !cityA || !cityB || cityA === cityB;
}

/** Search in the catalog by name or address (accents and case ignored, every word must match). */
export function matchesCatalogSearch(field: Pick<CatalogField, 'name' | 'address'>, query: string): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${normalizeText(field.name)} ${normalizeText(field.address)}`;
  return words.every((w) => hay.includes(w));
}

/** The league field data that comes from a catalog entry (descriptive data + starting prices). */
export function leagueFieldFromCatalog(c: CatalogField): Omit<SportField, 'id'> {
  const out: Omit<SportField, 'id'> = { name: c.name, address: c.address };
  CATALOG_DESC_KEYS.forEach((k) => {
    if (k !== 'name' && k !== 'address' && c[k]) out[k] = c[k];
  });
  if (c.notes) out.notes = c.notes;
  if (Number(c.default_cost) > 0) out.cost = Number(c.default_cost);
  if (c.default_costs && Object.keys(c.default_costs).length) out.costs = { ...c.default_costs };
  return out;
}
