import { FieldPosition, Profile } from '@/types/database';
import { FormationSlot } from '@/lib/utils/matchFormat';

export interface TeamStatsSummary {
  overallAvg: number;
  defenseAvg: number;
  attackAvg: number;
  staminaAvg: number;
  techniqueAvg: number;
  totalScore: number;
}

export interface BalancedTeamsResult {
  teamWhite: Profile[];
  teamBlack: Profile[];
  whiteStats: TeamStatsSummary;
  blackStats: TeamStatsSummary;
  difference: number;
  fairnessScore: number; // 0 to 100%
}

/**
 * Calcola la media totale e le medie specifiche per un giocatore
 */
export function getPlayerOverallRating(player: Profile): number {
  if (typeof player.overall_rating === 'number' && player.overall_rating > 0) {
    return Number(player.overall_rating);
  }
  const statsValues = Object.values(player.stats || {});
  if (statsValues.length === 0) return 6.0;
  const sum = statsValues.reduce((acc, val) => acc + (Number(val) || 6), 0);
  return Number((sum / statsValues.length).toFixed(1));
}

/**
 * Calcola il riassunto statistiche per una squadra di 5 giocatori
 */
export function calculateTeamSummary(team: Profile[]): TeamStatsSummary {
  if (team.length === 0) {
    return {
      overallAvg: 0,
      defenseAvg: 0,
      attackAvg: 0,
      staminaAvg: 0,
      techniqueAvg: 0,
      totalScore: 0,
    };
  }

  const count = team.length;
  let totalRatingSum = 0;
  let defSum = 0;
  let atkSum = 0;
  let staSum = 0;
  let tecSum = 0;

  team.forEach((p) => {
    const ovr = getPlayerOverallRating(p);
    totalRatingSum += ovr;

    const stats = p.stats || {};
    defSum += Number(stats['Difesa'] || ovr);
    atkSum += Number(stats['Tiro'] || ovr);
    staSum += Number(stats['Resistenza'] || ovr);
    tecSum += Number(stats['Visione'] || stats['Tecnica'] || stats['Dribbling'] || ovr);
  });

  return {
    overallAvg: Number((totalRatingSum / count).toFixed(1)),
    defenseAvg: Number((defSum / count).toFixed(1)),
    attackAvg: Number((atkSum / count).toFixed(1)),
    staminaAvg: Number((staSum / count).toFixed(1)),
    techniqueAvg: Number((tecSum / count).toFixed(1)),
    totalScore: Number(totalRatingSum.toFixed(1)),
  };
}

/**
 * Genera tutte le combinazioni di k elementi da un array
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];

  function helper(start: number, currentCombo: T[]) {
    if (currentCombo.length === k) {
      result.push([...currentCombo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      currentCombo.push(arr[i]);
      helper(i + 1, currentCombo);
      currentCombo.pop();
    }
  }

  helper(0, []);
  return result;
}

/**
 * Ordina una squadra di 5 giocatori per la disposizione a Rombo 1-1-2-1 da calcetto:
 * [0]: Portiere (vicino porta)
 * [1]: Difensore (centrale subito sopra)
 * [2]: Esterno Sinistro (largo a SX)
 * [3]: Esterno Destro (largo a DX)
 * [4]: Punta (in alto in attacco)
 */
