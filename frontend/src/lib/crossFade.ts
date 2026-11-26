import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * Makes a change to the page as a cross-fade from the old screen to the new one, where the
 * browser can do that (the View Transitions API). In other browsers, and for anyone who has
 * asked their system for less motion, the change simply happens.
 */
export function crossFade(change: () => void) {
  const lessMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (lessMotion || typeof document.startViewTransition !== 'function') {
    change()
    return
  }
  // The browser pictures the page, runs the change, then fades from the picture to the
  // result. The change has to be on screen by the time the callback returns, hence flushSync.
  document.startViewTransition(() => flushSync(change))
}

/**
 * Follows `value` one cross-fade behind. When `value` changes, the copy returned here changes
 * inside crossFade, so whatever is drawn from it dissolves into its next state instead of
 * snapping to it.
 */
export function useCrossFaded<T>(value: T): T {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (!Object.is(shown, value)) crossFade(() => setShown(value))
  }, [shown, value])
  return shown
}
