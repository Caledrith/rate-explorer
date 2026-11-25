import type { ProviderResult } from '../../api/types.ts'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import { RateLine } from './RateLine.tsx'
import { RATE_COLUMNS } from './rateText.ts'

const PROVIDER_COLUMNS = 'md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-3'

interface Props {
  providers: ProviderResult[]
  selectedRate: string | null
  onSelectRate: (id: string) => void
  /** Dims the list while the next page or sort order is on its way. */
  stale: boolean
}

/** One entry per provider (tax ID), each with its rates for the searched code inline. */
export function ProviderList({ providers, selectedRate, onSelectRate, stale }: Props) {
  return (
    <div
      className={cx(
        'flex flex-col gap-2.5 transition-opacity md:gap-0 md:overflow-hidden md:rounded-xl md:border md:border-line md:bg-surface',
        stale && 'opacity-60',
      )}
    >
      <div
        aria-hidden="true"
        className={cx('hidden px-4 py-2 text-meta font-semibold text-muted', PROVIDER_COLUMNS)}
      >
        <span>Provider</span>
        <span className={cx('grid gap-x-3 px-2', RATE_COLUMNS)}>
          <span className="text-right">Rate</span>
          <span>vs median</span>
          <span>Setting and modifier</span>
          <span>Filed under</span>
          <span />
        </span>
      </div>
      <ul className="contents">
        {providers.map((provider) => (
          <ProviderRow
            key={provider.tin}
            provider={provider}
            selectedRate={selectedRate}
            onSelectRate={onSelectRate}
          />
        ))}
      </ul>
    </div>
  )
}

function ProviderRow({
  provider,
  selectedRate,
  onSelectRate,
}: {
  provider: ProviderResult
  selectedRate: string | null
  onSelectRate: (id: string) => void
}) {
  return (
    <li
      className={cx(
        'list-none rounded-xl border border-line bg-surface px-3 pt-3 pb-0.5',
        'md:items-start md:rounded-none md:border-0 md:border-t md:border-line-soft md:px-4 md:py-2',
        PROVIDER_COLUMNS,
      )}
    >
      <div className="min-w-0 pb-2 md:pt-1.5 md:pb-0">
        <h2 className="font-semibold break-words">{provider.name}</h2>
        <p className="text-meta text-muted tabular-nums">
          {provider.tinType === 'ein' ? 'EIN' : 'Tax ID'} {provider.tinDisplay} ·{' '}
          {plural(provider.npiCount, 'NPI')}
          {provider.matchedNpi && (
            <>
              {provider.npiCount > 1 ? ', including ' : ': '}
              <span className="font-semibold text-ink">{provider.matchedNpi}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col md:gap-0.5">
        {provider.rates.map((rate) => (
          <RateLine
            key={rate.id}
            rate={rate}
            providerNpiCount={provider.npiCount}
            selected={rate.id === selectedRate}
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
  )
}
