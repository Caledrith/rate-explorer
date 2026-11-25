import { useCodeSuggestions } from '../../api/queries.ts'
import type { SourceFile } from '../../api/types.ts'
import { Button, Mono } from '../../components/ui.tsx'
import { formatCount, formatMegabytes, plural } from '../../lib/format.ts'

/** The first screen once the file is loaded: what this is, and codes that are known to work. */
export function Welcome({
  file,
  onSearchCode,
}: {
  file: SourceFile
  onSearchCode: (code: string) => void
}) {
  const common = useCodeSuggestions('', true)
  return (
    <section className="flex max-w-2xl flex-col gap-3">
      <h1 className="text-title font-bold">Look up a negotiated rate</h1>
      <p>
        Enter a billing code to see what {file.reportingEntityName ?? 'the plan'} has agreed to pay
        each provider for it. Add an NPI or EIN to narrow the search to one provider.
      </p>
      <p className="text-meta text-muted">
        Loaded:{' '}
        {file.planGroupLabel
          ? `${file.planGroupLabel} plans (${file.planCount})`
          : plural(file.planCount, 'plan')}
        , {formatCount(file.codeCount)} billing codes, {formatCount(file.providerCount)} providers
        {file.lastUpdatedOn && `, file dated ${file.lastUpdatedOn}`}.
      </p>
      {common.data && common.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-meta text-muted">Codes with the most providers in this file:</span>
          {common.data.map((code) => (
            <Button key={code.code} size="sm" onClick={() => onSearchCode(code.code)}>
              {code.code}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}

const SKIPPED: Array<[key: string, singular: string, plural: string]> = [
  ['skippedNpis', 'NPI that is not 10 digits', 'NPIs that are not 10 digits'],
  ['skippedItems', 'item with no billing code', 'items with no billing code'],
  ['skippedRatesWithoutProviders', 'rate with no providers', 'rates with no providers'],
  ['skippedPrices', 'price with no amount', 'prices with no amount'],
  ['skippedProviderGroups', 'provider group with no tax ID', 'provider groups with no tax ID'],
  [
    'remoteProviderReferences',
    'provider reference kept in another file',
    'provider references kept in other files',
  ],
]

/**
 * What was loaded and what was left out. Skipped records are counted during ingestion
 * rather than dropped silently, and this is where a reader can see them.
 */
export function DataReport({ file, warning }: { file: SourceFile; warning: string | null }) {
  const number = (key: string) =>
    typeof file.stats[key] === 'number' ? (file.stats[key] as number) : 0
  const skipped = SKIPPED.filter(([key]) => number(key) > 0)
  const unknown = Array.isArray(file.stats.unknownTopLevelFields)
    ? file.stats.unknownTopLevelFields
    : []

  return (
    <footer className="border-t border-line px-4 py-3 text-meta text-muted md:px-8">
      {warning && <p className="mb-2 text-warn">{warning}</p>}
      <details>
        <summary className="font-semibold text-ink">About this data</summary>
        <div className="flex max-w-3xl flex-col gap-2 pt-2">
          <p>
            Rates come from one Transparency in Coverage in-network file published by{' '}
            {file.reportingEntityName ?? 'the reporting entity'}
            {file.reportingEntityType && ` (${file.reportingEntityType.toLowerCase()})`}. The app
            found it through the index file <Mono>{file.indexFileName}</Mono>, in
            reporting_structure[{file.reportingStructureIndex}].
          </p>
          <p>
            <a href={file.fileUrl} target="_blank" rel="noreferrer">
              <Mono>{file.fileName}</Mono>
            </a>
            {file.byteSize !== null && ` · ${formatMegabytes(file.byteSize)}`}
            {file.schemaVersion && ` · schema version ${file.schemaVersion}`}
            {file.lastUpdatedOn && ` · last updated ${file.lastUpdatedOn}`}
          </p>
          <p>
            Read {formatCount(number('items'))} billing items, {formatCount(number('prices'))}{' '}
            prices and {formatCount(number('providerGroups'))} provider groups.{' '}
            {formatCount(number('pricesMatchedByAdditionalInformation'))} of those prices sit under
            a revenue code and are searchable by the procedure code written on the price.
          </p>
          <p>
            {skipped.length === 0
              ? 'No records were skipped.'
              : `Skipped: ${skipped.map(([key, one, many]) => `${formatCount(number(key))} ${number(key) === 1 ? one : many}`).join('; ')}.`}
            {unknown.length > 0 && ` Ignored top-level fields: ${unknown.join(', ')}.`}
          </p>
        </div>
      </details>
    </footer>
  )
}
