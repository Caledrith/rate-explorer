import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useOpenRate } from './useOpenRate.ts'

/**
 * A list of two rates that re-flows when the panel opens, as the real one does: with a rate
 * open, everything sits 120px lower.
 */
function List({ selected }: { selected: string | null }) {
  const drawn = useOpenRate(selected)
  return (
    <div data-panel={drawn ? 'open' : 'closed'}>
      <button id="rate-a">Rate A</button>
      <button id="rate-b">Rate B</button>
      <output>{drawn ?? 'none'}</output>
    </div>
  )
}

function layOut({ drawnRates = true } = {}) {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => (drawnRates ? [{}] : []) as unknown as DOMRectList,
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const lowered = this.closest('[data-panel="open"]') ? 120 : 0
    return { top: (this.id === 'rate-b' ? 700 : 300) + lowered } as DOMRect
  })
  const scrollBy = vi.fn()
  vi.stubGlobal('scrollBy', scrollBy)
  return scrollBy
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('opening a rate scrolls the page by however far that rate moved, so it stays put', async () => {
  const scrollBy = layOut()
  const view = render(<List selected={null} />)

  view.rerender(<List selected="b" />)

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('b'))
  expect(scrollBy).toHaveBeenCalledTimes(1)
  expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'instant' })
})

test('closing it does the same in the other direction', async () => {
  const scrollBy = layOut()
  const view = render(<List selected="b" />)

  view.rerender(<List selected={null} />)

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('none'))
  expect(scrollBy).toHaveBeenCalledWith({ top: -120, behavior: 'instant' })
})

test('going from one open rate to another moves nothing and is not delayed', () => {
  const scrollBy = layOut()
  const view = render(<List selected="a" />)

  view.rerender(<List selected="b" />)

  // Drawn in the same update, with no cross-fade in between.
  expect(screen.getByRole('status')).toHaveTextContent('b')
  expect(scrollBy).not.toHaveBeenCalled()
})

test('a rate that is not on screen is left alone', async () => {
  // On narrow screens the panel covers the list, so the rate has no position to keep.
  const scrollBy = layOut({ drawnRates: false })
  const view = render(<List selected={null} />)

  view.rerender(<List selected="b" />)

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('b'))
  expect(scrollBy).not.toHaveBeenCalled()
})
