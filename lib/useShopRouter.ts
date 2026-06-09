'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { withShopQuery } from '@/lib/shop-context'

/** 内部跳转时自动保留 URL 中的 code */
export function useShopRouter() {
  const router = useRouter()

  const push = useCallback((path: string) => {
    router.push(withShopQuery(path))
  }, [router])

  const replace = useCallback((path: string) => {
    router.replace(withShopQuery(path))
  }, [router])

  const back = useCallback(() => {
    router.back()
  }, [router])

  return useMemo(() => ({ push, replace, back }), [push, replace, back])
}
