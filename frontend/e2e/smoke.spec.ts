import { expect, test, type Page } from '@playwright/test'

async function searchFor(page: Page, fields: { code?: string; npi?: string; ein?: string }) {
  if (fields.code !== undefined) await page.getByLabel(/Billing code/).fill(fields.code)
  if (fields.npi !== undefined) await page.getByLabel(/Provider NPI/).fill(fields.npi)
  if (fields.ein !== undefined) await page.getByLabel(/Provider EIN/).fill(fields.ein)
  await page.getByRole('button', { name: 'Search' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // The backend loads the rate file in the background after it starts.
  await expect(page.getByText('File loaded')).toBeVisible({ timeout: 60_000 })
})

test('search by code, open a rate, and trace it to the file', async ({ page }) => {
  await searchFor(page, { code: '99213' })

  await expect(page.getByRole('heading', { level: 1 })).toContainText('99213')
  await expect(page.getByText(/3 providers · 6 rates/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Alpha Clinic' })).toBeVisible()
  // Only the two facility rates are badged; the four filed as CPT 99213 are not.
  await expect(page.getByText('Revenue code 510')).toHaveCount(2)

  const alpha = page.getByRole('listitem').filter({ hasText: 'Alpha Clinic' })
  await alpha.getByRole('button', { name: /\$300\.00/ }).click()

  const panel = page.getByRole('complementary', { name: 'Why this matched' })
  await expect(panel).toContainText('This rate is filed under revenue code 510')
  await expect(panel).toContainText('The file records this price 2 times')
  await expect(panel).toContainText('in_network[1]')
  await expect(page).toHaveURL(/rate=/)

  // The open rate is part of the address, so a reload lands on the same view.
  await page.reload()
  await expect(panel).toContainText('negotiated_rates[0].negotiated_prices[0]')

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/rate=/)
})

test('an NPI narrows providers and hides rates that do not apply to it', async ({ page }) => {
  await searchFor(page, { code: '99213', npi: '1111111111' })

  await expect(page.getByRole('heading', { name: 'Alpha Clinic' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beta Hospital' })).toHaveCount(0)
  await expect(
    page.getByText("1 more rate applies only to this provider's other NPIs."),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Clear provider filter' }).click()
  await expect(page.getByRole('heading', { name: 'Beta Hospital' })).toBeVisible()
})

test('empty results explain themselves and offer a way out', async ({ page }) => {
  // A provider that is in the file but has no rate for this code.
  await searchFor(page, { code: '99213', ein: '44-4444444' })
  await expect(
    page.getByRole('heading', { name: 'No 99213 rates for this provider' }),
  ).toBeVisible()
  await expect(page.getByText(/in this file as Delta Practice/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear provider filter' }).click()
  await expect(page.getByRole('heading', { name: 'Gamma Health' })).toBeVisible()

  // A code that is not in the file suggests the closest ones.
  await searchFor(page, { code: '99216' })
  await expect(page.getByRole('heading', { name: 'No rates for 99216' })).toBeVisible()
  await page.getByRole('button', { name: '99214', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('99214')
  await expect(page.getByRole('heading', { name: 'Gamma Health' })).toBeVisible()
})

test('invalid input is caught beside the field', async ({ page }) => {
  await searchFor(page, { code: '99213', npi: '18817774' })

  await expect(page.getByText('An NPI has 10 digits. This has 8.')).toBeVisible()
  await expect(page).not.toHaveURL(/code=/)
})

test('at phone width the search collapses and the detail takes the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await searchFor(page, { code: '99213' })

  await expect(page.getByRole('button', { name: 'Edit search' })).toBeVisible()
  await expect(page.getByLabel(/Billing code/)).toBeHidden()

  // The note on reading the list hangs from a "?" in the middle of a line. It has to
  // stay on the screen rather than widen the page.
  await page.getByRole('button', { name: 'How to read this list' }).click()
  const note = await page.getByText(/Each rate is compared with the median/).boundingBox()
  expect(note!.x).toBeGreaterThanOrEqual(0)
  expect(note!.x + note!.width).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.keyboard.press('Escape')

  await page.getByRole('listitem').filter({ hasText: 'Gamma Health' }).getByRole('button').click()
  const panel = page.getByRole('complementary', { name: 'Why this matched' })
  await expect(panel).toContainText('This rate is filed as CPT 99213')
  const box = await panel.boundingBox()
  expect(box?.width).toBe(390)

  await panel.getByRole('button', { name: /Results/ }).click()
  await expect(panel).toBeHidden()

  // Nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('an open rate sits beside the list only where the list still has room', async ({ page }) => {
  // Wide enough for the table, but not for the table and the panel side by side.
  await page.setViewportSize({ width: 1100, height: 800 })
  await searchFor(page, { code: '99213' })
  await page.getByRole('listitem').filter({ hasText: 'Gamma Health' }).getByRole('button').click()

  const panel = page.getByRole('complementary', { name: 'Why this matched' })
  await expect(panel).toBeVisible()
  // The panel takes the screen; squeezing the list in beside it left its columns unreadable.
  await expect(page.getByRole('heading', { name: 'Gamma Health' })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1100)

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gamma Health' })).toBeVisible()
})