export function orderTeamForDiamondRombo(team: Profile[], fixedKeeper = true): Profile[] {
  const pool = [...team];

  // 1. Portiere: cerca giocatore con posizione === 'Portiere', altrimenti miglior difensore/fisico
  // Portiere a rotazione: nessuno fa il portiere tutta la partita, lo slot in porta segue solo le abilità
  let porIndex = fixedKeeper ? pool.findIndex((p) => p.position === 'Portiere') : -1;
  if (porIndex === -1) {
    let bestScore = -1;
    pool.forEach((p, i) => {
      const score = (p.stats?.['Difesa'] || 6) + (p.stats?.['Fisico'] || 6);
      if (score > bestScore) {
        bestScore = score;
        porIndex = i;
      }
    });
  }
  const por = pool.splice(porIndex >= 0 ? porIndex : 0, 1)[0];

  // 2. Punta: cerca giocatore con posizione === 'Punta', altrimenti maggior tiro/velocità
  let punIndex = pool.findIndex((p) => p.position === 'Punta');
  if (punIndex === -1) {
    let bestScore = -1;
    pool.forEach((p, i) => {
      const score = (p.stats?.['Tiro'] || 6) + (p.stats?.['Velocità'] || 6);
      if (score > bestScore) {
        bestScore = score;
        punIndex = i;
      }
    });
  }
  const pun = pool.splice(punIndex >= 0 ? punIndex : 0, 1)[0];

  // 3. Difensore: cerca giocatore con posizione === 'Difensore', altrimenti miglior difesa
  let difIndex = pool.findIndex((p) => p.position === 'Difensore');
  if (difIndex === -1) {
    let bestScore = -1;
    pool.forEach((p, i) => {
      const score = p.stats?.['Difesa'] || 6;
      if (score > bestScore) {
        bestScore = score;
        difIndex = i;
      }
    });
  }
  const dif = pool.splice(difIndex >= 0 ? difIndex : 0, 1)[0];

  // 4. I rimanenti 2 giocatori sono i due Esterni
  const est1 = pool[0] || dif;
  const est2 = pool[1] || por;

  return [por, dif, est1, est2, pun];
}

export interface BalanceOptions {
  /**
   * "Ribilancia": skip this split (see splitKey in teamUtils) and pick at random among the
   * most balanced alternatives, so pressing the button really gives different teams.
   */
  excludeSplitKey?: string;
  /** How many of the best alternatives to choose from when rebalancing (default 5) */
  pickAmongTop?: number;
  /**
   * Club plays with a fixed goalkeeper: with 2 or more 'Portiere' among the starters, each team gets at least one.
   * false (rotation, default) = the role Portiere is ignored.
   */
  fixedKeeper?: boolean;
  /**
   * Places of the formation (7vs7, 8vs8, 11vs11). Without it (or with 5 per team) the 5vs5 rombo is used.
   * The number of players must be twice the number of places.
   */
  slots?: FormationSlot[];
}

/**
 * Algoritmo di Bilanciamento Squadre 5v5 per ClubCalcetto.
 * Valuta tutte le 126 divisioni distinte (252 combinazioni / 2) e sceglie la più equilibrata
 * per media generale, poi per difesa + attacco. Senza opzioni il risultato è deterministico.
 */
