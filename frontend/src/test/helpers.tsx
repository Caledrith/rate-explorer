import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { vi } from 'vitest'
import type {
  ProviderResult,
  RateDetail,
  RateLine,
  SearchResponse,
  SourceFile,
  StatusResponse,
} from '../api/types.ts'

type Answer = { status?: number; body: unknown }
/** A canned answer, or a function producing one. The function may return a promise to hold a request open. */
type Reply = Answer | (() => Answer | Promise<Answer>)

/**
 * Replaces fetch with canned answers keyed by "METHOD /path?query" or just "/path".
 * Unknown requests fail loudly so a test cannot pass by accident.
 */
export function mockApi(replies: Record<string, Reply>) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url}`)
    const path = url.split('?')[0]!
    const reply =
      replies[`${method} ${url}`] ?? replies[url] ?? replies[`${method} ${path}`] ?? replies[path]
    if (!reply) throw new TypeError(`Unexpected request in test: ${method} ${url}`)
    const { status = 200, body } = typeof reply === 'function' ? await reply() : reply
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

/** Renders inside the same providers as main.tsx, starting at the given address. */
export function renderApp(ui: ReactElement, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let location = route
  function Probe() {
    const current = useLocation()
    location = current.pathname + current.search
    return null
  }
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, location: () => location }
}

// ---- Sample data in the API's shape ----

export const sourceFile: SourceFile = {
  id: 1,
  indexUrl: 'https://example.test/index.json',
  indexFileName: 'index.json',
  reportingStructureIndex: 0,
  planGroupLabel: 'Example Care',
  planCount: 2,
  fileUrl: 'https://example.test/in-network.json',
  fileName: 'in-network.json',
  fileDescription: 'in-network file',
  reportingEntityName: 'Example Health Plan',
  reportingEntityType: 'Health Insurance Issuer',
  schemaVersion: '2.0.0',
  lastUpdatedOn: '2026-01-15',
  byteSize: 89_000_000,
  ingestedAt: '2026-01-16T00:00:00Z',
  codeCount: 4,
  providerCount: 4,
  stats: {
    items: 5,
    prices: 9,
    providerGroups: 6,
    pricesMatchedByAdditionalInformation: 2,
    skippedNpis: 1,
  },
}

export const readyStatus: StatusResponse = {
  state: 'ready',
  phase: null,
  bytesDone: null,
  bytesTotal: null,
  fileName: null,
  error: null,
  warning: null,
  file: sourceFile,
}

export function rate(overrides: Partial<RateLine> = {}): RateLine {
  return {
    id: '1-111111111',
    rate: 50,
    negotiatedType: 'negotiated',
    vsMedianPercent: -17,
    billingClass: 'professional',
    setting: 'outpatient',
    placeOfService: [{ code: '11', label: 'Office' }],
    modifiers: [{ code: '25', label: 'separate same-day visit' }],
    filedUnder: { kind: 'billing_code', codeType: 'CPT', code: '99213' },
    npiCount: 2,
    occurrences: 1,
    ...overrides,
  }
}

export function provider(overrides: Partial<ProviderResult> = {}): ProviderResult {
  return {
    tin: '111111111',
    tinType: 'ein',
    tinDisplay: '11-1111111',
    name: 'Alpha Clinic',
    npiCount: 2,
    matchedNpi: null,
    hiddenRateCount: 0,
    rates: [rate()],
    ...overrides,
  }
}

export function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  const classes = [
    { billingClass: 'professional', providers: 3, rates: 4, median: 60, min: 50, max: 90 },
    { billingClass: 'institutional', providers: 2, rates: 2, median: 300, min: 300, max: 300 },
  ]
  return {
    query: {
      code: '99213',
      npi: null,
      ein: null,
      einDisplay: null,
      name: null,
      billingClass: null,
      sort: 'name',
      page: 1,
      pageSize: 25,
    },
    code: {
      code: '99213',
      type: 'CPT',
      name: 'OFFICE/OUTPATIENT VISIT EST',
      description: 'Office or other outpatient visit, established patient',
      providerCount: 3,
    },
    summary: {
      providers: 3,
      rates: 6,
      providersWithBothClasses: 2,
      distinctSettings: 1,
      distinctNegotiatedTypes: 1,
      classes,
    },
    baseline: classes,
    providers: [
      provider({
        rates: [
          rate(),
          rate({
            id: '5-111111111',
            rate: 300,
            vsMedianPercent: 0,
            billingClass: 'institutional',
            placeOfService: [{ code: '22', label: 'Outpatient hospital' }],
            modifiers: [],
            filedUnder: { kind: 'additional_information', codeType: 'RC', code: '510' },
            occurrences: 2,
          }),
        ],
      }),
      provider({
        tin: '333333333',
        tinDisplay: '33-3333333',
        name: 'Gamma Health',
        npiCount: 1,
        rates: [
          rate({ id: '4-333333333', rate: 90, vsMedianPercent: 50, npiCount: 1, modifiers: [] }),
        ],
      }),
    ],
    page: { page: 1, pageSize: 25, totalProviders: 3, totalPages: 1 },
    noResults: null,
    ...overrides,
  }
}

/** A facility rate filed under a revenue code, for a provider with two NPIs. */
export function rateDetail(overrides: Partial<RateDetail> = {}): RateDetail {
  return {
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
    ...overrides,
  }
}
