import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { date, playerId, playerName } = await request.json();

    if (!date || !playerId) {
      return NextResponse.json({ error: 'Parametri mancanti (date, playerId)' }, { status: 400 });
    }

    // Le presenze sono gestite in tempo reale via Firebase Firestore sul client.
    // L'endpoint serve come hook per eventuali notifiche email o log.
    return NextResponse.json({ success: true, date, playerId, playerName });
  } catch (error: unknown) {
    console.error('Presence toggle error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
