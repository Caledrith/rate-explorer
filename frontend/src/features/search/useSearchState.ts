import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { SearchParams } from '../../api/queries.ts'
import type { SortOrder } from '../../api/types.ts'
import type { ValidSearch } from './validation.ts'

const SORTS: SortOrder[] = ['name', 'rate_asc', 'rate_desc']

/**
 * The address bar is the single source of truth for what is being searched and which
 * rate is open. That makes every result shareable and makes Back and Forward work.
 *
 *   ?code=99213&npi=1881777464&class=professional&sort=rate_desc&page=2&rate=179548-141637021
 */
export function useSearchState() {
  const [params, setParams] = useSearchParams()

  const search = useMemo<SearchParams | null>(() => {
    const code = params.get('code')?.trim()
    if (!code) return null
    const sort = params.get('sort') as SortOrder | null
    const page = Number(params.get('page'))
    return {
      code,
      npi: params.get('npi') ?? undefined,
      ein: params.get('ein') ?? undefined,
      billingClass: params.get('class') ?? undefined,
      sort: sort && SORTS.includes(sort) ? sort : 'name',
      page: Number.isInteger(page) && page >= 1 ? page : 1,
    }
  }, [params])

  const selectedRate = params.get('rate')

  /** Starts a new search. Everything that depended on the old one is cleared. */
  const submit = useCallback(
    (next: ValidSearch) => {
      const fresh = new URLSearchParams({ code: next.code })
      if (next.npi) fresh.set('npi', next.npi)
      if (next.ein) fresh.set('ein', next.ein)
      setParams(fresh)
    },
    [setParams],
  )

  /** Changes one refinement of the current search. Any change returns to the first page. */
  const refine = useCallback(
    (change: { billingClass?: string | null; sort?: SortOrder; page?: number }) => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        const set = (key: string, value: string | null) =>
          value ? next.set(key, value) : next.delete(key)
        if ('billingClass' in change) set('class', change.billingClass ?? null)
        if (change.sort) set('sort', change.sort === 'name' ? null : change.sort)
        set('page', change.page && change.page > 1 ? String(change.page) : null)
        // The open rate may not be on the list any more.
        next.delete('rate')
        return next
      })
    },
    [setParams],
  )

  /** Drops the NPI and EIN but keeps the code, class and sort. */
  const clearProviderFilter = useCallback(() => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const key of ['npi', 'ein', 'page', 'rate']) next.delete(key)
      return next
    })
  }, [setParams])

  const selectRate = useCallback(
    (id: string | null) => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (id) next.set('rate', id)
        else next.delete('rate')
        return next
      })
    },
    [setParams],
  )

  return { search, selectedRate, submit, refine, clearProviderFilter, selectRate }
}
