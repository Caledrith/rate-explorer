import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cx } from '../lib/cx.ts'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary is the one green action on a screen; quiet is everything else. */
  variant?: 'primary' | 'quiet'
  size?: 'md' | 'sm'
}

export function Button({
  variant = 'quiet',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed',
        size === 'md' ? 'px-5 py-2 text-body' : 'px-3 py-1 text-meta',
        variant === 'primary'
          ? 'border-accent bg-accent text-white hover:bg-accent-strong disabled:border-line disabled:bg-ground disabled:text-muted'
          : 'border-line-strong bg-surface text-ink hover:bg-ground disabled:border-line disabled:bg-ground disabled:text-muted',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * A select whose arrow is drawn by the page. The browser's own arrow sits hard against the
 * edge and differs from one browser to the next; this one keeps the same distance as the
 * text does on the other side.
 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex">
      <select
        className={cx(
          'appearance-none rounded-lg border border-line-strong bg-surface py-1.5 pr-9 pl-3 text-ink',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  )
}

/** A small rounded label. "warn" marks a rate filed under a revenue code. */
export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warn'
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-block rounded-full px-2.5 py-0.5 text-meta font-semibold whitespace-nowrap',
        tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-chip text-ink',
      )}
    >
      {children}
    </span>
  )
}

/** The shape every full-width message shares: what happened, what it means, what to do. */
export function Notice({
  title,
  children,
  actions,
  tone = 'plain',
}: {
  title: string
  children?: ReactNode
  actions?: ReactNode
  tone?: 'plain' | 'danger'
}) {
  return (
    <section
      role={tone === 'danger' ? 'alert' : undefined}
      className={cx(
        'flex max-w-2xl flex-col gap-3 rounded-xl border p-5',
        tone === 'danger' ? 'border-danger-line bg-danger-soft' : 'border-line bg-surface',
      )}
    >
      <h2 className={cx('text-lead font-bold', tone === 'danger' && 'text-danger')}>{title}</h2>
      {children && (
        <div className={cx('flex flex-col gap-3', tone === 'danger' && 'text-danger')}>
          {children}
        </div>
      )}
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </section>
  )
}

/**
 * A thin moving bar for "the next answer is on its way". It is positioned over the top
 * edge of its nearest positioned ancestor, so it takes no space and nothing shifts, and
 * it only fades in if the wait is long enough to notice.
 */
export function LoadingBar({ label }: { label: string }) {
  return (
    <div role="status" className="pointer-events-none absolute inset-x-0 -top-2.5 animate-appear">
      <div className="h-0.5 overflow-hidden rounded-full bg-line">
        <div className="h-full w-1/4 animate-slide rounded-full bg-muted" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

/** Fixed-width text for identifiers, file paths and code. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-meta break-all', className)}>{children}</span>
}
