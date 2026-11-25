import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { SearchParams } from '../../api/queries.ts'
import {
  mockApi,
  provider,
  rate,
  renderApp,
  searchResponse,
  sourceFile,
} from '../../test/helpers.tsx'
import { ResultsView } from './ResultsView.tsx'

afterEach(() => vi.unstubAllGlobals())

const search: SearchParams = { code: '99213', sort: 'name', page: 1 }

function setup(reply: { status?: number; body: unknown }, params: SearchParams = search) {
  const api = mockApi({ '/api/search': reply })
  const handlers = {
    onSearchCode: vi.fn(),
    onRefine: vi.fn(),
    onClearProvider: vi.fn(),
    onSelectRate: vi.fn(),
  }
  renderApp(<ResultsView search={params} file={sourceFile} selectedRate={null} {...handlers} />)
  return { ...handlers, api, user: userEvent.setup() }
}

test('lists one entry per provider with its rates inline', async () => {
  setup({ body: searchResponse() })

  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('99213')
  expect(screen.getByText(/3 providers · 6 rates/)).toBeInTheDocument()

  const alpha = screen.getByRole('heading', { name: 'Alpha Clinic' }).closest('li')!
  expect(within(alpha).getByText('EIN 11-1111111 · 2 NPIs')).toBeInTheDocument()
  expect(within(alpha).getAllByRole('button')).toHaveLength(2)
  expect(within(alpha).getByText('$50.00')).toBeInTheDocument()
  expect(within(alpha).getByText('Office (11)')).toBeInTheDocument()
  expect(within(alpha).getByText('Modifier 25 · separate same-day visit')).toBeInTheDocument()
})

test('only the exception is badged: a rate filed under a revenue code', async () => {
  setup({ body: searchResponse() })
  await screen.findByRole('heading', { name: 'Alpha Clinic' })

  // Two of the three rates are filed as CPT 99213 and carry no badge at all.
  expect(screen.getAllByText(/Revenue code 510/)).toHaveLength(1)
  expect(screen.queryByText('CPT 99213')).not.toBeInTheDocument()
  expect(screen.getByText(/Rates are filed as CPT 99213 unless marked/)).toBeInTheDocument()
})

test('rates far from the median stand out and rates at it stay quiet', async () => {
  setup({ body: searchResponse() })
  await screen.findByRole('heading', { name: 'Alpha Clinic' })

  expect(screen.getByText('+50%')).toHaveClass('font-bold')
  expect(screen.getByText('At median')).toHaveClass('text-muted')
})

test('each class has its own median, and the tiles filter by class', async () => {
  const { onRefine, user } = setup({ body: searchResponse() })

  const professional = await screen.findByRole('button', { name: /Professional/ })
  expect(professional).toHaveTextContent('3 providers')
  expect(professional).toHaveTextContent('$60.00')
  expect(screen.getByRole('button', { name: /Institutional/ })).toHaveTextContent('$300.00')
  expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')

  await user.click(professional)
  expect(onRefine).toHaveBeenCalledWith({ billingClass: 'professional' })
})

test('selecting a rate asks for its detail', async () => {
  const { onSelectRate, user } = setup({ body: searchResponse() })

  const gamma = (await screen.findByRole('heading', { name: 'Gamma Health' })).closest('li')!
  await user.click(within(gamma).getByRole('button'))

  expect(onSelectRate).toHaveBeenCalledWith('4-333333333')
})

