import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import type { RateDetail, StatusResponse } from './api/types.ts'
import { mockApi, readyStatus, renderApp, searchResponse, sourceFile } from './test/helpers.tsx'

afterEach(() => vi.unstubAllGlobals())

const loading: StatusResponse = {
  ...readyStatus,
  state: 'loading',
  phase: 'parsing',
  bytesDone: 44_500_000,
  bytesTotal: 89_000_000,
  fileName: 'in-network.json',
  file: null,
}

const failed: StatusResponse = {
  ...readyStatus,
  state: 'failed',
  fileName: 'in-network.json',
  error: { kind: 'parse', message: 'Unexpected end-of-input (line 9, byte 4500)' },
  file: null,
}

const detail: RateDetail = {
  id: '5-111111111',
  searchCode: '99213',
  rate: 300,
  negotiatedType: 'negotiated',
  billingClass: 'institutional',
  setting: 'outpatient',
  expirationDate: '9999-12-31',
  noEndDate: true,
  placeOfService: [{ code: '22', label: 'Outpatient hospital' }],
  modifiers: [],
  provider: {
    tin: '111111111',
    tinType: 'ein',
    tinDisplay: '11-1111111',
    name: 'Alpha Clinic',
    nameCount: 2,
    npiCount: 2,
  },
  match: {
    kind: 'additional_information',
    field: 'additional_information',
    value: '99213',
    filedUnder: { kind: 'additional_information', codeType: 'RC', code: '510' },
    itemName: 'US EXAM, ABDOM, COMPLETE',
  },
  occurrences: { count: 2, sampleItemNames: ['US EXAM, ABDOM, COMPLETE', 'ACNE SURGERY'] },
  location: {
    itemIndex: 1,
    rateIndex: 0,
    priceIndex: 0,
    providerGroupId: 1,
    path: 'in_network[1].negotiated_rates[0].negotiated_prices[0]',
  },
  npis: { total: 1, values: ['1111111111'] },
  otherNpis: { total: 1, values: ['2222222222'] },
  source: {
    indexFileName: sourceFile.indexFileName,
    indexUrl: sourceFile.indexUrl,
    reportingStructureIndex: 0,
    planGroupLabel: 'Example Care',
    planCount: 2,
    fileName: sourceFile.fileName,
    fileUrl: sourceFile.fileUrl,
    schemaVersion: '2.0.0',
    lastUpdatedOn: '2026-01-15',
  },
  raw: '{\n  "negotiated_rate" : 300.00,\n  "additional_information" : "99213"\n}',
}

test('while the rate file loads, progress is shown and search is locked', async () => {
  mockApi({ '/api/status': { body: loading } })
  renderApp(<App />)

  expect(await screen.findByRole('heading', { name: 'Loading the rate file' })).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  expect(screen.getByText(/45 MB of 89 MB/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
})

test('a file that failed to load says why and can be retried', async () => {
  const api = mockApi({
    '/api/status': { body: failed },
    'POST /api/reload': { status: 202, body: { started: true } },
  })
  renderApp(<App />)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('The rate file could not be read')
  expect(alert).toHaveTextContent('Unexpected end-of-input (line 9, byte 4500)')
  expect(screen.getByText('File not loaded')).toBeInTheDocument()

  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(api.calls).toContain('POST /api/reload'))
})

test('an unreachable server is reported instead of a blank page', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderApp(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent('The server is not answering')
})

test('once loaded, the first screen offers codes that exist in the file', async () => {
  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': {
      body: [{ code: '99213', type: 'CPT', name: null, description: null, providerCount: 3 }],
    },
  })
  const view = renderApp(<App />)

  await userEvent.setup().click(await screen.findByRole('button', { name: '99213' }))

  expect(view.location()).toBe('/?code=99213')
})

test('the address bar drives the search, and searching updates it', async () => {
  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': { body: [] },
    '/api/search': { body: searchResponse() },
  })
  const view = renderApp(<App />, '/?code=99213&class=professional&page=3')
  const user = userEvent.setup()

  expect(await screen.findByRole('heading', { name: 'Alpha Clinic' })).toBeInTheDocument()
  expect(screen.getByLabelText(/Billing code/)).toHaveValue('99213')

  // A new search starts clean: the old class and page do not carry over.
  await user.clear(screen.getByLabelText(/Billing code/))
  await user.type(screen.getByLabelText(/Billing code/), '99214')
  await user.type(screen.getByLabelText(/Provider NPI/), '1111111111')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  expect(view.location()).toBe('/?code=99214&npi=1111111111')
  // The form is not rebuilt by the search, so the keyboard stays where it was.
  expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus()
})

test('a shared link opens the same rate, and closing it keeps the search', async () => {
  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': { body: [] },
    '/api/search': { body: searchResponse() },
    '/api/rates/5-111111111': { body: detail },
  })
  const view = renderApp(<App />, '/?code=99213&rate=5-111111111')

  const panel = await screen.findByRole('complementary', { name: 'Why this matched' })
  await waitFor(() => expect(panel).toHaveTextContent('This rate is filed under revenue code 510'))
  expect(panel).toHaveTextContent('"additional_information": "99213"')
  expect(panel).toHaveTextContent('The file records this price 2 times')
  expect(panel).toHaveTextContent('in_network[1]')
  expect(panel).toHaveTextContent('negotiated_rates[0].negotiated_prices[0]')
  expect(panel).toHaveTextContent("1 of this provider's 2 NPIs")
  expect(document.getElementById('rate-5-111111111')).toHaveAttribute('aria-pressed', 'true')

  const user = userEvent.setup()
  // Escape typed in a field belongs to the field and leaves the panel open.
  await user.click(screen.getByLabelText(/Billing code/))
  await user.keyboard('{Escape}')
  expect(view.location()).toBe('/?code=99213&rate=5-111111111')

  await user.click(panel)
  await user.keyboard('{Escape}')
  expect(view.location()).toBe('/?code=99213')
})
