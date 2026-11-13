import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
import { AuthProvider } from '@/lib/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { FeedbackHost } from '@/components/ui/Feedback';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

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
  // Colore della barra del browser / del telefono, secondo il tema del sistema
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0F19' },
  ],
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
    // La classe "dark" / "light" su <html> la mette next-themes prima del primo disegno (niente lampo)
    <html lang="it" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-app text-primary flex flex-col antialiased selection:bg-accent selection:text-on-accent body-safe-bottom px-safe" suppressHydrationWarning>
        {/* Schermata di avvio: nascosta subito se già vista in questa sessione o sul login */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GUARD }} />
        <SplashScreen />
        {/* Tema (sistema / chiaro / scuro) e lingua (italiano / inglese), scelti nel browser */}
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <Navbar />
              <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
                {children}
              </main>
              <FeedbackHost />
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
