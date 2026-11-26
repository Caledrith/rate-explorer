import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { SearchParams } from '../../api/queries.ts'
import {
  mockApi,
  provider,
  rate,
  rateDetail,
  renderApp,
  searchResponse,
} from '../../test/helpers.tsx'
import { ResultsView } from './ResultsView.tsx'

afterEach(() => vi.unstubAllGlobals())

const search: SearchParams = { code: '99213', sort: 'name', page: 1 }

const emptySummary = {
  providers: 0,
  rates: 0,
  providersWithBothClasses: 0,
  distinctSettings: 0,
  distinctNegotiatedTypes: 0,
  classes: [],
}

function setup(reply: { status?: number; body: unknown }, params: SearchParams = search) {
  const api = mockApi({ '/api/search': reply })
  const handlers = {
    onSearchCode: vi.fn(),
    onRefine: vi.fn(),
    onClearProvider: vi.fn(),
    onSelectRate: vi.fn(),
  }
  renderApp(<ResultsView search={params} selectedRate={null} {...handlers} />)
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
  // The list shows the code; what the modifier means is left to the detail panel.
  expect(within(alpha).getByText('Modifier 25')).toBeInTheDocument()
  expect(screen.queryByText(/separate same-day visit/)).not.toBeInTheDocument()
})

/** A search answer that the test delivers when it chooses to. */
function heldAnswer() {
  let deliver!: (answer: { body: unknown }) => void
  const answer = new Promise<{ body: unknown }>((resolve) => (deliver = resolve))
  return { reply: () => answer, deliver }
}

const idle = {
  onSearchCode: vi.fn(),
  onRefine: vi.fn(),
  onClearProvider: vi.fn(),
  onSelectRate: vi.fn(),
}

test('the first search keeps what was on screen until its answer arrives', async () => {
  const held = heldAnswer()
  mockApi({ '/api/search': held.reply })
  renderApp(
    <ResultsView search={search} selectedRate={null} before={<p>Start screen</p>} {...idle} />,
  )

  // Still there, marked as busy, and not swapped for placeholder rows.
  expect(screen.getByText('Start screen')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Searching for 99213…')
  expect(screen.queryByRole('status', { name: 'Searching' })).not.toBeInTheDocument()

  held.deliver({ body: searchResponse() })

  expect(await screen.findByRole('heading', { name: 'Alpha Clinic' })).toBeInTheDocument()
  expect(screen.queryByText('Start screen')).not.toBeInTheDocument()
})

test('a page opened straight onto a search has nothing to keep, and shows placeholder rows', async () => {
  const held = heldAnswer()
  mockApi({ '/api/search': held.reply })
  renderApp(<ResultsView search={search} selectedRate={null} {...idle} />)

  expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument()

  held.deliver({ body: searchResponse() })
  expect(await screen.findByRole('heading', { name: 'Alpha Clinic' })).toBeInTheDocument()
})

test('only the exception is badged: a rate filed under a revenue code', async () => {
  const { user } = setup({ body: searchResponse() })
  await screen.findByRole('heading', { name: 'Alpha Clinic' })

  // Two of the three rates are filed as CPT 99213 and carry no badge at all.
  expect(screen.getAllByText(/Revenue code 510/)).toHaveLength(1)
  expect(screen.queryByText('CPT 99213')).not.toBeInTheDocument()
  // The legend for the unbadged rates is one click away, on the column heading.
  expect(screen.queryByText(/Blank means the rate is filed as CPT 99213/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'What the Filed under column means' }))
  expect(screen.getByText(/Blank means the rate is filed as CPT 99213/)).toBeInTheDocument()
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

test('with a rate open, the arrow keys step through the rates in list order', async () => {
  const onSelectRate = vi.fn()
  mockApi({
    '/api/search': { body: searchResponse() },
    '/api/rates/5-111111111': { body: rateDetail() },
  })
  renderApp(
    <ResultsView
      search={search}
      selectedRate="5-111111111"
      {...idle}
      onSelectRate={onSelectRate}
    />,
  )
  await screen.findByRole('heading', { name: 'Gamma Health' })
  const user = userEvent.setup()

  await user.keyboard('{ArrowDown}')
  expect(onSelectRate).toHaveBeenLastCalledWith('4-333333333')
  // Held keys arrive faster than the page redraws; each still counts, and the list has an end.
  await user.keyboard('{ArrowDown}')
  expect(onSelectRate).toHaveBeenCalledTimes(1)
  await user.keyboard('{ArrowUp}{ArrowUp}')
  expect(onSelectRate).toHaveBeenCalledTimes(3)
  expect(onSelectRate).not.toHaveBeenCalledWith(null)

  // In a field the arrows belong to the field.
  onSelectRate.mockClear()
  await user.click(screen.getByRole('searchbox', { name: 'Provider name' }))
  await user.keyboard('{ArrowDown}')
  expect(onSelectRate).not.toHaveBeenCalled()
})

test('with no rate open, the arrow keys are left alone', async () => {
  const { onSelectRate, user } = setup({ body: searchResponse() })
  await screen.findByRole('heading', { name: 'Gamma Health' })

  await user.keyboard('{ArrowDown}')

  expect(onSelectRate).not.toHaveBeenCalled()
})

test('typing part of a provider name narrows the list without adding to history', async () => {
  const { onRefine, user } = setup({ body: searchResponse() })
  await screen.findByRole('heading', { name: 'Gamma Health' })

  await user.type(screen.getByRole('searchbox', { name: 'Provider name' }), 'gam')

  await vi.waitFor(() => expect(onRefine).toHaveBeenCalledWith({ name: 'gam' }, { replace: true }))
})

test('a name that finds nothing says so and stays editable', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, name: 'zebra' },
    summary: { ...emptySummary },
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'provider_not_in_file',
      closestCodes: [],
      ein: null,
      npi: null,
      name: { name: 'zebra', providerCount: 0 },
    },
  })
  setup({ body }, { ...search, name: 'zebra' })

  expect(
    await screen.findByRole('heading', { name: 'No 99213 rates for a provider with that name' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('No provider in this file has a name containing "zebra".'),
  ).toBeInTheDocument()
  // The box is still there to correct the name; sorting an empty list is not offered.
  expect(screen.getByRole('searchbox', { name: 'Provider name' })).toHaveValue('zebra')
  expect(screen.queryByLabelText(/^Sort/)).not.toBeInTheDocument()
})

