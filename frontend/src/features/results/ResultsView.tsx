import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearch, type SearchParams } from '../../api/queries.ts'
import type { SearchResponse, SortOrder } from '../../api/types.ts'
import { Hint } from '../../components/Hint.tsx'
import { Button, Chip, LoadingBar } from '../../components/ui.tsx'
import { useCrossFaded } from '../../lib/crossFade.ts'
import { cx } from '../../lib/cx.ts'
import { codeTypeName, plural, sentenceCase } from '../../lib/format.ts'
import { useRemembered } from '../../lib/useRemembered.ts'
import { MatchPanel } from '../detail/MatchPanel.tsx'
import { formatEin } from '../search/validation.ts'
import { NoResultsNotice, ResultsSkeleton, SearchFailed } from '../states/SearchStates.tsx'
import { NameFilter } from './NameFilter.tsx'
import { Pagination } from './Pagination.tsx'
import { ProviderList } from './ProviderList.tsx'
import { SummaryTiles } from './SummaryTiles.tsx'
import { filedUnderNote, VS_MEDIAN_NOTE } from './notes.ts'
import { rateElementId } from './rateText.ts'

interface Props {
  search: SearchParams
  selectedRate: string | null
  onSearchCode: (code: string) => void
  onRefine: (
    change: { billingClass?: string | null; sort?: SortOrder; page?: number; name?: string | null },
    options?: { replace?: boolean },
  ) => void
  onClearProvider: () => void
  onSelectRate: (id: string | null) => void
  /**
   * What was on screen before this search, if anything. It stays there until the first
   * answer arrives, so the page never empties in between.
   */
  before?: ReactNode
}

