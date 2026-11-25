import { expect, test } from 'vitest'
import { modifierCodes, modifierText, npiCoverageText, placeOfServiceText } from './rateText.ts'

// A non-breaking space, written out so the tests show where the text may not wrap.
const NBSP = ' '

test('place of service puts words before codes, and a code never wraps away from its name', () => {
  expect(placeOfServiceText([{ code: '11', label: 'Office' }])).toBe(`Office${NBSP}(11)`)
  expect(
    placeOfServiceText([
      { code: '02', label: 'Telehealth' },
      { code: '10', label: 'Telehealth at home' },
    ]),
  ).toBe(`Telehealth${NBSP}(02), Telehealth at home${NBSP}(10)`)
  // A code with no label is still shown, plainly.
  expect(placeOfServiceText([{ code: '77', label: null }])).toBe(`Place of service${NBSP}77`)
  expect(placeOfServiceText([])).toBe('Any setting')
})

test('the panel follows each modifier code with its plain-language wording', () => {
  expect(modifierText([])).toBe('No modifier')
  expect(modifierText([{ code: '25', label: 'separate same-day visit' }])).toBe(
    'Modifier 25 (separate same-day visit)',
  )
  // Each wording stays with its own code, and a code without one is shown bare.
  expect(
    modifierText([
      { code: '25', label: 'separate same-day visit' },
      { code: 'GT', label: null },
      { code: '95', label: 'live video' },
    ]),
  ).toBe('Modifiers 25 (separate same-day visit), GT, 95 (live video)')
  expect(modifierText([{ code: 'U4', label: null }])).toBe('Modifier U4')
})

test('the list shows modifier codes alone', () => {
  expect(modifierCodes([])).toBe('No modifier')
  expect(modifierCodes([{ code: '25', label: 'separate same-day visit' }])).toBe('Modifier 25')
  expect(
    modifierCodes([
      { code: '25', label: 'separate same-day visit' },
      { code: '95', label: null },
    ]),
  ).toBe('Modifiers 25, 95')
})

test('NPI coverage is mentioned only when a rate leaves some of the provider out', () => {
  expect(npiCoverageText(6, 6)).toBeNull()
  expect(npiCoverageText(5, 6)).toBe(`5${NBSP}of${NBSP}6${NBSP}NPIs`)
  // The file named no usable NPI for this rate's provider groups.
  expect(npiCoverageText(0, 6)).toBe(`no${NBSP}NPI${NBSP}listed`)
})
