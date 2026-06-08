'use client'

import { useEffect } from 'react'
import { preloadCatalog } from '@/lib/catalog'

export function SkuPreloader({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    preloadCatalog().catch(() => {
      // 业务错误已在 request 层 toast；网络错误静默，页面按需重试
    })
  }, [])

  return <>{children}</>
}
