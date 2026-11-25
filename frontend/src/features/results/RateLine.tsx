import type { RateLine as Rate } from '../../api/types.ts'
import { Chip } from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { codeTypeName, formatRate, formatVsMedian } from '../../lib/format.ts'
import { RATE_COLUMNS, modifierText, placeOfServiceText, rateElementId } from './rateText.ts'

interface Props {
  rate: Rate
  /** NPIs billing this code under the provider, to say when a rate covers only some of them. */
  providerNpiCount: number
  selected: boolean
  onSelect: (id: string) => void
}

/**
 * One negotiated rate. The whole line is a button that opens "Why this matched".
 *
 * The common case is deliberately quiet: a rate filed under the searched code shows no
 * badge, and a rate at the median is grey. Only the exceptions carry weight - the amber
 * badge for a rate filed under a revenue code, and bold for a rate far from the median.
 */
export function RateLine({ rate, providerNpiCount, selected, onSelect }: Props) {
  const vsMedian = formatVsMedian(rate.vsMedianPercent)
  const partial = rate.npiCount < providerNpiCount

  return (
    <button
      type="button"
      id={rateElementId(rate.id)}
      aria-pressed={selected}
      onClick={() => onSelect(rate.id)}
      className={cx(
        'grid w-full grid-cols-[5.5rem_minmax(0,1fr)_1rem] items-start gap-x-3 border-t border-line-soft py-2.5 text-left',
        'md:items-center md:rounded-md md:border md:px-2 md:py-1.5',
        RATE_COLUMNS,
        selected
          ? 'md:border-accent md:bg-accent-soft'
          : 'md:border-transparent md:hover:bg-ground',
      )}
    >
      <span className="flex flex-col md:contents">
        <span className="text-lead font-bold tabular-nums md:text-right">
          {formatRate(rate.rate, rate.negotiatedType)}
        </span>
        {vsMedian ? (
          <span
            className={cx('text-meta tabular-nums', vsMedian.notable ? 'font-bold' : 'text-muted')}
          >
            {vsMedian.text}
            {rate.vsMedianPercent !== 0 && <span className="md:hidden"> vs median</span>}
          </span>
        ) : (
          <span />
        )}
      </span>

      <span className="flex min-w-0 flex-col items-start gap-1 md:contents">
        <span className="min-w-0">
          <span className="block">
            {placeOfServiceText(rate.placeOfService)}
            {partial && (
              <span className="text-meta text-muted">
                {' '}
                · {rate.npiCount} of {providerNpiCount} NPIs
              </span>
            )}
          </span>
          <span className="block text-meta text-muted">{modifierText(rate.modifiers)}</span>
        </span>
        <span>
          {rate.filedUnder.kind === 'additional_information' && (
            <Chip tone="warn">
              {codeTypeName(rate.filedUnder.codeType)} {rate.filedUnder.code}
            </Chip>
          )}
        </span>
      </span>

      <span
        aria-hidden="true"
        className={cx('self-center text-lead', selected ? 'font-bold text-accent' : 'text-muted')}
      >
        ›
      </span>
    </button>
  )
}
