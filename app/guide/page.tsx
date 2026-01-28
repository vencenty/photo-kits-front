'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, User } from 'lucide-react'
import { updateOrder, getOrderDetail } from '@/lib/api'
import { isOrderLocked as checkOrderLocked } from '@/lib/constants'

function GuidePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderNo = searchParams.get('orderNo') as string

  const [receiverName, setReceiverName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOrderLocked, setIsOrderLocked] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)

  // 检查订单状态
  useEffect(() => {
    if (!orderNo) {
      router.push('/')
      return
    }

    // 加载订单信息（包含收货人和锁定状态）
    const loadOrderInfo = async () => {
      try {
        const orderDetail = await getOrderDetail(orderNo, false)
        setReceiverName(orderDetail.receiverName || '')
        setIsOrderLocked(checkOrderLocked(orderDetail.status))
      } catch (error) {
        console.error('获取订单状态失败:', error)
      } finally {
        setIsLoadingStatus(false)
      }
    }

    loadOrderInfo()
  }, [orderNo, router])

  const handleSubmit = async () => {
    if (!receiverName.trim()) {
      alert('请输入收货人信息')
      return
    }

    setIsSubmitting(true)
    try {
      await updateOrder(orderNo, receiverName.trim())
      
      // 保存到 sessionStorage 和 localStorage
      sessionStorage.setItem('pending-order-number', orderNo)
      localStorage.setItem('current-order-number', orderNo)
      
      // 跳转到 select-size 页面
      router.push(`/select-size?orderNo=${orderNo}`)
    } catch (error) {
      console.error('更新订单失败:', error)
      alert('更新失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!orderNo) {
    return null
  }

  // 加载中状态
  if (isLoadingStatus) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#ff4d6d] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={() => router.push('/')}
            className="mr-3 p-1 text-gray-700"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">
            {isOrderLocked ? '订单信息' : '欢迎使用照片冲印服务'}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        {/* 订单号显示 */}
        <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            📦 订单编号：<span className="font-bold">{orderNo}</span>
          </p>
        </div>

        {/* 订单已锁定提示 */}
        {isOrderLocked && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 font-medium">
              🔒 订单已锁定，正在制作中，无法修改收货人信息
            </p>
          </div>
        )}

        {/* 收货人信息表单 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-5 h-5 text-[#ff4d6d]" />
            <h2 className="text-base font-semibold">收货人信息</h2>
            {!isOrderLocked && <span className="text-red-500 text-sm">*</span>}
          </div>
          
          <textarea
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            placeholder="请输入收货人姓名"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#ff4d6d] focus:outline-none resize-none disabled:bg-gray-100 disabled:text-gray-500"
            rows={4}
            disabled={isOrderLocked}
          />
          
          <p className="mt-2 text-xs text-gray-400">
            💡 提示：要和淘宝收货人姓名一致哦～
          </p>
        </div>

        {/* 操作指引区域 - 预留 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <h2 className="text-base font-semibold mb-3">📖 使用说明</h2>
          
          {/* 这里预留给您填充内容：视频、图文教程等 */}
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                📌 操作步骤说明区域（预留）
              </p>
              <p className="text-xs text-gray-400 mt-1">
                您可以在这里添加：操作视频、图文教程、常见问题等
              </p>
            </div>
            
            {/* 示例：常见问题 */}
            <div className="space-y-2">
              <details className="p-3 bg-gray-50 rounded-lg">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  ✅ 支持哪些图片格式？
                </summary>
                <p className="text-xs text-gray-600 mt-2">
                  支持 JPG、PNG、HEIC、WebP 等常见图片格式
                </p>
              </details>
              
              <details className="p-3 bg-gray-50 rounded-lg">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  ✅ 照片会被裁剪吗？
                </summary>
                <p className="text-xs text-gray-600 mt-2">
                  您可以选择居中裁剪、打印整图、四周留白三种模式
                </p>
              </details>
              
              <details className="p-3 bg-gray-50 rounded-lg">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  ✅ 预览效果准确吗？
                </summary>
                <p className="text-xs text-gray-600 mt-2">
                  列表预览图已压缩，但冲印时会使用原图，效果更佳
                </p>
              </details>
            </div>
          </div>
        </div>

        {/* 注意事项 */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-orange-700 mb-2">⚠️ 温馨提示</h3>
          <ul className="text-xs text-orange-600 space-y-1">
            <li>• 预览效果即为最终打印效果</li>
            <li>• 提交后订单将锁定，无法修改</li>
            <li>• 建议先上传1-2张照片测试效果</li>
          </ul>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
        {isOrderLocked ? (
          <button
            onClick={() => router.push('/select-size')}
            className="w-full py-3 bg-gray-600 text-white rounded-full font-medium text-base active:scale-[0.98]"
          >
            返回
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !receiverName.trim()}
            className={`w-full py-3 rounded-full font-medium text-base flex items-center justify-center gap-2 ${
              isSubmitting || !receiverName.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#ff4d6d] text-white active:scale-[0.98]'
            }`}
          >
            {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
            {isSubmitting ? '提交中...' : '下一步，开始上传照片'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function GuidePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#ff4d6d] animate-spin" />
      </div>
    }>
      <GuidePageContent />
    </Suspense>
  )
}
