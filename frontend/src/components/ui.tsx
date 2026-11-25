import type { ButtonHTMLAttributes, ReactNode } from 'react'
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

/** Fixed-width text for identifiers, file paths and code. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-meta break-all', className)}>{children}</span>
}
