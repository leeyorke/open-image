'use client'

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base, #0a0a0a)', color: 'var(--text-primary, #fafafa)' }}
      >
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4">Error</h1>
          <h2 className="text-xl mb-8" style={{ color: 'var(--text-tertiary)' }}>
            Something went wrong!
          </h2>
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-lg font-medium transition-colors"
            style={{ background: 'var(--brand, #f59e0b)', color: 'var(--brand-foreground, #000)' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}