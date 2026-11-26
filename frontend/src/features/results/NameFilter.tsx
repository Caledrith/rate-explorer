import { useEffect, useRef, useState } from 'react'
import { cx } from '../../lib/cx.ts'

interface Props {
  /** The name filter in the address bar, if any. */
  applied: string | null
  onChange: (name: string | null) => void
  className?: string
}

const MIN_LENGTH = 2
const PAUSE_MS = 300

function tidy(text: string): string | null {
  const name = text.trim().split(/\s+/).join(' ')
  return name.length >= MIN_LENGTH ? name : null
}

/**
 * Narrows the list to providers whose name contains what is typed. It applies itself a
 * moment after typing stops, so there is no button to press and no request per keystroke.
 * One letter matches too much to be useful and is treated as no filter.
 */
export function NameFilter({ applied, onChange, className }: Props) {
  const [text, setText] = useState(applied ?? '')
  // The last value this box asked for. When the address bar changes to anything else (Back,
  // "Clear provider filter", a new search), the box follows it; when it is only catching up
  // with what was typed, the typing is left alone.
  const [asked, setAsked] = useState(applied)
  const [seen, setSeen] = useState(applied)
  if (seen !== applied) {
    setSeen(applied)
    if (applied !== asked) {
      setAsked(applied)
      setText(applied ?? '')
    }
  }

  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })

  useEffect(() => {
    const wanted = tidy(text)
    if (wanted === asked) return
    const timer = setTimeout(() => {
      setAsked(wanted)
      latest.current(wanted)
    }, PAUSE_MS)
    return () => clearTimeout(timer)
  }, [text, asked])

  return (
    <label className={cx('relative flex min-w-0 items-center text-meta', className)}>
      {/* The placeholder says what the box is for; this is its name for screen readers. */}
      <span className="sr-only">Provider name</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="pointer-events-none absolute left-3 size-3.5 text-muted"
      >
        <circle cx="7" cy="7" r="4.25" />
        <path d="m10.25 10.25 3 3" />
      </svg>
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Filter by provider name"
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        className="w-full rounded-lg border border-line-strong bg-surface py-1.5 pr-3 pl-9 text-ink placeholder:text-muted"
      />
    </label>
  )
}
