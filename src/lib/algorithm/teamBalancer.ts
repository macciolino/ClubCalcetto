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
    tecSum += Number(stats['Tecnica'] || stats['Dribbling'] || ovr);
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
 * Algoritmo di Bilanciamento Squadre 5v5 per ClubCalcetto
 * Trova la partizione ottimale tra 252 combinazioni minimizzando il delta medio e secondario
 */
export function balanceTeams(players: Profile[]): BalancedTeamsResult {
  if (players.length !== 10) {
    throw new Error('L\'algoritmo richiede esattamente 10 giocatori.');
  }

  // Tutte le possibili combinazioni di 5 giocatori
  const allCombos = getCombinations(players, 5);

  let bestWhite: Profile[] = [];
  let bestBlack: Profile[] = [];
  let minDiff = Infinity;
  let minSecondaryDiff = Infinity;

  for (const comboWhite of allCombos) {
    const whiteIds = new Set(comboWhite.map((p) => p.id));
    const comboBlack = players.filter((p) => !whiteIds.has(p.id));

    const whiteSum = comboWhite.reduce((acc, p) => acc + getPlayerOverallRating(p), 0);
    const blackSum = comboBlack.reduce((acc, p) => acc + getPlayerOverallRating(p), 0);

    const diff = Math.abs(whiteSum - blackSum);

    // Calcolo bilanciamento secondario (difesa + attacco)
    const whiteDef = comboWhite.reduce((acc, p) => acc + (p.stats?.['Difesa'] || 6), 0);
    const blackDef = comboBlack.reduce((acc, p) => acc + (p.stats?.['Difesa'] || 6), 0);
    const whiteAtk = comboWhite.reduce((acc, p) => acc + (p.stats?.['Tiro'] || 6), 0);
    const blackAtk = comboBlack.reduce((acc, p) => acc + (p.stats?.['Tiro'] || 6), 0);

    const secondaryDiff = Math.abs(whiteDef - blackDef) + Math.abs(whiteAtk - blackAtk);

    if (
      diff < minDiff ||
      (Math.abs(diff - minDiff) < 0.05 && secondaryDiff < minSecondaryDiff)
    ) {
      minDiff = diff;
      minSecondaryDiff = secondaryDiff;
      bestWhite = comboWhite;
      bestBlack = comboBlack;
    }
  }

  const whiteStats = calculateTeamSummary(bestWhite);
  const blackStats = calculateTeamSummary(bestBlack);
  const diffAvg = Math.abs(whiteStats.overallAvg - blackStats.overallAvg);

  // Indice di equità da 0 a 100% (se diffAvg è 0, fairness è 100%)
  const fairnessScore = Math.max(0, Math.min(100, Math.round(100 - diffAvg * 15)));

  return {
    teamWhite: bestWhite,
    teamBlack: bestBlack,
    whiteStats,
    blackStats,
    difference: Number(diffAvg.toFixed(2)),
    fairnessScore,
  };
}
