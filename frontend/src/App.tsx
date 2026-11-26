import { useRef, useState } from 'react'
import { useStatus } from './api/queries.ts'
import type { SourceFile } from './api/types.ts'
import { useOpenRate } from './features/detail/useOpenRate.ts'
import { ResultsView } from './features/results/ResultsView.tsx'
import { SearchForm } from './features/search/SearchForm.tsx'
import { useSearchState } from './features/search/useSearchState.ts'
import { FileFailed, FileLoading, ServerUnreachable } from './features/states/FileStates.tsx'
import { DataReport, Welcome } from './features/status/DataReport.tsx'

export default function App() {
  const status = useStatus()
  const { search, selectedRate, submit, refine, clearProviderFilter, selectRate } = useSearchState()

  // What is drawn follows the address bar through a cross-fade; see useOpenRate.
  const openRate = useOpenRate(selectedRate)

  const file = status.data?.state === 'ready' ? status.data.file : null

  const about = useRef<HTMLDetailsElement>(null)
  function showAbout() {
    if (!about.current) return
    about.current.open = true
    // Optional call: not every environment implements scrollIntoView.
    about.current.scrollIntoView?.({ block: 'start' })
  }
  const ready = file !== null
  // On narrow screens an open rate takes the whole screen; see MatchPanel.
  const behindPanel = search && openRate && ready ? 'max-xl:hidden' : ''

  const start = file && <Welcome file={file} onSearchCode={(code) => submit({ code })} />
  // Once the start screen has been shown, the first search keeps it in place while it
  // loads. A page opened straight onto a search has nothing to keep.
  const [startShown, setStartShown] = useState(false)
  if (start && !search && !startShown) setStartShown(true)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className={`border-b border-line bg-surface ${behindPanel}`}>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3 md:px-8">
          <a
            href="/"
            className="order-1 text-lead font-bold text-ink no-underline md:mt-[1.6875rem]"
          >
            Rate Explorer
          </a>
          <SearchForm applied={search} ready={ready} onSubmit={submit} />
          <StatusText
            state={status.data?.state}
            unreachable={status.isError}
            file={file}
            onShowFile={showAbout}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-5 md:px-8">
        {status.isError && !status.data ? (
          <ServerUnreachable onRetry={() => void status.refetch()} />
        ) : !status.data ? null : status.data.state === 'failed' ? (
          <FileFailed status={status.data} />
        ) : !file ? (
          <FileLoading status={status.data} />
        ) : search ? (
          <ResultsView
            search={search}
            selectedRate={openRate}
            onSearchCode={(code) => submit({ code })}
            onRefine={refine}
            onClearProvider={clearProviderFilter}
            onSelectRate={selectRate}
            before={startShown ? start : undefined}
          />
        ) : (
          start
        )}
      </main>

      {file && (
        <div className={behindPanel}>
          <DataReport file={file} warning={status.data?.warning ?? null} detailsRef={about} />
        </div>
      )}
    </div>
  )
}

function StatusText({
  state,
  unreachable,
  file,
  onShowFile,
}: {
  state: 'loading' | 'ready' | 'failed' | undefined
  unreachable: boolean
  file: SourceFile | null
  onShowFile: () => void
}) {
  const text = unreachable
    ? 'Server not answering'
    : state === 'ready'
      ? 'File loaded'
      : state === 'failed'
        ? 'File not loaded'
        : 'Loading rate file'
  const bad = unreachable || state === 'failed'
  // Which file, in a few words: the plans it covers and its date. The rest is one click away.
  const which = file
    ? [
        file.planGroupLabel && `${file.planGroupLabel} plans`,
        file.lastUpdatedOn && `dated ${file.lastUpdatedOn}`,
      ]
        .filter(Boolean)
        .join(', ')
    : ''
  return (
    <span
      role="status"
      // Between md and lg the search form fills the row. "File loaded" is the unremarkable
      // case, so it steps aside there instead of taking a row of its own.
      className={`order-2 ml-auto text-meta md:order-3 md:mt-[1.875rem] ${bad ? 'font-semibold text-danger' : 'text-muted'} ${state === 'ready' ? 'md:max-lg:hidden' : ''}`}
    >
      {file && !unreachable ? (
        <button
          type="button"
          onClick={onShowFile}
          className="rounded text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
        >
          <span>{text}</span>
          {which && <span className="hidden xl:inline">: {which}</span>}
          <span className="sr-only">. About this data</span>
        </button>
      ) : (
        text
      )}
    </span>
  )
}
