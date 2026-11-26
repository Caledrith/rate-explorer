import type { ClassSummary } from '../../api/types.ts'
import { classLabel, formatMoney, plural } from '../../lib/format.ts'

interface Props {
  rate: number
  /** Every provider's rates for the same code and billing class. */
  range: ClassSummary
  code: string
}

/** Whole percent from the median, rounded the way the list's "vs median" column is. */
function percentFromMedian(rate: number, median: number): number | null {
  if (median === 0) return null
  const percent = ((rate - median) / median) * 100
  return Math.sign(percent) * Math.round(Math.abs(percent))
}

/**
 * Where one rate sits among all the rates for its code and class: a line from the lowest to
 * the highest, a tick at the median and a dot at this rate. The sentence above it says the
 * same thing in words, and is what a screen reader gets.
 */
export function RangeBar({ rate, range, code }: Props) {
  const { min, max, median } = range
  // One price, or none to compare with, leaves nothing to draw.
  if (!(max > min)) return null

  const at = (value: number) =>
    `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`
  const percent = percentFromMedian(rate, median)
  const standing =
    percent === null
      ? null
      : percent === 0
        ? 'At the median'
        : `${Math.abs(percent)}% ${percent > 0 ? 'above' : 'below'} the median`

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-meta">
        {standing && (
          <>
            <strong>{standing}</strong> of {formatMoney(median)}.{' '}
          </>
        )}
        <span className="text-muted">
          {classLabel(range.billingClass)} rates for {code}, from{' '}
          {plural(range.providers, 'provider')}.
        </span>
      </figcaption>
      <div aria-hidden="true">
        <div className="relative h-4">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
          <div
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-muted"
            style={{ left: at(median) }}
          />
          <div
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
            style={{ left: at(rate) }}
          />
        </div>
        <div className="flex justify-between text-meta text-muted tabular-nums">
          <span>{formatMoney(min)}</span>
          <span>{formatMoney(max)}</span>
        </div>
      </div>
      <p className="sr-only">
        Rates run from {formatMoney(min)} to {formatMoney(max)}.
      </p>
    </figure>
  )
}
