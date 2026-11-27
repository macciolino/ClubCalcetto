import { expect, test } from '@playwright/test';
import { PLAYERS, db, lg, loginAs, loginAsAdmin, romeDay, seedAccountWithoutLeague, seedMatchDay } from './seed';

/**
 * "Bacheca Avvisi / Cerco giocatore" (docs/ARCHITECTURE.md §3.5): the president publishes a notice from the
 * league's data, a user with NO league takes the last spot (without joining), the notice leaves the board and the
 * president sees who took it.
 */
test.describe('Bacheca "Cerco giocatore"', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('pubblica → un esterno prende il posto → avviso chiuso, il presidente vede chi è', async ({ page, browser }) => {
    await loginAsAdmin(page);
    await page.goto('/board');
    await expect(page.getByText('La tua lega non ha avvisi.', { exact: false })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Nuovo avviso' }).click();

    // Il modulo parte dai dati della lega: giorno ufficiale, ora standard, campo predefinito e suo prezzo
    const form = page.getByRole('dialog');
    await expect(form.locator('#notice-date')).toHaveValue(romeDay(1), { timeout: 15_000 });
    await expect(form.locator('#notice-time')).toHaveValue('20:30');
    await expect(form.locator('#notice-place')).toHaveValue('Campo Test');
    await expect(form.locator('#notice-address')).toHaveValue('Via dei Test 1');
    await expect(form.locator('#notice-total')).toHaveValue('80');
    await expect(form.locator('#notice-head')).toHaveValue('8');
    await form.locator('#notice-role').selectOption('GOALKEEPER');
    await form.getByRole('button', { name: 'Pubblica' }).click();
    await expect(page.getByText('Avviso pubblicato.')).toBeVisible({ timeout: 15_000 });

    const notices = async () => (await db.collection('match_notices').get()).docs.map((d) => d.data());
    await expect.poll(async () => (await notices()).length, { timeout: 15_000 }).toBe(1);
    const [n] = await notices();
    expect(n).toMatchObject({ leagueId: 'calcettari', matchId: romeDay(1), spotsNeeded: 1, spotsFilled: 0, status: 'OPEN', roleNeeded: 'GOALKEEPER', costPerPlayer: 8 });

    // Un utente senza lega lo trova in bacheca e prende il posto
    const acc = await seedAccountWithoutLeague();
    const other = await (await browser.newContext()).newPage();
    await loginAs(other, acc.email, acc.password);
    // dal benvenuto (nessuna lega) alla bacheca
    await other.getByRole('link', { name: 'Cerca una partita da giocare' }).click();
    await other.waitForURL('**/board');
    const card = other.locator('article').filter({ hasText: 'I Calcettari' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('Portiere', { exact: true })).toBeVisible();
    await expect(card.getByText('1 posto libero')).toBeVisible();
    await expect(card.getByText('8 € a testa')).toBeVisible();
    // chi non ha una lega ha la barra ridotta (Inizio e Bacheca), con il badge: 1 partita cerca giocatori
    const otherNav = other.getByRole('navigation', { name: 'Navigazione principale' });
    await expect(otherNav.getByRole('link', { name: /Bacheca/ })).toContainText('1');
    await expect(otherNav.getByRole('link', { name: /Presenze/ })).toHaveCount(0);
    await card.getByRole('button', { name: 'Partecipa alla partita' }).click();
    const join = other.getByRole('dialog');
    await expect(join.getByText('Non entri nella lega', { exact: false })).toBeVisible();
    await join.getByRole('button', { name: 'Conferma partecipazione' }).click();
    await expect(other.getByText('Posto preso: i gestori della lega sono stati avvisati.')).toBeVisible({ timeout: 15_000 });
    // ultimo posto: l'avviso esce dalla bacheca e finisce tra "I miei posti"
    await expect(other.getByText('Nessuna partita cerca giocatori in questo momento.')).toBeVisible({ timeout: 15_000 });
    await expect(other.getByText('Confermato')).toBeVisible();
    expect((await db.doc('memberships/e2e-nolega').get()).exists).toBe(false);

    // Il presidente vede l'avviso chiuso e chi ha preso il posto
    await page.reload();
    await page.getByRole('button', { name: /Campo Test/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Chi ha preso il posto (1/1)')).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Nuovo Arrivato')).toBeVisible();
    // chiuso perché pieno: "Completo"
    await expect(sheet.getByText('Campo Test · Completo')).toBeVisible();
  });

  test('lega nuova senza impostazioni salvate: il modulo parte comunque da ora e campo della lega', async ({ page }) => {
    await db.doc('leagues/calcettari/settings/app_config').delete();
    await loginAsAdmin(page);
    await page.goto('/board');
    await page.getByRole('button', { name: 'Nuovo avviso' }).click();
    const form = page.getByRole('dialog');
    await expect(form.locator('#notice-time')).toHaveValue('20:30', { timeout: 15_000 });
    await expect(form.locator('#notice-place')).toHaveValue('Campo Test');
    await expect(form.locator('#notice-address')).toHaveValue('Via dei Test 1');
    await expect(form.locator('#notice-total')).toHaveValue('80');
  });

  test('dalla partita: "Cerca giocatori esterni" già compilato, stato nella partita', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings?sezione=partita');
    // il giorno ufficiale (domani), scheda Organizzazione
    await page.getByRole('radio', { name: /Ufficiale/ }).click({ timeout: 15_000 });
    await page.getByRole('tab', { name: /Organizzazione/ }).click();
    await expect(page.getByText('Giocatori esterni', { exact: true })).toBeVisible({ timeout: 15_000 });
    // domani nessun iscritto: mancano tutti e 10
    await expect(page.getByText(/Mancano 10 giocatori/)).toBeVisible();
    await page.getByRole('button', { name: 'Cerca giocatori esterni' }).click();
    const form = page.getByRole('dialog');
    await expect(form.locator('#notice-date')).toHaveValue(romeDay(1));
    await expect(form.locator('#notice-date')).toBeDisabled();
    await expect(form.locator('#notice-time')).toHaveValue('20:30');
    await expect(form.locator('#notice-place')).toHaveValue('Campo Test');
    await expect(form.locator('#notice-spots')).toHaveValue('10');
    await expect(form.locator('#notice-head')).toHaveValue('8');
    await form.locator('#notice-spots').fill('2');
    await form.getByRole('button', { name: 'Pubblica' }).click();
    await expect(page.getByText('Avviso pubblicato.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('In bacheca · 0/2 presi')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Annulla avviso' })).toBeVisible();
  });

  test('lista dei gestori: avviso già iniziato "Scaduto"; il badge della Bacheca conta solo le altre leghe', async ({ page }) => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const notice = (id: string, leagueId: string, leagueName: string, dateTime: string) =>
      db.doc(`match_notices/${id}`).set({
        id, leagueId, leagueName, matchId: dateTime.slice(0, 10), dateTime, locationName: `Campo ${id}`, address: 'Via Test 1', format: '5v5',
        totalFieldCost: 80, costPerPlayer: 8, spotsNeeded: 2, spotsFilled: 0, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'OPEN',
        createdBy: { profileId: 'x', name: 'x' }, created_at: 'x', updated_at: 'x',
      });
    await notice('scaduto', 'calcettari', 'I Calcettari', past);
    await loginAsAdmin(page);
    await page.goto('/board');
    await expect(page.getByRole('button', { name: /Campo scaduto/ })).toContainText('Scaduto', { timeout: 15_000 });
    const link = page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Bacheca/ });
    // un avviso futuro della propria lega non fa comparire il badge...
    await notice('mio', 'calcettari', 'I Calcettari', `${romeDay(2)}T19:30:00.000Z`);
    await expect(page.getByRole('button', { name: /Campo mio/ })).toBeVisible({ timeout: 15_000 });
    await expect(link).not.toContainText(/\d/);
    await expect(page.getByText('È la tua lega: iscriviti dalle Presenze.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partecipa alla partita' })).toHaveCount(0);
    // ...uno di un'altra lega sì
    await notice('altro', 'amici', 'Lega Amici', `${romeDay(3)}T19:30:00.000Z`);
    await expect(link).toContainText('1', { timeout: 15_000 });
  });

  test('profilo: carriera di tutte le leghe con le partite da esterno', async ({ page }) => {
    await db.doc('leagues/calcettari/players/p-1').update({ matches_won: 3, matches_drawn: 1, matches_lost: 2 });
    await db.doc('profiles/p-1/spots/x1').set({
      noticeId: 'x1', leagueId: 'altra', leagueName: 'Lega Amici', matchId: romeDay(-3), dateTime: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      locationName: 'Campo Amici', address: 'Via Amici 1', format: '5v5', costPerPlayer: 8, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'ACTIVE', joinedAt: 'x',
    });
    await loginAsAdmin(page);
    await page.goto('/profile');
    const career = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Carriera' }) });
    await expect(career.getByText('7 partite')).toBeVisible({ timeout: 15_000 });
    await expect(career.getByText('1 da esterno')).toBeVisible();
    // storico personale: la partita da ospite con il suo badge, esito in attesa dell'archiviazione
    await expect(career.getByText('Ospite · Lega Amici')).toBeVisible();
    await expect(career.getByText('In attesa', { exact: true })).toBeVisible();
    await expect(page.getByText('Solo I Calcettari')).toBeVisible();
  });
});

