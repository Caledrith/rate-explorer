import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Hint } from './Hint.tsx'

function setup() {
  const onDocumentEscape = vi.fn()
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) onDocumentEscape()
  })
  render(
    <div>
      <Hint label="About the median">Each rate is compared with the median.</Hint>
      <p>Elsewhere</p>
    </div>,
  )
  return {
    user: userEvent.setup(),
    button: screen.getByRole('button', { name: 'About the median' }),
    onDocumentEscape,
  }
}

test('the note is hidden until asked for, and opens by click', async () => {
  const { user, button } = setup()

  expect(screen.queryByText('Each rate is compared with the median.')).not.toBeInTheDocument()
  expect(button).toHaveAttribute('aria-expanded', 'false')

  await user.click(button)

  expect(screen.getByText('Each rate is compared with the median.')).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-expanded', 'true')
})

test('it opens from the keyboard and Escape closes it without reaching the page behind', async () => {
  const { user, button, onDocumentEscape } = setup()

  await user.tab()
  expect(button).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByText('Each rate is compared with the median.')).toBeInTheDocument()

  await user.keyboard('{Escape}')
  expect(screen.queryByText('Each rate is compared with the median.')).not.toBeInTheDocument()
  // An open detail panel listens for Escape on the document; this one was already handled.
  expect(onDocumentEscape).not.toHaveBeenCalled()
})

test('a click elsewhere closes it', async () => {
  const { user, button } = setup()
  await user.click(button)

  // A real click elsewhere: the pointer leaves the hint and presses on something else.
  await user.click(screen.getByText('Elsewhere'))

  expect(screen.queryByText('Each rate is compared with the median.')).not.toBeInTheDocument()
})

test('with a mouse it also opens on hover', async () => {
  const { user, button } = setup()

  await user.hover(button)
  expect(screen.getByText('Each rate is compared with the median.')).toBeInTheDocument()

  await user.unhover(button)
  expect(screen.queryByText('Each rate is compared with the median.')).not.toBeInTheDocument()
})

test('a note that would run off the page is moved back onto it', async () => {
  // jsdom lays nothing out, so give it a phone: 390 wide, with the button near the right edge.
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 })
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const isNote = this.getAttribute('role') === 'status'
      return new DOMRect(250, 0, isNote ? 256 : 18, 18)
    })

  try {
    const { user, button } = setup()
    await user.click(button)

    // 256 wide from x=250 would end at 506; it has to end 16 short of 390, so 132 to the left.
    const note = screen.getByRole('status')
    expect(note.style.left).toBe('-132px')
    expect(note.style.right).toBe('auto')
  } finally {
    rects.mockRestore()
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
  }
})
