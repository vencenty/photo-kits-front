'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImageIcon } from 'lucide-react'
import { PHOTO_SIZES } from '@/lib/photo-sizes'
import { useStore, Session } from '@/lib/store'

// 每个尺寸的上传统计
interface SizeStats {
  [sizeId: string]: {
    imageCount: number
    totalPrintCount: number
  }
}

export default function SelectSizePage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [sizeStats, setSizeStats] = useState<SizeStats>({})
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const clearImages = useStore((state) => state.clearImages)
  const images = useStore((state) => state.images)

  // 获取从查询页传来的订单号
  useEffect(() => {
    const pendingOrder = sessionStorage.getItem('pending-order-number')
    if (pendingOrder) {
      setOrderNumber(pendingOrder)
    }
  }, [])

  // 计算每个尺寸的上传统计
  useEffect(() => {
    if (!orderNumber) return

    // 从 localStorage 读取该订单下所有尺寸的数据
    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}
    
    // 从 photo-upload-storage 读取图片数据
    const uploadStorage = localStorage.getItem('photo-upload-storage')
    const storageData = uploadStorage ? JSON.parse(uploadStorage) : { state: { images: [] } }
    const allImages = storageData.state?.images || []

    const stats: SizeStats = {}

    // 遍历所有保存的订单，找到属于当前订单号的
    Object.keys(orders).forEach((orderId) => {
      // 订单ID格式：orderNumber-sizeId 或直接是 orderNumber
      if (orderId === orderNumber || orderId.startsWith(`${orderNumber}-`)) {
        const session = orders[orderId]
        const sizeId = session.sizeId
        
        // 计算该 session 下的图片数量
        const sessionImages = allImages.filter((img: any) => img.sessionId === orderId)
        const imageCount = sessionImages.length
        const totalPrintCount = sessionImages.reduce((sum: number, img: any) => sum + (img.printCount || 1), 0)

        if (stats[sizeId]) {
          stats[sizeId].imageCount += imageCount
          stats[sizeId].totalPrintCount += totalPrintCount
        } else {
          stats[sizeId] = { imageCount, totalPrintCount }
        }
      }
    })

    setSizeStats(stats)
  }, [orderNumber])

  const handleSelectSize = (sizeId: string) => {
    const size = PHOTO_SIZES.find((s) => s.id === sizeId)
    if (!size) return

    // 使用 orderNumber-sizeId 作为唯一的 session ID
    const sessionId = orderNumber ? `${orderNumber}-${sizeId}` : `ORDER-${Date.now()}-${sizeId}`

    // 检查是否已存在该 session
    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}

    if (orders[sessionId]) {
      // 已存在，恢复 session
      const existingSession = orders[sessionId]
      const session = {
        ...existingSession,
        unit: existingSession.unit || 'mm',
        ratio: existingSession.ratio || size.ratio,
      }
      setCurrentSession(session)
      // 不清除图片，保留已上传的
    } else {
      // 创建新的上传会话
      const session: Session = {
        id: sessionId,
        sizeId: size.id,
        sizeName: size.name,
        targetCount: 0, // 不限制数量
        currentCount: 0,
        canvasWidth: size.width,
        canvasHeight: size.height,
        unit: size.unit,
        ratio: size.ratio,
        createdAt: new Date().toISOString(),
      }

      // 保存到 localStorage
      orders[sessionId] = session
      localStorage.setItem('photo-orders', JSON.stringify(orders))

      setCurrentSession(session)
      clearImages()
    }

    // 清除临时存储的订单号（但保留以便返回时使用）
    // sessionStorage.removeItem('pending-order-number')

    // 直接跳转到上传页面
    router.push(`/upload/${sizeId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center">
          <button
            onClick={() => router.push('/')}
            className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold">选择照片尺寸</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4">
        {/* 订单号显示 */}
        {orderNumber && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              📦 订单编号：<span className="font-bold">{orderNumber}</span>
            </p>
          </div>
        )}
        
        <p className="text-gray-600 mb-6 text-center">
          请选择您要冲印的照片尺寸规格
        </p>

        <div className="grid gap-4">
          {PHOTO_SIZES.map((size) => {
            const stats = sizeStats[size.id]
            const hasUploads = stats && stats.imageCount > 0

            return (
              <div
                key={size.id}
                className="relative bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-pink-200 hover:scale-[1.02]"
                onClick={() => handleSelectSize(size.id)}
              >
                {/* 推荐标签 */}
                {size.recommended && !hasUploads && (
                  <div className="absolute -top-2 -right-2 px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full shadow-md">
                    推荐
                  </div>
                )}
                
                {/* 角标 */}
                {size.badge && !size.recommended && !hasUploads && (
                  <div className="absolute -top-2 -right-2 px-3 py-1 bg-pink-500 text-white text-xs font-semibold rounded-full shadow-md">
                    {size.badge}
                  </div>
                )}

                {/* 已上传数量标签 */}
                {hasUploads && (
                  <div className="absolute -top-2 -right-2 px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full shadow-md flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    {stats.totalPrintCount}张
                  </div>
                )}

                <div className="flex items-start gap-4">
                  {/* 图标 */}
                  {size.icon && (
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${
                      hasUploads ? 'bg-green-50' : 'bg-pink-50'
                    }`}>
                      {size.icon}
                    </div>
                  )}

                  {/* 内容 */}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-800 mb-1">
                      {size.name}
                    </h3>
                    
                    {/* 描述 */}
                    {size.description && (
                      <p className="text-sm text-gray-600 mb-2">
                        {size.description}
                      </p>
                    )}
                    
                    {/* 规格信息 */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="px-2 py-1 bg-gray-100 rounded text-gray-700 font-medium">
                        {size.width}×{size.height} {size.unit}
                      </span>
                      
                      {/* 已上传提示 */}
                      {hasUploads && (
                        <span className="px-2 py-1 bg-green-100 rounded text-green-700 font-medium">
                          已上传 {stats.imageCount} 张照片
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 箭头 */}
                  <div className="flex-shrink-0 self-center">
                    <svg 
                      className={`w-6 h-6 ${hasUploads ? 'text-green-500' : 'text-gray-400'}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M9 5l7 7-7 7" 
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
