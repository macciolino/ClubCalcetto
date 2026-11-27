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
| `match_notices/{id}` | **Bacheca "Cerco giocatore"** (§3.5): avviso di una lega per una sua partita, posti, stato | **Solo il server** |
| `match_notices/{id}/applicants/{profileId}` | Chi ha preso un posto (nome, `userId`, ora, invito) | **Solo il server** |
| `profiles/{id}/spots/{noticeId}` | La copia personale dei posti presi ("I miei posti", carriera) | **Solo il server**; la legge il titolare |
| `push_tokens/{token}` | Dispositivi per le notifiche | Ognuno solo i propri |
| `profiles/{id}/notifications` | Campanella personale | Il server; il titolare legge e segna come letto |

### 1.2 Profilo globale e scheda di lega

- **Un account** (`profiles/{uid}`) può avere **una scheda per ogni lega** (`leagues/{id}/players/{uid}`, stesso id).
- Le statistiche, l'OVR e il V/P/S stanno sulla **scheda**: ogni lega ha i suoi numeri.
- `useAuth().profile` = account globale **fuso** con la scheda della lega attiva. Restano dell'account `id`, `user_id`,
  `locale` e `theme`. La lingua scelta sul dispositivo non passa a chi accede dopo: all'uscita dall'account la scelta salvata sul dispositivo viene dimenticata (si torna alla lingua del browser), e al nuovo accesso si applica quella salvata sul profilo ([PreferencesSync](../src/components/settings/PreferencesSync.tsx)). Il titolo della scheda del browser segue la lingua.
- **Eccezione storica:** il fondatore ha il profilo `p-1`, creato prima di Firebase Auth. Viene riconosciuto da
  `profiles/p-1.user_id == uid`; l'email del fondatore serve solo a trovarlo e il server ripara `user_id`
  ([platformAccount.ts](../src/lib/server/platformAccount.ts)). Le regole e gli e2e lo trattano come caso noto.

### 1.3 Lega attiva

- La lega attiva si sceglie dal selettore accanto al logo ([LeagueSwitcher.tsx](../src/components/league/LeagueSwitcher.tsx)).
  È salvata sul dispositivo (`localStorage.cc_league`).
- **Le pagine partono solo quando la lega attiva è nota** ([LeagueGate](../src/lib/context/ActiveLeagueContext.tsx), `isResolving`;
  fanno eccezione login, inviti e Bacheca, che non hanno bisogno di una lega). Finché le leghe dell'account si caricano, il
  livello dati punta a una lega provvisoria: nessuna copia locale (campi, giocatori, categorie, cassa, giorno ufficiale,
  impostazioni) viene scritta ([canCacheLeagueData](../src/lib/league/leagueRefs.ts)), così chi è di più leghe non trova nelle
  copie i dati di un'altra. Le copie locali sono solo per mostrare qualcosa subito: i dati veri sono quelli di Firestore.
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
- Nessuno toglie sé stesso dalla lega: per andarsene si usa "Esci dalla lega".
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

