import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Remembered first-use hints must not leak from one test into the next.
  localStorage.clear()
})
