import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { RangeBar } from './RangeBar.tsx'

const institutional = {
  billingClass: 'institutional',
  providers: 84,
  rates: 100,
  median: 163.74,
  min: 46.12,
  max: 559.06,
}

test('says how the rate compares with the median and across how many providers', () => {
  render(<RangeBar rate={123.62} range={institutional} code="99213" />)

  const figure = screen.getByRole('figure')
  expect(figure).toHaveTextContent('25% below the median of $163.74.')
  expect(figure).toHaveTextContent('Institutional rates for 99213, from 84 providers.')
  expect(figure).toHaveTextContent('Rates run from $46.12 to $559.06.')
})

test('a rate above or at the median reads that way', () => {
  const view = render(<RangeBar rate={559.06} range={institutional} code="99213" />)
  expect(screen.getByRole('figure')).toHaveTextContent('241% above the median')

  view.rerender(<RangeBar rate={163.74} range={institutional} code="99213" />)
  expect(screen.getByRole('figure')).toHaveTextContent('At the median of $163.74.')
})

test('with a single price there is nothing to compare, so nothing is drawn', () => {
  const view = render(
    <RangeBar
      rate={300}
      range={{ ...institutional, min: 300, max: 300, median: 300 }}
      code="99213"
    />,
  )

  expect(view.container).toBeEmptyDOMElement()
})
