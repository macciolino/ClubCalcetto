import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
import { AuthProvider } from '@/lib/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { FeedbackHost } from '@/components/ui/Feedback';

import { SplashScreen, SPLASH_GUARD } from '@/components/SplashScreen';
export const metadata: Metadata = {
  title: 'Club Soccer - Gestione Partite & Squadre Bilanciate',
  description: 'App privata per la gestione presenze, statistiche giocatori e generazione squadre (5vs5, 7vs7, 8vs8, 11vs11) con algoritmo di bilanciamento.',
  icons: {
    icon: [{ url: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-icon-180.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Club Soccer', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0B0F19',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Use the whole screen (notch, rounded corners, home bar): bars add the safe margins themselves
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`dark ${inter.variable}`} suppressHydrationWarning style={{ backgroundColor: '#0B0F19', colorScheme: 'dark' }}>
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950 body-safe-bottom px-safe" suppressHydrationWarning style={{ backgroundColor: '#0B0F19' }}>
        {/* Schermata di avvio: nascosta subito se già vista in questa sessione o sul login */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GUARD }} />
        <SplashScreen />
        <AuthProvider>
          <Navbar />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>
          <FeedbackHost />
        </AuthProvider>
      </body>
    </html>
  );
}