test('a name some providers have, but none with this code, says how many', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, name: 'lab' },
    summary: { ...emptySummary },
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'provider_has_no_rates_for_code',
      closestCodes: [],
      ein: null,
      npi: null,
      name: { name: 'lab', providerCount: 6 },
    },
  })
  setup({ body }, { ...search, name: 'lab' })

  expect(
    await screen.findByText('6 providers in this file have a name containing "lab".'),
  ).toBeInTheDocument()
  expect(screen.getByText('None of them has a 99213 rate.')).toBeInTheDocument()
})

test('a new page of providers is shown from its top', async () => {
  // The paging controls are at the bottom, so the top of the list is above the window.
  const scrolled = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: -900 } as DOMRect)
  HTMLElement.prototype.scrollIntoView = scrolled
  const second = searchResponse({
    query: { ...searchResponse().query, page: 2 },
    page: { page: 2, pageSize: 25, totalProviders: 60, totalPages: 3 },
  })
  mockApi({
    '/api/search?code=99213&sort=name&page=1&pageSize=25': {
      body: searchResponse({ page: { page: 1, pageSize: 25, totalProviders: 60, totalPages: 3 } }),
    },
    '/api/search?code=99213&sort=name&page=2&pageSize=25': { body: second },
  })
  function Paged() {
    const [page, setPage] = useState(1)
    return (
      <ResultsView
        search={{ ...search, page }}
        selectedRate={null}
        {...idle}
        onRefine={(change) => setPage(change.page ?? 1)}
      />
    )
  }
  renderApp(<Paged />)
  await screen.findByText('Page 1 of 3')
  expect(scrolled).not.toHaveBeenCalled()

  await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }))

  await screen.findByText('Page 2 of 3')
  expect(scrolled).toHaveBeenCalledWith({ block: 'start' })
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

