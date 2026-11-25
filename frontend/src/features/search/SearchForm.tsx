import { useDeferredValue, useId, useState, type FormEvent } from 'react'
import { useCodeSuggestions, type SearchParams } from '../../api/queries.ts'
import { Button } from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { sentenceCase } from '../../lib/format.ts'
import {
  formatEin,
  validateSearch,
  type DraftErrors,
  type SearchDraft,
  type ValidSearch,
} from './validation.ts'

interface Props {
  /** The search currently shown, used to prefill the fields. */
  applied: SearchParams | null
  /** False until the rate file has loaded; nothing can be searched before then. */
  ready: boolean
  onSubmit: (search: ValidSearch) => void
}

/**
 * Billing code (required) plus optional NPI and EIN. On wide screens it sits in the
 * header; on phones it collapses to one line once a search is showing.
 *
 * The parent gives this component a `key` that changes with the applied search, so the
 * fields always start from what the address bar says.
 */
export function SearchForm({ applied, ready, onSubmit }: Props) {
  const [draft, setDraft] = useState<SearchDraft>({
    code: applied?.code ?? '',
    npi: applied?.npi ?? '',
    ein: applied?.ein ? formatEin(applied.ein) : '',
  })
  const [errors, setErrors] = useState<DraftErrors>({})
  const [editing, setEditing] = useState(applied === null)

  const typedCode = useDeferredValue(draft.code.trim().toUpperCase())
  const suggestions = useCodeSuggestions(typedCode, ready && /^[A-Z0-9]{0,7}$/.test(typedCode))
  const listId = useId()

  function change(field: keyof SearchDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    // A field's message goes away as soon as the field is edited.
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = validateSearch(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setEditing(false)
    onSubmit(result.value)
  }

  const filterText = [
    applied?.npi && `NPI ${applied.npi}`,
    applied?.ein && `EIN ${formatEin(applied.ein)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="order-3 min-w-0 flex-1 basis-full md:order-2 md:basis-auto">
      {/* Phones only: the search in one line once results are showing. */}
      {applied && !editing && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 md:hidden">
          <div className="min-w-0">
            <div className="text-meta text-muted">Billing code</div>
            <div className="truncate">
              <span className="text-lead font-bold">{applied.code}</span>{' '}
              <span className="text-meta text-muted">· {filterText || 'any provider'}</span>
            </div>
          </div>
          <Button onClick={() => setEditing(true)}>Edit search</Button>
        </div>
      )}

      <form
        onSubmit={submit}
        noValidate
        aria-label="Search rates"
        className={cx(
          'flex-col gap-3 md:flex md:flex-row md:flex-wrap md:items-start md:gap-2.5',
          applied && !editing ? 'hidden' : 'flex',
        )}
      >
        <Field
          label="Billing code"
          hint="required"
          value={draft.code}
          error={errors.code}
          onChange={(value) => change('code', value)}
          className="md:w-40"
          inputClassName="font-bold"
          list={listId}
          required
          autoCapitalize="characters"
        />
        <datalist id={listId}>
          {suggestions.data?.map((code) => (
            <option key={code.code} value={code.code} label={optionLabel(code.type, code.name)} />
          ))}
        </datalist>
        <Field
          label="Provider NPI"
          hint="optional"
          value={draft.npi}
          error={errors.npi}
          onChange={(value) => change('npi', value)}
          placeholder="10 digits"
          className="md:w-40"
          inputMode="numeric"
        />
        <Field
          label="Provider EIN"
          hint="optional"
          value={draft.ein}
          error={errors.ein}
          onChange={(value) => change('ein', value)}
          placeholder="12-3456789"
          className="md:w-40"
          inputMode="numeric"
        />
        <div className="flex flex-col gap-2 md:mt-[1.4375rem] md:flex-row">
          <Button type="submit" variant="primary" disabled={!ready} className="text-lead">
            Search
          </Button>
          {applied && (
            <Button className="text-lead md:hidden" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
        {!ready && (
          <p className="text-meta text-muted md:mt-[1.4375rem] md:self-center">
            Search unlocks when the rate file has loaded.
          </p>
        )}
      </form>
    </div>
  )
}

function optionLabel(type: string | null, name: string | null): string {
  return [type, name && sentenceCase(name)].filter(Boolean).join(' · ')
}

function Field({
  label,
  hint,
  value,
  error,
  onChange,
  className,
  inputClassName,
  ...input
}: {
  label: string
  hint: string
  value: string
  error?: string
  onChange: (value: string) => void
  className?: string
  inputClassName?: string
  placeholder?: string
  list?: string
  required?: boolean
  inputMode?: 'numeric'
  autoCapitalize?: string
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-meta font-semibold">
        {label} <span className="font-normal text-muted">({hint})</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
        className={cx(
          'w-full rounded-lg border bg-surface px-3 py-2 text-lead text-ink placeholder:text-muted/70',
          error ? 'border-danger' : 'border-line-strong',
          inputClassName,
        )}
        {...input}
      />
      {error && (
        <span id={errorId} className="text-meta text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
