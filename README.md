# ⚽ Club Soccer (ClubCalcetto)

App web privata per organizzare la partita settimanale di un gruppo di amici: iscrizioni con titolari e lista
d'attesa, squadre bilanciate, campo virtuale da condividere su WhatsApp, storico e classifiche, voto MVP,
cassa, notifiche push. Interfaccia in italiano e inglese, tema chiaro e scuro, pensata per il telefono.

Il nome mostrato agli utenti è **Club Soccer**; codice, repository e dominio Vercel si chiamano ancora ClubCalcetto.

## Tecnologie

- **Next.js 16** (App Router), **React 19**, **TypeScript** strict, **Tailwind CSS 3**, **next-intl** (lingua scelta nel browser).
- **Firebase** (piano gratuito Spark): Authentication (Google, email e password), Firestore in tempo reale,
  Cloud Messaging per le notifiche. SDK del browser `firebase` 13; lato server `firebase-admin`.
- **Vercel** (piano Hobby): pubblicazione automatica a ogni push su `main`; le route `src/app/api/*` usano `firebase-admin`.
- **GitHub Actions**: `mvp-vote-notify.yml` chiama ogni 10 minuti `/api/cron/mvp-vote` (voto MVP, promozioni dalla
  lista d'attesa, pulizia della campanella); `ci.yml` esegue i controlli a ogni push.

## Sicurezza e dati

- I permessi veri sono in **`firestore.rules`** (il browser parla direttamente con Firestore). Ruoli: super admin
  (account verificato in `src/lib/superAdmin.ts`, profilo `p-1`), admin (`role == 'admin'`), giocatore.
- Le email dei giocatori stanno in `private_profiles/{id}` (lette solo dal giocatore e dagli admin), non nei profili pubblici.
- Le regole **non si pubblicano da qui**: si incollano nella console Firebase (Firestore → Regole) dopo il push del codice.
- Modello dati, ruoli e regole di gioco: [`.claude/skills/data-and-roles/SKILL.md`](.claude/skills/data-and-roles/SKILL.md).
  Mappa di pagine e cartelle: [`.claude/skills/project-map/SKILL.md`](.claude/skills/project-map/SKILL.md).

## Sviluppo in locale

Requisiti: Node.js 20 o superiore, Java 11 o superiore (per gli emulatori Firebase).

```bash
npm ci
cp .env.example .env.local      # configurazione Firebase pubblica (NEXT_PUBLIC_*)
npm run dev:emulators           # emulatori Firebase + app su http://localhost:3001 con dati finti
npm run seed:emulators          # (facoltativo) riempie gli emulatori con dati di prova
```

Con gli emulatori l'app usa il progetto finto `demo-clubcalcetto`: **la produzione non viene mai toccata**.
`npm run dev` invece si collega al progetto Firebase configurato in `.env.local`.

Le chiavi segrete (`FIREBASE_ADMIN_*`, `CRON_SECRET`, chiave VAPID) vanno impostate **solo su Vercel**, mai nel repository.

## Controlli e test

| Comando | Cosa fa |
|---|---|
| `npx tsc --noEmit -p .` | controllo dei tipi |
| `npm run lint` | ESLint |
| `npm run test:unit` | test di unità (Vitest) |
| `npm run test:rules` | regole Firestore sugli emulatori |
| `npm run test:integration` | route e logica del server sugli emulatori |
| `npm run test:e2e` | app vera nel browser (Playwright) sugli emulatori; chiudere prima `dev:emulators` |
| `npm run check:server` | le librerie del server si caricano come sulle funzioni Vercel (senza `require()` di moduli ES): da lanciare dopo ogni aggiornamento di `firebase-admin` |
| `npm run build` | build di produzione |
| `npm run test:all` | tutti i test |

Tutti i test usano emulatori e dati finti. `npm run backup:firestore` salva una copia di sola lettura della
produzione in `backups/` (cartella esclusa da git: contiene dati personali).

## Pubblicazione

1. `git push` su `main` → Vercel pubblica l'app.
2. Se `firestore.rules` è cambiato: pubblicare le regole nella console Firebase **dopo** il push del codice.
