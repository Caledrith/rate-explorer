import { useReload } from '../../api/queries.ts'
import type { StatusResponse } from '../../api/types.ts'
import { Button, Mono, Notice } from '../../components/ui.tsx'
import { formatMegabytes } from '../../lib/format.ts'

const PHASES: Record<string, string> = {
  starting: 'Starting up',
  fetching_index: 'Reading the index file',
  downloading: 'Downloading the rate file',
  parsing: 'Reading rates into the database',
  indexing: 'Building the search index',
}

/** Shown from startup until the rate file is searchable. The bar tracks real bytes, not a guess. */
export function FileLoading({ status }: { status: StatusResponse }) {
  const { bytesDone, bytesTotal, phase } = status
  const known = bytesDone !== null && bytesTotal !== null && bytesTotal > 0
  const percent = known ? Math.min(100, Math.round((bytesDone / bytesTotal) * 100)) : null

  return (
    <Notice title="Loading the rate file">
      <p>
        {status.fileName ? (
          <>
            Fetching <Mono>{status.fileName}</Mono>, the in-network file the index points to.
          </>
        ) : (
          'Finding the in-network file listed in the index.'
        )}{' '}
        Search unlocks when it has loaded.
      </p>
      <div
        role="progressbar"
        aria-label="Loading the rate file"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 overflow-hidden rounded-full bg-line-soft"
      >
        <div
          className={
            percent === null
              ? 'h-full w-1/3 animate-pulse bg-muted'
              : 'h-full bg-muted transition-[width]'
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <p className="text-meta text-muted">
        {PHASES[phase ?? 'starting'] ?? 'Working'}
        {known && ` · ${formatMegabytes(bytesDone)} of ${formatMegabytes(bytesTotal)}`}
      </p>
    </Notice>
  )
}

const FAILURES: Record<string, { title: string; meaning: string }> = {
  index: {
    title: 'The index file could not be used',
    meaning: 'The index is where the app finds the rate file, so nothing can be loaded without it.',
  },
  fetch: {
    title: 'The rate file could not be downloaded',
    meaning: 'The download did not complete. This is usually a network problem or a moved file.',
  },
  parse: {
    title: 'The rate file could not be read',
    meaning:
      'The file arrived, but it could not be read as a rate file. It may have been cut off part way.',
  },
  database: {
    title: 'The rate file could not be saved',
    meaning: 'The file was read, but the database rejected it.',
  },
  unexpected: {
    title: 'The rate file could not be loaded',
    meaning: 'Something unexpected went wrong while loading it.',
  },
}

/** A fetch or parse error leaves the app running and says what went wrong, with a way to retry. */
export function FileFailed({ status }: { status: StatusResponse }) {
  const reload = useReload()
  const failure = FAILURES[status.error?.kind ?? 'unexpected'] ?? FAILURES.unexpected!

  return (
    <Notice
      tone="danger"
      title={failure.title}
      actions={
        <Button variant="primary" disabled={reload.isPending} onClick={() => reload.mutate()}>
          Try again
        </Button>
      }
    >
      <p>{failure.meaning} Nothing can be searched until it loads.</p>
      <p className="rounded-lg border border-danger-line bg-surface px-3 py-2">
        {status.fileName && (
          <>
            <Mono>{status.fileName}</Mono>
            <br />
          </>
        )}
        <Mono>{status.error?.message ?? 'No further detail was reported.'}</Mono>
      </p>
    </Notice>
  )
}

/** The API itself cannot be reached, so there is no status to show. */
export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <Notice
      tone="danger"
      title="The server is not answering"
      actions={<Button onClick={onRetry}>Try again</Button>}
    >
      <p>
        The page loaded, but the search service behind it did not respond. It will be retried
        automatically.
      </p>
    </Notice>
  )
}
