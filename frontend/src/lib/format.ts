const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const count = new Intl.NumberFormat('en-US')

export function formatMoney(value: number): string {
  return money.format(value)
}

/** A negotiated rate is dollars unless the file says it is a percentage of charges. */
export function formatRate(value: number, negotiatedType: string | null): string {
  return negotiatedType === 'percentage' ? `${value}%` : formatMoney(value)
}

export function formatCount(value: number): string {
  return count.format(value)
}

/** "1 provider", "1,013 providers". */
export function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(value)} ${value === 1 ? singular : pluralForm}`
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

/**
 * How a rate sits against the median for its class. Within one percent reads as
 * "At median"; the sign uses a real minus so columns of numbers line up.
 */
export function formatVsMedian(percent: number | null): { text: string; notable: boolean } | null {
  if (percent === null) return null
  if (percent === 0) return { text: 'At median', notable: false }
  const sign = percent > 0 ? '+' : '−'
  return { text: `${sign}${Math.abs(percent)}%`, notable: Math.abs(percent) >= 10 }
}

/** The file writes names in capitals ("OFFICE/OUTPATIENT VISIT EST"); sentence case reads easier. */
export function sentenceCase(text: string): string {
  const lower = text.trim().toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const CODE_TYPE_NAMES: Record<string, string> = {
  RC: 'Revenue code',
  CPT: 'CPT',
  HCPCS: 'HCPCS',
  'MS-DRG': 'MS-DRG',
  NDC: 'NDC',
}

/** "Revenue code" for RC; other code systems are known by their abbreviation. */
export function codeTypeName(type: string): string {
  return CODE_TYPE_NAMES[type.toUpperCase()] ?? type
}

export function classLabel(billingClass: string): string {
  return billingClass.charAt(0).toUpperCase() + billingClass.slice(1)
}
