import { test, expect } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function open(
  page: import('@playwright/test').Page,
  nav: string,
  heading: string,
) {
  await page.getByRole('button', { name: nav, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: heading, exact: true }).first(),
  ).toBeVisible();
}

test('tokens : filtres, recherche et édition propagée jusqu’aux aperçus', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Tokens', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.band, .line')).toHaveCount(12);

  const filters = page.locator('.flt').first();
  await expect(filters.getByRole('button', { name: /^Tous/ })).toContainText(
    '12',
  );
  await expect(
    filters.getByRole('button', { name: /^Couleurs/ }),
  ).toContainText('4');
  await expect(
    filters.getByRole('button', { name: /^Espacements/ }),
  ).toContainText('3');

  await filters.getByRole('button', { name: /^Couleurs/ }).click();
  await expect(page.locator('.band')).toHaveCount(4);
  await expect(page.locator('.line')).toHaveCount(0);
  await expect(page.locator('.tgroup')).toHaveCount(1);

  await filters.getByRole('button', { name: /^Tous/ }).click();
  await page.getByLabel('Rechercher').fill('spacing');
  await expect(page.locator('.band, .line')).toHaveCount(3);
  await page.getByLabel('Rechercher').fill('');

  await page.locator('.band', { hasText: 'color-primary-500' }).click();
  const value = page.getByLabel('Valeur de color-primary-500');
  await value.fill('#ff0000');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary-500')
        .trim(),
    ),
  ).toBe('#ff0000');
  await expect(
    page.locator('.band', { hasText: 'color-primary-500' }),
  ).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  await expect(
    page.locator('.band', { hasText: 'color-primary-500' }),
  ).toHaveCSS('color', 'rgb(0, 0, 0)');

  await open(page, 'Composants', 'Bouton');
  await expect(page.locator('.vp .b.p').first()).toHaveCSS(
    'background-color',
    'rgb(255, 0, 0)',
  );

  await open(page, 'Aperçu', 'Aperçu');
  await expect(page.locator('.stage .b.p')).toHaveCSS(
    'background-color',
    'rgb(255, 0, 0)',
  );

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Tokens', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.band', { hasText: 'color-primary-500' }),
  ).toHaveCSS('background-color', 'rgb(255, 0, 0)');
});

test('tokens : ajout, copie de la variable et suppression en deux clics', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Nouveau token' }).click();
  await page.getByLabel('Nom du token').fill('color-accent-400');
  await page.getByLabel('Type', { exact: true }).selectOption('color');
  await page.getByLabel('Valeur', { exact: true }).fill('#14b8a6');
  await page.getByRole('button', { name: 'Ajouter le token' }).click();

  await expect(page.locator('.band, .line')).toHaveCount(13);
  const band = page.locator('.band', { hasText: 'color-accent-400' });
  await expect(band).toHaveCSS('background-color', 'rgb(20, 184, 166)');

  await band.click();
  await page
    .getByRole('button', { name: 'Copier var(--color-accent-400)' })
    .click();
  await expect(page.getByRole('button', { name: 'Copié' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('var(--color-accent-400)');

  const remove = page.getByRole('button', { name: 'Supprimer' });
  await remove.click();
  await expect(
    page.getByRole('button', { name: 'Confirmer la suppression' }),
  ).toBeVisible();
  await expect(page.locator('.band, .line')).toHaveCount(13);
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.locator('.band, .line')).toHaveCount(12);
});

test('composants : variantes rendues, code copié et panneau accessible au clavier', async ({
  page,
}) => {
  await page.goto('/');
  await open(page, 'Composants', 'Bouton');

  await expect(page.locator('.clist .ci')).toHaveCount(3);
  await expect(
    page.getByRole('heading', { name: '7 variantes' }),
  ).toBeVisible();
  await expect(page.locator('.vp')).toHaveCount(7);
  for (const preview of await page.locator('.vp').all()) {
    await expect(preview).not.toBeEmpty();
  }

  await page.locator('.vl', { hasText: 'Secondaire' }).click();
  await expect(page.locator('pre')).toContainText('Secondaire');
  await page
    .locator('.code')
    .getByRole('button', { name: 'Copier', exact: true })
    .click();
  await expect(
    page.locator('.code').getByRole('button', { name: 'Copié', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('Secondaire');

  await page.locator('.vl', { hasText: 'Danger' }).click();
  await expect(page.locator('pre')).toContainText('Supprimer');

  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Déclenche une action prioritaire.');
  await dialog.getByRole('button', { name: '+ Ajouter une variante' }).click();
  const names = dialog.getByLabel(/Nom de la variante/);
  const codes = dialog.getByLabel(/Code HTML de la variante/);
  await names.nth(7).fill('Très petit');
  await codes
    .nth(7)
    .fill(
      '<button class="b p" style="padding:4px 8px;font-size:11px">Mini</button>',
    );
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: '8 variantes' }),
  ).toBeVisible();
  await expect(
    page.getByText('Déclenche une action prioritaire.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Modifier', exact: true }),
  ).toBeFocused();

  await page.reload();
  await open(page, 'Composants', 'Bouton');
  await expect(
    page.getByRole('heading', { name: '8 variantes' }),
  ).toBeVisible();

  await page
    .locator('.comp-head')
    .getByRole('button', { name: 'Supprimer', exact: true })
    .click();
  await page
    .locator('.comp-head')
    .getByRole('button', { name: 'Confirmer la suppression' })
    .click();
  await expect(page.locator('.clist .ci')).toHaveCount(2);
});

