import type { RateLine as Rate } from '../../api/types.ts'
import { Chip } from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { codeTypeName, formatRate, formatVsMedian } from '../../lib/format.ts'
import {
  RATE_COLUMNS,
  modifierCodes,
  npiCoverageText,
  placeOfServiceText,
  rateElementId,
} from './rateText.ts'

interface Props {
  rate: Rate
  /** NPIs billing this code under the provider, to say when a rate covers only some of them. */
  providerNpiCount: number
  /** Setting and negotiated type are shown only when the result has more than one of them. */
  showSetting: boolean
  showNegotiatedType: boolean
  selected: boolean
  /** One of this provider's rates is open, so the provider's row is highlighted. */
  rowSelected: boolean
  /** The provider has no other rate listed, so there is nothing to tell this one apart from. */
  onlyRate: boolean
  onSelect: (id: string) => void
}

/**
 * One negotiated rate. The whole line is a button that opens "Why this matched".
 *
 * The common case is deliberately quiet: a rate filed under the searched code shows no
 * badge, and a rate at the median is grey. Only the exceptions carry weight - the amber
 * badge for a rate filed under a revenue code, and bold for a rate far from the median.
 */
export function RateLine({
  rate,
  providerNpiCount,
  showSetting,
  showNegotiatedType,
  selected,
  rowSelected,
  onlyRate,
  onSelect,
}: Props) {
  const vsMedian = formatVsMedian(rate.vsMedianPercent)
  const detail = [
    showSetting && rate.setting,
    // Codes only: what each modifier means is in the detail panel, not repeated on every row.
    modifierCodes(rate.modifiers),
    showNegotiatedType && rate.negotiatedType && `${rate.negotiatedType} rate`,
    // Says so when the rate covers only some of the provider's NPIs.
    npiCoverageText(rate.npiCount, providerNpiCount),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      id={rateElementId(rate.id)}
      aria-pressed={selected}
      onClick={() => onSelect(rate.id)}
      className={cx(
        'grid w-full grid-cols-[5.5rem_minmax(0,1fr)_1rem] items-start gap-x-3 border-t border-line-soft py-2.5 text-left',
        'lg:items-center lg:rounded-md lg:border lg:px-2 lg:py-1.5',
        RATE_COLUMNS,
        // The highlight belongs to the whole provider row. Inside it, the open rate is
        // outlined only when the provider has other rates to tell it apart from.
        // The open rate itself has no hover state: selecting it again changes nothing.
        selected
          ? onlyRate
            ? 'lg:border-transparent'
            : 'lg:border-accent lg:bg-surface'
          : rowSelected
            ? 'lg:border-transparent lg:hover:bg-surface/60'
            : 'lg:border-transparent lg:hover:bg-ground',
      )}
    >
      <span className="flex flex-col lg:contents">
        <span className="text-lead font-bold tabular-nums lg:text-right">
          {formatRate(rate.rate, rate.negotiatedType)}
        </span>
        {vsMedian ? (
          <span
            className={cx('text-meta tabular-nums', vsMedian.notable ? 'font-bold' : 'text-muted')}
          >
            {vsMedian.text}
            {rate.vsMedianPercent !== 0 && <span className="lg:hidden"> vs median</span>}
          </span>
        ) : (
          <span />
        )}
      </span>

      <span className="flex min-w-0 flex-col items-start gap-1 lg:contents">
        <span className="min-w-0">
          <span className="block">{placeOfServiceText(rate.placeOfService)}</span>
          <span className="block text-meta text-muted">{detail}</span>
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
