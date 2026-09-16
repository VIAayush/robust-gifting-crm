'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Georgia, serif', background: '#F1F4F9', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: 18, fontWeight: 400, color: '#0D1B2A', margin: 0 }}>
              Robust
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: '0.38em',
                  height: 1,
                  margin: '0 0.28em 0.2em',
                  background: 'currentColor',
                  opacity: 0.7,
                  verticalAlign: 'middle',
                }}
              />
              Gifting Solutions could not load
            </h1>
            <p style={{ fontSize: 14, fontFamily: 'system-ui, sans-serif', color: '#64748B', marginTop: 8 }}>
              An unexpected error occurred while starting the application.
            </p>
            {error.digest && (
              <p style={{ fontSize: 12, color: '#4A5568', marginTop: 8, fontFamily: 'monospace' }}>
                Reference: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                marginTop: 20,
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: '#C9A84C',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
