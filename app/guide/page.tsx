'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, User, Crop, ImageIcon, Frame, AlertTriangle } from 'lucide-react'
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
      await updateOrder(orderNo, { receiverName: receiverName.trim() })
      
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
      <div className="bg-white sticky top-0 z-10 shadow-sm desktop-nav">
        <div className="desktop-container flex items-center px-4 py-3">
          <button
            onClick={() => router.push('/')}
            className="mr-3 p-1 text-gray-700 hover:text-gray-900 transition-colors desktop-hover"
          >
            <ArrowLeft className="w-6 h-6 md:w-7 md:h-7" />
          </button>
          <h1 className="text-lg font-semibold md:text-xl">
            {isOrderLocked ? '订单信息' : '欢迎使用照片冲印服务'}
          </h1>
        </div>
      </div>

      {/* Content - 可无限下滑，后续可继续补充更多图片和内容 */}
      <div className="desktop-container p-4 pb-32 min-h-screen">
        {/* 订单号显示 */}
        <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700 md:text-base">
            📦 订单编号：<span className="font-bold">{orderNo}</span>
          </p>
        </div>

        {/* 订单已锁定提示 */}
        {isOrderLocked && (
          <div className="mb-6 px-4 py-3 bg-amber-50 border-2 border-amber-500 rounded-lg">
            <p className="text-sm text-amber-800 font-medium md:text-base">
              🔒 订单已锁定，正在制作中，无法修改收货人信息
            </p>
          </div>
        )}

        {/* 收货人信息表单 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm desktop-shadow">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-5 h-5 md:w-6 md:h-6 text-[#ff4d6d]" />
            <h2 className="text-base font-semibold md:text-lg">收货人信息</h2>
            {!isOrderLocked && <span className="text-red-500 text-sm md:text-base">*</span>}
          </div>
          
          <input
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            placeholder="请输入收货人姓名"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#ff4d6d] focus:outline-none resize-none disabled:bg-gray-100 disabled:text-gray-500 md:py-4 md:text-base"
            disabled={isOrderLocked}
          />
          
          <p className="mt-2 text-xs text-gray-400 md:text-sm">
            💡 提示：要和下单的收货人姓名一致哦～
          </p>
        </div>

        {/* 传图最佳实践（置于三种冲印样式对比之前） */}
        <section className="mb-8">
          <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100 overflow-hidden desktop-shadow">
            <Image
              src="/images/传图最佳实践.png"
              alt="上传最佳实践：先整理相册；每次最多选 30 张分批上传；确认无误后再锁单。分批上传可避免中断，保障照片安全。"
              width={1086}
              height={1448}
              className="w-full h-auto rounded-lg"
              sizes="(max-width: 768px) 100vw, 896px"
            />
          </div>
        </section>

        {/* 三种冲印样式对比 - 帮助客户理解差异 */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2 md:text-lg">
            <Crop className="w-5 h-5 text-[#ff4d6d]" />
            三种冲印样式对比
          </h2>
          <p className="text-sm text-gray-500 mb-4 md:text-base">
            上传照片时可选择不同样式，同一张照片效果对比如下：
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* 满版（裁剪） */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 overflow-hidden desktop-shadow hover:border-pink-200 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
                  <Crop className="w-4 h-4 text-[#ff4d6d]" />
                </span>
                <span className="font-medium text-gray-800">满版（裁剪）</span>
              </div>
              <div 
                className="relative w-full rounded-lg overflow-hidden bg-gray-100"
                style={{ aspectRatio: '89/127' }}
              >
                <Image
                  src="/images/767ca761813e48ef1d6c58a23490d297.jpg"
                  alt="满版（裁剪）示例"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>
              <p className="mt-3 text-xs text-gray-600 md:text-sm">
                填满相纸，多余部分居中裁掉。适合构图完整的照片。
              </p>
            </div>

            </div>

          {/* 满版裁切说明 */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="text-base font-semibold text-gray-800 mb-2 flex items-center gap-2 md:text-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              哪些照片不适合做「满版」？
            </h3>
            <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100 overflow-hidden desktop-shadow">
              <Image
                src="/images/裁切说明.png"
                alt="裁切说明：右下角日期、四周边框、人物贴边等不宜满版；满版四周约 2～3mm 裁切，建议选择留白保全图像"
                width={1086}
                height={1448}
                className="w-full h-auto rounded-lg"
                sizes="(max-width: 768px) 100vw, 896px"
              />
            </div>
          </div>

          {/* 预留区域：后续可在此追加更多图片和说明，页面可无限下滑 */}
        </section>

        {/* 操作指引区域 - 预留 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm desktop-shadow">
          {/* 重要说明区域 */}
          <div className="space-y-3">
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-sm font-semibold text-red-700 md:text-base">
                🚨 下单前必读（务必看完再操作）
              </p>
              <ul className="mt-2 text-xs text-red-700 space-y-1 list-disc list-inside md:text-sm">
                <li>每次手机选择照片不要超过30张，超过30张需要分多次上传避免卡死浏览器</li>
                <li>请拍多少传多少，订单和这里的要保持一致，否则会延误制作发货～</li>
              </ul>
            </div>
            
            {/* 示例：常见问题 */}
            <div className="space-y-2">
              <details className="p-3 bg-gray-50 rounded-lg desktop-hover">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer md:text-base">
                  ✅ 支持哪些图片格式？
                </summary>
                <p className="text-xs text-gray-600 mt-2 md:text-sm">
                  支持 JPG、PNG、HEIC、WebP 等常见图片格式
                </p>
              </details>
              
              <details className="p-3 bg-gray-50 rounded-lg desktop-hover">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer md:text-base">
                  ✅ 照片会被裁剪吗？
                </summary>
                <p className="text-xs text-gray-600 mt-2 md:text-sm">
                  四周留白样式没有任何裁剪，放心选择。
                </p>
              </details>
              
              <details className="p-3 bg-gray-50 rounded-lg desktop-hover">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer md:text-base">
                  ✅ 预览效果准确吗？
                </summary>
                <p className="text-xs text-gray-600 mt-2 md:text-sm">
                  列表预览图已压缩，效果为参考图，最终效果以实际打印为准
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg desktop-nav">
        <div className="desktop-container">
          {isOrderLocked ? (
            <button
              onClick={() => router.push('/select-size')}
              className="w-full py-3 bg-gray-600 text-white rounded-full font-medium text-base active:scale-[0.98] md:py-4 desktop-hover"
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
              } md:py-4 desktop-hover`}
            >
              {isSubmitting && <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />}
              {isSubmitting ? '提交中...' : '下一步，开始上传照片'}
            </button>
          )}
        </div>
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
