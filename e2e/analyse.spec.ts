import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function placeDefault(page: Page, name: string) {
  const lib = page.getByRole('button', { name: 'Événements', exact: true })
  if (await lib.isVisible()) await lib.click()
  await page.getByRole('button', { name: `Placer : ${name}` }).click()
  const bar = page.getByRole('dialog', { name: `Placer : ${name}` })
  await bar.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Terminé' }).click()
}

async function openPanel(page: Page) {
  const btn = page.getByRole('button', { name: 'Analyse', exact: true })
  if (await btn.isVisible()) await btn.click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?tutoriel=0')
  await expect(page.locator('.map__dep')).toHaveCount(96)
  await placeDefault(page, 'Télétravail généralisé')
  await page.getByRole('slider', { name: 'Année affichée' }).fill('2050')
  await openPanel(page)
  await page.getByLabel('Choisir une autre zone').selectOption('region:53')
})

test('« D’où vient cet écart ? » décompose l’écart et chiffre la part de chaque événement', async ({ page }) => {
  await page.locator('.chip--btn').click()
  const dlg = page.getByRole('dialog', { name: 'D’où vient cet écart ?' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('list', { name: 'Décomposition de l’écart par composante' })).toContainText('Arrivées d’autres départements')
  const shares = dlg.getByRole('list', { name: 'Part de chaque événement dans l’écart' })
  await expect(shares).toContainText('Télétravail généralisé')
  await expect(shares).toContainText('Effets croisés')
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})

test('chaque indicateur ouvre l’explication de son écart', async ({ page }) => {
  await page.getByRole('button', { name: /^Âge médian/ }).click()
  await expect(page.getByRole('dialog', { name: 'D’où vient cet écart ?' })).toContainText('Âge médian')
})

test('onglets au clavier : pyramide, courbes, petits multiples', async ({ page }) => {
  await page.getByRole('tab', { name: 'Synthèse' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Pyramide' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('img', { name: /Pyramide des âges de Bretagne en 2050/ })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('combobox', { name: 'Indicateur' })).toBeVisible()
  await page.keyboard.press('End')
  const grid = page.locator('.multiples__grid button')
  await expect(grid).toHaveCount(13)
  await page.getByRole('button', { name: /^Île-de-France :/ }).click()
  await expect(page.locator('#zone-title')).toHaveText('Île-de-France')
})

test('mode avant / après : deux cartes et un séparateur réglable', async ({ page, isMobile }) => {
  test.skip(isMobile, 'comparaison détaillée : parcours ordinateur')
  await page.getByLabel('Mode avant / après').selectOption('reference')
  await expect(page.locator('.compare .map')).toHaveCount(2)
  const sep = page.getByRole('slider', { name: /Séparateur avant/ })
  await sep.focus()
  await page.keyboard.press('Home')
  await expect(sep).toHaveValue('0')
  await expect(page.locator('.compare__tag--right')).toHaveText('Ce scénario 2050')
})

test('aucune violation d’accessibilité dans l’analyse et dans l’explication', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('tab', { name: 'Pyramide' }).click()
  let r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target}`)).toEqual([])
  await page.locator('.chip--btn').click()
  await expect(page.getByRole('list', { name: 'Part de chaque événement dans l’écart' })).toBeVisible()
  r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target}`)).toEqual([])
})
