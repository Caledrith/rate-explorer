import { useEffect, useRef, useState } from 'react'

interface Props {
  /** The name filter in the address bar, if any. */
  applied: string | null
  onChange: (name: string | null) => void
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
export function NameFilter({ applied, onChange }: Props) {
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
    <label className="flex items-center gap-2 text-meta text-muted">
      Provider name
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="contains…"
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        className="w-40 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-ink placeholder:text-muted/70 sm:w-48"
      />
    </label>
  )
}
