import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openSide(page: Page) {
  if (await page.locator('#bibliotheque.is-open').count()) return
  for (const name of ['Événements', 'Jeu']) {
    const b = page.getByRole('button', { name, exact: true })
    if (await b.isVisible()) {
      await b.click()
      return
    }
  }
}

async function chooseMode(page: Page, label: string) {
  const btn = page.getByRole('navigation', { name: 'Mode de jeu' }).getByRole('button', { name: label })
  if (await btn.isVisible()) await btn.click()
  else await page.getByRole('navigation', { name: 'Mode de jeu' }).getByRole('combobox').selectOption({ label })
}

test('le tutoriel se fait en jouant, en 4 étapes', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.map__dep')).toHaveCount(101)
  const coach = page.getByRole('dialog', { name: 'Voici la France de 2025' })
  await expect(coach).toBeVisible()
  await page.getByRole('button', { name: 'Lancer le temps' }).click()
  // la référence se déroule : l'étape ne passe plus d'elle-même en 2035 (elle ramenait en 2025)
  await expect(page.locator('.timeline__year')).toHaveText(/^20(3[6-9]|[4-9]\d)$/, { timeout: 20_000 })
  await expect(page.getByRole('dialog', { name: 'Voici la France de 2025' })).toBeVisible()
  await page.getByRole('button', { name: 'Mettre en pause' }).click()
  await expect(page.getByRole('dialog', { name: /le télétravail se généralisait/ })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Placer : Télétravail généralisé' }).click()
  await page.getByRole('dialog', { name: 'Placer : Télétravail généralisé' }).getByRole('button').first().click()
  await expect(page.getByRole('dialog', { name: /Bleu : plus d’habitants/ })).toBeVisible()
  await page.getByRole('slider', { name: 'Année affichée' }).fill('2050')
  await expect(page.getByRole('dialog', { name: 'D’où vient l’écart ?' })).toBeVisible()
  await page.locator('.chip--btn').click()
  await expect(page.getByRole('dialog', { name: 'D’où vient cet écart ?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page.locator('.coach')).toHaveCount(0)
  // ne revient pas au rechargement
  await page.reload()
  await expect(page.locator('.map__dep')).toHaveCount(101)
  await expect(page.locator('.coach')).toHaveCount(0)
})

test.describe('modes de jeu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?tutoriel=0')
    await expect(page.locator('.map__dep')).toHaveCount(101)
  })

  test('réussir le défi « Sauver la Creuse »', async ({ page }) => {
    await chooseMode(page, 'Défis')
    await openSide(page)
    await page.getByRole('button', { name: 'Relever le défi : Sauver la Creuse' }).click()
    await expect(page.getByRole('heading', { name: 'Sauver la Creuse' })).toBeVisible()
    // trois leviers posés sur la Creuse elle-même (la liste « Zone » propose les départements)
    for (const name of ['Ouverture migratoire', 'Relocalisation industrielle', 'Boom technologique']) {
      await openSide(page)
      await page.getByRole('button', { name: `Placer : ${name}` }).click()
      const bar = page.getByRole('dialog', { name: `Placer : ${name}` })
      if (await bar.isVisible()) await bar.getByRole('button').first().click()
      const insp = page.getByRole('dialog', { name })
      await expect(insp.getByRole('radio', { name: 'Extrême' })).toHaveCount(0) // intensité plafonnée en défi
      await insp.getByRole('radio', { name: 'Forte' }).check()
      await insp.getByRole('combobox').selectOption({ label: '23 · Creuse' })
      await insp.getByRole('slider').nth(1).fill('50')
      await insp.getByRole('slider').nth(1).press('ArrowRight')
      await insp.getByRole('slider').nth(1).press('ArrowLeft')
      await insp.getByRole('button', { name: 'Terminé' }).click()
    }
    await openSide(page)
    // pas de validation instantanée : le résultat se révèle quand le temps atteint 2100
    await expect(page.locator('.mission__measure')).toContainText('résultat révélé en 2100')
    await expect(page.locator('.mission__win')).toHaveCount(0)
    await page.getByRole('slider', { name: 'Année affichée' }).fill('2100')
    await expect(page.locator('.mission__win')).toContainText('Réussi', { timeout: 20_000 })
    await expect(page.getByRole('status').filter({ hasText: 'Défi réussi' })).toBeVisible()
    // le meilleur score s'affiche ensuite sur la carte du défi
    await page.getByRole('button', { name: '← Tous les défis' }).click()
    await expect(page.locator('.game-card').filter({ hasText: 'Sauver la Creuse' }).locator('.game-card__best')).toContainText('points')
  })

  test('un défi refuse les événements en trop', async ({ page }) => {
    await chooseMode(page, 'Défis')
    await openSide(page)
    await page.getByRole('button', { name: 'Relever le défi : Des retraites tenables' }).click()
    for (const name of ['Retraite à 67 ans', 'Ouverture migratoire', 'Politique nataliste']) {
      await openSide(page)
      await page.getByRole('button', { name: `Placer : ${name}` }).click()
      const bar = page.getByRole('dialog', { name: `Placer : ${name}` })
      if (await bar.isVisible()) await bar.getByRole('button').first().click()
      if (await page.getByRole('button', { name: 'Terminé' }).isVisible()) await page.getByRole('button', { name: 'Terminé' }).click()
    }
    await expect(page.locator('.toast')).toContainText('2 événements au plus')
    await expect(page.locator('.lanes button.block')).toHaveCount(2)
  })

  test('mode Devine : on répond, la carte révèle l’effet', async ({ page }) => {
    await chooseMode(page, 'Devine')
    await openSide(page)
    await expect(page.getByText('question 1 sur 8')).toBeVisible()
    const choice = page.locator('.choice').first()
    await expect(choice).toBeEnabled({ timeout: 20_000 })
    await choice.click()
    await expect(page.locator('.guess__reveal')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.choice--right')).toHaveCount(1)
    await expect(page.locator('.timeline__year')).toHaveText('2050')
    await page.getByRole('button', { name: 'Question suivante' }).click()
    await expect(page.getByText('question 2 sur 8')).toBeVisible()
  })

  test('charger un scénario célèbre', async ({ page }) => {
    await chooseMode(page, 'Scénarios célèbres')
    await openSide(page)
    await page.getByRole('button', { name: 'Charger : La canicule de 2003, tous les 5 ans' }).click()
    await expect(page.locator('.lanes button.block')).toHaveCount(15)
    await expect(page.getByText('À regarder')).toBeVisible()
  })

  test('aucune violation d’accessibilité dans les défis et dans Devine', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await chooseMode(page, 'Défis')
    await openSide(page)
    let r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target}`)).toEqual([])
    await page.keyboard.press('Escape')
    await chooseMode(page, 'Devine')
    await openSide(page)
    await expect(page.locator('.choice').first()).toBeEnabled({ timeout: 20_000 })
    r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target}`)).toEqual([])
  })
})
