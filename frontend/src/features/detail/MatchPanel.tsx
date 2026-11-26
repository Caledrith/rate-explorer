import { useEffect, useRef } from 'react'
import { useRateDetail } from '../../api/queries.ts'
import type { ClassSummary, RateDetail } from '../../api/types.ts'
import { Hint } from '../../components/Hint.tsx'
import { Button, Mono, Notice } from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { classLabel, codeTypeName, formatCount, formatRate, plural } from '../../lib/format.ts'
import { modifierText, placeOfServiceText, rateElementId } from '../results/rateText.ts'
import { RangeBar } from './RangeBar.tsx'

interface Props {
  id: string
  /** The NPI that was searched, if any, so the panel can point it out. */
  searchedNpi: string | null
  /** The code the list is showing, and every provider's rates for it by billing class. */
  code?: string
  ranges?: ClassSummary[]
  onClose: () => void
}

/**
 * "Why this matched": traces one rate back to the exact record in the source file.
 *
 * On wide screens it is a column beside the list. On narrow ones the rest of the page is
 * hidden while it is open (see `max-xl:hidden` in App and ResultsView), so it is the only
 * thing on screen and the only thing in the tab order, with no focus trap to maintain.
 * Opening it moves focus to its heading; Escape or the close button returns focus to the rate.
 */