test('an NPI search names the NPI, counts hidden rates and offers to clear the filter', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, npi: '1111111111' },
    summary: {
      ...emptySummary,
      providers: 1,
      rates: 1,
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
    summary: { ...emptySummary },
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
      name: null,
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
    summary: { ...emptySummary },
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
      name: null,
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

  // One button, in the notice: the filter bar does not repeat it.
  await user.click(screen.getByRole('button', { name: 'Clear provider filter' }))
  expect(onClearProvider).toHaveBeenCalled()
})

test('an identifier that is not in the file at all says so', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, npi: '9999999999' },
    summary: { ...emptySummary },
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'provider_not_in_file',
      closestCodes: [],
      ein: null,
      npi: { npi: '9999999999', inFile: false, providerCount: 0 },
      name: null,
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

test('a provider whose NPI entries are all invalid says so instead of counting zero', async () => {
  const body = searchResponse({
    providers: [provider({ npiCount: 0, rates: [rate({ npiCount: 0 })] })],
  })
  setup({ body })

  expect(await screen.findByText('EIN 11-1111111 · no NPI listed')).toBeInTheDocument()
  expect(screen.queryByText(/0 NPIs/)).not.toBeInTheDocument()
  expect(screen.queryByText(/0 of/)).not.toBeInTheDocument()
})

test('a rate that has no NPI among a provider that has some is marked', async () => {
  const body = searchResponse({
    providers: [provider({ npiCount: 1, rates: [rate({ npiCount: 0 })] })],
  })
  setup({ body })

  expect(await screen.findByText(/no NPI listed/)).toBeInTheDocument()
})

test('setting and negotiated type appear on each rate only when the result has more than one', async () => {
  const mixed = searchResponse()
  mixed.summary.distinctSettings = 2
  mixed.summary.distinctNegotiatedTypes = 2
  setup({ body: mixed })

  expect(await screen.findByText('outpatient · Modifier 25 · negotiated rate')).toBeInTheDocument()
})

test('an NPI that is in the file but has no rate for the code is explained in NPI terms', async () => {
  const body = searchResponse({
    query: { ...searchResponse().query, npi: '5555555555' },
    summary: { ...emptySummary },
    providers: [],
    page: { page: 1, pageSize: 25, totalProviders: 0, totalPages: 0 },
    noResults: {
      reason: 'provider_has_no_rates_for_code',
      closestCodes: [],
      ein: null,
      npi: { npi: '5555555555', inFile: true, providerCount: 3 },
      name: null,
    },
  })
  setup({ body }, { ...search, npi: '5555555555' })

  expect(
    await screen.findByText('NPI 5555555555 is in this file under 3 providers.'),
  ).toBeInTheDocument()
  expect(screen.getByText('It has no 99213 rate with any of them.')).toBeInTheDocument()
})

test('the instruction to select a rate shows until a rate has been opened once', async () => {
  setup({ body: searchResponse() })

  expect(await screen.findByText(/a rate to see where it came from/)).toBeInTheDocument()
})

test('once a rate has been opened in this browser, the instruction is gone', async () => {
  localStorage.setItem('rate-explorer.opened-a-rate', '1')
  setup({ body: searchResponse() })

  await screen.findByRole('heading', { name: 'Alpha Clinic' })
  expect(screen.queryByText(/a rate to see where it came from/)).not.toBeInTheDocument()
})

test("the heading shows the counts, and the file's long description is behind a hint", async () => {
  const { user } = setup({ body: searchResponse() })

  expect(await screen.findByText('3 providers · 6 rates')).toBeInTheDocument()
  expect(screen.queryByText(/Office or other outpatient visit/)).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: "The file's description of this code" }))
  expect(
    screen.getByText(/Office or other outpatient visit, established patient/),
  ).toBeInTheDocument()
})

test('how the comparison and the provider counts work is explained on request', async () => {
  const { user } = setup({ body: searchResponse() })
  await screen.findByRole('heading', { name: 'Alpha Clinic' })

  await user.click(screen.getByRole('button', { name: 'How rates are compared with the median' }))
  expect(screen.getByText(/compared with the median for its billing class/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'About the provider counts' }))
  expect(
    screen.getByText(/2 providers have both professional and institutional rates/),
  ).toBeInTheDocument()
})