export function balanceTeams(players: Profile[], options: BalanceOptions = {}): BalancedTeamsResult {
  const perTeam = options.slots?.length || 5;
  if (perTeam !== 5) return balanceTeamsLarge(players, { ...options, slots: options.slots! });
  if (players.length !== 10) {
    throw new Error("L'algoritmo richiede esattamente 10 giocatori.");
  }

  // Ogni divisione contiene il primo giocatore in "Bianca": così non contiamo due volte la stessa divisione a colori invertiti
  const first = players[0];
  const allCombos = getCombinations(players.slice(1), 4).map((c) => [first, ...c]);

  const candidates = allCombos.map((comboWhite) => {
    const whiteIds = new Set(comboWhite.map((p) => p.id));
    const comboBlack = players.filter((p) => !whiteIds.has(p.id));
    const sum = (team: Profile[], f: (p: Profile) => number) => team.reduce((acc, p) => acc + f(p), 0);
    const diff = Math.abs(sum(comboWhite, getPlayerOverallRating) - sum(comboBlack, getPlayerOverallRating));
    const def = (p: Profile) => Number(p.stats?.['Difesa']) || 6;
    const atk = (p: Profile) => Number(p.stats?.['Tiro']) || 6;
    const secondaryDiff =
      Math.abs(sum(comboWhite, def) - sum(comboBlack, def)) + Math.abs(sum(comboWhite, atk) - sum(comboBlack, atk));
    const key = [comboWhite.map((p) => p.id).sort().join(','), comboBlack.map((p) => p.id).sort().join(',')]
      .sort()
      .join('|');
    return { white: comboWhite, black: comboBlack, diff, secondaryDiff, key };
  });

  // Portiere fisso: con almeno 2 portieri, un portiere per squadra
  const keepers = new Set(players.filter((p) => p.position === 'Portiere').map((p) => p.id));
  // (filter crea una nuova lista: senza il filtro si tengono tutte le divisioni)
  if (options.fixedKeeper && keepers.size >= 2) {
    const allowed = candidates.filter((c) => c.white.some((p) => keepers.has(p.id)) && c.black.some((p) => keepers.has(p.id)));
    if (allowed.length > 0) candidates.splice(0, candidates.length, ...allowed);
  }

  // Più equilibrate prima (differenze sotto 0.05 considerate pari, poi conta difesa + attacco)
  candidates.sort((a, b) =>
    Math.abs(a.diff - b.diff) >= 0.05 ? a.diff - b.diff : a.secondaryDiff - b.secondaryDiff
  );

  let chosen = candidates[0];
  if (options.excludeSplitKey) {
    const others = candidates.filter((c) => c.key !== options.excludeSplitKey);
    const pool = others.slice(0, Math.max(1, options.pickAmongTop ?? 5));
    if (pool.length > 0) chosen = pool[Math.floor(Math.random() * pool.length)];
  }

  // A caso chi fa i Bianchi solo quando si ribilancia; altrimenti risultato stabile
  const swapColours = Boolean(options.excludeSplitKey) && Math.random() < 0.5;
  const bestWhite = swapColours ? chosen.black : chosen.white;
  const bestBlack = swapColours ? chosen.white : chosen.black;

  const whiteStats = calculateTeamSummary(bestWhite);
  const blackStats = calculateTeamSummary(bestBlack);
  const diffAvg = Math.abs(whiteStats.overallAvg - blackStats.overallAvg);

  // Indice di equità da 0 a 100% (se diffAvg è 0, fairness è 100%)
  const fairnessScore = Math.max(0, Math.min(100, Math.round(100 - diffAvg * 15)));

  return {
    teamWhite: orderTeamForDiamondRombo(bestWhite, Boolean(options.fixedKeeper)),
    teamBlack: orderTeamForDiamondRombo(bestBlack, Boolean(options.fixedKeeper)),
    whiteStats,
    blackStats,
    difference: Number(diffAvg.toFixed(2)),
    fairnessScore,
  };
}

/** Balance summary for teams that already exist (saved, substituted or edited by hand). */
export function summarizeTeams(teamWhite: Profile[], teamBlack: Profile[]): BalancedTeamsResult {
  const whiteStats = calculateTeamSummary(teamWhite);
  const blackStats = calculateTeamSummary(teamBlack);
  const diffAvg = Math.abs(whiteStats.overallAvg - blackStats.overallAvg);
  return {
    teamWhite,
    teamBlack,
    whiteStats,
    blackStats,
    difference: Number(diffAvg.toFixed(2)),
    fairnessScore: Math.max(0, Math.min(100, Math.round(100 - diffAvg * 15))),
  };
}

// =====================================================================================
// 7vs7, 8vs8, 11vs11: troppe divisioni per provarle tutte (11vs11 ≈ 350.000), quindi:
// tante partenze diverse + scambi a coppie finché migliorano (ricerca locale). Pochi millisecondi anche su telefono.
// =====================================================================================

/** Close roles: a Centrocampista can play wide, an Esterno in the middle, a Punta on the wing, … */
const ROLE_NEAR: Record<FieldPosition, FieldPosition[]> = {
  Portiere: [],
  Difensore: ['Centrocampista'],
  Centrocampista: ['Esterno', 'Difensore'],
  Esterno: ['Centrocampista', 'Punta'],
  Punta: ['Esterno'],
};

