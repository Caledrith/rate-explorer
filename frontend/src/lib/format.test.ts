import { expect, test } from 'vitest'
import { codeTypeName, formatRate, formatVsMedian, plural, sentenceCase } from './format.ts'

test('rates are dollars unless the file says percentage', () => {
  expect(formatRate(51.45, 'negotiated')).toBe('$51.45')
  expect(formatRate(1234.5, null)).toBe('$1,234.50')
  expect(formatRate(65, 'percentage')).toBe('65%')
})

test('a rate at the median is quiet and one far from it is notable', () => {
  expect(formatVsMedian(0)).toEqual({ text: 'At median', notable: false })
  expect(formatVsMedian(-2)).toEqual({ text: '−2%', notable: false })
  expect(formatVsMedian(61)).toEqual({ text: '+61%', notable: true })
  expect(formatVsMedian(-25)).toEqual({ text: '−25%', notable: true })
  expect(formatVsMedian(null)).toBeNull()
})

test('counts read naturally', () => {
  expect(plural(1, 'provider')).toBe('1 provider')
  expect(plural(1013, 'provider')).toBe('1,013 providers')
})

test('file text is made readable without changing its words', () => {
  expect(sentenceCase('OFFICE/OUTPATIENT VISIT EST')).toBe('Office/outpatient visit est')
  expect(codeTypeName('RC')).toBe('Revenue code')
  expect(codeTypeName('CPT')).toBe('CPT')
  expect(codeTypeName('APC')).toBe('APC')
})