test.describe('Esterno nella partita', () => {
  test('l’esterno è titolare e finisce nelle squadre generate, senza entrare nella rosa', async ({ page }) => {
    await seedMatchDay();
    const day = romeDay(1);
    // 9 giocatori della lega + un esterno (iscrizione scritta dal server quando prende il posto)
    await Promise.all(
      PLAYERS.slice(0, 9).map((p, i) =>
        db.doc(`leagues/calcettari/presences/${day}_${p.id}`).set({ id: `${day}_${p.id}`, date: day, player_id: p.id, status: 'confirmed', order_index: i, created_at: 'x', joined_at: new Date(Date.now() - (30 - i) * 60_000) })
      )
    );
    await db.doc(`leagues/calcettari/presences/${day}_ext-luca`).set({
      id: `${day}_ext-luca`, date: day, player_id: 'ext-luca', status: 'confirmed', order_index: 9, created_at: 'x', joined_at: new Date(),
      external: { profileId: 'luca', userId: 'luca', name: 'Luca Esterno', noticeId: 'n1', overall_rating: 10, stats: { Difesa: 10, Tiro: 10 } },
    });
    await loginAsAdmin(page);
    await page.goto(`/teams?date=${day}`);
    await page.getByRole('button', { name: /Genera squadre/ }).first().click({ timeout: 20_000 });
    await expect.poll(async () => (await db.doc(`leagues/calcettari/generated_teams/${day}`).get()).exists, { timeout: 20_000 }).toBe(true);
    const teams = (await db.doc(`leagues/calcettari/generated_teams/${day}`).get()).data()!;
    const ids = [...teams.team_white, ...teams.team_black].map((p: { id: string }) => p.id);
    expect(ids).toHaveLength(10);
    expect(ids).toContain('ext-luca');
    await expect(page.getByText(/Luca/).first()).toBeVisible({ timeout: 15_000 });
    // la pagina pesa l'esterno con il suo livello (10), come la generazione: le medie delle squadre non sono uguali
    await expect(page.getByRole('heading', { name: 'Equilibrio' })).toBeVisible();
    await expect(page.getByText('100%', { exact: true })).toHaveCount(0);
    // nella rosa della lega non c'è
    await page.goto('/players');
    await expect(page.getByText(PLAYERS[0].name).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Luca Esterno')).toHaveCount(0);
  });
});

test.describe('Ospiti nello Storico e card in Home', () => {
  test('Storico della lega ospitante: l’ospite col suo nome e il badge; Home: card della Bacheca per le altre leghe', async ({ page }) => {
    const { date } = await seedMatchDay();
    // partita archiviata dei Calcettari con un ospite MVP
    await db.doc(`leagues/calcettari/matches/${date}`).set({
      id: date, match_date: date, status: 'completed', score_white: 4, score_black: 2,
      team_white: [...PLAYERS.slice(0, 4).map((p) => ({ id: p.id, name: p.name })), { id: 'ext-luca', name: 'Luca Ospite' }],
      team_black: PLAYERS.slice(5).map((p) => ({ id: p.id, name: p.name })),
      scorers: [{ player_id: 'ext-luca', player_name: 'Luca Ospite', goals: 2 }], mvp_player_id: 'ext-luca',
    });
    // un'altra lega cerca giocatori
    const day = romeDay(3);
    await db.doc('match_notices/other1').set({
      id: 'other1', leagueId: 'amici', leagueName: 'Lega Amici', matchId: day, dateTime: `${day}T19:30:00.000Z`, locationName: 'Campo Amici',
      address: 'Via Amici 1', format: '7v7', totalFieldCost: 112, costPerPlayer: 8, spotsNeeded: 2, spotsFilled: 0, roleNeeded: 'ANY',
      shirtColor: 'DARK', status: 'OPEN', createdBy: { profileId: 'x', name: 'x' }, created_at: 'x', updated_at: 'x',
    });

    await loginAsAdmin(page);
    const home = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Cerco giocatore' }) });
    await expect(home.getByText('Lega Amici', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(home.getByRole('link', { name: 'Vai alla Bacheca' })).toBeVisible();

    await page.goto('/history');
    await expect(page.getByText('Luca Ospite').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Ospite', { exact: true }).first()).toBeVisible();
    // la riga della partita mostra l'MVP ospite col suo nome
    await page.getByRole('radio', { name: 'Partite' }).click();
    await expect(page.getByText(/⭐ Luca/).first()).toBeVisible();
  });
});

/** Chi prende un posto lo può restituire; ogni persona può nascondere un avviso o tutta la Bacheca (solo per sé). */
test.describe('Bacheca: rinunciare al posto e nascondere', () => {
  const day = romeDay(2);
  const seedNotice = (id: string, extra: Record<string, unknown> = {}) =>
    db.doc(`match_notices/${id}`).set({
      id, leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: day, dateTime: `${day}T19:30:00.000Z`, locationName: 'Campo Prova',
      address: 'Via Prova 1', format: '5v5', totalFieldCost: 80, costPerPlayer: 8, spotsNeeded: 2, spotsFilled: 0, roleNeeded: 'ANY',
      shirtColor: 'DARK', status: 'OPEN', createdBy: { profileId: 'p-1', name: 'Marco Test' }, created_at: 'x', updated_at: 'x', ...extra,
    });
  const otherLeague = (id: string) => seedNotice(id, { leagueId: 'amici', leagueName: 'Lega Amici', locationName: 'Campo Amici' });

  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('chi ha preso un posto lo restituisce: sparisce da I miei posti, dalle iscrizioni e il posto torna libero', async ({ page }) => {
    await seedNotice('n1');
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await page.getByRole('link', { name: 'Cerca una partita da giocare' }).click();
    await page.waitForURL('**/board');
    const card = page.locator('article').filter({ hasText: 'I Calcettari' });
    await card.getByRole('button', { name: 'Partecipa alla partita' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Conferma partecipazione' }).click();
    await expect(page.getByText('Posto preso: i gestori della lega sono stati avvisati.')).toBeVisible({ timeout: 15_000 });
    const mine = page.getByRole('region', { name: 'I miei posti' });
    await expect(mine.getByText('Confermato')).toBeVisible();
    expect((await db.doc('match_notices/n1').get()).data()?.spotsFilled).toBe(1);

    await mine.getByRole('button', { name: 'Rinuncia al posto' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page.getByText('Hai rinunciato al posto: sei fuori dalla partita.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'I miei posti' })).toHaveCount(0);
    // di nuovo libero per tutti, e nessuna traccia della persona
    await expect(card.getByRole('button', { name: 'Partecipa alla partita' })).toBeVisible({ timeout: 15_000 });
    expect((await db.doc('match_notices/n1').get()).data()).toMatchObject({ spotsFilled: 0, status: 'OPEN' });
    expect((await db.collection('match_notices/n1/applicants').get()).size).toBe(0);
    expect((await db.collection('profiles/e2e-nolega/spots').get()).size).toBe(0);
    expect((await db.collection(`leagues/calcettari/presences`).where('date', '==', day).get()).docs.some((d) => d.id.includes('ext-'))).toBe(false);
  });

  test('"Non mi interessa": l’avviso sparisce solo per me (Bacheca, Home e badge) e si può rimostrare', async ({ page }) => {
    await otherLeague('o1');
    await loginAsAdmin(page);
    await page.goto('/board');
    const card = page.locator('article').filter({ hasText: 'Lega Amici' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Bacheca/ })).toContainText('1');
    await card.getByRole('button', { name: 'Non mi interessa' }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByText('1 avviso nascosto')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Bacheca/ })).not.toContainText(/\d/);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ciao Marco', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Cerco giocatore' })).toHaveCount(0);
    // resta nascosto anche dopo aver ricaricato (salvato sul profilo)
    await page.goto('/board');
    await expect(page.getByText('1 avviso nascosto')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Mostra di nuovo' }).click();
    await expect(page.locator('article').filter({ hasText: 'Lega Amici' })).toBeVisible();
  });

  test('chi non è interessato nasconde tutta la Bacheca da Impostazioni: via dalla barra, da Home e dal conteggio', async ({ page }) => {
    await otherLeague('o2');
    await loginAsAdmin(page);
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
    await expect(nav.getByRole('link', { name: /Bacheca/ })).toBeVisible({ timeout: 15_000 });
    await page.goto('/settings');
    await page.getByRole('button', { name: /Bacheca “Cerco giocatore”/ }).click();
    await page.getByRole('radio', { name: /Nascosta/ }).click();
    await expect(page.getByText('Bacheca nascosta.')).toBeVisible({ timeout: 15_000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ciao Marco', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByRole('link', { name: /Bacheca/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cerco giocatore' })).toHaveCount(0);
    // la pagina resta raggiungibile dall'indirizzo, con il modo di riattivarla
    await page.goto('/board');
    await expect(page.getByText('Hai nascosto la Bacheca', { exact: false })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Mostra la Bacheca' }).click();
    await expect(nav.getByRole('link', { name: /Bacheca/ })).toBeVisible();
  });
});

/** Squadre già fatte con un esterno: se rinuncia al posto, chi era in lista d'attesa prende il suo posto in squadra. */
test('Esterno in squadra che rinuncia al posto: subentra il primo in lista d\u2019attesa', async ({ page, browser }) => {
  await seedMatchDay();
  const day = romeDay(2);
  await db.doc('match_notices/n9').set({
    id: 'n9', leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: day, dateTime: `${day}T19:30:00.000Z`, locationName: 'Campo Test',
    address: 'Via dei Test 1', format: '5v5', totalFieldCost: 80, costPerPlayer: 8, spotsNeeded: 1, spotsFilled: 0, roleNeeded: 'ANY',
    shirtColor: 'DARK', status: 'OPEN', createdBy: { profileId: 'p-1', name: 'Marco Test' }, created_at: 'x', updated_at: 'x',
  });
  // 9 della lega iscritti; il decimo è l'esterno (iscrizione più tarda); un altro della lega dopo di lui, in lista d'attesa
  await Promise.all(
    PLAYERS.slice(0, 9).map((p, i) =>
      lg(`presences/${day}_${p.id}`).set({ id: `${day}_${p.id}`, date: day, player_id: p.id, status: 'confirmed', order_index: i, created_at: 'x', joined_at: new Date(Date.now() - (30 - i) * 60_000) })
    )
  );
  await lg(`presences/${day}_${PLAYERS[9].id}`).set({ id: `${day}_${PLAYERS[9].id}`, date: day, player_id: PLAYERS[9].id, status: 'confirmed', order_index: 10, created_at: 'x', joined_at: new Date(Date.now() + 10 * 60_000) });

  // L'esterno prende il posto dalla sua Bacheca
  const acc = await seedAccountWithoutLeague();
  const outsider = await (await browser.newContext()).newPage();
  await loginAs(outsider, acc.email, acc.password);
  await outsider.getByRole('link', { name: 'Cerca una partita da giocare' }).click();
  await outsider.waitForURL('**/board');
  await outsider.locator('article').filter({ hasText: 'I Calcettari' }).getByRole('button', { name: 'Partecipa alla partita' }).click();
  await outsider.getByRole('dialog').getByRole('button', { name: 'Conferma partecipazione' }).click();
  await expect(outsider.getByText('Posto preso: i gestori della lega sono stati avvisati.')).toBeVisible({ timeout: 15_000 });

  // Il presidente fa le squadre: l'esterno è titolare, il decimo della lega no
  await loginAsAdmin(page);
  await page.goto(`/teams?date=${day}`);
  await page.getByRole('button', { name: /Genera squadre/ }).first().click({ timeout: 20_000 });
  const ids = async () => {
    const t = (await lg(`generated_teams/${day}`).get()).data();
    return t ? [...t.team_white, ...t.team_black].map((p: { id: string }) => p.id) : [];
  };
  await expect.poll(async () => (await ids()).length, { timeout: 20_000 }).toBe(10);
  expect(await ids()).toContain('ext-e2e-nolega');
  expect(await ids()).not.toContain(PLAYERS[9].id);

  // L'esterno rinuncia: il presidente riapre le squadre e al suo posto c'è il primo della lista d'attesa
  await outsider.getByRole('region', { name: 'I miei posti' }).getByRole('button', { name: 'Rinuncia al posto' }).click();
  await outsider.getByRole('alertdialog').getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(outsider.getByText('Hai rinunciato al posto: sei fuori dalla partita.')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/teams?date=${day}`);
  await expect.poll(async () => (await ids()).includes(PLAYERS[9].id), { timeout: 25_000 }).toBe(true);
  expect(await ids()).not.toContain('ext-e2e-nolega');
  expect(await ids()).toHaveLength(10);
});

/** Un presidente che ha nascosto la Bacheca pubblica comunque dalla partita e ritrova i suoi avvisi aprendo l'indirizzo. */
test('Presidente con la Bacheca nascosta: pubblica dalla partita e vede la sua lista da /board', async ({ page }) => {
  await seedMatchDay();
  await db.doc('profiles/p-1').update({ board_off: true });
  await loginAsAdmin(page);
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Bacheca/ })).toHaveCount(0);
  await page.goto('/settings?sezione=partita');
  await page.getByRole('radio', { name: /Ufficiale/ }).click({ timeout: 15_000 });
  await page.getByRole('tab', { name: /Organizzazione/ }).click();
  await page.getByRole('button', { name: 'Cerca giocatori esterni' }).click();
  const form = page.getByRole('dialog');
  await form.locator('#notice-spots').fill('2');
  await form.getByRole('button', { name: 'Pubblica' }).click();
  await expect(page.getByText('Avviso pubblicato.')).toBeVisible({ timeout: 15_000 });
  await page.goto('/board');
  await expect(page.getByText('Hai nascosto la Bacheca', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Campo Test/ })).toBeVisible();
  // il pulsante per pubblicare dalla Bacheca c'è comunque, e basta un tocco per rimostrarla
  await expect(page.getByRole('button', { name: 'Nuovo avviso' })).toBeVisible();
  await page.getByRole('button', { name: 'Mostra la Bacheca' }).click();
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Bacheca/ })).toBeVisible();
});

/** Chi non ha una lega ma ha giocato da esterno: riepilogo nel benvenuto, Carriera completa nel suo Profilo. */
test('Senza lega: le partite da ospite nel riepilogo del benvenuto e la Carriera nel Profilo', async ({ page }) => {
  await seedMatchDay();
  const acc = await seedAccountWithoutLeague();
  await loginAs(page, acc.email, acc.password);
  await expect(page.getByRole('heading', { name: 'Il tuo calcetto, senza chat infinite.' })).toBeVisible({ timeout: 15_000 });
  const summary = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Il tuo profilo' }) });
  await expect(summary.getByText('Partite da ospite')).toBeVisible();
  await db.doc('profiles/e2e-nolega/spots/x1').set({
    noticeId: 'x1', leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: romeDay(-3), dateTime: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    locationName: 'Campo Test', address: 'Via dei Test 1', format: '5v5', costPerPlayer: 8, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'ACTIVE', joinedAt: 'x',
    result: 'won', goals: 2, mvp: true,
  });
  // riepilogo: 1 partita da ospite, vinta, 2 gol, MVP
  await expect(summary.locator('div').filter({ hasText: /^1Partite da ospite$/ })).toBeVisible({ timeout: 15_000 });
  await expect(summary.locator('div').filter({ hasText: /^2Gol$/ })).toBeVisible();
  // la Carriera completa sta nel Profilo
  await summary.getByRole('link', { name: 'Vai al profilo' }).click();
  await page.waitForURL('**/profile');
  const career = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Carriera' }) });
  await expect(career.getByText('1 partita')).toBeVisible({ timeout: 15_000 });
  await expect(career.getByText('Ospite · I Calcettari')).toBeVisible();
});

/** Lo staff della piattaforma agisce come presidente: con una scheda da giocatore l'intestazione dice il suo ruolo vero. */
test('Staff con una scheda da giocatore: l\u2019intestazione non dice "Giocatore"', async ({ page }) => {
  await seedMatchDay();
  await db.doc('leagues/calcettari/players/p-1').update({ leagueRole: 'PLAYER' });
  await loginAsAdmin(page);
  const header = page.locator('header').first();
  await expect(header).toContainText(/Super admin/i, { timeout: 15_000 });
  await expect(header).not.toContainText(/Giocatore/i);
});

/** Una partita già archiviata non è più "Prossima partita" e non offre iscrizione né ritiro. */
test('Home: partita archiviata, niente "Prossima partita" né iscrizione', async ({ page }) => {
  await seedMatchDay();
  const day = romeDay(1);
  await lg(`matches/${day}`).set({ id: day, match_date: day, status: 'completed', score_white: 3, score_black: 1, team_white: PLAYERS.slice(0, 5), team_black: PLAYERS.slice(5) });
  await lg(`presences/${day}_p-1`).set({ id: `${day}_p-1`, date: day, player_id: 'p-1', status: 'confirmed', order_index: 1, created_at: 'x', joined_at: new Date() });
  await loginAsAdmin(page);
  await expect(page.getByRole('heading', { name: 'Ciao Marco', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Partita conclusa', { exact: true })).toBeVisible();
  await expect(page.getByText('Prossima partita', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ritirati' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Ci sono/ })).toHaveCount(0);
});
