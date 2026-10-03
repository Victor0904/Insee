import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.map__dep')).toHaveCount(96)
})

test('la lecture fait avancer le temps et toute l’interface suit', async ({ page }) => {
  const year = page.locator('.timeline__year')
  await expect(year).toHaveText('2025')
  await page.getByRole('button', { name: 'Lancer le temps' }).click()
  await expect.poll(async () => Number(await year.textContent())).toBeGreaterThan(2027)
  await page.getByRole('button', { name: 'Mettre en pause' }).click()
  const paused = await year.textContent()
  await page.waitForTimeout(800)
  await expect(year).toHaveText(paused!)
  await expect(page.locator('.legend__year')).toHaveText(paused!)
})

test('le curseur de la frise se pilote au clavier', async ({ page }) => {
  const slider = page.getByRole('slider', { name: 'Année affichée' })
  await slider.focus()
  await page.keyboard.press('End')
  await expect(page.locator('.timeline__year')).toHaveText('2100')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.timeline__year')).toHaveText('2026')
})

test('on choisit un département au clavier sur la carte, puis on remonte à la région', async ({ page, isMobile }) => {
  test.skip(isMobile, 'navigation au clavier : parcours ordinateur')
  const map = page.getByRole('application', { name: /Carte des départements/ })
  await map.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  const title = page.locator('#zone-title')
  await expect(title).not.toHaveText('France métropolitaine')
  await page.getByRole('navigation', { name: 'Niveau géographique' }).getByRole('button').nth(1).click()
  await expect(page.getByRole('navigation', { name: 'Niveau géographique' }).getByRole('button', { name: /./ }).last()).toHaveAttribute('aria-current', 'true')
  await map.focus()
  await page.keyboard.press('Escape')
  await expect(title).toHaveText('France métropolitaine')
})

test('le sélecteur de zone est une alternative à la carte', async ({ page }) => {
  if (await page.getByRole('button', { name: 'Analyse' }).isVisible()) await page.getByRole('button', { name: 'Analyse' }).click()
  await page.getByLabel('Choisir une autre zone').selectOption('dep:23')
  await expect(page.locator('#zone-title')).toHaveText('Creuse')
})

test('la couche de la carte change la légende', async ({ page }) => {
  await page.getByLabel('La carte montre').selectOption('medianAge')
  await expect(page.locator('.legend__title')).toContainText('Âge médian')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`aucune violation d’accessibilité détectée (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.locator('.map__dep')).toHaveCount(96)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} élément(s) — ${v.help}`)).toEqual([])
  })
}

test('pas de défilement horizontal', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})
