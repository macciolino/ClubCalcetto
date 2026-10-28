import { NextResponse } from 'next/server';
import { generateTacticalAnalysis } from '@/lib/gemini/client';

export async function POST(request: Request) {
  try {
    const { teamWhite, teamBlack, matchInfo } = await request.json();

    if (!teamWhite || !teamBlack || !matchInfo) {
      return NextResponse.json({ error: 'Dati mancanti per l\'analisi tattica' }, { status: 400 });
    }

    const analysis = await generateTacticalAnalysis(teamWhite, teamBlack, matchInfo);
    return NextResponse.json(analysis);
  } catch (error: unknown) {
    console.error('Tactical preview error:', error);
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
