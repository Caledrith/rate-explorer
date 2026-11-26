import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary.tsx'

function Broken(): never {
  throw new Error('cannot read properties of undefined')
}

afterEach(() => vi.restoreAllMocks())

test('a component that throws leaves a message and a way back, not a blank page', () => {
  // React and the boundary both report the error; keep the test output clean.
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})

  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('This page hit a problem')
  expect(screen.getByRole('alert')).toHaveTextContent('reloading brings it back')
  expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
  expect(reported).toHaveBeenCalled()
})

test('a page that renders normally is left alone', () => {
  render(
    <ErrorBoundary>
      <p>Results</p>
    </ErrorBoundary>,
  )

  expect(screen.getByText('Results')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