/** Everything below the header for one search: summary, filters, providers and the open rate. */
export function ResultsView({
  search,
  selectedRate,
  onSearchCode,
  onRefine,
  onClearProvider,
  onSelectRate,
  before,
}: Props) {
  const { data: result, error, isPending, isPlaceholderData, refetch } = useSearch(search)
  // The "select a rate" instruction is only worth showing until someone has done it once.
  const hasOpenedARate = useRemembered('rate-explorer.opened-a-rate', selectedRate !== null)

  // A new page of providers starts from its top: paging happens at the bottom of the list,
  // and the answer would otherwise arrive with its first provider off screen.
  const toolbar = useRef<HTMLDivElement>(null)
  const pageShown = result && !isPlaceholderData ? result.query.page : null
  const pageBefore = useRef<number | null>(null)
  useEffect(() => {
    if (pageShown === null) return
    const before = pageBefore.current
    pageBefore.current = pageShown
    if (before === null || before === pageShown) return
    const top = toolbar.current
    // Optional call: not every environment implements scrollIntoView.
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView?.({ block: 'start' })
  }, [pageShown])

  // With a rate open, the arrow keys step to the one below or above it in the list.
  const rateIds = useMemo(
    () => result?.providers.flatMap((provider) => provider.rates.map((rate) => rate.id)) ?? [],
    [result],
  )
  // Where the keys have got to. It runs ahead of `selectedRate` when keys arrive faster than
  // the page redraws, so a held key does not lose steps.
  const cursor = useRef(selectedRate)
  useEffect(() => {
    cursor.current = selectedRate
  }, [selectedRate])
  const panelOpen = selectedRate !== null
  useEffect(() => {
    if (!panelOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      // In a field the arrows belong to the field.
      if (event.target instanceof Element && event.target.closest('input, select, textarea')) return
      const at = cursor.current === null ? -1 : rateIds.indexOf(cursor.current)
      const next = at === -1 ? undefined : rateIds[at + (event.key === 'ArrowDown' ? 1 : -1)]
      if (!next) return
      event.preventDefault()
      cursor.current = next
      onSelectRate(next)
      // Optional call: not every environment implements scrollIntoView.
      document.getElementById(rateElementId(next))?.scrollIntoView?.({ block: 'nearest' })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen, rateIds, onSelectRate])

  // Going from waiting to an answer is a cross-fade, not a cut, so what is drawn (`phase`)
  // trails what is known (`hasAnswer`) by the length of that fade.
  const hasAnswer = Boolean(result ?? error)
  const phase = useCrossFaded(hasAnswer ? 'answer' : 'waiting')
  // `before` covers only the wait for this view's first answer.
  const [answered, setAnswered] = useState(false)
  if (!answered && hasAnswer && phase === 'answer') setAnswered(true)

  if (phase === 'waiting' || !hasAnswer || isPending) {
    if (!before || answered) return <ResultsSkeleton />
    // The same treatment stale results get while the next answer loads: left in place, with
    // a loading bar and a fade that only show if the wait is long enough to notice.
    return (
      <div className="relative" aria-busy="true">
        <LoadingBar label={`Searching for ${search.code}…`} />
        <div className="animate-dim">{before}</div>
      </div>
    )
  }
  if (!result) {
    return error ? (
      <SearchFailed error={error} onRetry={() => void refetch()} />
    ) : (
      <ResultsSkeleton />
    )
  }

  // `result` may be the previous search's answer, kept on screen while the next one loads.
  const loadingNext = isPlaceholderData
  const hasProviderFilter = result.query.npi !== null || result.query.ein !== null
  const hasList = !result.noResults
  const showList = !result.noResults || result.noResults.reason === 'no_rates_in_class'
  // When the provider filter is why nothing was found, the notice below offers to clear it.
  const noticeClearsProvider =
    result.noResults?.reason === 'provider_not_in_file' ||
    result.noResults?.reason === 'provider_has_no_rates_for_code'
  const filedAs = `${result.code?.type ? `${codeTypeName(result.code.type)} ` : ''}${result.query.code}`

  // On narrow screens an open rate takes the whole screen, so everything else steps aside.
  const behindPanel = selectedRate ? 'max-xl:hidden' : undefined

  return (
    <div className="relative" aria-busy={loadingNext}>
      {loadingNext && <LoadingBar label={`Searching for ${search.code}…`} />}
      <div
        className={cx(
          'flex flex-col gap-3 transition-opacity duration-200',
          // The delay means a quick answer swaps in with no dimming at all.
          loadingNext && 'opacity-50 delay-300',
        )}
      >
        <div className={cx('contents', behindPanel)}>
          <ResultHeading result={result} />

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
              {!noticeClearsProvider && (
                <Button size="sm" onClick={onClearProvider}>
                  Clear provider filter
                </Button>
              )}
              {result.query.npi && result.summary.providers > 1 && (
                <span className="text-meta text-muted">
                  This NPI is listed under {plural(result.summary.providers, 'provider')}. Only
                  rates that apply to it are shown.
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
        </div>

        {/* Stays in place when a name finds nothing, so the name can be corrected. */}
        {(hasList || result.query.name !== null) && (
          <div
            ref={toolbar}
            className={cx(
              'flex scroll-mt-3 flex-wrap items-center justify-between gap-x-4 gap-y-2',
              behindPanel,
            )}
          >
            <div className="flex items-center gap-2 text-meta">
              {hasList && !hasOpenedARate && (
                <p className="font-semibold">
                  <span className="md:hidden">Tap</span>
                  <span className="hidden md:inline">Select</span> a rate to see where it came from.
                </p>
              )}
              {/* The table puts these notes on its column headings; the cards have no headings. */}
              {hasList && (
                <span className="lg:hidden">
                  <Hint label="How to read this list">
                    <span className="flex flex-col gap-2">
                      <span>{VS_MEDIAN_NOTE}</span>
                      <span>{filedUnderNote(filedAs, result.query.code)}</span>
                    </span>
                  </Hint>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <NameFilter
                applied={result.query.name}
                onChange={(name) => onRefine({ name }, { replace: true })}
              />
              {hasList && (
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
              )}
            </div>
          </div>
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
            {/* The panel takes a column only while a rate is open; otherwise the list has the full width. */}
            <div
              className={cx(
                'grid items-start gap-5',
                selectedRate && 'xl:grid-cols-[minmax(0,1fr)_25rem]',
              )}
            >
              <div className={cx('flex min-w-0 flex-col gap-3', behindPanel)}>
                <ProviderList
                  providers={result.providers}
                  selectedRate={selectedRate}
                  onSelectRate={onSelectRate}
                  showSetting={result.summary.distinctSettings > 1}
                  showNegotiatedType={result.summary.distinctNegotiatedTypes > 1}
                  filedAs={filedAs}
                  code={result.query.code}
                />
                <Pagination
                  page={result.page}
                  shown={result.providers.length}
                  onPage={(page) => onRefine({ page })}
                />
              </div>
              {selectedRate && (
                <MatchPanel
                  id={selectedRate}
                  searchedNpi={result.query.npi}
                  code={result.query.code}
                  ranges={result.baseline}
                  onClose={() => onSelectRate(null)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ResultHeading({ result }: { result: SearchResponse }) {
  const { code, query, summary } = result
  const description = code?.description && code.description !== code.name ? code.description : null
  // Split off the last word of the name, so the description's "?" can be kept beside it.
  const name = code?.name ? sentenceCase(code.name) : ''
  const lastSpace = name.lastIndexOf(' ')
  const nameStart = name.slice(0, lastSpace + 1)
  const nameEnd = name.slice(lastSpace + 1)
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title font-bold">
        <span>{query.code}</span>
        {code?.type && <Chip>{codeTypeName(code.type)}</Chip>}
        {name && !description && <span className="font-medium">{name}</span>}
        {description && (
          <span className="font-medium">
            {nameStart}
            {/* The "?" wraps together with the last word, never onto a line by itself. */}
            <span className="whitespace-nowrap">
              {nameEnd}{' '}
              <Hint label="The file's description of this code">
                {sentenceCase(description)}
                {/* The file cuts descriptions at 100 characters. */}
                {description.length >= 100 && '… (the file cuts the description off here)'}
              </Hint>
            </span>
          </span>
        )}
      </h1>
      {summary.providers > 0 && (
        <p className="text-meta text-muted" aria-live="polite">
          {plural(summary.providers, 'provider')} · {plural(summary.rates, 'rate')}
        </p>
      )}
    </header>
  )
}
