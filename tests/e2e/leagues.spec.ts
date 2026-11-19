import { expect, test } from '@playwright/test';
import { FieldValue } from 'firebase-admin/firestore';
import { db, loginAs, loginAsAdmin, seedAccountWithoutLeague, seedMatchDay } from './seed';

/** Multi-league step 2: league switcher in the header, creating a league, welcome screen without leagues. */
test.describe('Leghe', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('selettore: lega attiva con il ruolo, elenco delle leghe e "Crea nuova lega"', async ({ page }) => {
    await loginAsAdmin(page);
    const switcher = page.getByRole('button', { name: /Lega attiva: I Calcettari/ });
    await expect(switcher).toBeVisible();
    await expect(switcher).toContainText('Presidente');
    await switcher.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('menuitemradio', { name: /I Calcettari/ })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('menuitem', { name: 'Crea nuova lega' })).toBeVisible();
  });

  test('crea una lega, ci entra da presidente con i suoi dati separati, poi torna ai Calcettari', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: /Lega attiva: I Calcettari/ }).click();
    await page.getByRole('menuitem', { name: 'Crea nuova lega' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByRole('button', { name: 'Crea la lega' })).toBeDisabled();
    await form.getByLabel('Nome della lega').fill('Lega del giovedì');
    await form.getByRole('radio', { name: /Pubblica/ }).click();
    await form.getByRole('button', { name: 'Crea la lega' }).click();

    const switcher = page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ });
    await expect(switcher).toBeVisible({ timeout: 15_000 });
    await expect(switcher).toContainText('Presidente');
    const leagues = await db.collection('leagues').where('name', '==', 'Lega del giovedì').get();
    expect(leagues.size).toBe(1);
    expect(leagues.docs[0].data()).toMatchObject({ visibility: 'public', createdBy: 'p-1' });

    // nella nuova lega ci sono solo io: i giocatori dei Calcettari non si vedono
    await page.goto('/players');
    await expect(page.locator('text=Marco Test >> visible=true').first()).toBeVisible();
    await expect(page.getByText('Test Uno')).toHaveCount(0);

    // ritorno ai Calcettari: tornano i loro giocatori
    await page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ }).click();
    await page.getByRole('menuitemradio', { name: /I Calcettari/ }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible();
    await expect(page.locator('text=Test Uno >> visible=true').first()).toBeVisible();
    // la scelta resta dopo un ricaricamento
    await page.reload();
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible();
  });

  test('senza leghe: benvenuto con "Crea" e "Unisciti"; un codice sbagliato è segnalato', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crea una nuova lega' })).toBeVisible();
    await page.getByRole('button', { name: 'Unisciti con codice o link invito' }).click();
    await page.getByLabel('Codice o link di invito').fill('no');
    await page.getByRole('button', { name: 'Entra', exact: true }).click();
    await expect(page.getByText(/Codice non valido/)).toBeVisible();
    await page.getByLabel('Codice o link di invito').fill('https://club.example.com/join/abcdef123');
    await page.getByRole('button', { name: 'Entra', exact: true }).click();
    await expect(page).toHaveURL(/\/join\/abcdef123$/);
    await expect(page.getByRole('heading', { name: 'Invito alla lega' })).toBeVisible();
  });

  test('senza leghe: crea la prima lega e ci entra', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await page.getByRole('button', { name: 'Crea una nuova lega' }).click();
    await page.getByRole('dialog').getByLabel('Nome della lega').fill('I Nuovi');
    await page.getByRole('dialog').getByRole('button', { name: 'Crea la lega' }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: I Nuovi/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toHaveCount(0);
  });
});

