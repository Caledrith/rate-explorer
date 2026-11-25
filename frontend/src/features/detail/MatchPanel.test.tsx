import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { RateDetail } from '../../api/types.ts'
import { mockApi, rateDetail, renderApp } from '../../test/helpers.tsx'
import { MatchPanel } from './MatchPanel.tsx'

afterEach(() => vi.unstubAllGlobals())

async function open(detail: RateDetail, searchedNpi: string | null = null) {
  mockApi({ [`/api/rates/${detail.id}`]: { body: detail } })
  renderApp(<MatchPanel id={detail.id} searchedNpi={searchedNpi} onClose={vi.fn()} />)
  const panel = screen.getByRole('complementary', { name: 'Why this matched' })
  await within(panel).findByText('Alpha Clinic')
  return panel
}

test('an ordinary negotiated rate with no end date says nothing about either', async () => {
  const panel = await open(rateDetail())

  expect(panel).not.toHaveTextContent(/negotiated rate/i)
  expect(panel).not.toHaveTextContent(/end date/i)
})

test('an end date or an unusual rate type is stated', async () => {
  const panel = await open(
    rateDetail({ noEndDate: false, expirationDate: '2027-06-30', negotiatedType: 'fee schedule' }),
  )

  expect(panel).toHaveTextContent('Fee schedule rate · Expires 2027-06-30')
})

test('a provider with one NPI shows it in the heading instead of a section of its own', async () => {
  const detail = rateDetail({
    npis: { total: 1, values: ['1111111111'] },
    otherNpis: { total: 0, values: [] },
  })
  detail.provider.npiCount = 1
  const panel = await open(detail)

  expect(panel).toHaveTextContent('EIN 11-1111111 · NPI 1111111111')
  expect(
    within(panel).queryByRole('heading', { name: 'NPIs this rate applies to' }),
  ).not.toBeInTheDocument()
})

test('a provider with several NPIs lists which ones the rate applies to', async () => {
  const panel = await open(rateDetail(), '1111111111')

  expect(
    within(panel).getByRole('heading', { name: 'NPIs this rate applies to' }),
  ).toBeInTheDocument()
  expect(panel).toHaveTextContent("1 of this provider's 2 NPIs")
  expect(panel).toHaveTextContent('your search')
})

test('the location is one line: the full path, labelled with the item it sits under', async () => {
  const panel = await open(rateDetail())

  expect(panel).toHaveTextContent('Price · under Revenue code 510, "US EXAM, ABDOM, COMPLETE"')
  expect(panel).toHaveTextContent('in_network[1].negotiated_rates[0].negotiated_prices[0]')
  expect(panel).not.toHaveTextContent('Billing item')
})

test('other spellings of the provider name are mentioned behind a hint', async () => {
  const panel = await open(rateDetail())

  expect(panel).not.toHaveTextContent(/spells this provider/)
  await userEvent
    .setup()
    .click(within(panel).getByRole('button', { name: "About this provider's name" }))
  expect(panel).toHaveTextContent("The file spells this provider's name 2 ways.")
})
