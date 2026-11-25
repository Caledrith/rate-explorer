import { expect, test } from 'vitest'
import { modifierCodes, modifierText, placeOfServiceText } from './rateText.ts'

test('place of service puts words before codes', () => {
  expect(placeOfServiceText([{ code: '11', label: 'Office' }])).toBe('Office (11)')
  expect(
    placeOfServiceText([
      { code: '02', label: 'Telehealth' },
      { code: '10', label: 'Telehealth at home' },
    ]),
  ).toBe('Telehealth (02), Telehealth at home (10)')
  // A code with no label is still shown, plainly.
  expect(placeOfServiceText([{ code: '77', label: null }])).toBe('Place of service 77')
  expect(placeOfServiceText([])).toBe('Any setting')
})

test('modifiers show their codes and any plain-language labels', () => {
  expect(modifierText([])).toBe('No modifier')
  expect(modifierText([{ code: '25', label: 'separate same-day visit' }])).toBe(
    'Modifier 25 · separate same-day visit',
  )
  expect(
    modifierText([
      { code: '25', label: 'separate same-day visit' },
      { code: '95', label: 'live video' },
    ]),
  ).toBe('Modifiers 25, 95 · separate same-day visit, live video')
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
