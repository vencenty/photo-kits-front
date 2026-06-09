'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { readShopCodeFromSearch, SHOP_CODE_QUERY_KEY } from '@/lib/shop-context'

function ShopEntryRequired() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-rose-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white text-2xl font-bold">
          店
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-3">请通过店铺链接进入</h1>
        <p className="text-sm md:text-base text-gray-600 leading-relaxed mb-4">
          本页面需使用店铺专属传图链接访问，链接中应包含{' '}
          <code className="px-1.5 py-0.5 bg-gray-100 rounded text-pink-600">{SHOP_CODE_QUERY_KEY}</code>{' '}
          参数。
        </p>
        <p className="text-xs md:text-sm text-gray-500">
          请扫描商家提供的二维码，或复制完整链接后在浏览器中打开。
        </p>
      </div>
    </div>
  )
}

function ShopGateInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const shopCode = readShopCodeFromSearch(`?${searchParams.toString()}`)

  if (!shopCode) {
    return <ShopEntryRequired />
  }

  return <>{children}</>
}

/** 无 code 时拦截，仅允许通过 ?code= 进入 */
export function ShopGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ShopGateInner>{children}</ShopGateInner>
    </Suspense>
  )
}
