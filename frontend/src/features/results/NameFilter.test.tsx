import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NameFilter } from './NameFilter.tsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const box = () => screen.getByRole('searchbox', { name: 'Provider name' })
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
const pause = () => act(() => vi.advanceTimersByTime(300))

test('what is typed is applied once typing pauses, not on every key', () => {
  const onChange = vi.fn()
  render(<NameFilter applied={null} onChange={onChange} />)

  type('ho')
  type('hosp')
  expect(onChange).not.toHaveBeenCalled()

  pause()
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledWith('hosp')
})

test('spacing is tidied, and one letter is too little to filter by', () => {
  const onChange = vi.fn()
  render(<NameFilter applied={null} onChange={onChange} />)

  type('  st   mary ')
  pause()
  expect(onChange).toHaveBeenLastCalledWith('st mary')

  type('s')
  pause()
  expect(onChange).toHaveBeenLastCalledWith(null)
})

test('typing ahead of the answer is not overwritten when the answer catches up', () => {
  const onChange = vi.fn()
  const view = render(<NameFilter applied={null} onChange={onChange} />)

  type('ho')
  pause()
  type('hospital')
  // The address bar now holds what was asked for a moment ago.
  view.rerender(<NameFilter applied="ho" onChange={onChange} />)

  expect(box()).toHaveValue('hospital')
  pause()
  expect(onChange).toHaveBeenLastCalledWith('hospital')
})

test('a filter changed elsewhere, such as by Back or a cleared search, shows in the box', () => {
  const view = render(<NameFilter applied="hosp" onChange={vi.fn()} />)
  expect(box()).toHaveValue('hosp')

  view.rerender(<NameFilter applied={null} onChange={vi.fn()} />)

  expect(box()).toHaveValue('')
})
