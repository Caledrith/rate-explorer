import { afterEach, expect, test, vi } from 'vitest'
import { crossFade } from './crossFade.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'startViewTransition')
})

function browserWithViewTransitions() {
  const started = vi.fn((update: () => void) => update())
  Object.defineProperty(document, 'startViewTransition', { value: started, configurable: true })
  return started
}

test('where the browser cannot cross-fade, the change simply happens', () => {
  const change = vi.fn()

  crossFade(change)

  expect(change).toHaveBeenCalledTimes(1)
})

test('where it can, the change is made inside the transition', () => {
  const started = browserWithViewTransitions()
  const change = vi.fn()

  crossFade(change)

  expect(started).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledTimes(1)
})

test('someone who has asked for less motion gets the change without the fade', () => {
  const started = browserWithViewTransitions()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
  const change = vi.fn()

  crossFade(change)

  expect(started).not.toHaveBeenCalled()
  expect(change).toHaveBeenCalledTimes(1)
})
