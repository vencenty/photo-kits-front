'use client'

import { useRouter } from 'next/navigation'
import { withShopQuery } from '@/lib/shop-context'

/** 内部跳转时自动保留 URL 中的 shop_id */
export function useShopRouter() {
  const router = useRouter()

  return {
    push: (path: string) => router.push(withShopQuery(path)),
    replace: (path: string) => router.replace(withShopQuery(path)),
    back: () => router.back(),
  }
}
