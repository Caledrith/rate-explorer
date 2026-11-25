import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { provider, rate } from '../../test/helpers.tsx'
import { ProviderList } from './ProviderList.tsx'

const alpha = provider({
  rates: [rate({ id: 'a1' }), rate({ id: 'a2', rate: 70 })],
})
const gamma = provider({
  tin: '333333333',
  tinDisplay: '33-3333333',
  name: 'Gamma Health',
  rates: [rate({ id: 'g1', rate: 90 })],
})

function renderList(selectedRate: string | null) {
  render(
    <ProviderList
      providers={[alpha, gamma]}
      selectedRate={selectedRate}
      onSelectRate={vi.fn()}
      showSetting={false}
      showNegotiatedType={false}
    />,
  )
  const row = (name: string) => screen.getByRole('heading', { name }).closest('li')!
  return { row }
}

test('the open rate highlights its whole provider row, and only that row', () => {
  const { row } = renderList('g1')

  expect(row('Gamma Health')).toHaveClass('bg-accent-soft')
  expect(row('Alpha Clinic')).not.toHaveClass('bg-accent-soft')
  expect(document.getElementById('rate-g1')).toHaveAttribute('aria-pressed', 'true')
  // With a single rate, the row is the highlight; the line inside is not boxed again.
  expect(document.getElementById('rate-g1')).not.toHaveClass('md:border-accent')
})

test('when a provider has several rates, the open one is outlined inside the highlighted row', () => {
  const { row } = renderList('a2')

  expect(row('Alpha Clinic')).toHaveClass('bg-accent-soft')
  expect(document.getElementById('rate-a2')).toHaveClass('md:border-accent')
  expect(document.getElementById('rate-a1')).not.toHaveClass('md:border-accent')
  expect(document.getElementById('rate-a1')).toHaveAttribute('aria-pressed', 'false')
})

test('nothing is highlighted when no rate is open', () => {
  const { row } = renderList(null)

  expect(row('Alpha Clinic')).not.toHaveClass('bg-accent-soft')
  expect(row('Gamma Health')).not.toHaveClass('bg-accent-soft')
})
