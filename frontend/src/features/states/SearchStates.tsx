import type { ApiError } from '../../api/client.ts'
import type { NoResults, SearchResponse } from '../../api/types.ts'
import { Button, Notice } from '../../components/ui.tsx'
import { classLabel, plural } from '../../lib/format.ts'

/** The request failed. The search stays in the address bar, so retrying needs no retyping. */
export function SearchFailed({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.status === 400 && error.fields.length > 0) {
    return (
      <Notice title="This search cannot be run">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {error.fields.map((field) => (
            <li key={field.field}>{field.message}</li>
          ))}
        </ul>
        <p className="text-meta text-muted">Correct the fields above and search again.</p>
      </Notice>
    )
  }
  return (
    <Notice
      tone="danger"
      title="The search did not finish"
      actions={
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      <p>
        {error.isNetworkFailure ? 'The server did not respond.' : error.message} Your search is
        still filled in.
      </p>
    </Notice>
  )
}

interface EmptyProps {
  result: SearchResponse
  onSearchCode: (code: string) => void
  onClearProvider: () => void
  onClearClass: () => void
}

/** Why a search found nothing, and the quickest way to something that will. */
export function NoResultsNotice({
  result,
  onSearchCode,
  onClearProvider,
  onClearClass,
}: EmptyProps) {
  const { query, noResults, code } = result
  if (!noResults) return null

  switch (noResults.reason) {
    case 'code_not_in_file':
      return (
        <Notice
          title={`No rates for ${query.code}`}
          actions={noResults.closestCodes.map((closest) => (
            <Button key={closest.code} size="sm" onClick={() => onSearchCode(closest.code)}>
              {closest.code}
            </Button>
          ))}
        >
          <p>
            {query.code} is not one of the billing codes in this file.{' '}
            {noResults.closestCodes.length > 0
              ? 'Check the code, or try one close to it.'
              : 'Check the code for a typing mistake.'}
          </p>
        </Notice>
      )

    case 'no_rates_in_class':
      return (
        <Notice
          title={`No ${query.billingClass ?? ''} rates here`}
          actions={
            <Button variant="primary" onClick={onClearClass}>
              Show all rates
            </Button>
          }
        >
          <p>
            This search has rates, but none billed as{' '}
            {classLabel(query.billingClass ?? 'this class').toLowerCase()}.
          </p>
        </Notice>
      )

    default:
      return (
        <Notice
          title={`No ${query.code} rates for this provider`}
          actions={
            <>
              <Button variant="primary" onClick={onClearProvider}>
                Clear provider filter
              </Button>
              {code && (
                <span className="text-meta text-muted">
                  Shows all {plural(code.providerCount, 'provider')} with a {query.code} rate.
                </span>
              )}
            </>
          }
        >
          {providerSentences(query.code, noResults).map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </Notice>
      )
  }
}

/** Separates "this provider is not in the file" from "it is, but has no rate for this code". */
function providerSentences(code: string, noResults: NoResults): string[] {
  const sentences: string[] = []
  const { ein, npi } = noResults

  if (ein) {
    sentences.push(
      ein.inFile
        ? `EIN ${ein.einDisplay} is in this file as ${ein.name ?? 'an unnamed provider'}, with rates for ${plural(ein.codeCount, 'code')}.`
        : `EIN ${ein.einDisplay} is not in this file.`,
    )
  }
  if (npi) {
    sentences.push(
      npi.inFile
        ? `NPI ${npi.npi} is in this file under ${plural(npi.providerCount, 'provider')}.`
        : `NPI ${npi.npi} is not in this file.`,
    )
  }
  const known = [ein?.inFile, npi?.inFile].filter((value) => value !== undefined)
  if (known.length > 0 && known.every(Boolean)) {
    sentences.push(
      ein && npi
        ? `None of that provider's ${code} rates apply to this EIN and NPI together.`
        : `None of them is ${code}.`,
    )
  }
  return sentences
}

/** Placeholder rows in the shape of the list, shown while a new search is in flight. */
export function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Searching" className="flex animate-pulse flex-col gap-4">
      <div className="h-7 w-80 max-w-full rounded bg-line-soft" />
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((tile) => (
          <div key={tile} className="h-16 rounded-xl bg-line-soft" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div
            key={row}
            className="flex items-center gap-6 border-t border-line-soft px-4 py-4 first:border-t-0"
          >
            <div className="h-4 w-40 rounded bg-line-soft" />
            <div className="h-4 w-16 rounded bg-line-soft" />
            <div className="hidden h-4 flex-1 rounded bg-line-soft md:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Searching…</span>
    </div>
  )
}
