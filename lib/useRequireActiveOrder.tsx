'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getActiveOrderNo } from '@/lib/order-context'
import { useShopRouter } from '@/lib/useShopRouter'

/**
 * 受保护页面：localStorage 无 active-order-no 时跳回首页（订单查询）。
 * C 端无独立登录页，首页输入订单号 / init 成功后才会写入订单上下文。
 */
export function useRequireActiveOrder(): string | null {
  const router = useShopRouter()
  const [orderNo, setOrderNo] = useState<string | null>(null)

  useEffect(() => {
    const active = getActiveOrderNo()
    if (!active) {
      router.replace('/')
      return
    }
    setOrderNo(active)
  }, [router])

  return orderNo
}

export function OrderGateLoading() {
  return (
    <div className="min-h-screen bg-app flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#ff4d6d] animate-spin" />
    </div>
  )
}
