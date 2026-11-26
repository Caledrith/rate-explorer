import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { mockApi, renderApp } from '../../test/helpers.tsx'
import { SearchForm } from './SearchForm.tsx'

afterEach(() => vi.unstubAllGlobals())

const visits = [
  {
    code: '99213',
    type: 'CPT',
    name: 'OFFICE/OUTPATIENT VISIT EST',
    description: null,
    providerCount: 1013,
  },
  {
    code: '99214',
    type: 'CPT',
    name: 'OFFICE/OUTPATIENT VISIT EST',
    description: null,
    providerCount: 1031,
  },
  { code: '99215', type: null, name: null, description: null, providerCount: 1 },
]

function setup(props: Partial<Parameters<typeof SearchForm>[0]> = {}, codes: unknown[] = []) {
  mockApi({ '/api/codes': { body: codes } })
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

test('typing a code lists the matching codes in the file, with their names', async () => {
  const { user } = setup({}, visits)
  const code = screen.getByRole('combobox', { name: /Billing code/ })

  // Nothing opens just because the field is there.
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(code).toHaveAttribute('aria-expanded', 'false')

  await user.type(code, '992')

  const options = await screen.findAllByRole('option')
  expect(options.map((option) => option.textContent)).toEqual([
    '99213Office/outpatient visit est1,013 providers',
    '99214Office/outpatient visit est1,031 providers',
    '992151 provider',
  ])
  expect(code).toHaveAttribute('aria-expanded', 'true')
})

test('the arrow keys pick from the list and Enter searches for the pick', async () => {
  const { onSubmit, user } = setup({}, visits)
  const code = screen.getByRole('combobox', { name: /Billing code/ })
  await user.type(code, '992')
  await screen.findAllByRole('option')

  await user.keyboard('{ArrowDown}{ArrowDown}')
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('99214')
  expect(code).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option', { selected: true }).id,
  )
  await user.keyboard('{Enter}')

  expect(onSubmit).toHaveBeenCalledWith({ code: '99214', npi: undefined, ein: undefined })
  expect(code).toHaveValue('99214')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('with nothing picked, Enter searches for what was typed', async () => {
  const { onSubmit, user } = setup({}, visits)
  await user.type(screen.getByRole('combobox', { name: /Billing code/ }), '99213')
  await screen.findAllByRole('option')

  await user.keyboard('{Enter}')

  expect(onSubmit).toHaveBeenCalledWith({ code: '99213', npi: undefined, ein: undefined })
})

test('clicking a listed code searches for it', async () => {
  const { onSubmit, user } = setup({}, visits)
  await user.type(screen.getByRole('combobox', { name: /Billing code/ }), '992')

  await user.click(await screen.findByRole('option', { name: /99213/ }))

  expect(onSubmit).toHaveBeenCalledWith({ code: '99213', npi: undefined, ein: undefined })
})

test('Escape closes the list, keeps what was typed, and goes no further', async () => {
  const { user } = setup({}, visits)
  const outside = vi.fn()
  document.addEventListener('keydown', outside)
  const code = screen.getByRole('combobox', { name: /Billing code/ })
  await user.type(code, '992')
  await screen.findAllByRole('option')
  outside.mockClear()

  await user.keyboard('{Escape}')

  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(code).toHaveValue('992')
  // The rest of the page (the open rate panel, for one) does not also treat it as "close".
  expect(outside).not.toHaveBeenCalled()
  document.removeEventListener('keydown', outside)
})
