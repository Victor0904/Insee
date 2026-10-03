import { chromium } from '@playwright/test'
const [,, out, w, h, scheme, actions] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme })
const logs = []
p.on('console', (m) => { if (['error','warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`) })
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
await p.goto('http://localhost:5173/')
await p.waitForSelector('.map__dep', { timeout: 30000 }).catch(() => logs.push('timeout'))
if (actions === 'play') { await p.getByRole('button', { name: 'Lancer le temps' }).click(); await p.waitForTimeout(4000) }
if (actions === 'drawer') { await p.locator('.stage__open-panel').click(); await p.waitForTimeout(400) }
await p.waitForTimeout(500)
await p.screenshot({ path: out })
const info = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, deps: document.querySelectorAll('.map__dep').length, year: document.querySelector('.timeline__year')?.textContent }))
console.log(JSON.stringify({ ...info, logs }))
await b.close()
