import type { SearchResponse } from '../../api/types.ts'
import { Button } from '../../components/ui.tsx'
import { formatCount } from '../../lib/format.ts'

interface Props {
  page: SearchResponse['page']
  shown: number
  onPage: (page: number) => void
}

export function Pagination({ page, shown, onPage }: Props) {
  const first = (page.page - 1) * page.pageSize + 1
  const last = first + shown - 1
  return (
    <nav
      aria-label="Pages of providers"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-meta">
        {shown > 0
          ? `Showing ${formatCount(first)} to ${formatCount(last)} of ${formatCount(page.totalProviders)} providers`
          : `No providers on page ${page.page}. There are ${formatCount(page.totalPages)} pages.`}
      </p>
      {page.totalPages > 1 && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={page.page <= 1}
            onClick={() => onPage(Math.min(page.page - 1, page.totalPages))}
          >
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
      )}
    </nav>
  )
}
