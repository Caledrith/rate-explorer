import type { CodeLabel } from '../../api/types.ts'

/**
 * Column template shared by the header row and every rate, so they line up.
 *
 * The list is a table from the `lg` breakpoint up and a stack of cards below it. The fixed
 * columns, the provider column and the row padding take about 39rem between them, so a
 * narrower list leaves the setting column too little room to hold a phrase on one line.
 */
export const RATE_COLUMNS = 'lg:grid-cols-[5rem_5.75rem_minmax(0,1fr)_8.5rem_1rem]'

/** DOM id of a rate's button, so focus can return to it when the detail panel closes. */
export function rateElementId(id: string): string {
  return `rate-${id}`
}

/**
 * Words first, codes after: "Telehealth (02), Telehealth at home (10)". The space before
 * each code is non-breaking, so a wrapped line never starts with a bare "(02)".
 */
export function placeOfServiceText(places: CodeLabel[]): string {
  if (places.length === 0) return 'Any setting'
  return places
    .map((place) =>
      place.label ? `${place.label}\u00a0(${place.code})` : `Place of service\u00a0${place.code}`,
    )
    .join(', ')
}

/** "Modifier 25", "Modifiers 25, 95" or "No modifier": the codes alone, as the list shows them. */
export function modifierCodes(modifiers: CodeLabel[]): string {
  if (modifiers.length === 0) return 'No modifier'
  const noun = modifiers.length === 1 ? 'Modifier' : 'Modifiers'
  return `${noun} ${modifiers.map((modifier) => modifier.code).join(', ')}`
}

/**
 * "Modifiers 25 (separate E/M, same day), GT": each code followed by its plain-language
 * wording, as the detail panel shows them. Codes with no wording are shown bare.
 */
export function modifierText(modifiers: CodeLabel[]): string {
  if (modifiers.length === 0) return 'No modifier'
  const noun = modifiers.length === 1 ? 'Modifier' : 'Modifiers'
  const described = modifiers.map((modifier) =>
    modifier.label ? `${modifier.code} (${modifier.label})` : modifier.code,
  )
  return `${noun} ${described.join(', ')}`
}

/** "5 of 6 NPIs" when a rate covers only some of the provider's NPIs; null when it covers all. */
export function npiCoverageText(covered: number, of: number): string | null {
  if (covered >= of) return null
  // Non-breaking spaces: the phrase wraps as a whole or not at all.
  return covered === 0 ? 'no\u00a0NPI\u00a0listed' : `${covered}\u00a0of\u00a0${of}\u00a0NPIs`
}
