import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { mockApi, renderApp } from '../../test/helpers.tsx'
import { SearchForm } from './SearchForm.tsx'

afterEach(() => vi.unstubAllGlobals())

function setup(props: Partial<Parameters<typeof SearchForm>[0]> = {}) {
  mockApi({ '/api/codes': { body: [] } })
  const onSubmit = vi.fn()
  renderApp(<SearchForm applied={null} ready onSubmit={onSubmit} {...props} />)
  return { onSubmit, user: userEvent.setup() }
}

test('an empty code is caught next to the field and nothing is sent', async () => {
  const { onSubmit, user } = setup()

  await user.click(screen.getByRole('button', { name: 'Search' }))

  const code = screen.getByLabelText(/Billing code/)
  expect(code).toBeInvalid()
  expect(code).toHaveAccessibleDescription('Enter a billing code.')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('identifier mistakes say what to fix, and the message clears on edit', async () => {
  const { onSubmit, user } = setup()

  await user.type(screen.getByLabelText(/Billing code/), '99213')
  await user.type(screen.getByLabelText(/Provider NPI/), '18817774')
  await user.type(screen.getByLabelText(/Provider EIN/), '13-37573')
  await user.click(screen.getByRole('button', { name: 'Search' }))

  expect(screen.getByText('An NPI has 10 digits. This has 8.')).toBeInTheDocument()
  expect(screen.getByText('An EIN has 9 digits. This has 7.')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()

  await user.type(screen.getByLabelText(/Provider NPI/), '64')
  expect(screen.queryByText('An NPI has 10 digits. This has 8.')).not.toBeInTheDocument()
})

test('a valid search is submitted in normalized form', async () => {
  const { onSubmit, user } = setup()

  await user.type(screen.getByLabelText(/Billing code/), ' g0438 ')
  await user.type(screen.getByLabelText(/Provider EIN/), '13-1624096')
  await user.click(screen.getByRole('button', { name: 'Search' }))

  expect(onSubmit).toHaveBeenCalledWith({ code: 'G0438', npi: undefined, ein: '131624096' })
})

test('the fields start from the applied search', () => {
  setup({ applied: { code: '99213', npi: '1881777464', ein: '131624096', sort: 'name', page: 1 } })

  expect(screen.getByLabelText(/Billing code/)).toHaveValue('99213')
  expect(screen.getByLabelText(/Provider NPI/)).toHaveValue('1881777464')
  expect(screen.getByLabelText(/Provider EIN/)).toHaveValue('13-1624096')
})

test('search is locked until the rate file has loaded', () => {
  setup({ ready: false })

  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  expect(screen.getByText('Search unlocks when the rate file has loaded.')).toBeInTheDocument()
})