const roleOf = (p: Profile): FieldPosition => (p.position as FieldPosition) || 'Esterno';
const stat = (p: Profile, k: string) => Number(p.stats?.[k]) || getPlayerOverallRating(p);

/** Small seeded random generator: same inputs → same teams (only "Ribilancia" asks for different ones). */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Split quality (lower = better): difference of total level first, then defence + attack,
 * then how differently the roles are spread (each team should get its defenders, midfielders, forwards).
 */
function splitCost(white: Profile[], black: Profile[]): { diff: number; secondary: number; roles: number } {
  const sum = (t: Profile[], f: (p: Profile) => number) => t.reduce((a, p) => a + f(p), 0);
  const diff = Math.abs(sum(white, getPlayerOverallRating) - sum(black, getPlayerOverallRating));
  const def = (p: Profile) => stat(p, 'Difesa');
  const atk = (p: Profile) => stat(p, 'Tiro');
  const secondary = Math.abs(sum(white, def) - sum(black, def)) + Math.abs(sum(white, atk) - sum(black, atk));
  const count = (t: Profile[], r: FieldPosition) => t.filter((p) => roleOf(p) === r).length;
  const roles = (['Difensore', 'Centrocampista', 'Esterno', 'Punta'] as FieldPosition[]).reduce(
    (a, r) => a + Math.abs(count(white, r) - count(black, r)),
    0
  );
  return { diff, secondary, roles };
}
const score = (c: { diff: number; secondary: number; roles: number }) => c.diff + c.secondary * 0.15 + c.roles * 0.35;

/**
 * Puts a team on the places of the formation: the goalkeeper first (a 'Portiere' when the keeper is fixed,
 * otherwise the best in defence + physique), then each place to the player whose role fits it best
 * (same role > close role > any), using the stat that matters for that place as tie-break.
 */
export function orderTeamForFormation(team: Profile[], slots: FormationSlot[], fixedKeeper = true): Profile[] {
  const pool = [...team];
  const out: (Profile | undefined)[] = new Array(slots.length).fill(undefined);

  let gk = fixedKeeper ? pool.findIndex((p) => roleOf(p) === 'Portiere') : -1;
  if (gk === -1) {
    // Senza portiere vero: in porta chi difende meglio, ma mai una punta se c'è altro
    let best = -1;
    pool.forEach((p, i) => {
      const v = stat(p, 'Difesa') + stat(p, 'Fisico') - (roleOf(p) === 'Punta' ? 3 : 0);
      if (v > best) {
        best = v;
        gk = i;
      }
    });
  }
  out[0] = pool.splice(Math.max(0, gk), 1)[0];

  const keyStat: Record<FieldPosition, string> = {
    Portiere: 'Difesa',
    Difensore: 'Difesa',
    Centrocampista: 'Visione',
    Esterno: 'Velocità',
    Punta: 'Tiro',
  };
  const fit = (p: Profile, slot: FormationSlot) => {
    const r = roleOf(p);
    const base = r === slot.role ? 30 : ROLE_NEAR[slot.role].includes(r) ? 15 : r === 'Portiere' ? 0 : 5;
    return base + stat(p, keyStat[slot.role]);
  };
  const pairs: { pi: number; si: number; v: number }[] = [];
  pool.forEach((p, pi) => slots.forEach((slot, si) => si > 0 && pairs.push({ pi, si, v: fit(p, slot) })));
  pairs.sort((a, b) => b.v - a.v);
  const usedP = new Set<number>();
  for (const { pi, si } of pairs) {
    if (usedP.has(pi) || out[si]) continue;
    out[si] = pool[pi];
    usedP.add(pi);
  }
  // (sicurezza) eventuali posti rimasti vuoti con chi resta
  const rest = pool.filter((_, i) => !usedP.has(i));
  return out.map((p) => p || rest.shift()).filter((p): p is Profile => Boolean(p));
}

