import { expect, test } from '@playwright/test'

test('au doigt, la poignée d’une carte la glisse sur un département', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'geste tactile : parcours téléphone')
  await page.goto('/?tutoriel=0')
  await expect(page.locator('.map__dep')).toHaveCount(101)
  await page.getByRole('button', { name: 'Événements', exact: true }).click()
  const card = page.locator('.ev-card', { hasText: 'Catastrophe naturelle' })
  await card.scrollIntoViewIfNeeded()
  const grip = card.locator('.ev-card__grip')
  await expect(grip).toBeVisible()
  const g = (await grip.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const sx = g.x + g.width / 2
  const sy = g.y + g.height / 2
  await touch('touchStart', sx, sy)
  // le tiroir se ferme au premier mouvement : on vise ensuite la Creuse sur la carte dégagée
  await touch('touchMove', sx + 10, sy + 10)
  await expect(page.locator('#bibliotheque')).not.toHaveClass(/is-open/)
  const d = (await page.locator('[data-dep="23"]').boundingBox())!
  const tx = d.x + d.width / 2
  const ty = d.y + d.height / 2
  for (let i = 1; i <= 8; i++) await touch('touchMove', sx + ((tx - sx) * i) / 8, sy + ((ty - sy) * i) / 8)
  await expect(page.locator('.ghost')).toContainText('Creuse')
  await touch('touchEnd', tx, ty)
  await expect(page.locator('.inspector select')).toHaveValue('dep:23')
})

test('au doigt, faire défiler la liste ne déclenche pas de glisser', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'geste tactile : parcours téléphone')
  await page.goto('/?tutoriel=0')
  await expect(page.locator('.map__dep')).toHaveCount(101)
  await page.getByRole('button', { name: 'Événements', exact: true }).click()
  const body = page.locator('.ev-card__summary').first()
  const b = (await body.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 40, y: b.y + 10 }] })
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 40, y: b.y + 10 - i * 30 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('.ghost')).toHaveCount(0)
  await expect(page.locator('#bibliotheque')).toHaveClass(/is-open/)
})
