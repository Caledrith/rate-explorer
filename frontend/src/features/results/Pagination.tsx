import type { SearchResponse } from '../../api/types.ts'
import { Button } from '../../components/ui.tsx'
import { formatCount, plural } from '../../lib/format.ts'

interface Props {
  page: SearchResponse['page']
  shown: number
  onPage: (page: number) => void
}

export function Pagination({ page, shown, onPage }: Props) {
  const first = (page.page - 1) * page.pageSize + 1
  const last = first + shown - 1
  // A hand-edited or stale link can ask for a page that no longer exists.
  const pastEnd = shown === 0

  return (
    <nav
      aria-label="Pages of providers"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-meta">{summary()}</p>
      {pastEnd ? (
        <Button size="sm" onClick={() => onPage(page.totalPages)}>
          Go to the last page
        </Button>
      ) : (
        page.totalPages > 1 && (
          <div className="flex gap-2">
            <Button size="sm" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              disabled={page.page >= page.totalPages}
              onClick={() => onPage(page.page + 1)}
            >
              Next
            </Button>
          </div>
        )
      )}
    </nav>
  )

  function summary(): string {
    if (pastEnd) return `Page ${formatCount(page.page)} is past the last page.`
    if (page.totalPages === 1) {
      return page.totalProviders === 1
        ? '1 provider'
        : `All ${formatCount(page.totalProviders)} providers`
    }
    return `Showing ${formatCount(first)} to ${formatCount(last)} of ${plural(page.totalProviders, 'provider')}`
  }
}
