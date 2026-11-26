import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { crossFade } from '../../lib/crossFade.ts'
import { rateElementId } from '../results/rateText.ts'

/** Where a rate sits on screen, or null when it is not being drawn (hidden, or not listed). */
function topOf(id: string): number | null {
  const rate = document.getElementById(rateElementId(id))
  return rate && rate.getClientRects().length > 0 ? rate.getBoundingClientRect().top : null
}

/**
 * The open rate as it is drawn, which trails the one in the address bar by a moment.
 *
 * Opening or closing the detail panel changes the width of the list beside it, so every row
 * re-wraps. As a plain update the list jumps, and the rate that was clicked moves out from
 * under the pointer. Here that step is a cross-fade, and the page is scrolled by however far
 * the rate moved, so it stays where it was while the rest settles around it. A page too
 * short to scroll cannot be corrected that way; there the fade is all there is.
 *
 * Going from one open rate to another moves nothing, and is passed straight through.
 */
export function useOpenRate(selected: string | null): string | null {
  const [drawn, setDrawn] = useState(selected)
  const held = useRef<{ id: string; top: number } | null>(null)

  const togglesPanel = (drawn === null) !== (selected === null)
  if (drawn !== selected && !togglesPanel) setDrawn(selected)

  useEffect(() => {
    if (drawn === selected) return
    // Note where the rate is before anything moves.
    const id = selected ?? drawn
    const top = id ? topOf(id) : null
    held.current = id && top !== null ? { id, top } : null
    crossFade(() => setDrawn(selected))
  }, [drawn, selected])

  // Part of the same update that redraws the list, before the browser shows it.
  useLayoutEffect(() => {
    const before = held.current
    held.current = null
    if (!before) return
    const top = topOf(before.id)
    if (top !== null && top !== before.top) {
      window.scrollBy({ top: top - before.top, behavior: 'instant' })
    }
  }, [drawn])

  return drawn
}
