import { NextResponse } from 'next/server';

interface NotificationPayload {
  type: 'ten_players_reached' | 'starter_cancelled';
  date: string;
  playerName?: string;
  promotedPlayerName?: string;
  totalConfirmed?: number;
}

export async function POST(request: Request) {
  try {
    const body: NotificationPayload = await request.json();
    const { type, date, playerName, promotedPlayerName, totalConfirmed } = body;

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@clubcalcetto.it';
    const resendApiKey = process.env.RESEND_API_KEY;

    let subject = '';
    let htmlContent = '';

    if (type === 'ten_players_reached') {
      subject = `⚽ [ClubCalcetto] 10 Titolari Raggiunti per il ${date}!`;
      htmlContent = `
        <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
          <h2 style="color: #22c55e;">Partita al completo! ⚽</h2>
          <p>Ciao Admin,</p>
          <p>La partita in programma per il giorno <strong>${date}</strong> ha appena raggiunto <strong>10 giocatori confermati (Titolari)</strong>!</p>
          ${playerName ? `<p>Ultimo giocatore confermato: <strong>${playerName}</strong></p>` : ''}
          <div style="background-color: #1e293b; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;">Puoi ora accedere all'app ClubCalcetto per visualizzare i convocati e generare le squadre bilanciate.</p>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">Notifica automatica generata da ClubCalcetto App</p>
        </div>
      `;
    } else if (type === 'starter_cancelled') {
      subject = `⚠️ [ClubCalcetto] Ritiro Titolare per il ${date}`;
      htmlContent = `
        <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
          <h2 style="color: #f59e0b;">Attenzione: Titolare ritirato ⚠️</h2>
          <p>Ciao Admin,</p>
          <p>Il giocatore <strong>${playerName || 'Un titolare'}</strong> ha annullato la propria presenza per la partita del <strong>${date}</strong>.</p>
          ${
            promotedPlayerName
              ? `<div style="background-color: #1e293b; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p style="color: #22c55e; margin: 0;"><strong>${promotedPlayerName}</strong> è stato automaticamente promosso dalla Waitlist a Titolare!</p>
                </div>`
              : `<p style="color: #ef4444;">Nessun giocatore in waitlist disponibile per il subentro.</p>`
          }
          <p style="color: #94a3b8; font-size: 13px;">Totale presenti attuali: ${totalConfirmed ?? 'N/D'}</p>
        </div>
      `;
    }

    console.log(`[ClubCalcetto Notification] -> Type: ${type} | Date: ${date} | To: ${adminEmail}`);

    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: 'ClubCalcetto <notifiche@clubcalcetto.it>',
          to: [adminEmail],
          subject,
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Errore invio Resend:', errorText);
        return NextResponse.json({ success: false, error: errorText }, { status: 500 });
      }

      return NextResponse.json({ success: true, mode: 'resend' });
    }

    // Modalità Log / Dev
    return NextResponse.json({
      success: true,
      mode: 'console_log',
      message: 'Notifica registrata correttamente a console (chiave Resend non configurata)',
    });
  } catch (error: unknown) {
    console.error('Errore route /api/notify:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
