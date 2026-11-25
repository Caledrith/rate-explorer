import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, getJson, postJson, withQuery } from './client.ts'
import type { CodeInfo, RateDetail, SearchResponse, SortOrder, StatusResponse } from './types.ts'

/** A search as the API takes it. Values are already validated and normalized. */
export interface SearchParams {
  code: string
  npi?: string
  ein?: string
  billingClass?: string
  sort: SortOrder
  page: number
}

export const PAGE_SIZE = 25

/** Whether the rate file is loading, loaded or failed. Polls while a load is running. */
export function useStatus() {
  return useQuery<StatusResponse, ApiError>({
    queryKey: ['status'],
    queryFn: ({ signal }) => getJson('/api/status', signal),
    staleTime: 0,
    refetchInterval: (query) => {
      if (query.state.error) return 5000
      return query.state.data?.state === 'loading' ? 700 : false
    },
  })
}

export function useSearch(params: SearchParams | null) {
  return useQuery<SearchResponse, ApiError>({
    queryKey: ['search', params],
    enabled: params !== null,
    queryFn: ({ signal }) =>
      getJson(
        withQuery('/api/search', {
          code: params!.code,
          npi: params!.npi,
          ein: params!.ein,
          class: params!.billingClass,
          sort: params!.sort,
          page: params!.page,
          pageSize: PAGE_SIZE,
        }),
        signal,
      ),
    // Changing the class, sort or page keeps the current list on screen until the next arrives.
    placeholderData: (previous, previousQuery) => {
      const before = previousQuery?.queryKey[1] as SearchParams | null | undefined
      const sameSearch =
        before &&
        params &&
        before.code === params.code &&
        before.npi === params.npi &&
        before.ein === params.ein
      return sameSearch ? previous : undefined
    },
  })
}

export function useRateDetail(id: string | null) {
  return useQuery<RateDetail, ApiError>({
    queryKey: ['rate', id],
    enabled: id !== null,
    queryFn: ({ signal }) => getJson(`/api/rates/${encodeURIComponent(id!)}`, signal),
  })
}

/** Codes in the file starting with what has been typed; the most common codes when nothing has. */
export function useCodeSuggestions(prefix: string, enabled: boolean) {
  return useQuery<CodeInfo[], ApiError>({
    queryKey: ['codes', prefix],
    enabled,
    queryFn: ({ signal }) => getJson(withQuery('/api/codes', { prefix, limit: 8 }), signal),
    staleTime: Infinity,
  })
}

/** Asks the server to load the rate file again, then follows its progress. */
export function useReload() {
  const queryClient = useQueryClient()
  return useMutation<{ started: boolean }, ApiError>({
    mutationFn: () => postJson('/api/reload'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['status'] }),
  })
}
