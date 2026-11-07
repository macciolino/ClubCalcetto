import { Profile } from '@/types/database';

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
   * Club plays with a fixed goalkeeper: with 2 or more 'Portiere' among the 10, each team gets at least one.
   * false (rotation, default) = the role Portiere is ignored.
   */
  fixedKeeper?: boolean;
}

/**
 * Algoritmo di Bilanciamento Squadre 5v5 per ClubCalcetto.
 * Valuta tutte le 126 divisioni distinte (252 combinazioni / 2) e sceglie la più equilibrata
 * per media generale, poi per difesa + attacco. Senza opzioni il risultato è deterministico.
 */
export function balanceTeams(players: Profile[], options: BalanceOptions = {}): BalancedTeamsResult {
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
  const allowed =
    options.fixedKeeper && keepers.size >= 2
      ? candidates.filter((c) => c.white.some((p) => keepers.has(p.id)) && c.black.some((p) => keepers.has(p.id)))
      : candidates;
  candidates.length = 0;
  candidates.push(...allowed);

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
