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
      // Three across needs about 375px for "Institutional" to fit its tile. Narrower
      // phones get two rows: all rates on top, the two billing classes side by side below.
      className="grid grid-cols-2 gap-1.5 min-[375px]:grid-cols-3 md:gap-2.5 lg:grid-cols-[15rem_1fr_1fr]"
    >
      <Tile
        className="col-span-2 min-[375px]:col-span-1"
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
        <span className="flex flex-col gap-0.5 tabular-nums lg:text-right">
          <span>
            <span className="text-meta text-muted">
              {filtered ? 'Median, all providers' : 'Median'}
            </span>{' '}
            {/* On its own line in the narrow tiles, so a longer figure cannot wrap one tile and not the other. */}
            <span className="block text-meta font-bold lg:inline lg:text-lead">
              {formatMoney(reference.median)}
            </span>
          </span>
          <span className="hidden text-meta text-muted lg:inline">
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
  className,
  children,
}: {
  /** Grid placement of the tile. */
  className?: string
  selected: boolean
  disabled?: boolean
  wide?: boolean
  onClick: () => void
  /** A "?" shown in the tile's corner on wide screens. It sits beside the button, not inside it. */
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cx('relative min-w-0', className)}>
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          'flex h-full w-full flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left md:px-3.5 md:py-2.5',
          // Side by side only where the tile is wide enough to hold both halves on a line.
          wide && 'lg:flex-row lg:items-center lg:justify-between lg:gap-4',
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
