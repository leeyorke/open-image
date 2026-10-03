import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg-base, #ffffff)', color: 'var(--text-primary, #09090b)' }}
    >
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <h2 className="text-xl mb-8" style={{ color: 'var(--text-tertiary)' }}>
          Page Not Found
        </h2>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-lg font-medium transition-colors"
          style={{
            background: 'var(--brand)',
            color: 'var(--brand-foreground)',
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}