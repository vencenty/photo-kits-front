'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Search, Loader2 } from 'lucide-react'
import { GlobalLoading } from '@/components/GlobalLoading'
import { getOrderDetail } from '@/lib/api'

export default function Home() {
  const [orderNumber, setOrderNumber] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleQuery = async () => {
    const trimmedOrder = orderNumber.trim()
    if (!trimmedOrder) {
      setError('请输入订单编号')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // 查询订单详情，判断是否已查看引导页（过期逻辑由后端 + 全局错误处理统一控制）
      const orderDetail = await getOrderDetail(trimmedOrder, false)

      // 保存订单号到 sessionStorage
      sessionStorage.setItem('pending-order-number', trimmedOrder)
      
      // 根据 guideViewed 决定跳转页面
      if (orderDetail.guideViewed === 1) {
        // 已查看过引导页，直接跳转到 select-size
        router.push('/select-size')
      } else {
        // 未查看引导页，跳转到 guide 页面
        router.push(`/guide?orderNo=${trimmedOrder}`)
      }
    } catch (err) {
      console.error('查询订单失败:', err)
      // 查询失败时停留在当前页，展示错误信息
      const message = err instanceof Error ? err.message : '查询订单失败，请检查订单编号后重试'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuery()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-pink-50 to-rose-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md md:max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 md:mb-12">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full gradient-primary flex items-center justify-center shadow-lg mb-4 relative desktop-hover">
            <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse"></div>
            <Camera className="w-12 h-12 md:w-16 md:h-16 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">田田洗照片</h1>
        </div>

        {/* 输入框 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-4 desktop-shadow">
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-2 md:text-base">
              订单编号
            </label>
            <div className="relative">
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => {
                  setOrderNumber(e.target.value)
                  setError('')
                }}
                onKeyPress={handleKeyPress}
                placeholder="请输入订单编号"
                className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all md:py-4 md:text-base"
                disabled={isLoading}
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-gray-400" />
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-500 md:text-base">{error}</p>
            )}
          </div>
          
          {/* 查询按钮 */}
          <button
            onClick={handleQuery}
            disabled={isLoading}
            className="w-full mt-4 py-3 gradient-primary text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 md:py-4 md:text-base desktop-hover"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
                查询中...
              </>
            ) : (
              '查询订单'
            )}
          </button>

          {/* 说明文字 */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 leading-relaxed md:text-sm">
              📌 输入订单编号后，选择照片尺寸开始上传
            </p>
          </div>
        </div>

      </div>

      {/* 全局 Loading */}
      <GlobalLoading />
    </div>
  )
}
