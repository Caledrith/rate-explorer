import type { FieldError } from './types.ts'

/**
 * Any failed request, in one shape. status 0 means the request never got an answer
 * (server down, network gone); otherwise it is the HTTP status.
 */
export class ApiError extends Error {
  readonly status: number
  readonly fields: FieldError[]

  constructor(status: number, message: string, fields: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }

  get isNetworkFailure() {
    return this.status === 0
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { Accept: 'application/json' } })
  } catch (cause) {
    // An aborted request is a cancellation, not a failure to report.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'The server did not respond.')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const problem = (body ?? {}) as { message?: string; fields?: FieldError[] }
    throw new ApiError(
      response.status,
      problem.message ?? `The server answered ${response.status}.`,
      problem.fields ?? [],
    )
  }
  if (body === null) throw new ApiError(response.status, 'The server sent an unreadable answer.')
  return body as T
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal })
}

export function postJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'POST' })
}

/** Builds a query string, leaving out empty values. */
export function withQuery(
  path: string,
  params: Record<string, string | number | null | undefined>,
) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `${path}?${text}` : path
}
