# ⚽ ClubCalcetto - Piattaforma Web 5v5 per Partite tra Amici

**ClubCalcetto** è un'applicazione web moderna e reattiva progettata per gestire con facilità l'organizzazione della partita di calcetto settimanale: votazione presenze in tempo reale con gestione automatica di titolari e waitlist, statistiche dettagliate da 1 a 10 per ogni giocatore, algoritmo intelligente di bilanciamento delle squadre 5v5, rendering del campo virtuale e condivisione su WhatsApp con screenshot ad alta risoluzione.

---

## 🚀 Stack Tecnologico

- **Framework:** [Next.js 15 (App Router)](https://nextjs.org/) con React 19 e TypeScript
- **Stile:** [Tailwind CSS v3](https://tailwindcss.com/) nativo Dark Mode (`dark`), responsive mobile-first
- **Backend & Database:** [Supabase](https://supabase.com/)
  - **Auth:** Google OAuth (app privata con ruoli `User` e `Admin`)
  - **Database:** PostgreSQL con Row Level Security (RLS) e trigger automatici
  - **Realtime:** Canali WebSocket Supabase Realtime per aggiornamento presenze istantaneo
  - **Storage:** Bucket `avatars` per il caricamento delle foto profilo dei calciatori
- **Screenshot & Condivisione:** `html-to-image` per la cattura PNG del campo da calcetto virtuale e formattatore WhatsApp per gli appunti
- **Notifiche:** API Route server-side integrata con Resend per avvisi email all'Admin (al raggiungimento del decimo titolare o al ritiro di un titolare)

---

## 📋 Requisiti e Funzionalità Implementate

### 1. 🔐 Autenticazione e Sicurezza
- Login esclusivo tramite **Google OAuth** con Supabase Auth.
- Gestione ruoli a due livelli: **`User` (Giocatore)** e **`Admin` (Organizzatore)** gestiti tramite Supabase RLS.
- L'applicazione è privata e protetta da middleware (`src/middleware.ts`): reindirizza automaticamente gli utenti non autenticati al login.
- Primo utente o sviluppatore configurato automaticamente con ruolo Admin.

### 2. 🎨 UI/UX Mobile-First & Dark Mode
- Tema scuro nativo con sfondo profondo `slate-950`, accenti verde fluorescente da campo `emerald-500` ed elementi ad alto contrasto.
- Ottimizzato per smartphone con bottom bar ergonomica su dispositivi mobili e navigazione desktop espansa.

### 3. ⏱️ Gestione Presenze Real-Time & Waitlist
- Dashboard settimanale con calendario a scorrimento (da Lunedì a Domenica).
- Iscrizione e cancellazione istantanea con un click ("Vota Presenza").
- **Logica Titolari vs Waitlist:**
  - I primi **10 presenti** sono contrassegnati come **Titolari** (1..10).
  - Dall'**11esimo giocatore in poi**, l'utente viene inserito nella **Waitlist (In Attesa)** con posizione dinamica (+1, +2, ecc.).
  - Se un Titolare annulla la presenza, il primo della Waitlist subentra **automaticamente** come titolare e tutti i giocatori connessi vedono la schermata aggiornarsi all'istante grazie a **Supabase Realtime**.

### 4. 📊 Giocatori e Statistiche (Tabella e Profilo)
- Valutazioni tecniche su scala da **1 a 10**:
  - `Resistenza`, `Velocità`, `Difesa`, `Tiro`, `Passaggio`, `Tecnica`, `Fisico`, `Dribbling`.
- Calcolo automatico della media complessiva **OVR (Overall Rating)**.
- Upload foto profilo su Supabase Storage (bucket `avatars`).
- **Vista User:** Tabella riassuntiva in sola lettura con ricerca e ordinamento per OVR o Nome.
- **Vista Admin:**
  - Modifica delle valutazioni individuali dei compagni.
  - Aggiunta e rimozione dinamica di **nuove categorie statistiche** (es. "Visione", "Colpo di Testa").
  - Creazione di **giocatori manuali/ospiti** (senza account Google).
  - Eliminazione giocatori.
  - **Tasto di emergenza nel pannello Admin per azzerare tutte le votazioni della settimana.**

### 5. ⚖️ Algoritmo di Generazione Squadre Bilanciate (5v5)
- Modulo di configurazione evento: Data, Ora inizio, Nome campo/centro sportivo e Costo totale del campo.
- Al raggiungimento dei 10 titolari, l'Admin può avviare l'algoritmo (`src/lib/algorithm/teamBalancer.ts`).
- L'algoritmo esamina le partizioni combinatorie possibili ($\binom{10}{5} = 252$) e individua la suddivisione esatta tra **Squadra Bianca** e **Squadra Nera** che minimizza lo scarto della media totale di abilità e bilancia difesa e attacco, restituendo anche un **Indice di Equità (%)**.

### 6. 📱 Campo Virtuale e Condivisione WhatsApp
- Rendering realistico di un campo da calcetto in erba verde scuro con strisce alternate e tracciature regolamentari (linee, centrocampo, aree e porte).
- I 10 giocatori sono posizionati graficamente nelle rispettive metà campo evitando sovrapposizioni.
- **Pulsante "Condividi su WhatsApp" (riservato Admin):**
  1. Genera e scarica automaticamente l'immagine PNG in alta definizione del campo.
  2. Calcola la quota esatta a testa: $\frac{\text{Costo Totale}}{10}$.
  3. Copia negli appunti il testo formattato con emoji e apre direttamente WhatsApp (`https://wa.me/?text=...`).

### 7. 📬 Notifiche Automatiche Email Admin
- Endpoint server-side `/api/notify` integrato con Resend:
  - Invia un'email all'Admin quando una partita raggiunge esattamente i **10 titolari confermati**.
  - Invia un alert se un titolare si ritira, indicando il nome della riserva promossa dalla waitlist.

---

## 🛠️ Istruzioni di Installazione e Avvio Locale

### 1. Clona o apri la cartella del progetto
```bash
cd ClubCalcetto
```

### 2. Configura il file `.env.local`
Crea o modifica `.env.local` con i tuoi parametri Supabase:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://tuo-progetto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tua-chiave-anonima
SUPABASE_SERVICE_ROLE_KEY=tua-service-role-key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Notifiche Admin
ADMIN_NOTIFICATION_EMAIL=admin@clubcalcetto.it
RESEND_API_KEY=re_tua_chiave_resend_opzionale
```

### 3. Inizializza il Database su Supabase
1. Accedi alla dashboard del tuo progetto su [Supabase](https://supabase.com/).
2. Vai su **SQL Editor** -> **New Query**.
3. Incolla l'intero contenuto del file [`supabase_schema.sql`](./supabase_schema.sql) ed esegui la query (**Run**).
   - Questo comando creerà tutte le tabelle (`profiles`, `stat_categories`, `matches`, `presences`, `teams`), i trigger per il calcolo dell'OVR e della waitlist, il bucket storage `avatars` e le policy di sicurezza RLS.
4. Vai su **Authentication** -> **Providers** e abilita il provider **Google** con i tuoi `Client ID` e `Client Secret` ottenuti dalla Google Cloud Console.
5. Inserisci nei Redirect URL di Google Cloud e Supabase:
   `https://tuo-progetto.supabase.co/auth/v1/callback` e `http://localhost:3000/auth/callback`.

### 4. Avvia il server di sviluppo
```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) nel tuo browser.

---

## 📁 Struttura del Progetto

```
ClubCalcetto/
├── supabase_schema.sql             # Script SQL completo per tabelle, trigger e policy RLS
├── package.json                    # Dipendenze Next.js 15, Tailwind, Supabase, html-to-image
├── tailwind.config.ts              # Configurazione Dark Mode e colori calcetto
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root Layout Dark Mode & AuthProvider
│   │   ├── page.tsx                # Redirect alla dashboard
│   │   ├── login/                  # Pagina di autenticazione Google OAuth
│   │   ├── auth/callback/          # Scambio token sessione Supabase
│   │   ├── presenze/               # Dashboard calendario presenze e realtime waitlist
│   │   ├── giocatori/              # Tabella statistiche 1-10 e profili
│   │   ├── squadre/                # Generatore 5v5, Campo Virtuale & WhatsApp Share
│   │   ├── admin/                  # Control panel admin (reset voti, categorie, ospiti)
│   │   └── api/
│   │       ├── notify/             # Invio email di notifica (10 confermati / ritiro)
│   │       └── presence/toggle/    # Gestione server-side presenza e waitlist
│   ├── components/
│   │   ├── Navbar.tsx              # Barra navigazione mobile-first con switch ruoli
│   │   ├── VirtualPitch.tsx        # Rendering grafico del campo e delle maglie
│   │   ├── PresenceCard.tsx        # Scheda giornaliera titolari vs riserve
│   │   ├── PlayerModal.tsx         # Modal per upload foto e voti 1-10
│   │   ├── StatCategoriesManager.tsx # Gestore categorie statistiche dinamiche
│   │   └── StatBadge.tsx           # Badge OVR stile FC / FIFA
│   ├── lib/
│   │   ├── algorithm/
│   │   │   └── teamBalancer.ts     # Algoritmo combinatorio bilanciamento 5v5
│   │   ├── context/
│   │   │   └── AuthContext.tsx     # Stato globale utente, profilo e ruolo
│   │   ├── supabase/
│   │   │   ├── client.ts           # Client Supabase browser
│   │   │   ├── server.ts           # Client Supabase SSR server
│   │   │   ├── middleware.ts       # Protezione rotte
│   │   │   └── types.ts            # Tipi TypeScript del Database
│   │   └── utils/
│   │       ├── dateUtils.ts        # Helper calendario giorni e date italiane
│   │       ├── formation.ts        # Coordinate non sovrapposte delle formazioni
│   │       └── whatsapp.ts         # Generatore testo e quota per WhatsApp
│   └── middleware.ts               # Protezione accessi privati
```

---

## 🔒 Sicurezza e RLS

Tutti i dati sono protetti da regole **Row Level Security (RLS)** in PostgreSQL:
- Solo gli utenti autenticati possono leggere giocatori e partite.
- Un utente può aggiornare solo il proprio avatar e nome, oppure votare per sé stesso.
- Solo gli **Admin** possono modificare le abilità tecniche altrui, creare giocatori ospiti, cancellare utenti e azzerare le presenze.

⚽ *Buona partita con ClubCalcetto!*
