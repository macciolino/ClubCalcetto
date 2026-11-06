import { NextResponse } from 'next/server';

/**
 * Public Web Push key (VAPID) of Firebase Cloud Messaging. It is PUBLIC by design (the browser needs it
 * to subscribe), served from here so on Vercel it can be stored without the NEXT_PUBLIC_ prefix.
 */
export async function GET() {
  const vapidKey = process.env.FIREBASE_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
  return NextResponse.json({ vapidKey }, { headers: { 'Cache-Control': 'no-store' } });
}
