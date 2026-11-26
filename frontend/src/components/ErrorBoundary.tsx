import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Notice } from './ui.tsx'

interface State {
  failed: boolean
}

/**
 * The last line of defence: if any component throws while rendering, React removes the
 * whole page. This shows a message and a way back instead of a blank screen.
 *
 * Failed requests never reach it. Those are handled where they happen (see the states
 * folder); this is for a bug, or an answer shaped differently from what the page expects.
 * React only offers this hook to class components.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The page could not be drawn.', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Notice
          tone="danger"
          title="This page hit a problem"
          actions={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          }
        >
          <p>
            Something went wrong while showing this page. Your search is in the address bar, so
            reloading brings it back.
          </p>
        </Notice>
      </main>
    )
  }
}