export function MatchPanel({ id, searchedNpi, code, ranges = [], onClose }: Props) {
  const { data, error, isPending, isPlaceholderData } = useRateDetail(id)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Beside the list (the xl breakpoint and up) the panel is already in view, and the page
    // has just been placed so the chosen rate stays put, so taking focus must not scroll it.
    // Filling the screen on its own, the panel should be read from its top, which the
    // browser's usual scroll-to-focus does.
    const besideList =
      typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 80rem)').matches
    heading.current?.focus({ preventScroll: besideList })
  }, [id])

  const closedByReader = useRef(false)

  function close() {
    closedByReader.current = true
    onClose()
  }

  // When the reader closes the panel, return to the rate they came from. This runs as the
  // panel leaves the page, which is when the list is back on screen and can take focus. A
  // panel that goes away for another reason (a new sort, a new search) leaves focus alone.
  useEffect(
    () => () => {
      if (!closedByReader.current) return
      const rate = document.getElementById(rateElementId(id))
      // Optional call: not every environment implements scrollIntoView.
      rate?.scrollIntoView?.({ block: 'nearest' })
      rate?.focus({ preventScroll: true })
    },
    [id],
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // Escape inside a field belongs to that field (it dismisses suggestions or a menu).
      if (event.target instanceof Element && event.target.closest('input, select, textarea')) return
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <aside
      aria-labelledby="match-panel-title"
      className={cx(
        'flex flex-col bg-surface',
        'max-xl:-mx-4 max-xl:-my-5 max-xl:min-h-dvh md:max-xl:-mx-8',
        'xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:rounded-xl xl:border xl:border-line-strong',
        // Tall from the moment it opens, so it does not grow when the detail arrives.
        'xl:min-h-[min(48rem,calc(100dvh-2rem))]',
      )}
    >
      <div className="sticky top-0 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 xl:justify-between xl:px-5">
        <Button size="sm" className="xl:order-2" onClick={close}>
          <span aria-hidden="true" className="xl:hidden">
            ‹{' '}
          </span>
          <span className="xl:hidden">Results</span>
          <span className="hidden xl:inline">Close</span>
        </Button>
        <h2
          id="match-panel-title"
          ref={heading}
          tabIndex={-1}
          className="text-lead font-bold outline-none"
        >
          Why this matched
        </h2>
        {/* Only where the list is beside the panel to step through. */}
        <span className="hidden text-meta text-muted xl:order-1 xl:ml-auto xl:block">
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> other rates
        </span>
      </div>

      <div className="flex flex-col gap-5 p-4 xl:p-5">
        {isPending && (
          <div role="status" className="flex animate-appear flex-col gap-3 *:animate-pulse">
            <div className="h-9 w-32 rounded bg-line-soft" />
            <div className="h-4 w-56 rounded bg-line-soft" />
            <div className="h-24 rounded-lg bg-line-soft" />
            <span className="sr-only">Loading this rate…</span>
          </div>
        )}
        {error && (
          <Notice
            tone={error.status === 404 ? 'plain' : 'danger'}
            title={
              error.status === 404
                ? 'This rate is no longer listed'
                : 'This rate could not be loaded'
            }
            actions={<Button onClick={close}>Back to results</Button>}
          >
            <p>
              {error.status === 404
                ? 'The link points at a rate that is not in the loaded file. The file may have been reloaded since.'
                : error.isNetworkFailure
                  ? 'The server did not respond.'
                  : error.message}
            </p>
          </Notice>
        )}
        {data && (
          // While another rate loads, the previous one stays, dimming only if the wait drags on.
          <div
            aria-busy={isPlaceholderData}
            className={cx(
              'flex flex-col gap-5 transition-opacity duration-200',
              isPlaceholderData && 'opacity-50 delay-300',
            )}
          >
            <Detail
              detail={data}
              searchedNpi={searchedNpi}
              // The comparison is with the code the list shows, in dollars.
              range={
                data.searchCode === code && data.negotiatedType !== 'percentage'
                  ? ranges.find((range) => range.billingClass === data.billingClass)
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </aside>
  )
}

function Detail({
  detail,
  searchedNpi,
  range,
}: {
  detail: RateDetail
  searchedNpi: string | null
  range?: ClassSummary
}) {
  const { match, provider, occurrences, location, source } = detail
  const viaRevenueCode = match.kind === 'additional_information'
  const filed = `${codeTypeName(match.filedUnder.codeType)} ${match.filedUnder.code}`
  const terms = [
    classLabel(detail.billingClass),
    detail.setting,
    placeOfServiceText(detail.placeOfService),
    lowerFirst(modifierText(detail.modifiers)),
  ].filter(Boolean)
  // An ordinary negotiated rate with no end date is the norm, so only departures are stated.
  const unusual = [
    detail.negotiatedType &&
      detail.negotiatedType !== 'negotiated' &&
      `${classLabel(detail.negotiatedType)} rate`,
    !detail.noEndDate && detail.expirationDate && `Expires ${detail.expirationDate}`,
  ].filter(Boolean)
  // With one NPI there is nothing to list: the number goes in the heading instead.
  const soleNpi =
    provider.npiCount === 1 && detail.npis.total === 1 ? (detail.npis.values[0] ?? null) : null
  const showNpiSection = soleNpi === null && detail.npis.total + detail.otherNpis.total > 0

  return (
    <>
      <div>
        <p className="text-figure font-bold tabular-nums">
          {formatRate(detail.rate, detail.negotiatedType)}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 font-semibold">
          {provider.name}
          {provider.nameCount > 1 && (
            <Hint label="About this provider's name">
              The file spells this provider's name {provider.nameCount} ways. This is the most
              common.
            </Hint>
          )}
        </p>
        <p className="text-meta text-muted tabular-nums">
          {provider.tinType === 'ein' ? 'EIN' : 'Tax ID'} {provider.tinDisplay} ·{' '}
          {soleNpi !== null
            ? `NPI ${soleNpi}`
            : provider.npiCount === 0
              ? 'no NPI listed'
              : plural(provider.npiCount, 'NPI')}
          {soleNpi !== null && soleNpi === searchedNpi && ' (your search)'}
        </p>
        <p className="text-meta text-muted">{terms.join(' · ')}</p>
        {unusual.length > 0 && <p className="text-meta text-muted">{unusual.join(' · ')}</p>}
      </div>

      {range && <RangeBar rate={detail.rate} range={range} code={detail.searchCode} />}

      {/* The answer comes first: where the searched code was found. */}
      <div className="flex flex-col gap-2.5 rounded-lg bg-ground px-4 py-3.5">
        <p>
          You searched <strong>{detail.searchCode}</strong>
          {searchedNpi && (
            <>
              {' '}
              for NPI <strong>{searchedNpi}</strong>
            </>
          )}
          .{' '}
          {viaRevenueCode ? (
            <>
              This rate is filed under <strong>{filed.toLowerCase()}</strong>. The code{' '}
              {detail.searchCode} is written on the price itself:
            </>
          ) : (
            <>This rate is filed as {filed}:</>
          )}
        </p>
        <code className="block rounded-md bg-code px-3 py-2 font-mono text-meta break-all text-code-ink">
          "{match.field}":{' '}
          <span
            className={cx(
              'rounded px-1.5 py-px text-ink',
              viaRevenueCode ? 'bg-mark' : 'bg-code-ink',
            )}
          >
            "{match.value}"
          </span>
        </code>
      </div>

      {viaRevenueCode && (
        <div className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-meta text-warn">
          <p>
            {occurrences.count > 1
              ? `The file records this price ${formatCount(occurrences.count)} times, under ${formatCount(occurrences.count)} different ${filed.toLowerCase()} items. `
              : `The file records this price under a ${filed.toLowerCase()} item. `}
            The item names do not describe this price.
          </p>
          {occurrences.sampleItemNames.length > 0 && (
            <details className="mt-1.5">
              <summary className="font-semibold">Item names it sits under</summary>
              <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-5">
                {occurrences.sampleItemNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
                {occurrences.count > occurrences.sampleItemNames.length && (
                  <li>
                    and {formatCount(occurrences.count - occurrences.sampleItemNames.length)} more
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}
      {!viaRevenueCode && occurrences.count > 1 && (
        <p className="text-meta text-muted">
          The file lists this same price for this provider {formatCount(occurrences.count)} times.
          It is shown once.
        </p>
      )}

      {showNpiSection && (
        <section>
          <h3 className="mb-2 font-bold">NPIs this rate applies to</h3>
          <NpiChips values={detail.npis.values} highlight={searchedNpi} />
          <p className="mt-1.5 text-meta text-muted">
            {npiSentence(detail)}
            {detail.npis.total > detail.npis.values.length &&
              ` Showing the first ${detail.npis.values.length}.`}
          </p>
          {detail.otherNpis.total > 0 && (
            <div className="mt-1.5">
              <NpiChips values={detail.otherNpis.values} highlight={null} />
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-2 font-bold">Where it is in the file</h3>
        <dl className="flex flex-col gap-2">
          <Location
            label={`Price · under ${filed}${match.itemName ? `, "${match.itemName}"` : ''}`}
          >
            {location.path}
          </Location>
          <Location label="Provider group">
            {location.providerGroupId === null
              ? 'provider_groups written on the rate itself'
              : `provider_group_id ${location.providerGroupId}`}
          </Location>
        </dl>
      </section>

      <div>
        <details className="border-t border-line-soft py-2.5">
          <summary className="font-semibold">Source files</summary>
          <dl className="flex flex-col gap-2 pt-2.5">
            <Location
              label={`Index file · reporting_structure[${source.reportingStructureIndex}]${source.planGroupLabel ? `, ${source.planGroupLabel}` : ''}, ${plural(source.planCount, 'plan')}`}
            >
              <a href={source.indexUrl} target="_blank" rel="noreferrer">
                {source.indexFileName}
              </a>
            </Location>
            <Location
              label={`In-network file${source.schemaVersion ? ` · schema version ${source.schemaVersion}` : ''}${source.lastUpdatedOn ? `, last updated ${source.lastUpdatedOn}` : ''}`}
            >
              <a href={source.fileUrl} target="_blank" rel="noreferrer">
                {source.fileName}
              </a>
            </Location>
          </dl>
        </details>
        <details className="border-y border-line-soft py-2.5">
          <summary className="font-semibold">Raw record</summary>
          <pre className="mt-2.5 overflow-x-auto rounded-lg bg-code px-4 py-3.5 font-mono text-meta leading-relaxed text-code-ink">
            {detail.raw}
          </pre>
        </details>
      </div>
    </>
  )
}

/** "Modifier 25 · separate E/M" reads mid-sentence as "modifier 25 · separate E/M"; abbreviations keep their capitals. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** How the NPIs on this rate relate to the provider's NPIs for the code. */
function npiSentence(detail: RateDetail): string {
  const { npis, otherNpis, provider } = detail
  if (npis.total === 0) return 'The file lists no valid NPI for this rate.'
  if (otherNpis.total === 0) {
    return npis.total === 1
      ? 'The only NPI billing this code under this provider.'
      : `All ${formatCount(npis.total)} NPIs billing this code under this provider.`
  }
  return `${formatCount(npis.total)} of this provider's ${formatCount(provider.npiCount)} NPIs. The other ${formatCount(otherNpis.total)} ${otherNpis.total === 1 ? 'is' : 'are'} on a different rate:`
}

function NpiChips({ values, highlight }: { values: string[]; highlight: string | null }) {
  if (values.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {values.map((npi) => (
        <li key={npi} className="flex items-center gap-1.5">
          <span
            className={cx(
              'rounded-md px-2 py-0.5 font-mono text-meta',
              npi === highlight ? 'border border-accent bg-accent-soft' : 'bg-ground',
            )}
          >
            {npi}
          </span>
          {npi === highlight && <span className="text-meta text-muted">your search</span>}
        </li>
      ))}
    </ul>
  )
}

function Location({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-meta text-muted">{label}</dt>
      <dd>
        <Mono>{children}</Mono>
      </dd>
    </div>
  )
}
