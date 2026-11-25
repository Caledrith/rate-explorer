import type { ReactNode } from 'react'
import type { ClassSummary, SearchResponse } from '../../api/types.ts'
import { Hint } from '../../components/Hint.tsx'
import { cx } from '../../lib/cx.ts'
import { classLabel, formatMoney, plural } from '../../lib/format.ts'

interface Props {
  result: SearchResponse
  onSelectClass: (billingClass: string | null) => void
}

/**
 * The summary doubles as the filter: one tile for all rates and one per billing class.
 *
 * Professional and institutional rates are different things (a clinician's fee and a
 * facility's), so each gets its own median instead of one pooled figure. With a provider
 * filter on, the counts are for that provider but the median stays the code-wide one,
 * because that is what the "vs median" column compares against.
 */
export function SummaryTiles({ result, onSelectClass }: Props) {
  const { summary, baseline, query } = result
  const filtered = query.npi !== null || query.ein !== null
  const found = new Map(summary.classes.map((entry) => [entry.billingClass, entry]))
  const both = summary.providersWithBothClasses

  return (
    <div
      role="group"
      aria-label="Show rates"
      className="grid grid-cols-3 gap-1.5 md:grid-cols-[15rem_1fr_1fr] md:gap-2.5"
    >
      <Tile
        selected={query.billingClass === null}
        onClick={() => onSelectClass(null)}
        hint={
          both > 0 && (
            <Hint label="About the provider counts" align="left">
              {both === 1 ? '1 provider has' : `${both} providers have`} both professional and
              institutional rates, so the two class counts add up to more than the total.
            </Hint>
          )
        }
      >
        <span className="font-bold">
          All<span className="hidden md:inline"> rates</span>
        </span>
        <span className="text-meta text-muted">{plural(summary.providers, 'provider')}</span>
      </Tile>
      {baseline.map((reference) => {
        const here = found.get(reference.billingClass)
        return (
          <ClassTile
            key={reference.billingClass}
            reference={reference}
            providers={here?.providers ?? 0}
            filtered={filtered}
            selected={query.billingClass === reference.billingClass}
            onClick={() => onSelectClass(reference.billingClass)}
          />
        )
      })}
    </div>
  )
}

function ClassTile({
  reference,
  providers,
  filtered,
  selected,
  onClick,
}: {
  reference: ClassSummary
  providers: number
  filtered: boolean
  selected: boolean
  onClick: () => void
}) {
  const empty = providers === 0
  return (
    <Tile selected={selected} disabled={empty} onClick={onClick} wide>
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">{classLabel(reference.billingClass)}</span>
        <span className="text-meta text-muted">
          {empty && filtered ? 'None for this provider' : plural(providers, 'provider')}
        </span>
      </span>
      {!empty && (
        <span className="flex flex-col gap-0.5 tabular-nums md:text-right">
          <span>
            <span className="text-meta text-muted">
              {filtered ? 'Median, all providers' : 'Median'}
            </span>{' '}
            <span className="text-meta font-bold md:text-lead">
              {formatMoney(reference.median)}
            </span>
          </span>
          <span className="hidden text-meta text-muted md:inline">
            {formatMoney(reference.min)} to {formatMoney(reference.max)}
          </span>
        </span>
      )}
    </Tile>
  )
}

function Tile({
  selected,
  disabled = false,
  wide = false,
  onClick,
  hint,
  children,
}: {
  selected: boolean
  disabled?: boolean
  wide?: boolean
  onClick: () => void
  /** A "?" shown in the tile's corner on wide screens. It sits beside the button, not inside it. */
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          'flex h-full w-full flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left md:px-3.5 md:py-2.5',
          wide && 'md:flex-row md:items-center md:justify-between md:gap-4',
          selected
            ? 'border-accent bg-accent-soft'
            : disabled
              ? 'border-line-soft bg-ground text-muted'
              : 'border-line bg-surface hover:bg-ground',
        )}
      >
        {children}
      </button>
      {hint && <span className="absolute top-2.5 right-3 hidden md:block">{hint}</span>}
    </div>
  )
}
