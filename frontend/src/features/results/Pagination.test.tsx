import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Pagination } from './Pagination.tsx'

function page(overrides: Partial<Parameters<typeof Pagination>[0]['page']> = {}) {
  return { page: 1, pageSize: 25, totalProviders: 1013, totalPages: 41, ...overrides }
}

test('one provider reads as one provider, with no paging controls', () => {
  render(
    <Pagination page={page({ totalProviders: 1, totalPages: 1 })} shown={1} onPage={vi.fn()} />,
  )

  expect(screen.getByText('1 provider')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('a single page says it shows everything', () => {
  render(
    <Pagination page={page({ totalProviders: 4, totalPages: 1 })} shown={4} onPage={vi.fn()} />,
  )

  expect(screen.getByText('All 4 providers')).toBeInTheDocument()
})

test('several pages show the range and move one page at a time', async () => {
  const onPage = vi.fn()
  render(<Pagination page={page({ page: 2 })} shown={25} onPage={onPage} />)

  expect(screen.getByText('Showing 26 to 50 of 1,013 providers')).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }))
  expect(onPage).toHaveBeenCalledWith(3)
})

test('a page past the end offers the way back, even when there is only one page', async () => {
  const onPage = vi.fn()
  render(
    <Pagination
      page={page({ page: 2, totalProviders: 1, totalPages: 1 })}
      shown={0}
      onPage={onPage}
    />,
  )

  expect(screen.getByText('Page 2 is past the last page.')).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Go to the last page' }))
  expect(onPage).toHaveBeenCalledWith(1)
})
