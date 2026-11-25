import type { ProviderResult } from '../../api/types.ts'
import { Hint } from '../../components/Hint.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import { RateLine } from './RateLine.tsx'
import { filedUnderNote, VS_MEDIAN_NOTE } from './notes.ts'
import { RATE_COLUMNS } from './rateText.ts'

const PROVIDER_COLUMNS = 'md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-3'

interface Props {
  providers: ProviderResult[]
  selectedRate: string | null
  onSelectRate: (id: string) => void
  /** True when the rates in this result differ by setting or by negotiated type. */
  showSetting: boolean
  showNegotiatedType: boolean
  /** The searched code with its type ("CPT 99213") and alone ("99213"), for the column notes. */
  filedAs: string
  code: string
}

/** One entry per provider (tax ID), each with its rates for the searched code inline. */
export function ProviderList({
  providers,
  selectedRate,
  onSelectRate,
  showSetting,
  showNegotiatedType,
  filedAs,
  code,
}: Props) {
  return (
    <div className="md:rounded-xl md:border md:border-line md:bg-surface">
      {/* The headings sit outside the clipped list so their notes can open over the rows. */}
      <div className={cx('hidden px-4 py-2 text-meta font-semibold text-muted', PROVIDER_COLUMNS)}>
        <span>Provider</span>
        <span className={cx('grid gap-x-3 px-2', RATE_COLUMNS)}>
          <span className="text-right">Rate</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            vs median
            <Hint label="How rates are compared with the median">{VS_MEDIAN_NOTE}</Hint>
          </span>
          <span>Setting and modifier</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            Filed under
            <Hint label="What the Filed under column means" align="right">
              {filedUnderNote(filedAs, code)}
            </Hint>
          </span>
          <span />
        </span>
      </div>
      <ul className="flex flex-col gap-2.5 md:gap-0 md:overflow-hidden md:rounded-b-xl">
        {providers.map((provider) => (
          <li
            key={provider.tin}
            className={cx(
              'list-none rounded-xl border px-3 pt-3 pb-0.5',
              'md:items-start md:rounded-none md:border-0 md:border-t md:border-line-soft md:px-4 md:py-2',
              // The open rate lights up its whole provider row, name included.
              hasRate(provider, selectedRate)
                ? 'border-accent bg-accent-soft md:ring-1 md:ring-accent md:ring-inset'
                : 'border-line bg-surface',
              PROVIDER_COLUMNS,
            )}
          >
            <div className="min-w-0 pb-2 md:pt-1.5 md:pb-0">
              <h2 className="font-semibold break-words">{provider.name}</h2>
              <p className="text-meta text-muted tabular-nums">
                {provider.tinType === 'ein' ? 'EIN' : 'Tax ID'} {provider.tinDisplay} ·{' '}
                <NpiSummary provider={provider} />
              </p>
            </div>
            <div className="flex flex-col md:gap-0.5">
              {provider.rates.map((rate) => (
                <RateLine
                  key={rate.id}
                  rate={rate}
                  providerNpiCount={provider.npiCount}
                  showSetting={showSetting}
                  showNegotiatedType={showNegotiatedType}
                  selected={rate.id === selectedRate}
                  rowSelected={hasRate(provider, selectedRate)}
                  onlyRate={provider.rates.length === 1}
                  onSelect={onSelectRate}
                />
              ))}
              {provider.hiddenRateCount > 0 && (
                <p className="border-t border-line-soft py-2 text-meta text-muted md:border-0 md:px-2 md:pt-0.5 md:pb-1">
                  {provider.hiddenRateCount === 1
                    ? "1 more rate applies only to this provider's other NPIs."
                    : `${provider.hiddenRateCount} more rates apply only to this provider's other NPIs.`}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function hasRate(provider: ProviderResult, rateId: string | null): boolean {
  return rateId !== null && provider.rates.some((rate) => rate.id === rateId)
}

/** "6 NPIs, including 1881777464". A provider whose only NPI entries are invalid has none to show. */
function NpiSummary({ provider }: { provider: ProviderResult }) {
  if (provider.npiCount === 0) return <>no NPI listed</>
  return (
    <>
      {plural(provider.npiCount, 'NPI')}
      {provider.matchedNpi && (
        <>
          {provider.npiCount > 1 ? ', including ' : ': '}
          <span className="font-semibold text-ink">{provider.matchedNpi}</span>
        </>
      )}
    </>
  )
}
