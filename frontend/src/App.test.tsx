import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import type { StatusResponse } from './api/types.ts'
import { mockApi, rateDetail, readyStatus, renderApp, searchResponse } from './test/helpers.tsx'

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

const detail = rateDetail()

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

test('the first search leaves the start screen in place until the results are ready', async () => {
  let deliver!: (answer: { body: unknown }) => void
  const answer = new Promise<{ body: unknown }>((resolve) => (deliver = resolve))
  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': { body: [] },
    '/api/search': () => answer,
  })
  renderApp(<App />)
  const user = userEvent.setup()

  await user.type(await screen.findByLabelText(/Billing code/), '99213')
  await user.click(screen.getByRole('button', { name: 'Search' }))

  // The search is under way, and the page has not been emptied to wait for it.
  expect(await screen.findByText('Searching for 99213…')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Look up a negotiated rate' })).toBeInTheDocument()

  deliver({ body: searchResponse() })

  expect(await screen.findByRole('heading', { name: 'Alpha Clinic' })).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Look up a negotiated rate' }),
  ).not.toBeInTheDocument()
})

test('the header says which file is loaded and leads to the details', async () => {
  mockApi({ '/api/status': { body: readyStatus }, '/api/codes': { body: [] } })
  renderApp(<App />)

  const status = await screen.findByRole('button', { name: /^File loaded/ })
  expect(status).toHaveTextContent(
    `File loaded: ${readyStatus.file!.planGroupLabel} plans, dated ${readyStatus.file!.lastUpdatedOn}`,
  )
  const about = screen.getByText('About this data', { selector: 'summary' }).closest('details')!
  expect(about).not.toHaveAttribute('open')

  await userEvent.setup().click(status)

  expect(about).toHaveAttribute('open')
})

test('the start screen names the codes it suggests', async () => {
  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': {
      body: [
        {
          code: '90837',
          type: 'CPT',
          name: 'PSYTX W PT 60 MINUTES',
          description: null,
          providerCount: 9,
        },
      ],
    },
  })
  const view = renderApp(<App />)

  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: '90837 Psytx w pt 60 minutes' }))

  expect(view.location()).toBe('/?code=90837')
})

test('a provider name in the address bar is part of the search, and clearing the filter drops it', async () => {
  const api = mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': { body: [] },
    '/api/search': {
      body: searchResponse({
        query: { ...searchResponse().query, npi: '1111111111', name: 'alpha' },
      }),
    },
  })
  const view = renderApp(<App />, '/?code=99213&npi=1111111111&name=alpha')

  await screen.findByRole('heading', { name: 'Alpha Clinic' })
  expect(api.calls.some((call) => call.includes('name=alpha'))).toBe(true)
  expect(screen.getByRole('searchbox', { name: 'Provider name' })).toHaveValue('alpha')

  await userEvent.setup().click(screen.getByRole('button', { name: 'Clear provider filter' }))

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
  // The panel leaves, and the keyboard is back on the rate it was opened from.
  await waitFor(() => expect(panel).not.toBeInTheDocument())
  expect(document.getElementById('rate-5-111111111')).toHaveFocus()
})

test('a panel that closes because the list changed does not take the keyboard with it', async () => {
  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': { body: [] },
    '/api/search': { body: searchResponse() },
    '/api/rates/5-111111111': { body: detail },
  })
  const view = renderApp(<App />, '/?code=99213&rate=5-111111111')
  const panel = await screen.findByRole('complementary', { name: 'Why this matched' })
  const user = userEvent.setup()

  // Re-sorting may move or remove the open rate, so the panel closes.
  await user.selectOptions(screen.getByLabelText('Sort'), 'rate_desc')

  expect(view.location()).toBe('/?code=99213&sort=rate_desc')
  await waitFor(() => expect(panel).not.toBeInTheDocument())
  expect(screen.getByLabelText('Sort')).toHaveFocus()
})

test('a new search keeps the previous results on screen until the next ones arrive', async () => {
  // The answer for the second code is held back so the in-between state can be observed.
  let release: (answer: { body: unknown }) => void = () => {}
  const held = new Promise<{ body: unknown }>((resolve) => (release = resolve))
  const second = searchResponse()
  second.query.code = '99214'
  second.providers = [second.providers[1]!]

  mockApi({
    '/api/status': { body: readyStatus },
    '/api/codes': { body: [] },
    '/api/search?code=99213&sort=name&page=1&pageSize=25': { body: searchResponse() },
    '/api/search?code=99214&sort=name&page=1&pageSize=25': () => held,
  })
  renderApp(<App />, '/?code=99213')
  const user = userEvent.setup()
  expect(await screen.findByRole('heading', { name: 'Alpha Clinic' })).toBeInTheDocument()

  await user.clear(screen.getByLabelText(/Billing code/))
  await user.type(screen.getByLabelText(/Billing code/), '99214')
  await user.click(screen.getByRole('button', { name: 'Search' }))

  // No placeholder replaces the page: the earlier results are still there, marked as busy.
  expect(screen.getByRole('heading', { name: 'Alpha Clinic' })).toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Searching' })).not.toBeInTheDocument()
  expect(screen.getByText('Searching for 99214…')).toBeInTheDocument()

  release({ body: second })
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('99214'))
  expect(screen.queryByRole('heading', { name: 'Alpha Clinic' })).not.toBeInTheDocument()
  expect(screen.queryByText('Searching for 99214…')).not.toBeInTheDocument()
})
