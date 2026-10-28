import { Profile } from '@/types/database';
import { formatItalianDate } from './dateUtils';
import { getPlayerOverallRating } from '../algorithm/teamBalancer';

export interface WhatsAppShareData {
  date: string;
  time: string;
  location: string;
  totalCost: number;
  teamWhite: Profile[];
  teamBlack: Profile[];
  whiteAvg?: number;
  blackAvg?: number;
}

export function generateWhatsAppMessage(data: WhatsAppShareData): string {
  const costPerPerson = (Number(data.totalCost || 80) / 10).toFixed(2);
  const formattedDate = formatItalianDate(data.date);

  const whiteList = data.teamWhite
    .map((p, i) => `  ${i + 1}. ${p.full_name} (${getPlayerOverallRating(p)})`)
    .join('\n');

  const blackList = data.teamBlack
    .map((p, i) => `  ${i + 1}. ${p.full_name} (${getPlayerOverallRating(p)})`)
    .join('\n');

  const whiteAvgText = data.whiteAvg ? ` [Media: ${data.whiteAvg}]` : '';
  const blackAvgText = data.blackAvg ? ` [Media: ${data.blackAvg}]` : '';

  return `⚽ *CLUB CALCETTO - CONVOCAZIONI E SQUADRE* ⚽

📅 *Data:* ${formattedDate}
⏰ *Orario:* ${data.time || '20:30'}
📍 *Luogo:* ${data.location || 'Centro Sportivo Calcetto'}
💰 *Costo a testa:* €${costPerPerson} (€${Number(data.totalCost || 80).toFixed(2)} totale / 10 giocatori)

━━━━━━━━━━━━━━━━━━━
⚪ *SQUADRA BIANCA*${whiteAvgText}
${whiteList}

⚫ *SQUADRA NERA*${blackAvgText}
${blackList}
━━━━━━━━━━━━━━━━━━━

⚡ *Presentarsi con 15 minuti di anticipo per il riscaldamento!*
Non dimenticate di portare sia maglietta Bianca che Nera per sicurezza! 🏃‍♂️💨`;
}

export function getWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Errore durante la copia negli appunti:', err);
    return false;
  }
}
