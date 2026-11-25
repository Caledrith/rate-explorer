import type { CodeLabel } from '../../api/types.ts'

/** Column template shared by the header row and every rate, so they line up on wide screens. */
export const RATE_COLUMNS = 'md:grid-cols-[5rem_5.75rem_minmax(0,1fr)_8.5rem_1rem]'

/** DOM id of a rate's button, so focus can return to it when the detail panel closes. */
export function rateElementId(id: string): string {
  return `rate-${id}`
}

/** Words first, codes after: "Telehealth (02), Telehealth at home (10)". */
export function placeOfServiceText(places: CodeLabel[]): string {
  if (places.length === 0) return 'Any setting'
  return places
    .map((place) =>
      place.label ? `${place.label} (${place.code})` : `Place of service ${place.code}`,
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
 * "Modifier 25 · separate E/M, same day": the codes with their plain-language wording,
 * as the detail panel shows them. Codes with no wording are shown bare.
 */
export function modifierText(modifiers: CodeLabel[]): string {
  if (modifiers.length === 0) return 'No modifier'
  const codes = modifiers.map((modifier) => modifier.code).join(', ')
  const labels = modifiers.map((modifier) => modifier.label).filter(Boolean)
  const noun = modifiers.length === 1 ? 'Modifier' : 'Modifiers'
  return labels.length > 0 ? `${noun} ${codes} · ${labels.join(', ')}` : `${noun} ${codes}`
}
