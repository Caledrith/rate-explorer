import { describe, expect, test } from 'vitest'
import { formatEin, validateSearch } from './validation.ts'

describe('validateSearch', () => {
  test('tidies what people type', () => {
    expect(validateSearch({ code: ' g0438 ', npi: ' 1881777464 ', ein: '13-1624096' })).toEqual({
      ok: true,
      value: { code: 'G0438', npi: '1881777464', ein: '131624096' },
    })
  })

  test('leaves blank optional fields out', () => {
    expect(validateSearch({ code: '99213', npi: '  ', ein: '' })).toEqual({
      ok: true,
      value: { code: '99213', npi: undefined, ein: undefined },
    })
  })

  test('requires a code', () => {
    expect(validateSearch({ code: '  ', npi: '', ein: '' })).toEqual({
      ok: false,
      errors: { code: 'Enter a billing code.' },
    })
    expect(validateSearch({ code: '99-213', npi: '', ein: '' })).toEqual({
      ok: false,
      errors: { code: 'A billing code is 2 to 7 letters or digits.' },
    })
  })

  test('says how many digits an identifier has', () => {
    expect(validateSearch({ code: '99213', npi: '18817774', ein: '13-37573' })).toEqual({
      ok: false,
      errors: {
        npi: 'An NPI has 10 digits. This has 8.',
        ein: 'An EIN has 9 digits. This has 7.',
      },
    })
    expect(validateSearch({ code: '99213', npi: '18817774ab', ein: '' })).toEqual({
      ok: false,
      errors: { npi: 'An NPI has 10 digits and no letters.' },
    })
  })
})

test('formatEin adds the hyphen to nine digits and leaves anything else alone', () => {
  expect(formatEin('131624096')).toBe('13-1624096')
  expect(formatEin('13-1624096')).toBe('13-1624096')
  expect(formatEin('12345')).toBe('12345')
})
