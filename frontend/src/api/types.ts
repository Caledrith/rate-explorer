// Shapes of the backend's JSON. Kept by hand next to the Kotlin DTOs in
// backend/src/main/kotlin/explorer/search/SearchModels.kt and api/StatusRoutes.kt.

export type BillingClass = 'professional' | 'institutional' | (string & {})

export type SortOrder = 'name' | 'rate_asc' | 'rate_desc'

// ---- Status ----

export interface SourceFile {
  id: number
  indexUrl: string
  indexFileName: string
  reportingStructureIndex: number
  planGroupLabel: string | null
  planCount: number
  fileUrl: string
  fileName: string
  fileDescription: string | null
  reportingEntityName: string | null
  reportingEntityType: string | null
  schemaVersion: string | null
  lastUpdatedOn: string | null
  byteSize: number | null
  ingestedAt: string
  codeCount: number
  providerCount: number
  stats: Record<string, number | string[]>
}

export interface StatusResponse {
  state: 'loading' | 'ready' | 'failed'
  phase: 'starting' | 'fetching_index' | 'downloading' | 'parsing' | 'indexing' | null
  bytesDone: number | null
  bytesTotal: number | null
  fileName: string | null
  error: { kind: 'index' | 'fetch' | 'parse' | 'database' | 'unexpected'; message: string } | null
  warning: string | null
  file: SourceFile | null
}

// ---- Search ----

export interface CodeInfo {
  code: string
  /** CPT, HCPCS, RC ... or null when the file only mentions the code on prices under revenue codes. */
  type: string | null
  name: string | null
  description: string | null
  providerCount: number
}

export interface ClassSummary {
  billingClass: BillingClass
  providers: number
  rates: number
  median: number
  min: number
  max: number
}

export interface CodeLabel {
  code: string
  label: string | null
}

export interface FiledUnder {
  /** additional_information means the searched code is written on the price, under another item. */
  kind: 'billing_code' | 'additional_information'
  codeType: string
  code: string
}

export interface RateLine {
  id: string
  rate: number
  negotiatedType: string | null
  vsMedianPercent: number | null
  billingClass: BillingClass
  /** inpatient, outpatient or both, as the file states it. */
  setting: string | null
  placeOfService: CodeLabel[]
  modifiers: CodeLabel[]
  filedUnder: FiledUnder
  npiCount: number
  occurrences: number
}

export interface ProviderResult {
  tin: string
  tinType: string
  tinDisplay: string
  name: string
  npiCount: number
  matchedNpi: string | null
  hiddenRateCount: number
  rates: RateLine[]
}

export interface NoResults {
  reason:
    | 'code_not_in_file'
    | 'provider_not_in_file'
    | 'provider_has_no_rates_for_code'
    | 'no_rates_in_class'
  closestCodes: CodeInfo[]
  ein: {
    ein: string
    einDisplay: string
    inFile: boolean
    name: string | null
    codeCount: number
  } | null
  npi: { npi: string; inFile: boolean; providerCount: number } | null
  /** providerCount: providers in the file, for any code, whose name contains the text. */
  name: { name: string; providerCount: number } | null
}

export interface SearchResponse {
  query: {
    code: string
    npi: string | null
    ein: string | null
    einDisplay: string | null
    name: string | null
    billingClass: string | null
    sort: SortOrder
    page: number
    pageSize: number
  }
  code: CodeInfo | null
  summary: {
    providers: number
    rates: number
    providersWithBothClasses: number
    /** How many different settings and negotiated types the rates have; shown per rate only when above one. */
    distinctSettings: number
    distinctNegotiatedTypes: number
    classes: ClassSummary[]
  }
  baseline: ClassSummary[]
  providers: ProviderResult[]
  page: { page: number; pageSize: number; totalProviders: number; totalPages: number }
  noResults: NoResults | null
}

// ---- Rate detail ----

export interface NpiList {
  total: number
  values: string[]
}

export interface RateDetail {
  id: string
  searchCode: string
  rate: number
  negotiatedType: string | null
  billingClass: BillingClass
  setting: string | null
  expirationDate: string | null
  noEndDate: boolean
  placeOfService: CodeLabel[]
  modifiers: CodeLabel[]
  provider: {
    tin: string
    tinType: string
    tinDisplay: string
    name: string
    nameCount: number
    npiCount: number
  }
  match: {
    kind: FiledUnder['kind']
    field: string
    value: string
    filedUnder: FiledUnder
    itemName: string | null
  }
  occurrences: { count: number; sampleItemNames: string[] }
  location: {
    itemIndex: number
    rateIndex: number
    priceIndex: number
    providerGroupId: number | null
    path: string
  }
  npis: NpiList
  otherNpis: NpiList
  source: {
    indexFileName: string
    indexUrl: string
    reportingStructureIndex: number
    planGroupLabel: string | null
    planCount: number
    fileName: string
    fileUrl: string
    schemaVersion: string | null
    lastUpdatedOn: string | null
  }
  /** The price record as the file wrote it, already indented. Kept as text so numbers are not reformatted. */
  raw: string
}

// ---- Errors ----

export interface FieldError {
  field: string
  message: string
}
