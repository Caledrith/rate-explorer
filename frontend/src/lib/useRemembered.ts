import { useEffect, useState } from 'react'

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    // Private windows and locked-down browsers can refuse storage; treat as not remembered.
    return false
  }
}

/**
 * Remembers, in this browser, that something has happened at least once.
 * Returns false until `happened` is first true, and true from then on, across visits.
 * Used to stop showing an instruction once the person has done what it describes.
 */
export function useRemembered(key: string, happened: boolean): boolean {
  const [remembered, setRemembered] = useState(() => read(key))
  // Adjusting state during render is React's pattern for "this prop changes what I know".
  if (happened && !remembered) setRemembered(true)

  useEffect(() => {
    if (!remembered) return
    try {
      localStorage.setItem(key, '1')
    } catch {
      // Not being able to save only means the instruction shows again next visit.
    }
  }, [key, remembered])

  return remembered
}
