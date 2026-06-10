'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getShopProfile } from '@/lib/api'

function ShopNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-rose-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md md:max-w-lg bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl font-bold">
          店
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-3">店铺不存在</h1>
        <p className="text-sm md:text-base text-gray-500 leading-relaxed">
          请确认传图链接是否正确，或联系商家获取有效链接。
        </p>
      </div>
    </div>
  )
}

function ShopGateLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-rose-50 flex flex-col items-center justify-center p-6">
      <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
    </div>
  )
}

function ShopGateInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const shopCode = searchParams.get('code') ?? ''
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    getShopProfile()
      .then(() => {
        if (!cancelled) setStatus('ok')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [shopCode])

  if (status === 'loading') {
    return <ShopGateLoading />
  }

  if (status === 'error') {
    return <ShopNotFound />
  }

  return <>{children}</>
}

/** 进入页面前校验店铺是否存在（依赖 URL code 与服务端查询） */
export function ShopGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShopGateLoading />}>
      <ShopGateInner>{children}</ShopGateInner>
    </Suspense>
  )
}
