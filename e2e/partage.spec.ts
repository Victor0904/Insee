import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function placeDefault(page: Page, name: string) {
  const lib = page.getByRole('button', { name: 'Événements', exact: true })
  if (await lib.isVisible()) await lib.click()
  await page.getByRole('button', { name: `Placer : ${name}` }).click()
  const bar = page.getByRole('dialog', { name: `Placer : ${name}` })
  await expect(bar.getByRole('button').first()).toBeFocused()
  await bar.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Terminé' }).click()
}

async function openScenario(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu des outils' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: /Mon scénario/ }).click()
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.goto('/?tutoriel=0')
  await expect(page.locator('.map__dep')).toHaveCount(96)
})

test('partager un lien : le scénario s’ouvre à l’identique ailleurs', async ({ page, context }) => {
  await placeDefault(page, 'Télétravail généralisé')
  await placeDefault(page, 'Politique nataliste')
  await openScenario(page)
  const dlg = page.getByRole('dialog', { name: 'Mon scénario' })
  await dlg.getByLabel('Nom').fill('Ouest et natalité')
  await dlg.getByRole('button', { name: 'Copier le lien de partage' }).click()
  const link = await dlg.getByLabel('Lien de partage').inputValue()
  expect(link).toContain('?s=')
  // un autre visiteur ouvre le lien
  const other = await context.newPage()
  await other.goto(link)
  await expect(other.locator('.map__dep')).toHaveCount(96)
  await expect(other.locator('.lanes button.block')).toHaveCount(2)
  await expect(other.locator('.toast')).toContainText('Ouest et natalité')
  await expect(other.locator('.coach')).toHaveCount(0) // pas de tutoriel pour un lien partagé
  expect(other.url()).not.toContain('?s=')
})

test('un lien abîmé affiche un message sans casser le jeu', async ({ page }) => {
  await page.goto('/?s=abime!!')
  await expect(page.locator('.map__dep')).toHaveCount(96)
  await expect(page.locator('.toast')).toContainText('illisible')
})

test('enregistrer, recharger et supprimer un scénario sur l’appareil', async ({ page }) => {
  await placeDefault(page, 'Exode urbain')
  await openScenario(page)
  const dlg = page.getByRole('dialog', { name: 'Mon scénario' })
  await dlg.getByLabel('Nom').fill('Campagne 2040')
  await dlg.getByRole('button', { name: 'Enregistrer sur cet appareil' }).click()
  await expect(dlg.getByText('Campagne 2040')).toBeVisible()
  await dlg.getByRole('button', { name: 'Tout effacer' }).click()
  await dlg.getByRole('button', { name: /Confirmer : tout effacer/ }).click()
  await expect(page.locator('.lanes .block')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.map__dep')).toHaveCount(96)
  await openScenario(page)
  await dlg.getByRole('button', { name: 'Charger Campagne 2040' }).click()
  await expect(page.locator('.lanes button.block')).toHaveCount(1)
  await openScenario(page)
  await dlg.getByRole('button', { name: 'Supprimer Campagne 2040' }).click()
  await dlg.getByRole('button', { name: 'Confirmer la suppression de Campagne 2040' }).click()
  await expect(dlg.getByText('Aucun pour l’instant')).toBeVisible()
})

test('exporter la carte en PNG, les données en CSV et le scénario en JSON, puis le réimporter', async ({ page }) => {
  await placeDefault(page, 'Canicules à répétition')
  await page.getByRole('slider', { name: 'Année affichée' }).fill('2060')
  await openScenario(page)
  const dlg = page.getByRole('dialog', { name: 'Mon scénario' })

  const [png] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Image de la carte (PNG)' }).click()])
  expect(png.suggestedFilename()).toMatch(/\.png$/)
  const pngBytes = readFileSync((await png.path())!)
  expect(pngBytes.subarray(1, 4).toString()).toBe('PNG')
  expect(pngBytes.length).toBeGreaterThan(20_000)

  const [csv] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Tous les départements (CSV)' }).click()])
  const csvText = readFileSync((await csv.path())!, 'utf8')
  expect(csvText.split('\n').filter((l) => /^\d|^2[AB]/.test(l))).toHaveLength(96)
  expect(csvText).toContain('Creuse')

  const [zone] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Données de la zone (CSV)' }).click()])
  expect(readFileSync((await zone.path())!, 'utf8').split('\n').filter((l) => /^20\d\d;|^2100;/.test(l))).toHaveLength(76)

  const [json] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Exporter le scénario (JSON)' }).click()])
  const path = (await json.path())!
  await dlg.getByRole('button', { name: 'Tout effacer' }).click()
  await dlg.getByRole('button', { name: /Confirmer : tout effacer/ }).click()
  await expect(page.locator('.lanes .block')).toHaveCount(0)
  await openScenario(page)
  await dlg.getByLabel('Fichier de scénario à importer').setInputFiles(path)
  await expect(page.locator('.lanes button.block')).toHaveCount(1)
})

test('l’aléa se règle et reste reproductible', async ({ page }) => {
  await placeDefault(page, 'Pandémie')
  await openScenario(page)
  const dlg = page.getByRole('dialog', { name: 'Mon scénario' })
  await dlg.getByRole('slider', { name: /Intensité de l’aléa/ }).fill('0.5')
  await expect(dlg.getByText('Intensité de l’aléa : 50 %')).toBeVisible()
  await expect(dlg.getByRole('button', { name: 'Nouveau tirage' })).toBeEnabled()
})

test('« Comment ça marche » : sources, limites et aucune violation d’accessibilité', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?tutoriel=0#/comment-ca-marche')
  await expect(page.getByRole('heading', { name: 'Le modèle, ses sources et ses limites' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Les limites, sans les cacher' })).toBeVisible()
  await expect(page.locator('table').first()).toContainText('Insee')
  await expect(page.locator('.badge--ok').first()).toBeVisible()
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target}`)).toEqual([])
})
