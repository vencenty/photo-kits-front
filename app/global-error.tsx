'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global Error:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: 'linear-gradient(to bottom right, #fff7ed, #fdf2f8, #fff1f2)',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              maxWidth: 400,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>
              出错了
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              {error.message || '应用发生错误，请刷新页面重试'}
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  reset()
                } catch {
                  /* ignore */
                }
                // 根级 Global Error 时 reset 未必能恢复整树，整页刷新最可靠
                if (typeof window !== 'undefined') {
                  window.location.reload()
                }
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#ff4d6d',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              重试（刷新页面）
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