Lo staff **non** agisce come giocatore dove non ha una scheda: non si iscrive e non vota l'MVP. Senza scheda la barra
e il selettore lega mostrano il ruolo di piattaforma ("Super admin" / "Admin piattaforma"), non "Giocatore".

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
| **Non gioca** (organizzatore) | `isActivePlayer: false` | Resta nella lega ma **non scende in campo**: è fuori dagli elenchi (Giocatori, Presenze, Squadre, Home) e le regole **rifiutano le sue iscrizioni**, anche se a iscriverlo è un gestore o lo staff (`playsOnPitch`). Non vota nemmeno l'MVP. Un gestore che non gioca continua comunque a iscrivere chi gioca. Quando lo si spegne, le iscrizioni future vengono tolte e sale chi è in lista d'attesa. Lo cambia l'interessato oppure il presidente o lo staff (`/api/league-admin` `playing`) |
| **Tolto dalla lega / uscito** | `removed_at`, `removed_by` | Nessun accesso, nascosto dagli elenchi, la scheda resta per lo storico. Rientra con un link di invito e riprende la stessa scheda |
| **Parametri da un'altra lega** | `stats_from`, `needs_stat_review` | Entrando in una lega nuova, la scheda parte dai parametri (Velocità, Fisico…) dell'ultima scheda dell'account in un'altra lega, anche lasciata, al posto dell'autovalutazione. Il **presidente o un collaboratore** della nuova lega li riapprova dal centro richieste, subito (senza aspettare la prima partita) |
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
| Aggiungere una partita passata nello Storico (anche con nuovi ospiti) | ✅ | ✅ | ✅ | ❌ | solo staff |
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
| Uscire dalla lega | ⚙️ | ✅ (mai l'ultimo presidente) | ✅ | ✅ | anche sospesa |
| Togliere un collaboratore | ✅ | ✅ | ❌ | ❌ | solo staff |
| Ruoli di lega | ✅ (super admin: solo SA) | ✅ (non super admin) | ❌ | ❌ | solo staff |
| "Non gioca" per un altro membro | ✅ | ✅ | ❌ | sé | solo staff |
| Nome e visibilità della lega | ✅ | ✅ | ❌ | ❌ | solo staff |
| Eliminare la lega (nome esatto) | ✅ | ✅ | ❌ | ❌ | solo staff |
| Creare una lega | ✅ | ✅ | ✅ | ✅ (max 5 create) | — |
| Console piattaforma (elenco leghe) | ✅ | ❌ | ❌ | ❌ | — |
| Sospendere o riattivare una lega | ✅ | ❌ | ❌ | ❌ | — |
| Bacheca "Cerco giocatore": creare, modificare, chiudere, annullare un avviso | ✅ | ✅ | ✅ | ❌ | solo staff |
| Bacheca: leggere gli avvisi, prendere un posto | ✅ | ✅ | ✅ | ✅ (qualsiasi utente con email verificata, anche di altre leghe) | si legge, posti fermi |
| Bacheca: vedere chi ha preso i posti | ✅ | ✅ | ✅ | ❌ (solo il proprio posto) | — |
| Bacheca: "Cerca giocatori esterni" dalla partita, invitare nella lega dopo la partita | ✅ | ✅ | ✅ | ❌ | solo staff |
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
3. Poi chiama `POST /api/account/registered { isNew: true }`: per un account **nuovo** (non un ospite preso con l'invito
   vecchio) il server imposta `base_radar_pending` sul profilo.
4. **Step Radar Base** ([OnboardingGate.tsx](../src/components/onboarding/OnboardingGate.tsx),
   [BaseRadarStep.tsx](../src/components/onboarding/BaseRadarStep.tsx)): finché `base_radar_pending` è vero **nessuna pagina
   si apre** (lega, invito `/join/…`, Bacheca) tranne il login. Gli attributi tecnici di base (Velocità, Fisico, Resistenza,
   Tiro, Passaggio, Dribbling, Difesa, Visione) sono **tutti a 6**: si può cambiarli o premere subito "Salva e prosegui". Un
   avviso dice che i valori **non sono confermati** finché un presidente o un collaboratore non li approva dopo la prima
   partita. `POST /api/account/base-radar` valida un intero 1–10 per ogni parametro e salva `profiles/{id}.baseRadar` (+
   `baseRadarAt`, `base_radar_pending: false`), **una sola volta**. Le regole non lasciano scrivere questi campi dall'app.
   Gli account che esistevano prima non hanno il flag: non lo vedono mai.
5. **Il bivio dopo il Radar:**
   - **Con un link d'invito** (`/join/{code}`, tenuto in `cc_return_to` anche dopo la verifica dell'email): finito il Radar
     si torna all'invito. Entra come giocatore nuovo, oppure dice "sono io" su un ospite (richiesta da approvare, come sempre).
   - **Senza invito**: la **schermata di benvenuto** ([LeagueWelcome.tsx](../src/components/league/LeagueWelcome.tsx)) con le
     **leghe pubbliche** come card cliccabili (vedi sotto), "Crea una nuova lega", "Unisciti con codice" e la Bacheca. Chi ha
     giocato partite da esterno ne vede il riepilogo e la ritrova completa nel suo Profilo (punto 9).
6. **Valori sulla scheda di lega** (`ensureLeagueCard`, [baseRadar.ts](../src/lib/utils/baseRadar.ts) `buildCardStats`): ogni
   scheda nuova parte dai valori già **rivisti in un'altra lega** (più affidabili), altrimenti dal **Radar Base** (il parametro
   che la lega ha in più prende il suo default); `stat_status: 'UNCONFIRMED'`, `needs_stat_review: true` e il Radar copiato in
   `self_stats` (il revisore vede cosa ha scelto la persona). Un account vecchio senza Radar fa l'autovalutazione di sempre
   (`self_rating_pending`). Diventa `CONFIRMED` quando un gestore conferma i valori (punto 7) o approva il "sono io" su un
   ospite.
7. **Revisione e conferma dei valori iniziali** (presidente, collaboratore, e lo staff di piattaforma che gestisce quella lega):
   - **Avviso**: chi entra con valori `UNCONFIRMED` (link d'invito o lega pubblica; NON il "sono io", che ha già la sua
     richiesta) genera `tellManagersOfNewMember` ([leagueMembers.ts](../src/lib/server/leagueMembers.ts)): campanello e push
     (secondo la modalità notifiche della lega) a chi ha una scheda `PRESIDENT`/`COLLABORATOR`, "[Nome] si è unito alla lega ·
     Valori da revisionare", con link `/players?player=<id>` che apre la scheda del giocatore. Lo staff di piattaforma la riceve solo
     nelle leghe dove ha una scheda presidente/collaboratore (non in tutte le leghe: sarebbe rumore); negli altri casi la vede
     comunque in Giocatori (badge e filtro). Chi entra non riceve nulla.
   - **Segni**: in Giocatori il badge sobrio **"Da revisionare"** ([UnconfirmedBadge.tsx](../src/components/UnconfirmedBadge.tsx))
     sulle schede `UNCONFIRMED` (card, elenco, tabella) e, per i gestori, un filtro rapido "Da revisionare (n)" visibile solo
     se ce ne sono. Nella scheda del giocatore (vista gestore) un riquadro in cima: "Valori iniziali impostati dal giocatore in
     attesa di conferma" con **"Conferma valori"**.
   - **Conferma**: due vie, stesso risultato (`confirmPlayerValues` in [firestoreService.ts](../src/lib/firebase/firestoreService.ts)):
     "Conferma valori" senza modifiche, oppure modificare **almeno un parametro** dalla matita e salvare (cambiare solo il nome
     o il ruolo NON conferma). Imposta `stat_status: 'CONFIRMED'`, `needs_stat_review: false`, toglie `stats_from`, scrive
     `stat_reviewed_at/by`. Il badge sparisce e compare un discreto "Verificato" (solo con `CONFIRMED` esplicito: le schede
     vecchie, senza campo, non mostrano nulla). Anche la card "Valutazioni da rivedere" del campanello usa la stessa funzione.
   - **Il giocatore**: vede sempre il suo radar completo; finché è `UNCONFIRMED`, sotto il grafico (Profilo e propria scheda)
     la nota "Valori iniziali · in attesa di revisione del gestore". Nessun badge, nessun avviso, nessun blocco.
   - **Generatore squadre**: i valori `UNCONFIRMED` contano come gli altri (OVR salvato, il 6 neutro o le modifiche iniziali):
     mai zero, mai esclusi (`getPlayerOverallRating` ignora lo stato; test in `tests/unit/unconfirmedBalancer.test.ts`).