/** Multi-league step 3: invite link, joining as new or as a ghost player, league settings and roles. */
test.describe('Inviti e ruoli', () => {
  const CODE = 'e2einvite123';
  test.beforeEach(async () => {
    await seedMatchDay();
    await db.doc(`league_invites/${CODE}`).set({ code: CODE, leagueId: 'calcettari', createdBy: 'p-1', createdAt: new Date().toISOString(), revoked: false });
    await db.doc('leagues/calcettari/players/guest-luca').set({
      id: 'guest-luca', user_id: null, userId: null, full_name: 'Ospite Luca', is_guest: true, role: 'player', leagueRole: 'PLAYER', isActivePlayer: true,
      position: 'Punta', avatar_url: null, stats: { Tiro: 9 }, overall_rating: 8, matches_won: 4, matches_drawn: 0, matches_lost: 0, created_at: 'x', updated_at: 'x',
    });
  });

  test('Impostazioni → Lega: link di invito, membri con i ruoli, rinomina della lega', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings?sezione=lega');
    await expect(page.getByRole('heading', { name: 'Invita nella lega' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Invita nella lega' })).toHaveValue(/\/join\/[A-Za-z0-9_-]{12}$/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Copia link' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Condividi su WhatsApp' })).toHaveAttribute('href', /wa\.me/);
    // "Gioco anch'io" sta sopra la lista dei membri (sul telefono non si scorre tutta la rosa per trovarlo)
    const playing = page.getByRole('checkbox', { name: /Gioco anch’io in questa lega/ });
    await expect(playing).toBeChecked();
    const playingBox = await playing.boundingBox();
    const membersBox = await page.getByRole('heading', { name: 'Membri e ruoli' }).boundingBox();
    expect(playingBox!.y).toBeLessThan(membersBox!.y);
    // ricerca per nome (senza accenti e maiuscole)
    const search = page.getByRole('searchbox', { name: 'Cerca un membro' });
    await search.fill('UNO');
    await expect(page.getByRole('combobox', { name: /^Ruolo di / })).toHaveCount(1);
    await expect(page.getByRole('combobox', { name: 'Ruolo di Test Uno' })).toBeVisible();
    await search.fill('nessuno-così');
    await expect(page.getByText('Nessun membro con questo nome.')).toBeVisible();
    await search.fill('');
    // membri registrati con il loro ruolo (gli ospiti senza account no)
    await expect(page.getByRole('combobox', { name: 'Ruolo di Marco Test' })).toHaveValue('PRESIDENT');
    await expect(page.getByRole('combobox', { name: 'Ruolo di Ospite Luca' })).toHaveCount(0);
    // l'unico presidente non può scendere
    await page.getByRole('combobox', { name: 'Ruolo di Marco Test' }).selectOption('PLAYER');
    await expect(page.getByText('Non si può: la lega resterebbe senza presidente.')).toBeVisible();
    // Test Uno diventa collaboratore
    await page.getByRole('combobox', { name: 'Ruolo di Test Uno' }).selectOption('COLLABORATOR');
    await expect.poll(async () => (await db.doc('leagues/calcettari/players/t1').get()).data()?.leagueRole, { timeout: 10_000 }).toBe('COLLABORATOR');
    // nuovo nome: arriva anche nel selettore in alto
    await page.getByLabel('Nome', { exact: true }).fill('I Calcettari FC');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari FC/ })).toBeVisible({ timeout: 15_000 });
  });

  test('senza account entrato: il link mostra la lega, si accede e si torna all’invito; "sono io" chiede la scheda, il presidente approva', async ({ page, browser }) => {
    const acc = await seedAccountWithoutLeague();
    await page.goto(`/join/${CODE}`);
    await expect(page.getByText('I Calcettari', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Accedi o registrati per entrare' }).click();
    await page.locator('#auth-email').fill(acc.email);
    await page.locator('#auth-password').fill(acc.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL(new RegExp(`/join/${CODE}$`), { timeout: 60_000 });

    const me = page.getByRole('radio', { name: /Ospite Luca/ });
    await me.click();
    await expect(me).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Entra nella lega' }).click();
    await expect(page.getByText(/Hai chiesto la scheda di Ospite Luca/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible({ timeout: 15_000 });
    // entrato come nuovo: lo storico dell'ospite NON è ancora suo
    expect((await db.doc('leagues/calcettari/players/e2e-nolega').get()).data()).toMatchObject({ userId: 'e2e-nolega', matches_won: 0 });
    expect((await db.doc('leagues/calcettari/players/guest-luca').get()).exists).toBe(true);

    // il presidente approva dal centro richieste
    const admin = await (await browser.newContext()).newPage();
    await loginAsAdmin(admin);
    await admin.goto('/?richieste=1');
    await expect(admin.getByText('Nuovo Arrivato dice di essere "Ospite Luca"')).toBeVisible({ timeout: 15_000 });
    await admin.getByRole('button', { name: 'Approva, è lui' }).click();
    await admin.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect.poll(async () => (await db.doc('leagues/calcettari/players/guest-luca').get()).exists, { timeout: 15_000 }).toBe(false);
    expect((await db.doc('leagues/calcettari/players/e2e-nolega').get()).data()).toMatchObject({ matches_won: 4, overall_rating: 8 });
  });

  test('già entrato e senza leghe: "sono nuovo" crea la scheda; riaprendo il link risulta già membro', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await page.goto(`/join/${CODE}`);
    await expect(page.getByRole('radio', { name: /Sono nuovo/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Entra nella lega' }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible({ timeout: 15_000 });
    expect((await db.doc('leagues/calcettari/players/e2e-nolega').get()).data()).toMatchObject({ leagueRole: 'PLAYER', matches_won: 0 });
    await page.goto(`/join/${CODE}`);
    await expect(page.getByText('Fai già parte di questa lega.')).toBeVisible();
  });
});

/** League lifecycle: delete for good (typed name) and automatic fallback when the active league goes away. */
test.describe('Ciclo di vita della lega', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
    await db.doc('leagues/giovedi').set({ id: 'giovedi', name: 'Lega del giovedì', slug: 'lega-del-giovedi', status: 'active', visibility: 'private', createdAt: new Date().toISOString(), createdBy: 'p-1' });
    await db.doc('leagues/giovedi/players/p-1').set({ id: 'p-1', userId: 'e2e-super', user_id: 'e2e-super', full_name: 'Marco Test', leagueRole: 'PRESIDENT', role: 'admin', isActivePlayer: true, is_guest: false, stats: {}, overall_rating: 6 });
    await db.doc('memberships/e2e-super').set({ leagues: { giovedi: { player_id: 'p-1', league_role: 'PRESIDENT', name: 'Lega del giovedì' } } }, { merge: true });
  });

  const openLeague = async (page: import('@playwright/test').Page, name: RegExp) => {
    await page.getByRole('button', { name: /Lega attiva:/ }).click();
    await page.getByRole('menuitemradio', { name }).click();
  };

  test('il presidente elimina la lega scrivendo il nome esatto: si torna all’altra lega', async ({ page }) => {
    await loginAsAdmin(page);
    await openLeague(page, /Lega del giovedì/);
    await page.goto('/settings?sezione=lega');
    await page.getByRole('button', { name: 'Elimina la lega' }).click();
    const sheet = page.getByRole('dialog');
    const confirm = sheet.getByRole('button', { name: 'Elimina per sempre' });
    await expect(confirm).toBeDisabled();
    await sheet.getByLabel(/scrivi il nome esatto della lega/).fill('Lega del giovedi');
    await expect(confirm).toBeDisabled();
    await sheet.getByLabel(/scrivi il nome esatto della lega/).fill('Lega del giovedì');
    await confirm.click();
    await expect(page.getByText('La lega "Lega del giovedì" è stata eliminata.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible({ timeout: 15_000 });
    expect((await db.doc('leagues/giovedi').get()).exists).toBe(false);
    expect((await db.doc('memberships/e2e-super').get()).data()?.leagues?.giovedi).toBeUndefined();
    // la lega di base non mostra la zona pericolosa
    await expect(page.getByRole('button', { name: 'Elimina la lega' })).toHaveCount(0);
  });

  test('tolto dalla lega aperta: avviso e passaggio all’altra; lega sospesa: avviso e passaggio', async ({ page }) => {
    await loginAsAdmin(page);
    await openLeague(page, /Lega del giovedì/);
    await expect(page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ })).toBeVisible();
    // il server lo toglie (come "Togli dalla lega" o l'eliminazione)
    await db.doc('memberships/e2e-super').update({ 'leagues.giovedi': FieldValue.delete() });
    await expect(page.getByText(/Non fai più parte della lega "Lega del giovedì"/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible();

    // di nuovo dentro, poi la lega viene sospesa mentre è aperta
    await db.doc('memberships/e2e-super').set({ leagues: { giovedi: { player_id: 'p-1', league_role: 'PRESIDENT', name: 'Lega del giovedì' } } }, { merge: true });
    await openLeague(page, /Lega del giovedì/);
    await expect(page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ })).toBeVisible();
    await db.doc('leagues/giovedi').update({ status: 'suspended' });
    await expect(page.getByText(/La lega "Lega del giovedì" è stata sospesa: ti abbiamo portato in "I Calcettari"/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible();
  });
});

/** Multi-league step 4: platform super admin console (menu item + /super-admin), suspended league banner. */
test.describe('Super admin della piattaforma', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('voce "Console piattaforma" nel menu, elenco delle leghe, sospende e riattiva', async ({ page }) => {
    await loginAsAdmin(page);
    await page.locator('button[aria-controls="user-menu"]').click();
    await page.getByRole('menuitem', { name: 'Console piattaforma' }).click();
    await expect(page).toHaveURL(/\/super-admin$/);
    await expect(page.getByRole('heading', { name: 'Console piattaforma', level: 1 })).toBeVisible();
    const row = page.getByRole('listitem', { name: 'I Calcettari' });
    await expect(row).toContainText('Attiva');
    await expect(row).toContainText('11 membri');

    await row.getByRole('button', { name: 'Sospendi' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(row).toContainText('Sospesa', { timeout: 15_000 });
    expect((await db.doc('leagues/calcettari').get()).data()?.status).toBe('suspended');
    // tutta l'app lo segnala: sola lettura
    await expect(page.getByText(/Questa lega è sospesa/)).toBeVisible();

    await row.getByRole('button', { name: 'Riattiva' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(row).toContainText('Attiva', { timeout: 15_000 });
    await expect(page.getByText(/Questa lega è sospesa/)).toHaveCount(0);
  });

  test('presidente senza ruolo di piattaforma: niente voce nel menu e pagina chiusa', async ({ page }) => {
    await db.doc('profiles/p-1').update({ platformRole: 'USER' });
    await loginAsAdmin(page);
    await page.locator('button[aria-controls="user-menu"]').click();
    await expect(page.getByRole('menuitem', { name: 'Impostazioni' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Console piattaforma' })).toHaveCount(0);
    // il ruolo mostrato è quello della lega (badge sull'avatar), mai "Admin"
    await expect(page.locator('[title="Presidente"]').first()).toBeAttached();
    await expect(page.locator('[title="Amministratore"]')).toHaveCount(0);
    await page.goto('/super-admin');
    await expect(page.getByText('Questa pagina è riservata al super admin e agli admin della piattaforma.')).toBeVisible();
  });

  test('admin della piattaforma: nomina per email esatta, compare nell’elenco, si toglie', async ({ page }) => {
    await seedAccountWithoutLeague('aiuto@example.com');
    await loginAsAdmin(page);
    await page.goto('/super-admin');
    const card = page.getByRole('region', { name: 'Admin della piattaforma' });
    await expect(card.getByRole('list', { name: 'Admin della piattaforma' })).toContainText('Super admin');
    await card.getByLabel("Email dell'account da nominare").fill('nessuno@example.com');
    await card.getByRole('button', { name: 'Nomina admin piattaforma' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page.getByText('Nessun account registrato con questa email.')).toBeVisible();

    await card.getByLabel("Email dell'account da nominare").fill('aiuto@example.com');
    await card.getByRole('button', { name: 'Nomina admin piattaforma' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(card.getByRole('list', { name: 'Admin della piattaforma' })).toContainText('Admin piattaforma', { timeout: 15_000 });
    const roleOf = async () => {
      const docs = await db.collection('profiles').where('platformRole', '==', 'GLOBAL_ADMIN').get();
      return docs.size;
    };
    expect(await roleOf()).toBe(1);

    await card.getByRole('button', { name: 'Togli' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect.poll(roleOf, { timeout: 15_000 }).toBe(0);
    await expect(card.getByRole('list', { name: 'Admin della piattaforma' })).not.toContainText('Admin piattaforma');
  });
});
