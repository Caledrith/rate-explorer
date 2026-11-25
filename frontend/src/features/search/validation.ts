// The same rules and wording as the server's InputNormalizer, checked before a request is
// sent so mistakes are caught next to the field. The server remains the authority.

export interface SearchDraft {
  code: string
  npi: string
  ein: string
}

export interface ValidSearch {
  code: string
  npi?: string
  ein?: string
}

export type DraftErrors = Partial<Record<keyof SearchDraft, string>>

export type ValidationResult = { ok: true; value: ValidSearch } | { ok: false; errors: DraftErrors }

const CODE = /^[A-Z0-9]{2,7}$/

function digits(raw: string, noun: string, length: number): { value?: string; error?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  const compact = trimmed.replace(/[-\s]/g, '')
  if (!/^\d+$/.test(compact)) return { error: `${noun} has ${length} digits and no letters.` }
  if (compact.length !== length) {
    return { error: `${noun} has ${length} digits. This has ${compact.length}.` }
  }
  return { value: compact }
}

export function validateSearch(draft: SearchDraft): ValidationResult {
  const errors: DraftErrors = {}

  const code = draft.code.trim().toUpperCase()
  if (code === '') errors.code = 'Enter a billing code.'
  else if (!CODE.test(code)) errors.code = 'A billing code is 2 to 7 letters or digits.'

  const npi = digits(draft.npi, 'An NPI', 10)
  if (npi.error) errors.npi = npi.error

  const ein = digits(draft.ein, 'An EIN', 9)
  if (ein.error) errors.ein = ein.error

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { code, npi: npi.value, ein: ein.value } }
}

/** Nine digits as 12-3456789, the way an EIN is usually written. */
export function formatEin(ein: string): string {
  return /^\d{9}$/.test(ein) ? `${ein.slice(0, 2)}-${ein.slice(2)}` : ein
}
