import { GoogleGenerativeAI } from '@google/generative-ai';
import { Profile } from '@/types/database';
import { getPlayerOverallRating } from '../algorithm/teamBalancer';

export interface TacticalAnalysisResult {
  headline: string;
  prediction: string;
  whiteTactics: string;
  blackTactics: string;
  keyDuel: string;
  funnyLockerRoomQuote: string;
  epicWhatsAppText: string;
}

export async function generateTacticalAnalysis(
  teamWhite: Profile[],
  teamBlack: Profile[],
  matchInfo: { date: string; time: string; location: string; totalCost: number }
): Promise<TacticalAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  const whiteNames = teamWhite
    .map((p) => `${p.full_name} (OVR ${getPlayerOverallRating(p)})`)
    .join(', ');
  const blackNames = teamBlack
    .map((p) => `${p.full_name} (OVR ${getPlayerOverallRating(p)})`)
    .join(', ');

  const costPerPerson = (Number(matchInfo.totalCost || 80) / 10).toFixed(2);

  // Se la chiave API di Google AI Studio non è ancora configurata, usa il generatore euristico di fallback
  if (!apiKey) {
    const whiteTop = [...teamWhite].sort((a, b) => getPlayerOverallRating(b) - getPlayerOverallRating(a))[0];
    const blackTop = [...teamBlack].sort((a, b) => getPlayerOverallRating(b) - getPlayerOverallRating(a))[0];

    return {
      headline: '⚽ Derby ad Alta Intensità: Equilibrio Millimetrico sul Rettangolo Verde!',
      prediction: 'Pronostico Gemini AI: 50% - 50% con probabile decisione nei minuti di recupero.',
      whiteTactics: `La Squadra Bianca deve puntare sul gioco veloce e sull'estro di ${whiteTop?.full_name || 'punta'}, cercando di aprire la difesa con passaggi filtranti rapidi.`,
      blackTactics: `La Squadra Nera ha grande compattezza fisica guidata da ${blackTop?.full_name || 'capitano'}; la chiave sarà il pressing alto per recuperare palla nella metà campo avversaria.`,
      keyDuel: `⚔️ Duello Chiave: ${whiteTop?.full_name || 'Attaccante'} (Bianca) vs ${blackTop?.full_name || 'Difensore'} (Nera)`,
      funnyLockerRoomQuote: '"Chi perde paga da bere, chi arriva in ritardo fa il portiere nei primi 10 minuti!"',
      epicWhatsAppText: `⚽ *CONVOCAZIONI UFFICIALI CLUB CALCETTO* ⚽
📅 *Data:* ${matchInfo.date} | ⏰ *Ore:* ${matchInfo.time}
📍 *Campo:* ${matchInfo.location}
💰 *Quota:* €${costPerPerson} a testa

⚪ *SQUADRA BIANCA:* ${whiteNames}
⚫ *SQUADRA NERA:* ${blackNames}

🎙️ *ANALISI GOOGLE AI STUDIO:*
Sfida equilibrata al millimetro! Chi perde paga le birre al bar del campo.
Portare sia maglietta Bianca che Nera! 🏃💨`,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
Sei il telecronista e analista tattico ufficiale dell'app calcetto "ClubCalcetto".
Ecco le due formazioni 5v5 bilanciate per la partita:
- Data: ${matchInfo.date}, Ora: ${matchInfo.time}, Luogo: ${matchInfo.location}, Quota: €${costPerPerson} a testa.
- Squadra Bianca: ${whiteNames}
- Squadra Nera: ${blackNames}

Genera un'analisi tattica brillante, divertente ma accurata per il gruppo calcetto in formato JSON valido:
{
  "headline": "Titolo epico ed entusiasmante della partita",
  "prediction": "Breve pronostico con percentuali di vittoria realistiche",
  "whiteTactics": "Strategia consigliata per la Squadra Bianca (max 2 frasi)",
  "blackTactics": "Strategia consigliata per la Squadra Nera (max 2 frasi)",
  "keyDuel": "Il duello individuale più caldo della serata",
  "funnyLockerRoomQuote": "Battuta ironica da spogliatoio o penitenza per chi perde",
  "epicWhatsAppText": "Messaggio formattato completo per WhatsApp con formazioni, quota a testa e l'analisi"
}
Rispondi ESCLUSIVAMENTE con il JSON puro, senza blocchi di codice markdown aggiuntivi.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Pulisci eventuale markdown ```json
    const cleanJson = responseText
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    return JSON.parse(cleanJson) as TacticalAnalysisResult;
  } catch (err) {
    console.warn('Errore chiamata Gemini API, fallback locale:', err);
    return {
      headline: '⚽ Grande Sfida 5v5: Due Squadre Perfettamente Bilanciate!',
      prediction: 'Pronostico AI: Partita aperta a qualsiasi risultato, decisa dai singoli episodi.',
      whiteTactics: 'Controllo del possesso palla e inserimenti fulminei dalle retrovie.',
      blackTactics: 'Aggressività sulle seconde palle e tiri potenti dal limite dell\'area.',
      keyDuel: 'Scontro tra i due migliori OVR della partita per il dominio del centrocampo.',
      funnyLockerRoomQuote: '"Niente scuse: chi liscia il pallone a porta vuota porta i cornetti giovedì!"',
      epicWhatsAppText: `⚽ *CONVOCAZIONI UFFICIALI CLUB CALCETTO* ⚽
📅 *Data:* ${matchInfo.date} | ⏰ *Ore:* ${matchInfo.time}
📍 *Luogo:* ${matchInfo.location}
💰 *Quota:* €${costPerPerson} a testa

⚪ *BIANCA:* ${whiteNames}
⚫ *NERA:* ${blackNames}

⚡ Ci vediamo 15 minuti prima per il riscaldamento! 🏃💨`,
    };
  }
}