function balanceTeamsLarge(players: Profile[], options: BalanceOptions & { slots: FormationSlot[] }): BalancedTeamsResult {
  const perTeam = options.slots.length;
  if (players.length !== perTeam * 2) {
    throw new Error(`Servono esattamente ${perTeam * 2} giocatori per ${perTeam} contro ${perTeam}.`);
  }
  const keepers = players.filter((p) => roleOf(p) === 'Portiere');
  const lockKeepers = Boolean(options.fixedKeeper) && keepers.length >= 2;
  // Con il portiere fisso: i due portieri migliori uno per squadra, mai scambiati
  const sortedKeepers = [...keepers].sort((a, b) => getPlayerOverallRating(b) - getPlayerOverallRating(a));
  const fixedW = lockKeepers ? sortedKeepers[0] : undefined;
  const fixedB = lockKeepers ? sortedKeepers[1] : undefined;
  const free = players.filter((p) => p !== fixedW && p !== fixedB);

  const seedBase = players.reduce((a, p) => a + p.id.split('').reduce((x, c) => x + c.charCodeAt(0), 0), 0);
  const rand = seeded(options.excludeSplitKey ? Math.floor(Math.random() * 1e9) : seedBase);

  const found = new Map<string, { white: Profile[]; black: Profile[]; cost: number; parts: ReturnType<typeof splitCost> }>();
  const RESTARTS = 40;
  for (let r = 0; r < RESTARTS; r++) {
    // Partenza: a serpentina per livello (la prima) oppure mescolata
    const order =
      r === 0
        ? [...free].sort((a, b) => getPlayerOverallRating(b) - getPlayerOverallRating(a))
        : [...free].sort(() => rand() - 0.5);
    const white: Profile[] = fixedW ? [fixedW] : [];
    const black: Profile[] = fixedB ? [fixedB] : [];
    order.forEach((p, i) => {
      const snake = i % 4 === 0 || i % 4 === 3;
      if ((snake && white.length < perTeam) || black.length >= perTeam) white.push(p);
      else black.push(p);
    });

    // Scambi a coppie finché il risultato migliora
    let best = score(splitCost(white, black));
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < white.length; i++) {
        if (white[i] === fixedW) continue;
        for (let j = 0; j < black.length; j++) {
          if (black[j] === fixedB) continue;
          [white[i], black[j]] = [black[j], white[i]];
          const c = score(splitCost(white, black));
          if (c + 1e-9 < best) {
            best = c;
            improved = true;
          } else {
            [white[i], black[j]] = [black[j], white[i]];
          }
        }
      }
    }
    const key = [white.map((p) => p.id).sort().join(','), black.map((p) => p.id).sort().join(',')].sort().join('|');
    if (!found.has(key)) found.set(key, { white: [...white], black: [...black], cost: best, parts: splitCost(white, black) });
  }

  const candidates = Array.from(found.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.cost - b.cost);
  let chosen = candidates[0];
  if (options.excludeSplitKey) {
    const others = candidates.filter((c) => c.key !== options.excludeSplitKey);
    const pool = others.slice(0, Math.max(1, options.pickAmongTop ?? 5));
    if (pool.length > 0) chosen = pool[Math.floor(Math.random() * pool.length)];
  }
  const swapColours = Boolean(options.excludeSplitKey) && Math.random() < 0.5;
  const bestWhite = swapColours ? chosen.black : chosen.white;
  const bestBlack = swapColours ? chosen.white : chosen.black;

  const whiteStats = calculateTeamSummary(bestWhite);
  const blackStats = calculateTeamSummary(bestBlack);
  const diffAvg = Math.abs(whiteStats.overallAvg - blackStats.overallAvg);
  return {
    teamWhite: orderTeamForFormation(bestWhite, options.slots, Boolean(options.fixedKeeper)),
    teamBlack: orderTeamForFormation(bestBlack, options.slots, Boolean(options.fixedKeeper)),
    whiteStats,
    blackStats,
    difference: Number(diffAvg.toFixed(2)),
    fairnessScore: Math.max(0, Math.min(100, Math.round(100 - diffAvg * 15))),
  };
}
