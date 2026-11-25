import { useStatus } from './api/queries.ts'
import { ResultsView } from './features/results/ResultsView.tsx'
import { SearchForm } from './features/search/SearchForm.tsx'
import { useSearchState } from './features/search/useSearchState.ts'
import { FileFailed, FileLoading, ServerUnreachable } from './features/states/FileStates.tsx'
import { DataReport, Welcome } from './features/status/DataReport.tsx'

export default function App() {
  const status = useStatus()
  const { search, selectedRate, submit, refine, clearProviderFilter, selectRate } = useSearchState()

  const file = status.data?.state === 'ready' ? status.data.file : null
  const ready = file !== null

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3 md:px-8">
          <a
            href="/"
            className="order-1 text-lead font-bold text-ink no-underline md:mt-[1.6875rem]"
          >
            Rate Explorer
          </a>
          {/* Re-created whenever the applied search changes, so its fields follow the address bar. */}
          <SearchForm
            key={`${search?.code ?? ''}|${search?.npi ?? ''}|${search?.ein ?? ''}`}
            applied={search}
            ready={ready}
            onSubmit={submit}
          />
          <StatusText state={status.data?.state} unreachable={status.isError} />
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
            file={file}
            selectedRate={selectedRate}
            onSearchCode={(code) => submit({ code })}
            onRefine={refine}
            onClearProvider={clearProviderFilter}
            onSelectRate={selectRate}
          />
        ) : (
          <Welcome file={file} onSearchCode={(code) => submit({ code })} />
        )}
      </main>

      {file && <DataReport file={file} warning={status.data?.warning ?? null} />}
    </div>
  )
}

function StatusText({
  state,
  unreachable,
}: {
  state: 'loading' | 'ready' | 'failed' | undefined
  unreachable: boolean
}) {
  const text = unreachable
    ? 'Server not answering'
    : state === 'ready'
      ? 'File loaded'
      : state === 'failed'
        ? 'File not loaded'
        : 'Loading rate file'
  const bad = unreachable || state === 'failed'
  return (
    <span
      role="status"
      className={`order-2 ml-auto text-meta md:order-3 md:mt-[1.875rem] ${bad ? 'font-semibold text-danger' : 'text-muted'}`}
    >
      {text}
    </span>
  )
}