8. **Ogni lega i suoi valori (Radar globale e radar locali).**
   - **Radar globale** = dell'account, sul profilo: il **Radar Base** (`profiles.baseRadar`, scritto solo dal server, una
     volta) e le **valutazioni da ospite** (`profiles/{id}/spots/*.rating`, scritte solo dal server, §3.5). È il punto di
     partenza di ogni nuova scheda e il livello di chi gioca da esterno.
   - **Radar locale** = di una lega, sulla scheda `leagues/{leagueId}/players/{playerId}` (`stats`, `overall_rating`,
     `stat_status`): lo decidono **solo i gestori di quella lega** (e lo staff). Ogni lega ha i suoi valori indipendenti per
     i suoi membri, anche se è la stessa persona.
   - **Blindatura** (`firestore.rules`, testata in `scripts/test-rules.mjs`, blocco "Radar"): le regole risolvono la lega dal
     percorso e controllano il ruolo **in quella lega**, quindi il presidente della Lega A non può leggere né scrivere la
     scheda dello stesso giocatore nella Lega B (né confermarne i valori); il giocatore non cambia da solo parametri o stato
     della propria scheda; nessuno, gestori compresi, scrive `baseRadar`, `spots` o `external_ratings` dall'app. Le API
     usano la lega dell'avviso o quella attiva e ricontrollano il ruolo lì (`rateExternal` usa `notice.leagueId`).
   - **Nel Profilo** le due cose sono in card distinte: "Radar globale" (con "Radar nelle tue leghe", una riga per lega) e
     "Valori nella lega «…»" (il radar della lega attiva).
9. **Senza lega** (account nuovo, o tolto dalla sua ultima lega): **una schermata di ingresso** e le pagine della persona.
   - **Ingresso** ([LeagueWelcome.tsx](../src/components/league/LeagueWelcome.tsx)), al posto di ogni pagina della lega (Home
     compresa) e **sotto l'intestazione**, in una pagina sola: cosa fa l'app (titolo, sottotitolo) con **Crea una lega**,
     **Ho un invito** e **Cerca una partita da giocare**; le **leghe pubbliche**; **Cosa puoi fare** (Presenze, Squadre
     equilibrate, Statistiche e forma, Cerco giocatore); **Come si inizia** in 3 passi (il primo si spunta da solo quando il
     Radar Base è salvato); **Il tuo profilo** in breve (OVR del Radar Base, partite da ospite, vinte, gol, MVP) con i link
     a Profilo e Impostazioni. Telefono: una colonna (le 4 funzioni 2 per riga); PC: gli stessi blocchi affiancati.
   - **Barre**: solo **Inizio** e **Bacheca**; il menu utente ha **Profilo**, **Impostazioni** e Logout (nessun ruolo sotto il nome).
   - **Profilo senza lega** ([NoLeagueProfile.tsx](../src/components/profile/NoLeagueProfile.tsx)): chi sei, **Radar globale**
     (Radar Base modificabile da "Imposta / Modifica il Radar Base", [RadarBaseSheet.tsx](../src/components/profile/RadarBaseSheet.tsx),
     e valutazioni da ospite) e **Carriera** con le partite da ospite.
   - **Impostazioni senza lega**: solo il gruppo "Tuo account" (Notifiche, Account, Lingua, Tema, Bacheca).
   - Instradamento: `/login`, `/join`, `/board`, `/profile` e `/settings` si aprono senza lega (`NO_LEAGUE_PATHS`); le altre
     mostrano l'ingresso (`LeagueGate`). Il vecchio `/account` porta a `/profile`.
   - Il **Radar Base si cambia quando si vuole** (`POST /api/account/base-radar`), anche con una lega (Profilo → Radar globale),
     e **non tocca** i valori che una lega ha già per la persona: vale per le leghe a cui entrerà e per le partite da ospite.

