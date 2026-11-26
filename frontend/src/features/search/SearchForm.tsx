import {
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useCodeSuggestions, type SearchParams } from '../../api/queries.ts'
import type { CodeInfo } from '../../api/types.ts'
import { Button } from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { codeTypeName, plural, sentenceCase } from '../../lib/format.ts'
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
 * The fields follow the applied search, so they always show what the address bar says.
 */
export function SearchForm({ applied, ready, onSubmit }: Props) {
  const [draft, setDraft] = useState<SearchDraft>(() => draftFrom(applied))
  const [errors, setErrors] = useState<DraftErrors>({})
  const [editing, setEditing] = useState(applied === null)

  // When the applied search changes (a new search, Back, a shared link), the fields follow
  // it. Resetting state during render, rather than remounting, keeps keyboard focus where it is.
  const appliedKey = `${applied?.code ?? ''}|${applied?.npi ?? ''}|${applied?.ein ?? ''}`
  const [syncedKey, setSyncedKey] = useState(appliedKey)
  if (syncedKey !== appliedKey) {
    setSyncedKey(appliedKey)
    setDraft(draftFrom(applied))
    setErrors({})
    setEditing(applied === null)
  }

  // Arriving with nothing searched, typing a code is the only thing to do, so the cursor
  // starts there. Not on touch screens, where it would bring the keyboard up over the page.
  // Only on arrival: later searches leave focus where the reader put it.
  const codeField = useRef<HTMLInputElement>(null)
  const arrivedWithNoSearch = useRef(applied === null)
  useEffect(() => {
    const hasKeyboard =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (arrivedWithNoSearch.current && hasKeyboard) codeField.current?.focus()
  }, [])

  const typedCode = useDeferredValue(draft.code.trim().toUpperCase())
  const suggestions = useCodeSuggestions(typedCode, ready && /^[A-Z0-9]{0,7}$/.test(typedCode))
  const listId = useId()
  // The list of matching codes opens when the code is typed or asked for with the down arrow,
  // not merely because the field has focus.
  const [listOpen, setListOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const options = suggestions.data ?? []
  const showList = listOpen && options.length > 0

  function change(field: keyof SearchDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    // A field's message goes away as soon as the field is edited.
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest)
  }

  function run(search: SearchDraft) {
    setListOpen(false)
    const result = validateSearch(search)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setEditing(false)
    onSubmit(result.value)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    run(draft)
  }

  /** Picking a code from the list searches for it straight away. */
  function choose(code: CodeInfo) {
    const next = { ...draft, code: code.code }
    setDraft(next)
    setHighlighted(-1)
    run(next)
  }

  function onCodeKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      if (!showList) {
        // Asking for the list starts at its nearer end.
        setListOpen(true)
        setHighlighted(step === 1 ? 0 : options.length - 1)
        return
      }
      // One step past either end is "none", which is the typed text itself.
      setHighlighted((at) => ((at + 1 + step + options.length + 1) % (options.length + 1)) - 1)
    } else if (event.key === 'Enter' && showList && highlighted >= 0) {
      event.preventDefault()
      choose(options[highlighted]!)
    } else if (event.key === 'Escape' && showList) {
      // Closes the list only; the typed code stays, and nothing else on the page reacts.
      event.preventDefault()
      event.stopPropagation()
      setListOpen(false)
      setHighlighted(-1)
    }
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
          onChange={(value) => {
            change('code', value)
            setListOpen(true)
            setHighlighted(-1)
          }}
          className="md:w-36 lg:w-40"
          inputClassName="font-bold placeholder:font-normal"
          placeholder="e.g. 99213"
          inputRef={codeField}
          required
          autoCapitalize="characters"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={
            showList && highlighted >= 0 ? `${listId}-${highlighted}` : undefined
          }
          onKeyDown={onCodeKey}
          onBlur={() => {
            setListOpen(false)
            setHighlighted(-1)
          }}
        >
          {showList && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Billing codes in this file"
              className="absolute top-full left-0 z-20 mt-1 max-h-80 w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-lg"
            >
              {options.map((code, index) => (
                <li
                  key={code.code}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                  // Keeps the cursor in the field, so the list is not closed before the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => choose(code)}
                  className={cx(
                    'flex cursor-pointer items-baseline gap-2.5 px-3 py-1.5',
                    index === highlighted && 'bg-accent-soft',
                  )}
                >
                  <span className="font-bold tabular-nums">{code.code}</span>
                  <span className="min-w-0 flex-1 truncate text-meta text-muted">
                    {optionLabel(code)}
                  </span>
                  <span className="text-meta whitespace-nowrap text-muted tabular-nums">
                    {plural(code.providerCount, 'provider')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field
          label="Provider NPI"
          hint="optional"
          value={draft.npi}
          error={errors.npi}
          onChange={(value) => change('npi', value)}
          placeholder="10 digits"
          className="md:w-36 lg:w-40"
          inputMode="numeric"
        />
        <Field
          label="Provider EIN"
          hint="optional"
          value={draft.ein}
          error={errors.ein}
          onChange={(value) => change('ein', value)}
          placeholder="12-3456789"
          className="md:w-36 lg:w-40"
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

function draftFrom(applied: SearchParams | null): SearchDraft {
  return {
    code: applied?.code ?? '',
    npi: applied?.npi ?? '',
    ein: applied?.ein ? formatEin(applied.ein) : '',
  }
}

/** The file's name for the code. A code with no name of its own is described by its type. */
function optionLabel(code: CodeInfo): string {
  if (code.name) return sentenceCase(code.name)
  return code.type ? `${codeTypeName(code.type)} code` : ''
}

function Field({
  label,
  hint,
  value,
  error,
  onChange,
  className,
  inputClassName,
  inputRef,
  children,
  ...input
}: {
  label: string
  hint: string
  value: string
  error?: string
  onChange: (value: string) => void
  className?: string
  inputClassName?: string
  inputRef?: Ref<HTMLInputElement>
  /** Something that opens from the field, such as a list of suggestions. */
  children?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-meta font-semibold">
        {label} <span className="font-normal text-muted">({hint})</span>
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
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
        {children}
      </div>
      {error && (
        <span id={errorId} role="alert" className="text-meta text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
