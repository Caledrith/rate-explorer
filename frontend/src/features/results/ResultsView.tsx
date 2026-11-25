import { useSearch, type SearchParams } from '../../api/queries.ts'
import type { SearchResponse, SortOrder, SourceFile } from '../../api/types.ts'
import { Button, Chip } from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { codeTypeName, plural, sentenceCase } from '../../lib/format.ts'
import { MatchPanel } from '../detail/MatchPanel.tsx'
import { formatEin } from '../search/validation.ts'
import { NoResultsNotice, ResultsSkeleton, SearchFailed } from '../states/SearchStates.tsx'
import { Pagination } from './Pagination.tsx'
import { ProviderList } from './ProviderList.tsx'
import { SummaryTiles } from './SummaryTiles.tsx'

interface Props {
  search: SearchParams
  file: SourceFile
  selectedRate: string | null
  onSearchCode: (code: string) => void
  onRefine: (change: { billingClass?: string | null; sort?: SortOrder; page?: number }) => void
  onClearProvider: () => void
  onSelectRate: (id: string | null) => void
}

/** Everything below the header for one search: summary, filters, providers and the open rate. */
export function ResultsView({
  search,
  file,
  selectedRate,
  onSearchCode,
  onRefine,
  onClearProvider,
  onSelectRate,
}: Props) {
  const { data: result, error, isPending, isPlaceholderData, refetch } = useSearch(search)

  if (error && !result) return <SearchFailed error={error} onRetry={() => void refetch()} />
  if (isPending || !result) return <ResultsSkeleton />

  const hasProviderFilter = result.query.npi !== null || result.query.ein !== null
  const showList = !result.noResults || result.noResults.reason === 'no_rates_in_class'

  return (
    <div className="flex flex-col gap-3">
      <ResultHeading result={result} file={file} />

      {hasProviderFilter && (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-lg border border-line-strong bg-surface px-2.5 py-1 tabular-nums">
            {[
              result.query.npi && (
                <span key="npi">
                  Provider NPI <strong>{result.query.npi}</strong>
                </span>
              ),
              result.query.ein && (
                <span key="ein">
                  {result.query.npi && ' · '}Provider EIN{' '}
                  <strong>{formatEin(result.query.ein)}</strong>
                </span>
              ),
            ]}
          </span>
          <Button size="sm" onClick={onClearProvider}>
            Clear provider filter
          </Button>
          {result.query.npi && result.summary.providers > 1 && (
            <span className="text-meta text-muted">
              This NPI is listed under {plural(result.summary.providers, 'provider')}. Only rates
              that apply to it are shown.
            </span>
          )}
        </div>
      )}

      {showList && (
        <SummaryTiles
          result={result}
          onSelectClass={(billingClass) => onRefine({ billingClass })}
        />
      )}

      {result.noResults ? (
        <NoResultsNotice
          result={result}
          onSearchCode={onSearchCode}
          onClearProvider={onClearProvider}
          onClearClass={() => onRefine({ billingClass: null })}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-muted">
              <span className="font-semibold text-ink">
                <span className="md:hidden">Tap</span>
                <span className="hidden md:inline">Select</span> a rate to see where it came from.
              </span>{' '}
              Rates are filed as {result.code?.type ? `${codeTypeName(result.code.type)} ` : ''}
              {result.query.code} unless marked.
            </p>
            <label className="flex items-center gap-2 text-meta text-muted">
              Sort
              <select
                value={result.query.sort}
                onChange={(event) => onRefine({ sort: event.target.value as SortOrder })}
                className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-ink"
              >
                <option value="name">Provider name, A to Z</option>
                <option value="rate_asc">Lowest rate first</option>
                <option value="rate_desc">Highest rate first</option>
              </select>
            </label>
          </div>

          {/* The panel takes a column only while a rate is open; otherwise the list has the full width. */}
          <div
            className={cx(
              'grid items-start gap-5',
              selectedRate && 'lg:grid-cols-[minmax(0,1fr)_25rem]',
            )}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <ProviderList
                providers={result.providers}
                selectedRate={selectedRate}
                onSelectRate={onSelectRate}
                stale={isPlaceholderData}
              />
              <Pagination
                page={result.page}
                shown={result.providers.length}
                onPage={(page) => onRefine({ page })}
              />
              <p className="text-meta text-muted">
                Each rate is compared with the median for its billing class across every provider. A
                provider's price counts once.
              </p>
            </div>
            {selectedRate && (
              <MatchPanel
                id={selectedRate}
                searchedNpi={result.query.npi}
                onClose={() => onSelectRate(null)}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ResultHeading({ result, file }: { result: SearchResponse; file: SourceFile }) {
  const { code, query, summary } = result
  const description = code?.description && code.description !== code.name ? code.description : null
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title font-bold">
        <span>{query.code}</span>
        {code?.type && <Chip>{codeTypeName(code.type)}</Chip>}
        {code?.name && <span className="font-medium">{sentenceCase(code.name)}</span>}
      </h1>
      {description && (
        <p className="max-w-3xl text-meta text-muted">
          {sentenceCase(description)}
          {/* The file cuts descriptions at 100 characters. */}
          {description.length >= 100 && '…'}
        </p>
      )}
      {code && (
        <p className="text-meta text-muted" aria-live="polite">
          {summary.providers > 0 &&
            `${plural(summary.providers, 'provider')} · ${plural(summary.rates, 'rate')} · `}
          {[
            file.planGroupLabel && `${file.planGroupLabel} plans (${file.planCount})`,
            file.lastUpdatedOn && `file dated ${file.lastUpdatedOn}`,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}
    </header>
  )
}