test('composants : création puis suppression d’un composant', async ({
  page,
}) => {
  await page.goto('/');
  await open(page, 'Composants', 'Bouton');
  await page.getByRole('button', { name: '+ Nouveau composant' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nom', { exact: true }).fill('Alerte');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Message important.');
  await dialog
    .getByLabel('Code HTML de la variante 1')
    .fill('<div style="color:#b91c1c">Attention</div>');
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();

  await expect(
    page.getByRole('heading', { name: 'Alerte', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.clist .ci')).toHaveCount(4);
  await expect(page.locator('.vp')).toContainText('Attention');

  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.locator('.clist .ci')).toHaveCount(3);
  await expect(
    page.getByRole('heading', { name: 'Bouton', exact: true }),
  ).toBeVisible();
});

test('composants : sélection multiple, compteur et suppression confirmée', async ({
  page,
}) => {
  await page.goto('/');
  await open(page, 'Composants', 'Bouton');
  await expect(page.locator('.clist .ci')).toHaveCount(3);
  await expect(page.locator('.ci-count').first()).toHaveText('7');

  await page.getByLabel('Tout sélectionner').check();
  const bulk = page.locator('.bulkbar');
  await expect(bulk).toContainText('3 composants sélectionnés');

  await page.getByLabel('Sélectionner Carte').uncheck();
  await expect(bulk).toContainText('2 composants sélectionnés');
  await bulk.getByRole('button', { name: 'Tout désélectionner' }).click();
  await expect(bulk).toHaveCount(0);

  await page.getByLabel('Tout sélectionner').check();
  await bulk.getByRole('button', { name: 'Supprimer', exact: true }).click();
  const confirm = page.getByRole('dialog', {
    name: 'Supprimer 3 composants ?',
  });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('3 composants');
  await confirm.getByRole('button', { name: 'Supprimer 3' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator('.clist .ci')).toHaveCount(0);
  await expect(bulk).toHaveCount(0);
  await expect(
    page.getByText('Aucun composant. Ajoutez-en un.'),
  ).toBeVisible();
});

test('composants : textes générés, édition manuelle et régénération', async ({
  page,
}) => {
  await page.goto('/');
  await open(page, 'Composants', 'Bouton');
  await page.getByRole('button', { name: '+ Nouveau composant' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom', { exact: true }).fill('Bouton d’alerte');
  await dialog
    .getByLabel('Nom de la variante 1')
    .fill('Taille=Grand, Etat=Repos');
  await dialog
    .getByLabel('Code HTML de la variante 1')
    .fill('<button>Agir</button>');
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();

  await expect(page.locator('.comp-desc')).toContainText('Bouton d’alerte');
  await expect(page.locator('.fc').first()).toContainText(
    'Choisissez la variante',
  );
  await expect(page.locator('.fc').nth(1)).toContainText('•');

  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const description = dialog.getByLabel('Description', { exact: true });
  await description.fill('Texte rédigé à la main.');
  await expect(
    dialog.getByText('modifié à la main').first(),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect(page.locator('.comp-desc')).toHaveText(
    'Texte rédigé à la main.',
  );

  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await dialog.getByRole('button', { name: 'Régénérer les textes' }).click();
  await expect(description).toHaveValue(/Bouton d’alerte/);
  await expect(description).not.toHaveValue('Texte rédigé à la main.');
  await expect(dialog.getByText('modifié à la main')).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Enregistrer', exact: true })
    .click();
  await expect(page.locator('.comp-desc')).toContainText('Bouton d’alerte');
});

test('composants : anciens imports éclatés fusionnés sans perdre le code', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'dss-comps',
      JSON.stringify([
        {
          id: 'old-primaire',
          name: 'Bouton/Primaire',
          status: 'Stable',
          description: 'Importé depuis Figma.',
          do: '',
          dont: '',
          origin: 'import',
          variants: [
            {
              id: 'old-v1',
              n: 'Par défaut',
              props: {},
              code: '<button>Primaire</button>',
            },
          ],
        },
        {
          id: 'old-secondaire',
          name: 'Bouton/Secondaire',
          status: 'Stable',
          description: 'Importé depuis Figma.',
          do: '',
          dont: '',
          origin: 'import',
          variants: [
            {
              id: 'old-v2',
              n: 'Par défaut',
              props: {},
              code: '<button>Secondaire</button>',
            },
          ],
        },
      ]),
    );
  });
  await page.goto('/');
  await open(page, 'Composants', 'Bouton/Primaire');
  await expect(page.locator('.clist .ci')).toHaveCount(2);
  const notice = page.locator('.notice.import-merge');
  await expect(notice).toContainText('1 groupe');
  await notice.getByRole('button', { name: 'Fusionner les doublons' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('.clist .ci')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Bouton', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '2 variantes' }),
  ).toBeVisible();
  await expect(page.locator('.vp').first()).toContainText('Primaire');

  await page.reload();
  await open(page, 'Composants', 'Bouton');
  await expect(page.locator('.clist .ci')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: '2 variantes' }),
  ).toBeVisible();
});

test('aperçu : largeurs mobile, tablette et thème clair', async ({ page }) => {
  await page.goto('/');
  await open(page, 'Aperçu', 'Aperçu');
  await expect(page.locator('.stage')).not.toHaveClass(/lt/);
  const wide = await page
    .locator('.stage')
    .evaluate((element) => element.getBoundingClientRect().width);

  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.stage')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(375);

  await page.getByRole('button', { name: 'Tablette', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.stage')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(768);

  await page.getByRole('button', { name: 'Bureau', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.stage')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(wide);

  await page.getByRole('button', { name: 'Mode clair', exact: true }).click();
  await expect(page.locator('.stage')).toHaveClass(/lt/);
  await expect(
    page.getByRole('button', { name: 'Mode sombre', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.stage')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
});

test('export : copie JSON et téléchargement réel', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('.promo')
    .getByRole('button', { name: 'Copier', exact: true })
    .click();
  await expect(
    page.locator('.promo').getByRole('button', { name: 'Copié', exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(async () =>
    JSON.parse(await navigator.clipboard.readText()),
  );
  expect(copied.tokens).toHaveLength(12);
  expect(copied.tokens[0].name).toBe('color-primary-500');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('design-tokens.json');
  const path = await download.path();
  expect(path).toBeTruthy();
  const { readFile } = await import('node:fs/promises');
  const file = JSON.parse(await readFile(path!, 'utf8'));
  expect(file.tokens).toHaveLength(12);
  expect(file.tokens.map((token: { name: string }) => token.name)).toContain(
    'shadow-card',
  );
});

test('mise en page : seule la carte défile, barre de filtres collante et export visible en 700 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/');

  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document.querySelector('.card')!;
        const side = document.querySelector('.side')!;
        return {
          bodyOverflow: getComputedStyle(document.body).overflow,
          documentScroll: document.documentElement.scrollHeight,
          innerHeight,
          cardScrolls: card.scrollHeight > card.clientHeight,
          sideScrolls: side.scrollHeight > side.clientHeight,
        };
      }),
    )
    .toEqual({
      bodyOverflow: 'hidden',
      documentScroll: 700,
      innerHeight: 700,
      cardScrolls: true,
      sideScrolls: false,
    });

  const promo = page.locator('.promo');
  await expect(promo).toBeVisible();
  const promoBox = await promo.boundingBox();
  expect(promoBox).not.toBeNull();
  expect(promoBox!.y + promoBox!.height).toBeLessThanOrEqual(700);
  await expect(
    promo.getByRole('button', { name: 'Télécharger' }),
  ).toBeVisible();

  await page.locator('.card').evaluate((card) => {
    card.scrollTop = 420;
  });
  const positions = await page.evaluate(() => {
    const card = document.querySelector('.card')!.getBoundingClientRect();
    const filters = document.querySelector('.flt')!.getBoundingClientRect();
    const top = document.querySelector('.top')!.getBoundingClientRect();
    return { cardTop: card.top, filtersTop: filters.top, headerTop: top.top };
  });
  expect(positions.headerTop).toBeLessThan(0);
  expect(Math.abs(positions.filtersTop - positions.cardTop)).toBeLessThan(1);

  await expect(
    page
      .locator('.flt')
      .first()
      .getByRole('button', { name: /^Ombres/ }),
  ).toBeVisible();
  await page
    .locator('.flt')
    .first()
    .getByRole('button', { name: /^Ombres/ })
    .click();
  await expect(page.locator('.band, .line')).toHaveCount(1);
  await expect(page.locator('.line')).toContainText('shadow-card');
});

test('responsive : aucune fuite horizontale et navigation en pastilles sous 900 px', async ({
  page,
}) => {
  for (const [width, height] of [
    [900, 800],
    [768, 1024],
    [600, 900],
    [375, 812],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.card')!;
      const nav = document.querySelector('.nav')!;
      return {
        documentWidth: document.documentElement.scrollWidth,
        innerWidth,
        cardWidth: card.scrollWidth,
        cardClient: card.clientWidth,
        navDisplay: getComputedStyle(nav).display,
        sideScrolls:
          document.querySelector('.side')!.scrollHeight >
          document.querySelector('.side')!.clientHeight,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.innerWidth);
    expect(layout.cardWidth).toBeLessThanOrEqual(layout.cardClient + 1);
    expect(layout.navDisplay).toBe('flex');
    expect(layout.sideScrolls).toBe(false);

    await open(page, 'Composants', 'Bouton');
    const components = await page.evaluate(() => {
      const grid = document.querySelector('.cgrid')!;
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        width: document.documentElement.scrollWidth,
        inner: innerWidth,
      };
    });
    expect(components.columns).toBe(1);
    expect(components.width).toBeLessThanOrEqual(components.inner);
  }

  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.stage')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThanOrEqual(375);
});

test('phase 1 : chrome beige, sans statut et export accessible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.card')).toHaveCSS(
    'background-color',
    'rgb(244, 236, 220)',
  );
  await expect(page.locator('.shell')).toHaveCSS(
    'background-color',
    'rgb(114, 54, 157)',
  );
  await expect(page.locator('.promo')).toHaveCSS(
    'background-color',
    'rgb(244, 236, 220)',
  );
  await expect(page.locator('.promo p')).toHaveCSS('color', 'rgb(95, 76, 115)');
  await expect(
    page.locator('.exp').getByRole('button', { name: 'Télécharger' }),
  ).toHaveCSS('border-color', 'rgb(114, 54, 157)');
  await expect(
    page.locator('.exp').getByRole('button', { name: 'Copier', exact: true }),
  ).toHaveCSS('background-color', 'rgb(255, 173, 3)');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('.card')).toHaveCSS(
    'background-color',
    'rgb(244, 236, 220)',
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
  ).toBe('light');
  await expect(page.locator('.pill, .dt')).toHaveCount(0);

  await open(page, 'Composants', 'Bouton');
  await expect(page.locator('.pill, .dt')).toHaveCount(0);
  await expect(page.getByText('Stable', { exact: true })).toHaveCount(0);
  await expect(page.locator('.fc').first()).toHaveCSS(
    'background-color',
    'rgb(228, 216, 242)',
  );
  await expect(page.locator('.fc.no')).toHaveCSS(
    'background-color',
    'rgb(251, 217, 160)',
  );
  await expect(page.locator('.fc.no')).toHaveCSS('color', 'rgb(74, 42, 0)');

  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nom', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Statut', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('typographie et focus : polices embarquées et anneau unique', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.fonts.load('500 14px Inter'));
  await page.evaluate(() =>
    document.fonts.load('700 14px "Plus Jakarta Sans"'),
  );
  expect(
    await page.evaluate(() =>
      document.fonts.check('600 14px "Plus Jakarta Sans"'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.fonts.check('500 14px Inter')),
  ).toBe(true);
  await expect(page.locator('body')).toHaveCSS(
    'font-family',
    /Plus Jakarta Sans/,
  );

  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return {
      label: element.getAttribute('data-v') ?? element.textContent?.trim(),
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
  expect(focus.label).toBe('tokens');
  expect(focus.outlineWidth).toBe('2px');
  expect(focus.outlineStyle).toBe('solid');
  expect(focus.outlineColor).toBe('rgb(42, 17, 64)');
  expect(focus.boxShadow).toContain('rgb(255, 255, 255)');
  expect(focus.boxShadow).toContain('3px');
});

test('phase 2 : connexion simulée, application puis annulation depuis la notification', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?figma=deconnecte');
  const pill = page.locator('.figma-pill');
  const menu = page.locator('#figma-menu');

  await expect(pill).toHaveAttribute('aria-label', 'Figma, non connecté');
  await expect(pill.locator('.figma-badge')).toHaveCount(0);

  await pill.click();
  await expect(
    menu.getByRole('heading', { name: 'Connecter Figma' }),
  ).toBeVisible();
  await menu.getByRole('button', { name: /Autoriser avec Figma/ }).click();
  await expect(
    menu.getByRole('heading', { name: 'Connecté à Figma' }),
  ).toBeVisible();

  const link = menu.getByLabel('Lien du fichier Figma');
  await link.fill('https://example.com/fichier');
  await menu.getByRole('button', { name: 'Continuer' }).click();
  await expect(menu.getByRole('alert')).toContainText(
    'Ce lien ne pointe pas vers un fichier Figma',
  );

  await link.fill('https://www.figma.com/design/dSsarah2026/DS-Sarah');
  await menu.getByRole('button', { name: 'Continuer' }).click();
  await expect(
    menu.getByRole('heading', { name: 'Choisir le contenu' }),
  ).toBeVisible();
  await expect(menu.locator('.fm-check')).toHaveCount(4);
  await expect(
    menu.locator('.fm-check', { hasText: 'Styles de couleur' }),
  ).toContainText('· 3');
  await expect(
    menu.locator('.fm-check', { hasText: 'Composants' }),
  ).toContainText('· 2');

  await menu.getByRole('button', { name: 'Terminer' }).click();
  await expect(menu).toHaveCount(0);
  await expect(pill).toHaveAttribute(
    'aria-label',
    'Figma, 7 changements en attente',
  );
  await expect(pill.locator('.figma-badge')).toHaveText('7');

  await pill.click();
  await expect(menu.getByText('DS-Sarah — Produit')).toBeVisible();
  await menu.getByRole('button', { name: 'Mettre à jour' }).click();

  const panel = page.getByRole('dialog', {
    name: 'Mise à jour depuis Figma',
  });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.fp-caps').first()).toHaveText(
    'Styles et variables · 5',
  );
  await expect(panel.locator('.fp-caps').nth(1)).toHaveText('Composants · 2');
  await expect(panel.locator('.fp-row')).toHaveCount(7);
  for (const box of await panel.locator('.fp-row input').all()) {
    await expect(box).toBeChecked();
  }
  await expect(panel.locator('.fp-values code').first()).toHaveText('#0ea5e9');
  await expect(panel.locator('.fp-values code').nth(1)).toHaveText('#7c3aed');

  await panel.getByRole('button', { name: 'Appliquer 7 changements' }).click();
  await expect(panel).toHaveCount(0);

  const toast = page.getByRole('status');
  await expect(toast).toContainText('7 éléments synchronisés');
  await expect(
    toast.getByRole('button', { name: 'Annuler', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.figma-pill .figma-badge')).toHaveCount(0);

  await page.locator('.band', { hasText: 'color-primary-500' }).click();
  await expect(page.getByLabel('Valeur de color-primary-500')).toHaveValue(
    '#7c3aed',
  );
  await expect(
    page.locator('.band', { hasText: 'color-accent-500' }),
  ).toHaveCount(1);

  await open(page, 'Composants', 'Bouton');
  await expect(page.locator('.clist .ci')).toHaveCount(4);
  await expect(page.locator('.clist')).toContainText('Badge');

  await page
    .getByRole('status')
    .getByRole('button', { name: 'Annuler', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.clist .ci')).toHaveCount(3);
  await expect(page.locator('.clist')).not.toContainText('Badge');

  await open(page, 'Tokens', 'Tokens');
  await expect(
    page.locator('.band', { hasText: 'color-primary-500' }),
  ).toHaveCSS('background-color', 'rgb(14, 165, 233)');
  await expect(
    page.locator('.band', { hasText: 'color-accent-500' }),
  ).toHaveCount(0);
});

test('phase 2 : erreur d’autorisation, fermeture Échap et clic extérieur', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?figma=erreur_autorisation');
  const pill = page.locator('.figma-pill');
  const menu = page.locator('#figma-menu');

  await expect(pill).toHaveAttribute(
    'aria-label',
    'Figma, autorisation expirée',
  );
  await expect(pill.locator('.figma-dot')).toHaveClass(/err/);

  await pill.click();
  await expect(menu.getByRole('alert')).toContainText(
    'Votre autorisation Figma a expiré',
  );
  await expect(
    menu.getByRole('button', { name: 'Reconnecter avec Figma' }),
  ).toBeVisible();
  await expect(
    menu.getByRole('button', { name: 'Utiliser un autre compte' }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(pill).toBeFocused();

  await pill.click();
  await expect(menu).toBeVisible();
  await page.locator('.card h1').click();
  await expect(menu).toHaveCount(0);
  await expect(pill).toBeFocused();

  await pill.click();
  await menu.getByRole('button', { name: 'Reconnecter avec Figma' }).click();
  await expect(
    menu.getByRole('heading', { name: 'Connecté à Figma' }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.locator('.figma-label')).toBeHidden();
  await expect(page.locator('.figma-badge')).toBeHidden();
  await expect(pill.locator('.figma-dot')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await pill.click();
  const box = await page.locator('#figma-menu').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.keyboard.press('Escape');
});

test('phase 2 : panneau modal, focus piégé et bouton désactivé à zéro', async ({
  page,
}) => {
  await page.goto('/?figma=connecte');
  await page.locator('.figma-pill').click();
  await page
    .locator('#figma-menu')
    .getByRole('button', { name: 'Mettre à jour' })
    .click();

  const panel = page.getByRole('dialog', {
    name: 'Mise à jour depuis Figma',
  });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Fermer' })).toBeFocused();

  const value = panel.locator('.fp-values code').first();
  await expect(value).toHaveCSS('font-size', '12px');
  await expect(value).toHaveCSS('font-family', /monospace/);

  await page.keyboard.press('Shift+Tab');
  const focusState = await panel.evaluate((element) => ({
    inside: element.contains(document.activeElement),
    label: document.activeElement?.textContent?.trim() ?? '',
  }));
  expect(focusState.inside).toBe(true);
  expect(focusState.label).toContain('Appliquer');

  const boxes = panel.locator('.fp-row input');
  await expect(boxes).toHaveCount(7);
  for (let index = 0; index < 7; index += 1) {
    await boxes.nth(index).uncheck();
  }
  const applyZero = panel.getByRole('button', {
    name: 'Appliquer 0 changement',
  });
  await expect(applyZero).toBeDisabled();
  await expect(panel.locator('.fp-foot')).toContainText(
    '0 éléments seront appliqués',
  );

  await panel
    .locator('.fp-row', { hasText: 'color-primary-500' })
    .locator('input')
    .check();
  const applyOne = panel.getByRole('button', {
    name: 'Appliquer 1 changement',
  });
  await expect(applyOne).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.figma-pill')).toBeFocused();
});

test('phase 2 : la notification disparaît après huit secondes', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?figma=connecte');
  await page.locator('.figma-pill').click();
  await page
    .locator('#figma-menu')
    .getByRole('button', { name: 'Mettre à jour' })
    .click();
  await page
    .getByRole('dialog', { name: 'Mise à jour depuis Figma' })
    .getByRole('button', { name: 'Appliquer 7 changements' })
    .click();

  await expect(page.getByRole('status')).toBeVisible();
  await page.clock.fastForward(8000);
  await expect(page.getByRole('status')).toHaveCount(0);
});

const IMPORT_PAYLOAD = {
  format: 'ds-studio/variables',
  version: 1,
  file: { name: 'DS-Sarah — Import de test' },
  variables: [
    {
      name: 'Colors/Primary/500',
      type: 'color',
      value: '#7c3aed',
      description: 'Action principale importée.',
    },
    { name: 'spacing/md', type: 'spacing', value: '20px' },
    { name: 'radius/lg', type: 'radius', value: '20px' },
    {
      name: 'Font/Heading',
      type: 'typography',
      value: {
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 28,
        fontWeight: 700,
      },
    },
    {
      name: 'Shadow/Card',
      type: 'shadow',
      value: '0 12px 20px -4px rgba(42,17,64,0.28)',
    },
    { name: 'color-accent-500', type: 'color', value: '#14b8a6' },
  ],
  components: [{ name: 'Badge', variants: ['Par défaut', 'Info'] }],
};

function importFile(payload: unknown) {
  return {
    name: 'variables.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  };
}

test('phase 4 : import JSON sans Figma, panneau partagé, application puis annulation', async ({
  page,
}) => {
  await page.goto('/?figma=deconnecte');
  const pill = page.locator('.figma-pill');
  const menu = page.locator('#figma-menu');
  await pill.click();
  await expect(
    menu.getByRole('heading', { name: 'Connecter Figma' }),
  ).toBeVisible();
  await expect(
    menu.getByRole('button', { name: 'Importer un JSON de variables…' }),
  ).toBeVisible();

  await page
    .locator('input[type=file]')
    .setInputFiles(importFile(IMPORT_PAYLOAD));

  const panel = page.getByRole('dialog', { name: 'Import de variables' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.fp-caps').first()).toHaveText(
    'Styles et variables · 6',
  );
  await expect(panel.locator('.fp-caps').nth(1)).toHaveText('Composants · 1');
  await expect(panel.locator('.fp-row')).toHaveCount(7);
  for (const box of await panel.locator('.fp-row input').all()) {
    await expect(box).toBeChecked();
  }
  const primaryRow = panel.locator('.fp-row', {
    hasText: 'colors-primary-500',
  });
  await expect(primaryRow.locator('code').first()).toHaveText('—');
  await expect(primaryRow.locator('code').nth(1)).toHaveText('#7c3aed');
  const spacingRow = panel.locator('.fp-row', { hasText: 'spacing-md' });
  await expect(spacingRow.locator('code').first()).toHaveText('16px');
  await expect(spacingRow.locator('code').nth(1)).toHaveText('20px');

  await panel.getByRole('button', { name: 'Appliquer 7 changements' }).click();
  await expect(panel).toHaveCount(0);

  const toast = page.getByRole('status');
  await expect(toast).toContainText('7 éléments importés');
  await expect(
    toast.getByRole('button', { name: 'Annuler', exact: true }),
  ).toBeVisible();
  await expect(pill).toHaveAttribute('aria-label', 'Figma, non connecté');

  await page.locator('.band', { hasText: 'colors-primary-500' }).click();
  await expect(page.getByLabel('Valeur de colors-primary-500')).toHaveValue(
    '#7c3aed',
  );
  await expect(
    page.locator('.band', { hasText: 'color-accent-500' }),
  ).toHaveCount(1);
  await page.locator('.line', { hasText: 'spacing-md' }).click();
  await expect(page.getByLabel('Valeur de spacing-md')).toHaveValue('20px');

  await open(page, 'Composants', 'Bouton');
  await expect(page.locator('.clist')).toContainText('Badge');
  await page.locator('.clist .ci', { hasText: 'Badge' }).click();
  await expect(
    page.getByRole('heading', { name: 'Badge', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '2 variantes' }),
  ).toBeVisible();

  await toast.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.clist')).not.toContainText('Badge');

  await open(page, 'Tokens', 'Tokens');
  await expect(
    page.locator('.band', { hasText: 'colors-primary-500' }),
  ).toHaveCount(0);
  await expect(
    page.locator('.band', { hasText: 'color-accent-500' }),
  ).toHaveCount(0);
  await page.locator('.line', { hasText: 'spacing-md' }).click();
  await expect(page.getByLabel('Valeur de spacing-md')).toHaveValue('16px');
});

test('phase 4 : JSON invalide signalé et import retirable', async ({
  page,
}) => {
  await page.goto('/?figma=deconnecte');
  const pill = page.locator('.figma-pill');
  const menu = page.locator('#figma-menu');
  await pill.click();

  await page.locator('input[type=file]').setInputFiles({
    name: 'casse.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(menu.getByRole('alert')).toContainText(
    'Ce fichier n’est pas un JSON valide',
  );

  await page
    .locator('input[type=file]')
    .setInputFiles(importFile(IMPORT_PAYLOAD));
  await expect(
    page.getByRole('dialog', { name: 'Import de variables' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await pill.click();
  await expect(
    menu.getByRole('button', { name: 'Retirer l’import (7)' }),
  ).toBeVisible();
  await menu.getByRole('button', { name: 'Vérifier l’import' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Import de variables' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await pill.click();
  await menu.getByRole('button', { name: 'Retirer l’import (7)' }).click();
  await expect(pill).toHaveAttribute('aria-label', 'Figma, non connecté');
  await expect(
    menu.getByRole('button', { name: /Retirer l’import/ }),
  ).toHaveCount(0);
  await expect(pill.locator('.figma-badge')).toHaveCount(0);
});

test('phase 4 : import fusionné avec les changements Figma en attente', async ({
  page,
}) => {
  await page.goto('/?figma=connecte');
  const pill = page.locator('.figma-pill');
  const menu = page.locator('#figma-menu');
  await pill.click();
  await page
    .locator('input[type=file]')
    .setInputFiles(importFile(IMPORT_PAYLOAD));

  const panel = page.getByRole('dialog', {
    name: 'Changements à appliquer',
  });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.fp-caps').first()).toHaveText(
    'Styles et variables · 9',
  );
  await expect(panel.locator('.fp-caps').nth(1)).toHaveText('Composants · 3');
  await expect(panel.locator('.fp-row')).toHaveCount(12);
  await expect(
    panel.getByRole('button', { name: 'Appliquer 7 changements' }),
  ).toBeEnabled();
  await panel.getByRole('button', { name: 'Appliquer 7 changements' }).click();
  await expect(page.getByRole('status')).toContainText('7 éléments importés');
  await expect(pill.locator('.figma-badge')).toHaveText('5');
  await expect(pill).toHaveAttribute(
    'aria-label',
    'Figma, 5 changements en attente',
  );
});