**Creazione di una lega** (`POST /api/leagues` → [leagueCreation.ts](../src/lib/server/leagueCreation.ts))
- Serve l'email verificata. Ogni account può creare al massimo 5 leghe (`MAX_LEAGUES_PER_USER`).
- Il creatore diventa `PRESIDENT`. Sceglie se gioca anche lui (`isActivePlayer`).
- La lega nasce con i parametri predefiniti e, se indicato, con il campo abituale.
- I parametri dei giocatori sono numeri interi da **1 a 10**: anche il valore iniziale di un nuovo parametro viene riportato in quella scala (`clampStatValue`), con il clic e con Invio nel campo.
- `visibility` (`private`/`public`): una lega **pubblica** attiva compare nella schermata di benvenuto di chi non ha leghe e
  ci si entra **direttamente**, senza invito né approvazione (l'ha scelto il presidente). Una privata si apre solo con l'invito.
  Nell'intestazione, accanto al nome della lega attiva, un'etichetta dice se è **Pubblica** (globo) o **Privata** (lucchetto):
  sul telefono solo l'icona, con il testo completo come suggerimento e per i lettori di schermo ([LeagueSwitcher.tsx](../src/components/league/LeagueSwitcher.tsx)).

**Leghe pubbliche** ([publicLeagues.ts](../src/lib/server/publicLeagues.ts), `GET/POST /api/leagues/public`)
- `GET`: le leghe `public` e `active` di cui l'account non fa già parte (accesso con email verificata). Per ogni lega: nome,
  **formato prevalente** (il più frequente tra le partite archiviate, dal formato salvato o dai giocatori in campo; senza
  partite il `defaultFormat`), **OVR medio** dei giocatori che giocano (`null` sotto i 6 giocatori: "Nuova lega"), numero di
  giocatori e di partite giocate. Cache di 5 minuti sul server (costa una lettura per scheda e partita); massimo 30 leghe.
- `POST { leagueId }`: entra con una scheda nuova (Radar Base, `UNCONFIRMED`) e avvisa i gestori ("Nuovo giocatore in lega · Valori da revisionare", punto 7).
  Una lega privata, sospesa o inesistente risponde sempre 404 `not_public`. Il server legge le leghe, non le regole: un non
  membro continua a non poterle leggere dall'app.

**Ingresso con il link della lega** (`/join/{code}`, `league_invites`, [leagueMembers.ts](../src/lib/server/leagueMembers.ts))
1. Un gestore crea il link (`POST /api/league-invite`).
2. Chi apre il link vede il nome della lega anche se non ha ancora fatto l'accesso; dopo l'accesso torna all'invito.
3. Entra come `PLAYER` con una scheda nuova (`POST /api/join`). Se era stato tolto, riprende la stessa scheda.

**Reclamo della scheda di un ospite (protetto)**
1. Nella pagina di invito, "Sono io" su un ospite fa entrare la persona come **giocatore nuovo** e apre la richiesta
   `guest_claim` nel centro richieste.
2. Un presidente o un collaboratore (o lo staff) sceglie:
   - **Approva**: `claimGuest` passa all'account partite, statistiche, OVR, V/P/S e iscrizioni dell'ospite;
   - **Rifiuta** (con conferma, come Approva): resta un giocatore nuovo e l'ospite resta nell'elenco.

   In entrambi i casi la persona riceve una notifica.
3. Se due persone reclamano lo stesso ospite, l'approvazione vale una volta sola; la seconda risponde `guest_gone`.
4. **Invito personale su WhatsApp** (`/api/invite`, `/login?invite=…`): lo genera un gestore per uno specifico ospite,
   quindi il collegamento è **immediato**. Il codice, dopo il controllo, resta solo in `sessionStorage` e sparisce dall'indirizzo: un ricaricamento dopo la registrazione non ricontrolla un link già usato.
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
   - Il **giorno ufficiale** (`settings/official_match`, uguale per tutti) lo cambia solo il comando esplicito dei gestori in
     Impostazioni > Partita della settimana. Scegliere un giorno nelle Presenze lo mostra e lo gestisce soltanto a chi lo
     sceglie: non cambia il giorno ufficiale e, finché non lo scegli, la pagina segue quello ufficiale.
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
   - Il gestore registra risultato, marcatori ed MVP. Archiviare una partita **non ancora giocata** (data futura)
     chiede una conferma in più.
   - V/P/S delle schede si aggiornano in **una transazione idempotente** (`profile_effects` + `increment`): salvare
     di nuovo applica solo la differenza.
   - Gli assist non esistono.
6. **Voto MVP** (`mvp_votes`)
   - Si apre a fine partita: inizio + 60 min + 45 min.
   - Resta aperto 24 h nell'app (`mvpVotingWindow`).
   - Le regole accettano voti dal giorno della partita fino a 3 giorni dopo. I gestori votano sempre; con il "test
     con tutti" votano tutti. **Vota solo chi gioca nella lega**: l'organizzatore (`isActivePlayer: false`) vede il voto
     ma non può votare (interfaccia e regole, `myCard(...).isActivePlayer`).
   - All'apertura, un cron di GitHub Actions (`/api/cron/mvp-vote`, `CRON_SECRET`) manda una notifica.
   - Il gestore sceglie l'MVP finale vedendo i voti.
7. **Storico**: le partite archiviate formano la cronologia per anno e la classifica. Le squadre archiviate sono una
   lista congelata.
   - **Partita passata inserita a mano** (Storico → "Aggiungi partita", [AddMatchSheet.tsx](../src/components/history/AddMatchSheet.tsx),
     regole in [manualMatch.ts](../src/lib/utils/manualMatch.ts)): per una partita dimenticata o segnata su carta prima
     di usare l'app. La inseriscono presidente, collaboratori e staff (lega non sospesa):
     - giorno passato (fino a oggi), una sola partita per giorno (se c'è già, la si modifica dal dettaglio);
     - ora, campo e costo facoltativi; il formato fissa il numero massimo di giocatori per squadra, si salva sulla
       partita (`format`) e la **quota a testa segue il formato** (costo / giocatori del formato), anche se la
       formazione segnata su carta è incompleta (dettaglio "5vs5 · €6 a testa", non "2vs1");
     - squadre: giocatori della lega oppure **nuovi ospiti** creati al volo con il loro nome (diventano schede
       ospite normali, prima del salvataggio della partita);
     - risultato, marcatori ed MVP con lo stesso modulo dell'archiviazione.
     Si salva con `saveMatchResult` come ogni partita archiviata: aggiorna V/P/S delle schede, la classifica e la
     forma; **nessuna cassa** (solo costo e quota a testa). Sulla partita restano `location`, `match_time` e
     `entered_by_hand: true` ("Inserita a mano nello Storico" nel dettaglio).

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
| **Esci dalla lega** (`/api/league-admin` `leave`, Impostazioni → Lega) | Il membro stesso, anche in una lega sospesa | Subito, senza approvazione: stessi effetti di "Togli dalla lega". Presidente e collaboratori ricevono un avviso (campanella e push). L'**ultimo presidente** non può uscire: nomina un altro presidente, oppure elimina la lega dalla Zona pericolosa ("I Calcettari" non si elimina: lì deve nominarne un altro). L'app passa a un'altra lega, o al benvenuto se non ne restano |
| **Chiudi il mio account** (`/api/account/delete`) | Il titolare (non il super admin) | Disattiva (dati conservati) oppure elimina. I gestori ricevono la richiesta `account_closed`, che è solo un avviso. Con **elimina** spariscono anche le notifiche personali (`profiles/{id}/notifications`), le richieste aperte di quella persona nella campanella dei gestori si chiudono (`account_deleted`) e l'email esce da tutte; l'avviso `account_closed` conserva solo nome e motivo. Restano, per coerenza dello storico, i voti MVP e i pagamenti già registrati |
| **Disattiva o elimina l'account di altri** | Solo lo staff, mai su un super admin | Agisce sull'account globale e su tutte le sue schede. Dalla scheda del giocatore c'è **Disattiva account**; **Elimina** si usa dopo, dall'elenco degli account disattivati (Impostazioni → Account e piattaforma) |
| **Rientro** (`/api/account/return-request`, pubblica) | Chi ha l'account chiuso chiede; **lo staff** decide | **Ripristina** (con conferma: profilo e storico tornano) oppure **riparti da zero** (vecchio storico archiviato come ospite). In entrambi i casi l'avviso `account_closed` di quella persona esce da "Da gestire". All'utente il login dice che "gli amministratori della piattaforma" stanno configurando il rientro. Per privacy la risposta è sempre la stessa (C10) |

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

### 3.5 Bacheca Avvisi & Partecipazioni Esterne (Spot)

Una lega cerca giocatori per una sua partita; chiunque sulla piattaforma può prendere un posto.
Codice: [matchNotices.ts](../src/lib/server/matchNotices.ts) (server), [matchNotice.ts](../src/lib/utils/matchNotice.ts)
(validazione e stato), [matchNotice.ts](../src/types/matchNotice.ts) (tipi), `/api/match-notices`,
[matchNoticeService.ts](../src/lib/services/matchNoticeService.ts) (app).

**Interfaccia** (componenti in `src/components/board/`)
- **Navigazione:** voce "Bacheca" nella barra, con un **badge numerico solo quando ci sono avvisi aperti di altre leghe** (come la card in Home: quelli della
  tua lega li gestisci dalla Bacheca, non sono posti che puoi prendere)
  ([useOpenNoticeCount.ts](../src/lib/hooks/useOpenNoticeCount.ts)). In **Home** una card compatta
  ([BoardHomeCard.tsx](../src/components/board/BoardHomeCard.tsx)) compare **solo quando altre leghe** cercano
  giocatori (gli avvisi della lega attiva sono per gli esterni: i membri si iscrivono normalmente): quante partite, la
  più vicina, "Vai alla Bacheca". La pagina `/board` funziona **anche senza lega** (dal benvenuto: "Cerca una partita
  da giocare").
- **Bacheca** ([page.tsx](../src/app/board/page.tsx)):
  - card scansionabili ([NoticeCard.tsx](../src/components/board/NoticeCard.tsx)): lega, giorno e ora in evidenza,
    badge "N posti liberi", formato, badge del ruolo (portieri in azzurro), pallino del colore della maglia, campo con
    "Indicazioni" (Maps), **quota a testa** grande con il costo del campo accanto, note;
  - filtri leggeri (Tutte / Oggi / 7 giorni, formato, ruolo; un filtro di ruolo tiene anche gli avvisi "qualsiasi
    ruolo"; [matchNotice.ts](../src/lib/utils/matchNotice.ts) `filterNotices`), stato vuoto con e senza filtri;
  - "**Partecipa alla partita**" apre una scheda di riepilogo ([JoinNoticeSheet.tsx](../src/components/board/JoinNoticeSheet.tsx))
    che ricorda che **non si entra nella lega**; dopo, "Hai preso il posto";
  - "**I miei posti**": le prossime partite prese (Confermato / Annullata).
- **Gestori** (presidente, collaboratore, staff):
  - in Bacheca: "Nuovo avviso" (il modulo parte da giorno ufficiale, ora standard, campo predefinito e suo prezzo
    per il formato, quota = prezzo / giocatori) e l'elenco degli avvisi della lega attiva;
  - **nella partita** (Impostazioni → Partita della settimana → Organizzazione, [MatchNoticePanel.tsx](../src/components/board/MatchNoticePanel.tsx)):
    "Giocatori esterni" con "**Cerca giocatori esterni**", che apre il modulo **già compilato** con i dati di quella
    partita (giorno bloccato, ora, campo, indirizzo, formato, costo, quota, posti = giocatori mancanti) e lascia al
    gestore posti, ruolo, maglia e note. Poi lo stato dell'avviso (In bacheca / Completo / Chiuso / Annullato / **Scaduto**: la partita è già iniziata; il lavoro periodico ogni 10 minuti, `closeExpiredNotices`, chiude gli avvisi ancora aperti e li segna `CLOSED` con `closedReason: 'expired'`, con N/M),
    chi ha preso il posto, Modifica / Chiudi / Annulla avviso;
  - dopo la partita, accanto a ogni persona: "**Invita nella lega**" (manda il link di invito; entra solo se vuole).
- **Profilo** ([CareerCard.tsx](../src/components/profile/CareerCard.tsx), [career.ts](../src/lib/utils/career.ts)):
  le statistiche della **lega attiva** restano nella loro card (etichetta "Solo &lt;lega&gt;"); la card "**Carriera**"
  somma le schede di **tutte le leghe** dell'account più le **partite da esterno** (giocate, senza esito: il risultato
  resta della lega ospitante), con l'elenco delle partite da esterno e il badge discreto "**Da esterno**".
  Sopra la Carriera c'è la card "**Radar globale**" ([GlobalRadarCard.tsx](../src/components/profile/GlobalRadarCard.tsx)),
  **separata** dai valori delle leghe: il **Radar Base** (scelto all'iscrizione), la media delle **valutazioni da ospite** (se
  ce ne sono) e, in fondo, "Radar nelle tue leghe" con l'OVR della scheda in ogni lega e il suo stato (Da revisionare /
  Verificato, deciso da QUEI gestori). La card dei valori della lega attiva ha il suo titolo ("Valori nella lega «…»").

**Dati** (`match_notices/{id}`):
- `leagueId`, `leagueName`, `matchId` (il **giorno** della partita, `YYYY-MM-DD`, come `matches/{data}`), `dateTime` (ISO);
- `locationName`, `address`, `format` (`5v5` / `7v7` / `8v8` / `11v11`);
- `totalFieldCost`, `costPerPlayer` (la quota non supera il costo del campo; zero va bene);
- `spotsNeeded` (1–22), `spotsFilled`;
- `roleNeeded`: `ANY` / `GOALKEEPER` / `ROTATION_GOALKEEPER` / `OUTFIELD`; `shirtColor`: `DARK` / `LIGHT`; `notes` (max 300);
- `status`: `OPEN` (in bacheca) / `CLOSED` (posti coperti o chiuso a mano, `closedReason` `full` / `manual`) / `CANCELLED`;
- `createdBy`, `created_at`, `updated_at`.
- Chi ha preso un posto sta nella sottocollezione `applicants/{profileId}` (`userId`, `displayName`, `joinedAt`,
  `invitedAt`), **non** nell'avviso: la bacheca la legge tutta la piattaforma, l'elenco delle persone solo i gestori di
  quella lega e lo staff.
- Ogni persona ha la **sua copia** dei posti presi in `profiles/{profileId}/spots/{noticeId}` (lega, giorno, campo,
  formato, quota, ruolo, maglia, `status` `ACTIVE` / `CANCELLED`, e dopo la partita `result`, `goals`, `mvp` e l'eventuale
  `rating`, la valutazione ricevuta): la scrive solo il server, la legge solo lei. Serve a "I miei posti", alla carriera e al
  Radar globale, e il server la tiene allineata a ogni modifica dell'avviso (senza cancellare `result` né `rating`). Si
  cancella con l'account.

**Flussi** (tutte le scritture passano da `POST /api/match-notices`)

| Azione | Chi | Cosa succede |
|---|---|---|
| `create` | Presidente, collaboratore della lega attiva; staff | Avviso `OPEN` per una partita futura. Lega sospesa: solo lo staff (423 per gli altri) |
| `update` | Gestori della lega dell'avviso; staff | Cambiano i dettagli e i posti, **mai** la lega o la partita. I posti non scendono sotto quelli presi (`below_filled`). Un avviso chiuso perché pieno **riapre** se si aggiungono posti |
| `close` | Gestori; staff | `CLOSED` a mano: non riapre da solo |
| `cancel` | Gestori; staff | `CANCELLED`: definitivo, niente più modifiche né posti. Chi aveva preso il posto riceve **subito una notifica** (campanella + push) e il posto risulta "Annullata" nella sua copia |
| `take` ("Partecipa alla partita") | Chiunque con email verificata | **Transazione**: legge l'avviso e il proprio posto, rifiuta se pieno, chiuso, annullato, passato o già preso, poi scrive il posto, la copia della persona e `spotsFilled + 1`. All'ultimo posto lo stato diventa `CLOSED` (`full`) e l'avviso esce dalla bacheca. I gestori della lega **e chi ha pubblicato l'avviso** ricevono una notifica (campanella + push, secondo la modalità della lega; chi ha pubblicato la riceve anche se la lega non ha presidenti o collaboratori) |
| `remove` | Gestori; staff | Prima della partita: toglie la persona, libera il posto (l'avviso riapre se era pieno), toglie l'iscrizione esterna, avvisa la persona |
| `leave` ("Rinuncia al posto") | Chi ha preso il posto | **Prima della partita** (`too_late` dopo): libera il posto (l'avviso **riapre sempre**, anche se era chiuso a mano; annullato resta annullato), toglie l'iscrizione esterna e **cancella ovunque** la traccia della persona (candidatura e copia in `profiles/{id}/spots`: non resta nemmeno in "I miei posti"). Gestori e chi ha pubblicato l'avviso ricevono "Posto liberato". Con un posto annullato o tolto dal gestore la stessa azione lo toglie solo dall'elenco della persona. `not_applicant` se non c'è nulla da restituire |
| `match_view`, `mvp_vote` | Chi ha preso il posto (`match_view` anche i gestori) | Le squadre di quella partita, il proprio voto e la finestra; il voto MVP dell'esterno |
| `invite` | Gestori; staff | **Solo dopo la partita** (`too_early` prima), mai a chi è già membro (`already_member`): la persona riceve una notifica con il link di invito della lega (`/join/{codice}`); entra solo se lo usa. `invitedAt` sul posto |

- **Già convocato:** chi ha già un'iscrizione a quella partita con la sua scheda in quella lega non prende il posto
  (`already_in_match`); chi ha già un posto non ne prende un altro (`already_joined`).
- **Preferenze personali sulla Bacheca** (profilo: `board_off`, `board_hidden`, modificabili solo dal titolare, vedi
  `firestore.rules`; copia anche sul dispositivo per mostrarle subito, [useBoardPrefs.ts](../src/lib/hooks/useBoardPrefs.ts)):
  **"Non mi interessa"** su una card nasconde quell'avviso solo a quella persona (massimo 100, "Mostra di nuovo" li riporta);
  **Impostazioni > Tuo account > Bacheca "Cerco giocatore": Nascosta** toglie la voce dalla barra, la card dalla Home e il
  badge (la pagina resta raggiungibile dall'indirizzo, con il pulsante per mostrarla di nuovo). Il badge e la card Home non
  contano gli avvisi nascosti né quelli in cui la persona ha già un posto.
- **Campi nel modulo:** "Nuovo avviso" propone il campo predefinito e il menu dei campi salvati della lega (con "Altro
  campo"); se la lega non ne ha dice dove aggiungerli. Impostazioni > Campi mostra solo i campi veri della lega, mai una
  copia rimasta sul dispositivo.
- **Posti per chi è fuori:** un **membro** di quella lega non prende un posto nel suo stesso avviso (`is_member`): si
  iscrive dalle Presenze con la sua scheda. Nella Bacheca la card della propria lega non offre "Partecipa".
- **Isolamento:** prendere un posto **non** crea `memberships` né una scheda; chi risponde non legge giocatori, cassa,
  impostazioni né altri dati della lega.
- **Lega sospesa:** la bacheca si legge, ma nessuno prende posti (423); lo staff può ancora chiudere o annullare.

#### L'esterno nella singola partita

Codice: [externalPlayers.ts](../src/lib/server/externalPlayers.ts) (server), [externalPlayers.ts](../src/lib/utils/externalPlayers.ts)
(regole pure).

- **Iscrizione alla sola partita.** Quando prende il posto, il server scrive anche un'iscrizione di quel giorno,
  `presences/{data}_ext-<profileId>`, con `player_id = ext-<profileId>` e `external = { profileId, userId, name,
  noticeId, avatar_url, position, overall_rating, stats, ratedIn }`, con l'ora del server come ordine. **Nessuna scheda** in `players`.
- **Nella partita come gli altri.** App e server contano queste iscrizioni anche senza scheda: l'esterno è titolare
  (o in attesa), entra nella generazione delle squadre con il suo **livello globale**, maglia Bianchi / Neri,
  nel risultato, nei marcatori, ed è **votabile come MVP**. In Presenze ha l'etichetta "esterno".
- **Il livello dell'esterno** ([externalLevel.ts](../src/lib/utils/externalLevel.ts), `externalLevelFor` in
  [externalPlayers.ts](../src/lib/server/externalPlayers.ts)). **Nessuna scheda** nella lega ospitante e **nessun flusso di
  conferma** di lega: per bilanciare le squadre di quella sola partita il server usa, in quest'ordine,
  1. la **media dei suoi radar confermati nelle sue leghe** (schede non `UNCONFIRMED`, quindi anche quelle nate prima del
     flusso di revisione) **insieme alle valutazioni da ospite** che altre leghe gli hanno lasciato (vedi sotto);
  2. altrimenti il **Radar Base** del profilo (`profiles.baseRadar`);
  3. altrimenti il **6 neutro** del club.

  Il risultato (OVR, parametri, `levelFrom` = `leagues` / `radar` / `default`) è copiato nell'iscrizione di quel giorno
  (`external`) e non cambia più per quella partita. Le schede `UNCONFIRMED` non entrano nella media: un valore che nessuno
  ha ancora rivisto non pesa più del Radar Base.
- **Voto MVP dell'esterno.** Non può leggere la lega, quindi vota da Bacheca → "I miei posti" → "Vota l'MVP": il
  server (`match_view`, `mvp_vote`) mostra le squadre di quella partita e scrive il voto in `mvp_votes/{data}_{uid}`
  come per i membri. Finestra: da inizio + 1 h 45 per 24 ore; solo chi ha il posto; solo chi era in squadra.
- **Livello nelle squadre.** La pagina Squadre (figurine, "Equilibrio", modifica manuale) pesa l'esterno con lo
  stesso livello usato per generare le squadre, preso dalla sua iscrizione del giorno (`external.overall_rating`).
- **Notifiche.** "Partita confermata", squadre cambiate, sostituzione e "sei titolare" arrivano anche all'esterno:
  `deliver` ([push.ts](../src/lib/server/push.ts)) traduce `ext-<id>` nel suo account e la notifica **apre la
  Bacheca**, perché non può aprire le pagine di una lega che non è sua. L'avviso "Vota l'MVP" del cron include gli
  esterni di quella partita. Valgono le modalità della lega: in "prova" (predefinita) arrivano solo agli admin.
- **Tolto o annullato prima della partita.** "Togli" (nel pannello della partita o "Rimuovi" in Presenze, sempre
  via server: le regole vietano di cancellare dall'app un'iscrizione esterna) libera il posto, riapre l'avviso se era
  chiuso perché pieno, toglie l'iscrizione (sale chi è in attesa) e avvisa la persona (posto "Tolto"). Annullare
  l'avviso prima della partita fa lo stesso per tutti. Dopo l'inizio non si toglie più (`too_late`).
  "Azzera presenze del giorno" lascia gli esterni.
- **Valutazione dell'ospite dopo la partita** (`rate_external`, `rateExternal` in [matchNotices.ts](../src/lib/server/matchNotices.ts),
  [ExternalRatingSheet.tsx](../src/components/board/ExternalRatingSheet.tsx)). **Facoltativa e rapida**: un radar completo
  (8 parametri, 1–10, partenza a 6). Appena la partita è archiviata, la campanella ricorda **una volta sola** ("⭐ Valuta gli
  ospiti", `tellUnratedExternals`, `external_rating_notified_at` sul referto) a presidenti e collaboratori **e a chi ha chiuso
  il referto** (`matches.closed_by`); poi si valuta da **Bacheca → l'avviso → chi ha preso il posto** o da Impostazioni →
  Partita → Giocatori esterni ("Valuta" / "Modifica", "Valutato · OVR n").
  - **Chi può:** presidente e collaboratore di quella lega, lo staff di piattaforma, e chi ha chiuso il referto di quella
    partita (nell'app il referto lo chiudono i gestori, quindi coincidono quasi sempre; la regola copre il collaboratore o
    chi ha firmato la chiusura se in seguito perde il ruolo). Mai l'ospite stesso, un giocatore comune, né i gestori di
    un'altra lega (`forbidden`).
  - **Quando e per chi:** solo a partita **archiviata** (`not_archived`) e solo per chi ha **giocato** quella partita
    (`not_applicant`). Si può correggere: l'ultima sostituisce la precedente.
  - **Dove finisce:** nel **referto di quella partita** (`matches/{data}.external_ratings.ext-<id>` = `{ profileId, stats,
    overall_rating, rated_by, rated_at }`) e nel **Radar globale** della persona (`profiles/{id}/spots/{noticeId}.rating`). Da
    lì entra nella media del punto 1 del livello dell'esterno e nella card "Radar globale" del suo Profilo.
  - **Cosa non tocca mai:** nessuna scheda di lega (né quella ospitante, che non c'è, né quelle delle leghe a cui appartiene),
    né il suo Radar Base. Il referto la conserva anche se lo si salva di nuovo (le regole vietano all'app di scriverla).
- **Statistiche separate.**
  - **Lega ospitante:** l'archiviazione non tocca nessuna scheda (gli `ext-` non ne hanno) e le statistiche dei
    membri (Home "Il tuo rendimento", Giocatori, forma: `computeMatchStats`, `computeRecentResults`) ignorano ogni
    id `ext-`. Lo **Storico** della lega invece racconta la partita com'è stata giocata: l'ospite compare con il
    **nome salvato nelle formazioni** (`nameInMatch`) e il badge "**Ospite**" in classifica, nelle formazioni del
    dettaglio, tra i marcatori e come MVP. Non si apre la sua scheda (non ne ha).
  - **Lega di appartenenza dell'ospite:** non vede niente; le sue classifiche non cambiano.
  - **Carriera:** dopo l'archiviazione (e a ogni correzione o cancellazione della partita) il server copia esito,
    gol e MVP sulla copia del posto (`result`, `goals`, `mvp`). Il profilo somma tutte le leghe più le partite da
    ospite; "Le mie partite" elenca tutte le partite giocate, con il badge "**Ospite · Lega**" e il filtro per lega.

**Regole:** `match_notices` si legge con email verificata; `applicants/{profileId}` lo legge la persona stessa, i
gestori della lega dell'avviso e lo staff; `profiles/{id}/spots` lo legge solo il titolare; nessuna scrittura dal
browser. Un'iscrizione con `external` non si cancella dall'app (solo il server). `matches/{data}.external_ratings` lo scrive
solo il server: i gestori possono modificare il resto del referto ma non aggiungere, cambiare o togliere le valutazioni
(regola su `matches`, testata in `scripts/test-rules.mjs`).

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
  - voti MVP solo per sé (`voter_id == uid`) e solo da chi gioca nella lega;
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

- **Superfici:** card, blocchi di sezione, righe di elenco e stati vuoti hanno un bordo sottile da 1px, preso solo dai token già
  esistenti ([surfaces.ts](../src/components/ui/surfaces.ts): `line-strong` nel chiaro, lo stesso al 60% nello scuro) e nessuna
  ombra. Serve perché una card bianca su sfondo `#F8FAFC` non ha contrasto. Vale in **tutta l'app** (Home, Presenze, Giocatori,
  Squadre, Storico, Profilo, Impostazioni, Bacheca, Lega, console): un blocco `bg-card` con `rounded-2xl` senza bordo non passa
  il test `tests/unit/surfaces.test.ts`. I campi e i filtri usano lo stesso bordo; i blocchi dentro una card, quello più leggero.
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
| Integrazione | `npm run test:integration` | API reali su emulatori: ruoli, staff, eliminazione, inviti e reclami, rientro, "non gioca", catalogo campi, bacheca "Cerco giocatore" (anche 10 click insieme su 2 posti) |
| End-to-end | `npm run test:e2e` | Flussi nel browser (Pixel 7): leghe, fallback, console, presenze, giocatori, bacheca, onboarding (Radar Base e leghe pubbliche). Per ripeterli senza riavviare tutto: `npm run test:e2e:server` (una volta, resta acceso) e `npm run test:e2e:fast` |

Prima di un commit si eseguono tutti i controlli (skill `pre-commit-testing-gate`).
