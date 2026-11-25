import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App.tsx'

test('shows the product name', () => {
  render(<App />)
  expect(screen.getByText('Rate Explorer')).toBeInTheDocument()
})
