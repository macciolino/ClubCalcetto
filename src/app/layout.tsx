import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/context/AuthContext';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'ClubCalcetto - Gestione Partite & Squadre Bilanciate',
  description: 'App privata per la gestione presenze, statistiche giocatori e generazione squadre 5v5 con algoritmo di bilanciamento.',
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark" style={{ backgroundColor: '#020617', colorScheme: 'dark' }}>
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950 pb-16 md:pb-0" style={{ backgroundColor: '#020617' }}>
        <AuthProvider>
          <Navbar />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