test('an NPI search names the NPI, counts hidden rates and offers to clear the filter', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, npi: '1111111111' },
    summary: {
      providers: 1,
      rates: 1,
      providersWithBothClasses: 0,
      classes: [
        { billingClass: 'professional', providers: 1, rates: 1, median: 50, min: 50, max: 50 },
      ],
    },
    providers: [provider({ matchedNpi: '1111111111', hiddenRateCount: 1, rates: [rate()] })],
    page: { page: 1, pageSize: 25, totalProviders: 1, totalPages: 1 },
  })
  const { onClearProvider, user } = setup({ body }, { ...search, npi: '1111111111' })

  expect(await screen.findByText(/2 NPIs, including/)).toHaveTextContent('1111111111')
  expect(
    screen.getByText("1 more rate applies only to this provider's other NPIs."),
  ).toBeInTheDocument()
  // The comparison stays code-wide, and a class with nothing for this provider is switched off.
  expect(screen.getByRole('button', { name: /Professional/ })).toHaveTextContent(
    'Median, all providers $60.00',
  )
  expect(screen.getByRole('button', { name: /Institutional/ })).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Clear provider filter' }))
  expect(onClearProvider).toHaveBeenCalled()
})

test('a code that is not in the file offers the closest codes', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, code: '99216' },
    code: null,
    summary: { providers: 0, rates: 0, providersWithBothClasses: 0, classes: [] },
    baseline: [],
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'code_not_in_file',
      closestCodes: [
        { code: '99213', type: 'CPT', name: null, description: null, providerCount: 3 },
      ],
      ein: null,
      npi: null,
    },
  })
  const { onSearchCode, user } = setup({ body }, { ...search, code: '99216' })

  expect(await screen.findByRole('heading', { name: 'No rates for 99216' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '99213' }))
  expect(onSearchCode).toHaveBeenCalledWith('99213')
})

test('a provider with no rates for the code is explained, and the code is kept', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, ein: '444444444', einDisplay: '44-4444444' },
    summary: { providers: 0, rates: 0, providersWithBothClasses: 0, classes: [] },
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'provider_has_no_rates_for_code',
      closestCodes: [],
      ein: {
        ein: '444444444',
        einDisplay: '44-4444444',
        inFile: true,
        name: 'Delta Practice',
        codeCount: 1,
      },
      npi: null,
    },
  })
  const { onClearProvider, user } = setup({ body }, { ...search, ein: '444444444' })

  expect(
    await screen.findByRole('heading', { name: 'No 99213 rates for this provider' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('EIN 44-4444444 is in this file as Delta Practice, with rates for 1 code.'),
  ).toBeInTheDocument()
  expect(screen.getByText('Shows all 3 providers with a 99213 rate.')).toBeInTheDocument()

  await user.click(screen.getAllByRole('button', { name: 'Clear provider filter' }).at(-1)!)
  expect(onClearProvider).toHaveBeenCalled()
})

test('an identifier that is not in the file at all says so', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, npi: '9999999999' },
    summary: { providers: 0, rates: 0, providersWithBothClasses: 0, classes: [] },
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'provider_not_in_file',
      closestCodes: [],
      ein: null,
      npi: { npi: '9999999999', inFile: false, providerCount: 0 },
    },
  })
  setup({ body }, { ...search, npi: '9999999999' })

  expect(await screen.findByText('NPI 9999999999 is not in this file.')).toBeInTheDocument()
})

test('a failed search can be retried without retyping', async () => {
  const { api, user } = setup({
    status: 500,
    body: { message: 'The server hit an unexpected error.' },
  })

  expect(await screen.findByRole('alert')).toHaveTextContent('The search did not finish')
  expect(screen.getByRole('alert')).toHaveTextContent('Your search is still filled in.')

  const before = api.calls.length
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(api.calls.length).toBeGreaterThan(before)
})

test('input the server rejects is listed field by field', async () => {
  setup(
    {
      status: 400,
      body: {
        message: 'Some inputs need fixing.',
        fields: [{ field: 'npi', message: 'An NPI has 10 digits. This has 8.' }],
      },
    },
    { ...search, npi: '18817774' },
  )

  expect(
    await screen.findByRole('heading', { name: 'This search cannot be run' }),
  ).toBeInTheDocument()
  expect(screen.getByText('An NPI has 10 digits. This has 8.')).toBeInTheDocument()
})
