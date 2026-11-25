import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx.ts'

/** The gap the note keeps from the edge of the page; the same as the page's side padding. */
const PAGE_MARGIN = 16

interface Props {
  /** What the button is for, read by screen readers: "About the median comparison". */
  label: string
  children: ReactNode
  /** Which edge of the button the note lines up with. Use "right" near the right edge of the page. */
  align?: 'left' | 'right'
}

/**
 * A small "?" that shows a note explaining something nearby.
 *
 * It is for text that is worth reading once and noise after that. Unlike a hover-only
 * tooltip it works by tap and by keyboard: it is a real button that opens on click,
 * Enter or Space, and closes on Escape or a click elsewhere. With a mouse it also opens
 * on hover. The note sits in a live region, so it is announced when it opens.
 */
export function Hint({ label, children, align = 'left' }: Props) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const note = useRef<HTMLSpanElement>(null)
  const open = pinned || hovered

  // The note hangs from the button, which can sit anywhere in a line of text. Before it
  // is painted, slide it sideways just far enough to stay on the page.
  useLayoutEffect(() => {
    const element = note.current
    const anchor = root.current
    if (!open || !element || !anchor) return
    // Measure where the stylesheet puts it, then override only if that is off the page.
    element.style.left = ''
    element.style.right = ''
    const { left, right } = element.getBoundingClientRect()
    const pageWidth = document.documentElement.clientWidth
    let shift = Math.min(0, pageWidth - PAGE_MARGIN - right)
    // The left edge wins if both cannot fit, because that is where reading starts.
    if (left + shift < PAGE_MARGIN) shift = PAGE_MARGIN - left
    if (shift === 0) return
    // Moved with `left`, not a transform: a transformed box can still widen the page
    // and give a phone a sideways scroll.
    element.style.left = `${left + shift - anchor.getBoundingClientRect().left}px`
    element.style.right = 'auto'
  }, [open])

  useEffect(() => {
    if (!pinned) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setPinned(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pinned])

  return (
    <span
      ref={root}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          // Handled here, so an open detail panel does not also close.
          event.preventDefault()
          setPinned(false)
          setHovered(false)
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setPinned((value) => !value)}
        className={cx(
          'inline-flex size-[1.125rem] items-center justify-center rounded-full border text-meta leading-none font-semibold',
          open
            ? 'border-ink bg-ink text-surface'
            : 'border-line-strong bg-surface text-muted hover:border-ink hover:text-ink',
        )}
      >
        ?
      </button>
      <span
        ref={note}
        role="status"
        className={cx(
          // whitespace-normal: the note wraps even when the heading it sits in does not.
          'absolute top-full z-10 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line-strong bg-surface p-2.5 text-left text-meta font-normal whitespace-normal text-ink shadow-lg',
          align === 'right' ? 'right-0' : 'left-0',
          !open && 'hidden',
        )}
      >
        {open && children}
      </span>
    </span>
  )
}
