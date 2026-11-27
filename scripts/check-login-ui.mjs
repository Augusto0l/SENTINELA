import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Uses an existing local server; never sends credentials or contacts Supabase.
const origin = process.env.LOGIN_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
const output = 'docs/evidencias/login-sprint4'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
})
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // Development tooling is excluded from evidence, without changing the app.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  const records = []
  for (const [width, height] of [[1920,1080], [1440,900], [768,1024], [390,844], [320,800]]) {
    await page.setViewportSize({ width, height })
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      height: document.documentElement.scrollHeight,
      bounds: [...document.querySelectorAll('main section, form input, form button, form a')]
        .filter(element => element.getClientRects().length)
        .map(element => { const r = element.getBoundingClientRect(); return { tag: element.tagName, left: r.left, right: r.right } }),
      logos: [...document.querySelectorAll('svg[aria-label="Escudo SENTINELA"]')]
        .filter(svg => svg.getBoundingClientRect().width)
        .map(svg => { const b = svg.querySelector('text').getBBox(); return { centerX: b.x + b.width / 2, centerY: b.y + b.height / 2 } }),
      title: document.querySelector('h1')?.textContent,
    }))
    assert.ok(metrics.scroll <= width, `${width}: document overflow`)
    for (const r of metrics.bounds) assert.ok(r.left >= 0 && r.right <= width, `${width}: clipped ${r.tag}`)
    for (const logo of metrics.logos) {
      assert.ok(Math.abs(logo.centerX - 18) < .25)
      assert.ok(Math.abs(logo.centerY - 22.5) < .25)
    }
    assert.equal(metrics.title, 'Acesse sua conta')
    await page.screenshot({ path: `${output}/login-${width}.png`, fullPage: true })
    records.push({ viewport: { width, height }, ...metrics })
  }
  const password = page.locator('#auth-password')
  await page.getByRole('button', { name: 'Mostrar senha' }).click()
  assert.equal(await password.getAttribute('type'), 'text')
  await page.getByRole('button', { name: 'Ocultar senha' }).click()
  assert.equal(await password.getAttribute('type'), 'password')
  assert.ok(await page.getByRole('checkbox').isDisabled())
  assert.ok(await page.getByRole('checkbox').isChecked())
  assert.equal(await page.getByRole('link', { name: 'Esqueci minha senha?' }).getAttribute('href'), '/recuperar-senha')
  await page.getByRole('button', { name: 'Mostrar senha' }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.locator(':focus').textContent(), 'Esqueci minha senha?')
  const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme)
  const background = await page.locator('main').evaluate(element => getComputedStyle(element).backgroundColor)
  await page.evaluate(() => { document.documentElement.dataset.theme = 'claro' })
  assert.equal(await page.locator('main').evaluate(element => getComputedStyle(element).backgroundColor), background)
  await page.evaluate(theme => {
    if (theme === undefined) delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, originalTheme)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await password.evaluate(element => getComputedStyle(element).transitionDuration), '0s')
  const configured = !(await page.locator('#auth-email').isDisabled())
  if (!configured) assert.ok(await page.getByRole('button', { name: 'Entrar', exact: true }).isDisabled())
  // Navigation only: do not submit the recovery form.
  await page.getByRole('link', { name: 'Esqueci minha senha?' }).click()
  await page.waitForURL('**/recuperar-senha')
  assert.equal(await page.locator('h1').textContent(), 'Recuperar acesso')
  await writeFile(`${output}/visual-metrics.json`, JSON.stringify({ records, interactions: 'passed', configured, realAuthTested: false }, null, 2) + '\n')
  console.log(`Login: ${records.length} viewports, bounds, shield centers, visibility, keyboard, recovery, theme and reduced motion passed. Auth configured: ${configured}; no sign-in attempted.`)
} finally {
  await browser.close()
}
