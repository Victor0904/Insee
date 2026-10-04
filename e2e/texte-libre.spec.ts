import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openLibrary(page: Page) {
  const btn = page.getByRole('button', { name: 'Événements', exact: true })
  if (await btn.isVisible()) await btn.click()
}

test('sans le mode test, « Décrire un événement » n’apparaît pas', async ({ page }) => {
  await page.goto('/?tutoriel=0&test=0')
  await expect(page.locator('.map__dep')).toHaveCount(101)
  await openLibrary(page)
  await expect(page.getByRole('button', { name: /Créer mon événement/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Décrire un événement/ })).toHaveCount(0)
})

test('mode test : une phrase devient un événement simulé', async ({ page }) => {
  await page.goto('/?tutoriel=0&test=1')
  await expect(page.locator('.map__dep')).toHaveCount(101)
  await openLibrary(page)
  await page.getByRole('button', { name: /Décrire un événement/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Décrire un événement' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Votre événement').fill('L’immigration devient très régulée et il n’est plus possible pour un étranger de venir en France et de voter')
  await expect(dialog.getByText('Solde migratoire avec l’étranger ramené à zéro', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Pas pris en compte')).toBeVisible()
  await expect(dialog.getByText('Variante Insee')).toBeVisible()

  const axe = await new AxeBuilder({ page }).include('.textev').analyze()
  expect(axe.violations).toEqual([])

  await dialog.getByRole('button', { name: 'Ajouter au scénario' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.lanes .block')).toHaveCount(1)
  await expect(page.locator('.lanes .block')).toContainText('Solde migratoire nul')
})

test('mode test : un événement personnalisé avec lieu et date', async ({ page }) => {
  await page.goto('/?tutoriel=0&test=1')
  await expect(page.locator('.map__dep')).toHaveCount(101)
  await openLibrary(page)
  await page.getByRole('button', { name: /Décrire un événement/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Décrire un événement' })
  await dialog.getByRole('button', { name: /Les Parisiens partent s’installer à Bordeaux/ }).click()
  await expect(dialog.getByText('partent vers « Bordeaux »', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Ajouter au scénario' }).click()
  await expect(page.locator('.lanes .block')).toHaveCount(1)
  await expect(page.locator('.lanes .block')).toContainText('Les Parisiens partent')
})
