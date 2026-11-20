# Club Soccer — Architettura e regole di business

> **Fonte primaria** per ruoli, permessi e flussi. Prima di toccare dati, regole Firestore o permessi, leggi questo file.
> Se il codice e questo documento non coincidono, va corretto uno dei due nello stesso commit.
> Stato al 2026-11-19 (modello ruoli "staff di piattaforma = presidente ovunque").

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind, next-intl (it/en), Firebase (Auth + Firestore, piano Spark
gratuito), Vercel (API route Node con Admin SDK), notifiche web push con FCM. Solo servizi gratuiti.

**Dove stanno i controlli** (la sicurezza vale solo se c'è sulle prime due righe):

| Livello | File | Ruolo |
|---|---|---|
| Regole Firestore | [firestore.rules](../firestore.rules) | Confine di sicurezza per le scritture dirette dal browser |
| API server | `src/app/api/**`, `src/lib/server/**` | Operazioni privilegiate (Admin SDK, ignora le regole): ricontrollano sempre il ruolo |
| Interfaccia | `src/lib/context/AuthContext.tsx`, `ActiveLeagueContext.tsx`, `src/lib/utils/leaguePermissions.ts` | Mostra o nasconde le azioni. **Non è sicurezza** |
| Proxy | [src/proxy.ts](../src/proxy.ts) | Solo reindirizzamento a `/login` (cookie `cc_session`), nessun ruolo |

---

## 1. Panoramica e architettura multi-lega

### 1.1 I tre livelli di dati

```
profiles/{profileId}            account GLOBALE (uno per persona) + platformRole
private_profiles/{profileId}    email (dato personale, separata)
memberships/{uid}               INDICE: in quali leghe è l'account e con quale scheda
leagues/{leagueId}              la lega (nome, stato, visibilità)
leagues/{leagueId}/...          TUTTI i dati del club, isolati per lega
```

| Collezione | Contenuto | Chi scrive |
|---|---|---|
| `profiles/{id}` | Nome, foto, ruolo in campo, lingua, tema, **`platformRole`** | Il titolare (solo campi estetici), il server; il super admin per il resto (mai `platformRole`) |
| `private_profiles/{id}` | `email` | Il titolare (solo la propria email di accesso), il server |
| `memberships/{uid}` | `leagues.{leagueId} = { player_id, league_role, name }` | **Solo il server** |
| `leagues/{id}` | `name`, `slug`, `status` (`active`/`suspended`), `visibility`, `createdBy` | **Solo il server** |
| `leagues/{id}/players/{playerId}` | La **scheda di lega**: statistiche, OVR, V/P/S, `leagueRole`, `isActivePlayer`, `is_guest`, `userId` | Gestori (non `userId`; ruoli solo il presidente), il titolare (nome, foto, ruolo in campo) |
| `leagues/{id}/presences` | Iscrizioni per giorno (`{data}_{playerId}`, `joined_at` = ora del server) | Il giocatore (solo per sé), i gestori |
| `leagues/{id}/matches` | Partite (data, campo, costo, risultato, marcatori, MVP) | Gestori |
| `leagues/{id}/generated_teams` | Squadre generate per giorno | Gestori |
| `leagues/{id}/match_payments` | Cassa: chi ha pagato | Gestori |
| `leagues/{id}/sport_fields` | Campi della lega con prezzi per formato | Gestori |
| `leagues/{id}/stat_categories` | Parametri dell'ottagono | Gestori |
| `leagues/{id}/settings/*` | Calendario (`open_until`), formati, regole, `app_config` | Gestori |
| `leagues/{id}/mvp_votes` | Voti MVP (`{data}_{uid}`) | Ogni membro per sé |
| `leagues/{id}/admin_requests` | Centro richieste dei gestori | **Solo il server** |
| `league_invites/{code}` | Link di invito della lega | **Solo il server** |
| `field_catalog/{id}` | **Catalogo globale dei campi** (§3.3): dati del campo, prezzi di partenza, stato, leghe collegate | **Solo il server** |
| `push_tokens/{token}` | Dispositivi per le notifiche | Ognuno solo i propri |
| `profiles/{id}/notifications` | Campanella personale | Il server; il titolare legge e segna come letto |

### 1.2 Profilo globale e scheda di lega

- **Un account** (`profiles/{uid}`) può avere **una scheda per ogni lega** (`leagues/{id}/players/{uid}`, stesso id).
- Le statistiche, l'OVR e il V/P/S stanno sulla **scheda**: ogni lega ha i suoi numeri.
- `useAuth().profile` = account globale **fuso** con la scheda della lega attiva. Restano dell'account `id`, `user_id`,
  `locale` e `theme`.
- **Eccezione storica:** il fondatore ha il profilo `p-1`, creato prima di Firebase Auth. Viene riconosciuto da
  `profiles/p-1.user_id == uid`; l'email del fondatore serve solo a trovarlo e il server ripara `user_id`
  ([platformAccount.ts](../src/lib/server/platformAccount.ts)). Le regole e gli e2e lo trattano come caso noto.

### 1.3 Lega attiva

- La lega attiva si sceglie dal selettore accanto al logo ([LeagueSwitcher.tsx](../src/components/league/LeagueSwitcher.tsx)).
  È salvata sul dispositivo (`localStorage.cc_league`).
- Il browser la manda al server nell'header **`x-league-id`**. Le API la leggono con `scoped()` / `currentLeague()`
  ([leagueScope.ts](../src/lib/server/leagueScope.ts)); se manca, usano la lega di base `calcettari`.
- Al cambio di lega le pagine vengono rimontate e le cache locali della lega vengono svuotate
  ([ActiveLeagueContext.tsx](../src/lib/context/ActiveLeagueContext.tsx)).
- La lega di base **"I Calcettari"** (`calcettari`) contiene i dati reali storici e **non si può eliminare**.

---

## 2. Sistema dei ruoli e matrice dei permessi

I due livelli sono **indipendenti**: il ruolo di piattaforma sta sul profilo globale, quello di lega sulla scheda.
Un account può essere presidente in una lega e giocatore in un'altra.

### 2.1 Livello piattaforma: `profiles.platformRole`

Il valore è unico, quindi i ruoli si escludono a vicenda. Lo scrive **solo il server** (le regole lo rifiutano da
qualsiasi client) e serve sempre un'**email verificata**. Se il campo manca, il ruolo è `USER`.

| Ruolo | Etichetta UI | In breve |
|---|---|---|
| `SUPER_ADMIN` | Super admin | Tutto, su tutta la piattaforma |
| `GLOBAL_ADMIN` | Admin piattaforma | Tutto come il super admin, **tranne la sezione di sistema riservata** |
| `USER` | — | Account normale: ha poteri solo dove la sua scheda di lega li dà |

**La sola differenza tra `SUPER_ADMIN` e `GLOBAL_ADMIN`** è la sezione di sistema riservata, che il secondo non vede:

| Riservato al `SUPER_ADMIN` | Dove |
|---|---|
| Nominare e revocare gli admin piattaforma | Console piattaforma → `PlatformAdminsCard`, `/api/super-admin/admins` |
| Privacy delle email (spostamento in `private_profiles`) | Impostazioni → Account e piattaforma → `EmailPrivacyCard`, `/api/admin/email-privacy` |
| Migrazione dei dati della lega | Impostazioni → Account e piattaforma → `LeagueMigrationCard`, `/api/admin/league-migration` |
| Lettura diretta di tutte le email e dei vecchi dati pre-multilega | Regole: `isSuperAdmin()` su `private_profiles` e sulle collezioni di primo livello |
| Modificare dall'app il profilo globale di altri | Regole `profiles` update |

**Protezione del super admin:** nessuno tranne un altro `SUPER_ADMIN` può:
- declassarlo, perché `setPlatformRole` lo rifiuta;
- disattivarne o eliminarne l'account;
- cambiare il ruolo della sua scheda o toglierlo da una lega.

Il controllo guarda il **ruolo**, non l'id: `isSuperAdminAccount()` nelle regole, `isSuperAdminProfile()` sul server.

**Helper**

| Dove | Helper |
|---|---|
| Regole | `isSuperAdmin()`, `isPlatformStaff()`, `isSuperAdminAccount(id)` |
| Server | `callerFrom()` → `{ isSuper, isPlatformStaff, platformRole, profileId }`, `platformCaller` (solo super), `platformStaffCaller` (super + admin piattaforma) |
| UI | `useAuth().isPlatformSuperAdmin` / `isSuperAdmin`, `useAuth().isPlatformStaff` |

### 2.2 Livello lega: `leagues/{id}/players/{id}.leagueRole`

Il ruolo è copiato dal server in `memberships/{uid}.leagues.{id}.league_role`, che serve solo come indice.

| Ruolo | Etichetta UI | Cosa può fare nella **sua** lega |
|---|---|---|
| `PRESIDENT` | Presidente | Tutto quello che fa il collaboratore, più: nome e visibilità della lega, **ruoli** (nomina e revoca di presidenti e collaboratori), togliere collaboratori, "non gioca" per un membro, **eliminare la lega** |
| `COLLABORATOR` | Collaboratore | Gestione operativa: presenze di tutti, sblocco del calendario, formati, squadre, partite e risultati, MVP, cassa, campi, parametri e statistiche, ospiti, inviti, centro richieste, email dei membri, togliere **giocatori** dalla lega |
| `PLAYER` | Giocatore | Legge la lega, si iscrive e si ritira per sé, vota l'MVP, modifica nome, foto e ruolo in campo della propria scheda, "Gioco anch'io" per sé |

**Vincoli**
- La lega non resta mai senza un presidente (`canChangeLeagueRole`).
- Un ospite non diventa mai gestore.
- Nessuno toglie sé stesso dalla lega (un'uscita volontaria non esiste ancora).
- Un presidente va prima declassato, poi si può togliere.
- `userId`, cioè il collegamento della scheda all'account, non si cambia mai dal client.

**Helper**

| Dove | Helper |
|---|---|
| Regole | `hasLeagueRole`, `isLeagueManager`, `isLeaguePresident`, `canReadLeague`, `canWriteLeague` |
| Server | `isLeagueManager(uid)`, `memberCard(uid)`, `adminCaller(request)` (gestore **o** staff) |
| UI | `useActiveLeague()` → `leagueRole` (ruolo reale della scheda), `isPresident`, `canManageLeague`, `canManageMatchesAndCash` (permessi **effettivi**), `isSuspended`; `useAuth().isAdmin` = gestore effettivo della lega attiva |

### 2.3 Override gerarchico: lo staff di piattaforma è presidente ovunque

`SUPER_ADMIN` e `GLOBAL_ADMIN` hanno i **permessi di un `PRESIDENT` in ogni lega**:

- **anche senza una scheda in quella lega:** nel selettore compaiono tutte le leghe della piattaforma; in quelle
  senza scheda la Home mostra "Non hai una scheda giocatore in questa lega";
- **anche se la lega è sospesa:** i membri restano in sola lettura, lo staff può ancora scrivere;
- **su tutti e tre i livelli:**
  - regole: `isLeagueManager`, `isLeaguePresident` e `canReadLeague` contengono `|| isPlatformStaff()`;
  - server: `adminCaller`, `/api/league-admin`, `/api/notify`, `/api/league-emails`;
  - UI: `ActiveLeagueContext` calcola i permessi effettivi.

Lo staff **non** agisce come giocatore dove non ha una scheda: non si iscrive e non vota l'MVP.

**Limite per i gestori normali** (`USER` con ruolo `PRESIDENT` o `COLLABORATOR`):
- tolgono un membro **solo dalla propria lega** con `/api/league-admin` `remove`, che marca `removed_at` sulla scheda e
  toglie la voce da `memberships`;
- **non toccano mai l'account globale** di un altro: disattivare, eliminare o riattivare un account è solo dello staff
  di piattaforma (`/api/account/delete` con `targetProfileId`);
- non decidono le richieste di **rientro** di un account chiuso (`restore`), che sono solo dello staff.

### 2.4 Stati speciali della scheda

| Stato | Campi | Effetto |
|---|---|---|
| **Ospite** | `is_guest: true`, `userId: null` | Giocatore senza account, creato da un gestore. Non accede. Le sue partite si passano a un account (§3.1). Si elimina, non si "toglie" |
| **Non gioca** (organizzatore) | `isActivePlayer: false` | Resta nella lega ma **non scende in campo**: è fuori dagli elenchi (Giocatori, Presenze, Squadre, Home) e le regole **rifiutano le sue iscrizioni**, anche se a iscriverlo è un gestore o lo staff (`playsOnPitch`). Un gestore che non gioca continua comunque a iscrivere chi gioca. Quando lo si spegne, le iscrizioni future vengono tolte e sale chi è in lista d'attesa. Lo cambia l'interessato oppure il presidente o lo staff (`/api/league-admin` `playing`) |
| **Tolto dalla lega** | `removed_at`, `removed_by` | Nessun accesso, nascosto dagli elenchi, la scheda resta per lo storico. Rientra con un link di invito |
| **Account disattivato** | `deactivated_at` (profilo e schede) | Accesso bloccato (Auth disabilitato), dati conservati, può chiedere di rientrare |
| **Archiviato** | `archived_at` | Vecchio storico dopo un "riparti da zero" |

> **Nome del campo:** nei documenti di progetto può comparire `isParticipating`; nel codice e nei dati reali il campo è
> **`isActivePlayer`**. Se manca vale `true`. Non va rinominato senza una migrazione.

### 2.5 Matrice dei permessi

Legenda:
- ✅ consentito
- 👁 solo lettura
- ❌ no
- **sé** solo per sé stesso
- ⚙️ dipende dalla scheda in quella lega

La colonna **Staff** vale per `SUPER_ADMIN` e `GLOBAL_ADMIN`, salvo dove è indicato "solo SA".

| Azione | Staff | Presidente | Collaboratore | Giocatore | Lega sospesa |
|---|---|---|---|---|---|
| Leggere i dati di una lega | ✅ tutte | ✅ | ✅ | ✅ | tutti leggono |
| Iscriversi a una partita | ⚙️ | sé | sé | sé (se gioca e il giorno è aperto) | ❌ |
| Iscrivere o ritirare altri, sbloccare il calendario | ✅ | ✅ | ✅ | ❌ | solo staff |
| Formati, squadre, risultati, MVP finale | ✅ | ✅ | ✅ | ❌ | solo staff |
| Votare l'MVP | ⚙️ | sempre | sempre | finestra del voto | ❌ |
| Statistiche, OVR, storici, parametri | ✅ | ✅ | ✅ | ❌ | solo staff |
| Cassa, campi, costo e quota della partita | ✅ | ✅ | ✅ | ❌ | solo staff |
| Catalogo campi: cercare, aggiungere alla lega, proporre, scollegare | ✅ | ✅ | ✅ | ❌ | solo staff |
| Catalogo campi: approvare, correggere, rifiutare, unire, eliminare | ✅ | ❌ | ❌ | ❌ | — |
| Ospiti (crea, elimina), inviti | ✅ | ✅ | ✅ | ❌ | solo staff |
| Centro richieste (iscrizioni, reclami, formati) | ✅ | ✅ | ✅ | ❌ | solo staff |
| Rientro di un account chiuso | ✅ | ❌ | ❌ | ❌ | — |
| Email dei membri della lega | ✅ | ✅ | ✅ | ❌ | gestori leggono |
| Togliere un giocatore dalla lega | ✅ | ✅ | ✅ | ❌ | solo staff |
| Togliere un collaboratore | ✅ | ✅ | ❌ | ❌ | solo staff |
| Ruoli di lega | ✅ (super admin: solo SA) | ✅ (non super admin) | ❌ | ❌ | solo staff |
| "Non gioca" per un altro membro | ✅ | ✅ | ❌ | sé | solo staff |
| Nome e visibilità della lega | ✅ | ✅ | ❌ | ❌ | solo staff |
| Eliminare la lega (nome esatto) | ✅ | ✅ | ❌ | ❌ | solo staff |
| Creare una lega | ✅ | ✅ | ✅ | ✅ (max 5 create) | — |
| Console piattaforma (elenco leghe) | ✅ | ❌ | ❌ | ❌ | — |
| Sospendere o riattivare una lega | ✅ | ❌ | ❌ | ❌ | — |
| Disattivare, eliminare o riattivare un account globale di altri | ✅ (mai un SA) | ❌ | ❌ | ❌ | — |
| Chiudere il proprio account | ✅ (SA no) | ✅ | ✅ | ✅ | — |
| Nominare o revocare gli admin piattaforma | solo SA | ❌ | ❌ | ❌ | — |
| Privacy email, migrazione | solo SA | ❌ | ❌ | ❌ | — |

---

## 3. Flussi funzionali principali

### 3.1 Accesso, creazione della lega e inviti

**Registrazione e primo accesso**
1. L'utente entra con Google o con email e password. Per email e password serve la verifica dell'email: senza, le
   regole non danno niente.
2. L'app crea `profiles/{uid}` come giocatore semplice. Le regole impongono valori di partenza bassi e nessuno storico
   (`isValidNewOwnProfile`).
3. Poi chiama `POST /api/account/registered`, che prepara l'autovalutazione (`self_rating_pending`). Il giocatore dà
   un voto ai propri parametri una volta sola (`/api/account/self-rating`); dopo la prima partita un gestore li rivede
   (`needs_stat_review`).
4. Senza leghe, l'utente vede la **schermata di benvenuto** ([LeagueWelcome.tsx](../src/components/league/LeagueWelcome.tsx)):
   può creare una lega o entrare con un invito.

**Creazione di una lega** (`POST /api/leagues` → [leagueCreation.ts](../src/lib/server/leagueCreation.ts))
- Serve l'email verificata. Ogni account può creare al massimo 5 leghe (`MAX_LEAGUES_PER_USER`).
- Il creatore diventa `PRESIDENT`. Sceglie se gioca anche lui (`isActivePlayer`).
- La lega nasce con i parametri predefiniti e, se indicato, con il campo abituale.
- `visibility` (`private`/`public`) oggi è solo un'etichetta: non apre la lega a nessuno.

**Ingresso con il link della lega** (`/join/{code}`, `league_invites`, [leagueMembers.ts](../src/lib/server/leagueMembers.ts))
1. Un gestore crea il link (`POST /api/league-invite`).
2. Chi apre il link vede il nome della lega anche se non ha ancora fatto l'accesso; dopo l'accesso torna all'invito.
3. Entra come `PLAYER` con una scheda nuova (`POST /api/join`). Se era stato tolto, riprende la stessa scheda.

**Reclamo della scheda di un ospite (protetto)**
1. Nella pagina di invito, "Sono io" su un ospite fa entrare la persona come **giocatore nuovo** e apre la richiesta
   `guest_claim` nel centro richieste.
2. Un presidente o un collaboratore (o lo staff) sceglie:
   - **Approva**: `claimGuest` passa all'account partite, statistiche, OVR, V/P/S e iscrizioni dell'ospite;
   - **Rifiuta**: resta un giocatore nuovo.

   In entrambi i casi la persona riceve una notifica.
3. Se due persone reclamano lo stesso ospite, l'approvazione vale una volta sola; la seconda risponde `guest_gone`.
4. **Invito personale su WhatsApp** (`/api/invite`, `/login?invite=…`): lo genera un gestore per uno specifico ospite,
   quindi il collegamento è **immediato**.
5. **Iscrizione spontanea simile a un ospite:** la richiesta `new_signup` propone ai gestori di collegarla all'ospite
   (`link`) oppure di lasciarla come giocatore nuovo (`new`).

### 3.2 Ciclo di vita della partita

```
Calendario → Iscrizioni (titolari / attesa) → Formato → Squadre → Partita → Risultato e MVP → Storico e statistiche
```

1. **Calendario**
   - La settimana corrente è sempre aperta.
   - Dalla settimana successiva i giorni restano chiusi finché un gestore non li apre (`settings/calendar.open_until`).
     Le regole lo verificano in `isDateOpenForPlayers`, con l'ora italiana.
2. **Iscrizioni** (`presences`)
   - L'ordine segue `joined_at` (ora del server, non falsificabile).
   - Titolari e lista d'attesa sono **calcolati** in base ai posti del formato ([presenceRanking.ts](../src/lib/utils/presenceRanking.ts)).
   - I gestori possono forzare un giocatore tra i titolari o in attesa.
   - **Blocco dei ritiri**: da N ore prima della partita, se `app_config.timelock_enabled` (`isWithdrawLocked`).
   - Quando qualcuno si ritira sale il primo in attesa, che riceve una notifica push (`checkPromotions`).
   - **Contano solo le iscrizioni di schede che possono giocare** (`cardCanPlay`): un ospite cancellato, un giocatore
     tolto dalla lega o disattivato e un organizzatore non occupano posti, né nell'app (Home, Presenze, Squadre) né sul
     server. Cancellando un ospite si cancellano insieme scheda e iscrizioni future.
   - **Avvisi a presidente e collaboratori** (campanella e push, mai ai giocatori):
     - "Raggiunti N iscritti" ogni volta che la partita torna al completo;
     - "Manca un giocatore" / "Mancano N giocatori" quando una partita al completo perde titolari, o quando nelle
       squadre salvate resta un posto che nessuno in attesa può prendere.
3. **Formato** (5v5, 7v7, 8v8, 11v11; [matchFormat.ts](../src/lib/utils/matchFormat.ts))
   - Ogni giorno ha il suo formato.
   - Se gli iscritti superano i posti, il server propone ai gestori un formato più grande (richiesta `format_proposal`).
     "Passa al …" cambia il formato e apre Squadre, dove le nuove squadre bilanciate si generano da sole.
   - **Formato più piccolo** (es. 8vs8 → 7vs7, `/api/notify` `format_reduced`): avviso a presidente e collaboratori,
     la partita torna da confermare ("Conferma partita") e in Squadre le squadre si ribilanciano da sole.
   - In Squadre, squadre salvate per un formato diverso da quello del giorno vengono rigenerate in automatico appena un
     gestore apre la pagina, e vanno confermate di nuovo.
4. **Squadre** (`generated_teams`)
   - Le genera un algoritmo locale bilanciato sull'OVR ([teamUtils.ts](../src/lib/utils/teamUtils.ts)), senza AI esterna.
   - Le sostituzioni dopo un ritiro vengono ricalcolate dal server (`/api/notify` `reconcile`).
5. **Chiusura della partita** (`saveMatchResult`, [firestoreService.ts](../src/lib/firebase/firestoreService.ts))
   - Il gestore registra risultato, marcatori ed MVP.
   - V/P/S delle schede si aggiornano in **una transazione idempotente** (`profile_effects` + `increment`): salvare
     di nuovo applica solo la differenza.
   - Gli assist non esistono.
6. **Voto MVP** (`mvp_votes`)
   - Si apre a fine partita: inizio + 60 min + 45 min.
   - Resta aperto 24 h nell'app (`mvpVotingWindow`).
   - Le regole accettano voti dal giorno della partita fino a 3 giorni dopo. I gestori votano sempre; con il "test
     con tutti" votano tutti.
   - All'apertura, un cron di GitHub Actions (`/api/cron/mvp-vote`, `CRON_SECRET`) manda una notifica.
   - Il gestore sceglie l'MVP finale vedendo i voti.
7. **Storico**: le partite archiviate formano la cronologia per anno e la classifica. Le squadre archiviate sono una
   lista congelata.

### 3.3 Campi, catalogo globale e cassa

**Campi della lega** (`leagues/{id}/sport_fields`): li gestiscono i gestori in Impostazioni → Campi. Possono essere
**privati** (solo di quella lega, modificabili in tutto) oppure **collegati al catalogo globale** (`catalog_id`).

Ogni campo ha:
- nome, indirizzo e note;
- prezzo base (`cost`) e prezzi per formato (`costs`);
- link Maps facoltativo. Il link generato segue sempre l'indirizzo attuale ([matchUtils.ts](../src/lib/utils/matchUtils.ts) `fieldMapsUrl`).

**Costo della singola partita**, dal più forte al più debole:
1. **costo personalizzato della partita** (`total_cost` + `cost_override`), scritto come totale oppure come
   **quota a testa** (`totalFromPerHead`: quota × giocatori);
2. costo del campo per quel formato;
3. costo standard delle impostazioni.

"Usa il costo del campo" toglie il costo personalizzato.

**Cassa** (`match_payments`, [cashUtils.ts](../src/lib/utils/cashUtils.ts)): chi paga una partita è, in ordine:
1. i giocatori della partita archiviata;
2. i giocatori delle squadre salvate;
3. i titolari iscritti.

La quota mostrata è il costo diviso per i paganti. I gestori segnano chi ha pagato.

#### Catalogo globale dei campi

Codice: [fieldCatalog.ts](../src/lib/server/fieldCatalog.ts) (server), [fieldCatalog.ts](../src/lib/utils/fieldCatalog.ts) (doppioni,
ricerca), `/api/field-catalog` (lega attiva), `/api/super-admin/fields` (staff).

**Dati**
- `field_catalog/{id}`:
  - nome, indirizzo, Maps, telefono, fondo, note;
  - `default_cost` e `default_costs` (prezzi di partenza);
  - `status`: `pending` / `approved` / `rejected`;
  - `dedup_key`;
  - `proposed_by` (persona e lega), `reviewed_by`;
  - `linked` = `{ "leagueId:fieldId": true }`, cioè le leghe che lo usano, tenute dal server.
- Sul campo della lega: `catalog_id`, `catalog_status` (`pending` / `approved`), `price_override` (la lega ha messo
  i suoi prezzi).

**Flussi**

| Passo | Chi | Cosa succede |
|---|---|---|
| Cerca e aggiungi | Presidente, collaboratore, staff | Impostazioni → Campi → "Campo": ricerca nel catalogo per nome o via (nel browser), poi "Aggiungi". Nasce un campo della lega **collegato**, con i dati e i prezzi di partenza del catalogo. Una volta sola per lega |
| Proponi un campo nuovo | Presidente, collaboratore, staff | Prima il server mostra i campi **simili** (stesso indirizzo normalizzato, oppure stesso nome nella stessa città): "Usa questo" oppure "Proponi comunque". La proposta è `pending` nel catalogo e **subito usabile** nella lega ("In attesa di approvazione"). Lo staff riceve una notifica |
| Proponi un campo esistente | Gestori | Pulsante sul campo privato: diventa una proposta collegata. I prezzi della lega restano i suoi |
| Approva (anche corretto) | Staff | Visibile a tutte le leghe. Le correzioni arrivano ai campi collegati; chi ha proposto riceve una notifica |
| Rifiuta | Staff | Il campo della lega resta **privato**, con i suoi dati. Chi ha proposto riceve una notifica |
| Unisci (doppione) | Staff | Le leghe della proposta passano al campo già approvato; la proposta sparisce |
| Correggi o elimina un campo approvato | Staff | Le correzioni arrivano a tutte le leghe collegate. Con l'eliminazione ogni lega tiene una copia privata |
| Scollega | Gestori | Il campo diventa privato e modificabile. Se era una proposta solo di quella lega, la proposta viene ritirata |

**Campi collegati**
- Nome, indirizzo, Maps, telefono e fondo li cura **solo lo staff**: nel modulo della lega sono in sola lettura e le
  regole lo impongono.
- La lega cambia solo **prezzi** e **note**. Quando cambia un prezzo, `price_override` diventa vero e le correzioni
  dei prezzi del catalogo non la toccano più. "Usa il prezzo del catalogo" la riporta ai prezzi di partenza.
- Le partite salvano il **nome del luogo** al momento del salvataggio: una correzione del catalogo non riscrive lo storico.
- I campi che le leghe avevano prima del catalogo restano privati. Si pubblicano con "Proponi al catalogo".

**Prezzo di una partita**, dal più forte al più debole:
1. costo della singola partita;
2. prezzo della lega (`price_override`);
3. prezzo di partenza del catalogo, copiato nel campo della lega.

Il prezzo di una lega o di una partita **non modifica mai il catalogo**.

**Regole**
- `field_catalog`:
  - lettura dei campi `approved` per chi ha fatto l'accesso con email verificata;
  - `pending` e `rejected` li legge solo lo staff (la lega che li ha proposti li vede tramite l'API);
  - nessuna scrittura dal browser.
- `sport_fields`:
  - `catalog_id` e `catalog_status` li scrive solo il server;
  - su un campo collegato i gestori cambiano solo `cost`, `costs`, `notes`, `price_override`.

**Limiti** (piano Spark): il catalogo si legge una volta all'apertura della ricerca e il filtro avviene nel browser.
Va bene fino a qualche centinaio di campi; oltre, servirà un filtro per città sul server.

### 3.4 Chiusura e fallback

**Togliere dalla lega e chiudere l'account sono due azioni distinte**

| Azione | Chi | Effetto |
|---|---|---|
| **Togli dalla lega** (`/api/league-admin` `remove`) | Gestori della lega, staff | La scheda viene marcata `removed_at` e la voce sparisce da `memberships`. Le iscrizioni future vengono tolte (sale chi è in attesa). Account e altre leghe restano intatti |
| **Esci dalla lega** | — | ⚠️ Non esiste ancora: un membro non può uscire da solo, lo toglie un gestore |
| **Chiudi il mio account** (`/api/account/delete`) | Il titolare (non il super admin) | Disattiva (dati conservati) oppure elimina. I gestori ricevono la richiesta `account_closed`, che è solo un avviso |
| **Disattiva o elimina l'account di altri** | Solo lo staff, mai su un super admin | Agisce sull'account globale e su tutte le sue schede |
| **Rientro** (`/api/account/return-request`, pubblica) | Chi ha l'account chiuso chiede; **lo staff** decide | **Ripristina** (profilo e storico tornano) oppure **riparti da zero** (vecchio storico archiviato come ospite). Per privacy la risposta è sempre la stessa (C10) |

**Eliminazione di una lega** ([leagueDeletion.ts](../src/lib/server/leagueDeletion.ts))
- **Chi:** il presidente (Impostazioni → Lega → Zona pericolosa) oppure lo staff (Console piattaforma).
- **Conferma:** il **nome esatto** della lega, che il server ricontrolla; spazi e maiuscole come scritti.
- **Cosa viene cancellato:** la lega con tutte le sottocollezioni (`recursiveDelete`), i link di invito e la voce della
  lega in `memberships` di ogni membro.
- **Cosa resta:** gli account.
- `calcettari` è protetta (`protected`).
- Un presidente non può eliminare una lega sospesa (423); lo staff sì.

**Fallback automatico** ([ActiveLeagueContext.tsx](../src/lib/context/ActiveLeagueContext.tsx)) — nessuna schermata
bianca e nessun ciclo di errori di permesso:

| Evento sulla lega aperta | Cosa succede |
|---|---|
| Tolto dalla lega, oppure lega eliminata | Passa a un'altra sua lega con un avviso, oppure alla schermata di benvenuto se non ne ha altre |
| Lega sospesa (membro) | Passa a un'altra sua lega con un avviso; se non ne ha altre resta in **sola lettura** con il banner |
| Lega sospesa (staff) | Resta e continua a gestire |

Gli avvisi sopravvivono al rimontaggio perché `FeedbackHost` sta fuori da `AuthProvider` ([layout.tsx](../src/app/layout.tsx)).

---

## 4. Sicurezza, regole Firestore e convenzioni UI

### 4.1 Principi delle `firestore.rules`

- **Niente accesso senza aver fatto l'accesso.** Senza **email verificata** non si è membri di nessuna lega e non si
  hanno ruoli di piattaforma.
- **Il server è l'unica fonte dei campi di potere.** `platformRole`, `memberships`, `leagues/{id}`, `league_invites`,
  `admin_requests` e le notifiche si scrivono **solo con l'Admin SDK**. Il client non può dare un ruolo a sé né ad
  altri.
- **I ruoli valgono solo nella propria lega.** Il vecchio `profiles.role == 'admin'` non dà niente; il campo `role`
  della scheda è solo un'etichetta derivata.
- **Lega sospesa:** tutti leggono. Scrivono solo lo staff (regole) e il server per le operazioni dello staff.
- **Dati non falsificabili:**
  - ordine delle iscrizioni = `request.time`;
  - un'iscrizione per giocatore per giorno;
  - voti MVP solo per sé (`voter_id == uid`);
  - foto profilo solo come JPEG piccolo o URL https;
  - parametri iniziali limitati.
- **Il server ricontrolla sempre.** Ogni API che usa l'Admin SDK, che ignora le regole, rifà il controllo del ruolo
  con `callerFrom`, `adminCaller`, `platformCaller` o `platformStaffCaller`.
- **Regole e test:** quando si cambiano le regole si aggiorna [scripts/test-rules.mjs](../scripts/test-rules.mjs)
  (`npm run test:rules`). Le regole si **pubblicano a mano** dopo il deploy (`firebase deploy --only firestore:rules`).

### 4.2 Privacy delle email

- Le email stanno in `private_profiles`, mai nel profilo pubblico (`profileEmailUntouched`).
- Le leggono il titolare e il `SUPER_ADMIN`.
- I gestori di una lega (e lo staff) ricevono **solo le email dei membri di quella lega** tramite `GET /api/league-emails`.
- Le richieste e le risposte pubbliche, come il rientro, non rivelano se un'email esiste (C10).
- I profili globali (nome e foto) sono leggibili da chi ha fatto l'accesso. È noto: non contengono email.

### 4.3 Convenzioni UI e traduzioni (next-intl)

- **Nessun testo scritto a mano nei componenti.** Tutto passa da `messages/it.json` e `messages/en.json`, con le chiavi
  allineate nelle due lingue.
- **Nomi dei ruoli**:

  | Contesto | Usare | Non usare |
  |---|---|---|
  | Dentro una lega | **Presidente**, **Collaboratore**, **Giocatore** (`league.roles.*`); in inglese President, Collaborator, Player | "Admin", "Amministratore" |
  | Livello globale | **Super admin**, **Admin piattaforma** (`superAdmin.roleSuper` / `roleGlobal`); la pagina si chiama **Console piattaforma** | "Admin" da solo |
  | Chi non gioca | **Organizzatore**, "solo organizza"; interruttore "Gioco anch'io in questa lega" | — |
  | Ospite | **Ospite** | — |

- **Pulsanti:** nascondi le azioni che il ruolo effettivo non permette, usando i permessi **effettivi** di
  `useActiveLeague()` e `useAuth()`, non il ruolo grezzo della scheda. Il server deve comunque rifiutarle.
- **Errori:** i codici di errore delle API (`forbidden`, `protected`, `suspended`, `name_mismatch`, …) hanno ciascuno
  il proprio messaggio tradotto.
- **Stile:** vedi le skill `club-soccer-design-system` e `ui-conventions`, cioè tema scuro, mobile prima di tutto,
  bottom sheet con pulsanti in colonna e conferme con `askConfirm`.

### 4.4 Test che proteggono queste regole

| Suite | Comando | Copre |
|---|---|---|
| Unitari | `npm run test:unit` | Permessi puri (`leaguePermissions`), formati, cassa, Home |
| Regole | `npm run test:rules` | Ogni regola di §2 sulle regole Firestore (emulatore) |
| Integrazione | `npm run test:integration` | API reali su emulatori: ruoli, staff, eliminazione, inviti e reclami, rientro, "non gioca", catalogo campi |
| End-to-end | `npm run test:e2e` | Flussi nel browser (Pixel 7): leghe, fallback, console, presenze, giocatori |

Prima di un commit si eseguono tutti i controlli (skill `pre-commit-testing-gate`).
