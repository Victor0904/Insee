import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openLibrary(page: Page) {
  const btn = page.getByRole('button', { name: 'Événements', exact: true })
  if (await btn.isVisible()) await btn.click()
}

/** Place un événement au clavier : « Placer », puis Entrée sur la zone conseillée. */
async function placeWithKeyboard(page: Page, name: string) {
  await openLibrary(page)
  await page.getByRole('button', { name: `Placer : ${name}` }).click()
  await expect(page.getByRole('dialog', { name: `Placer : ${name}` }).getByRole('button').first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?tutoriel=0')
  await expect(page.locator('.map__dep')).toHaveCount(96)
})

test('ajouter un événement sans glisser : Placer, puis la zone conseillée au clavier', async ({ page }) => {
  await placeWithKeyboard(page, 'Politique nataliste')
  await expect(page.locator('.lanes .block')).toHaveCount(1)
  // la carte passe d'elle-même en écart avec la référence
  await expect(page.getByLabel('La carte montre')).toHaveValue('delta')
  await page.getByRole('button', { name: 'Terminé' }).click()
  // le récit apparaît quand le temps avance
  await page.getByRole('slider', { name: 'Année affichée' }).fill('2050')
  if (await page.getByRole('button', { name: 'Analyse' }).isVisible()) await page.getByRole('button', { name: 'Analyse' }).click()
  await expect(page.locator('.story__line').first()).toBeVisible()
  await expect(page.locator('.zone__compare .chip--gain')).toBeVisible()
})

test('glisser une carte sur un département le choisit comme zone', async ({ page, isMobile }) => {
  test.skip(isMobile, 'glisser-déposer à la souris : parcours ordinateur')
  const card = page.locator('.ev-card', { hasText: 'Catastrophe naturelle' })
  await card.scrollIntoViewIfNeeded()
  const cb = (await card.boundingBox())!
  const db = (await page.locator('[data-dep="23"]').boundingBox())! // Creuse (23) — 2A et 2B décalent les indices
  await page.mouse.move(cb.x + 30, cb.y + 30)
  await page.mouse.down()
  await page.mouse.move(cb.x + 90, cb.y + 60, { steps: 4 })
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 12 })
  await expect(page.locator('.ghost')).toContainText('Creuse')
  await page.mouse.up()
  await expect(page.locator('.inspector select')).toHaveValue('dep:23')
})

test('annuler et rétablir au clavier, avec l’historique', async ({ page }) => {
  await placeWithKeyboard(page, 'Pandémie')
  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(page.locator('.lanes .block')).toHaveCount(2) // pandémie + rattrapage des naissances
  await page.keyboard.press('Control+z')
  await expect(page.locator('.lanes .block')).toHaveCount(0)
  await page.keyboard.press('Control+y')
  await expect(page.locator('.lanes .block')).toHaveCount(2)
  const menu = page.getByRole('button', { name: 'Menu des outils' })
  if (await menu.isVisible()) return // l'historique détaillé est réservé aux écrans plus larges
  await page.getByRole('button', { name: 'Historique des actions' }).click()
  await expect(page.getByRole('region', { name: 'Historique des actions' })).toContainText('Ajout : Pandémie')
})

test('un bloc de la frise se déplace au clavier', async ({ page }) => {
  await placeWithKeyboard(page, 'Exode urbain')
  await page.getByRole('button', { name: 'Terminé' }).click()
  const block = page.locator('.lanes button.block')
  await block.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(block).toHaveAccessibleName(/de 2027 à/)
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(block).toHaveAccessibleName(/de 2027 à 2041/)
  await page.keyboard.press('Delete')
  await expect(page.locator('.lanes .block')).toHaveCount(0)
})

test('créer son propre événement avec des curseurs simples', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: 'Créer mon événement' }).click()
  const dlg = page.getByRole('dialog', { name: 'Créer mon événement' })
  await dlg.getByLabel('Nom').fill('Bébés en Bretagne')
  await dlg.getByLabel(/Naissances/).fill('30')
  await expect(dlg.locator('.custom__preview')).toContainText('+')
  await dlg.getByRole('button', { name: 'Créer et placer' }).click()
  await expect(page.getByRole('dialog', { name: 'Placer : Bébés en Bretagne' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Toute la France/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.lanes .block')).toHaveCount(1)
  await expect(page.locator('.lanes .block')).toHaveAccessibleName(/Bébés en Bretagne/)
})

test('aucune violation d’accessibilité avec un événement et sa fiche ouverte', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await placeWithKeyboard(page, 'Télétravail généralisé')
  await expect(page.locator('.inspector')).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} — ${v.help} — ${v.nodes[0]?.target}`)).toEqual([])
})
