// Explanations that are worth reading once. They live behind "?" hints rather than on
// the page, and are written here once so the column headings (wide screens) and the
// single hint above the list (phones) say the same thing.

export const VS_MEDIAN_NOTE =
  'Each rate is compared with the median for its billing class, across every provider for this code. A provider’s price counts once.'

/** `filedAs` is how the searched code reads with its type, for example "CPT 99213". */
export function filedUnderNote(filedAs: string, code: string): string {
  return `Blank means the rate is filed as ${filedAs}. A badge means it is filed under another code, with ${code} written on the price itself.`
}
