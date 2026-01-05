'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, ImageIcon, ChevronRight, X, Check } from 'lucide-react'
import { PAPER_TYPES, SIZE_OPTIONS, generateSizeId, getPhotoSizeById } from '@/lib/photo-sizes'
import { useStore, Session } from '@/lib/store'

// 已添加的规格项
interface AddedSize {
  id: string
  paperId: string
  paperName: string
  sizeId: string
  sizeName: string
  width: number
  height: number
  imageCount: number
  totalPrintCount: number
}

export default function SelectSizePage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [addedSizes, setAddedSizes] = useState<AddedSize[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedPaper, setSelectedPaper] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [showToast, setShowToast] = useState<string | null>(null)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const clearImages = useStore((state) => state.clearImages)

  // 获取从查询页传来的订单号
  useEffect(() => {
    const pendingOrder = sessionStorage.getItem('pending-order-number')
    if (pendingOrder) {
      setOrderNumber(pendingOrder)
    }
  }, [])

  // 加载已添加的规格
  useEffect(() => {
    if (!orderNumber) return

    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}
    
    const uploadStorage = localStorage.getItem('photo-upload-storage')
    const storageData = uploadStorage ? JSON.parse(uploadStorage) : { state: { images: [] } }
    const allImages = storageData.state?.images || []

    const sizes: AddedSize[] = []

    Object.keys(orders).forEach((orderId) => {
      if (orderId.startsWith(`${orderNumber}-`)) {
        const session = orders[orderId]
        const sizeId = session.sizeId
        
        // 解析相纸和尺寸信息
        const parts = sizeId.split('-')
        const sizeKey = parts[parts.length - 1]
        const paperKey = parts.slice(0, -1).join('-')
        
        const paper = PAPER_TYPES.find(p => p.id === paperKey)
        const size = SIZE_OPTIONS.find(s => s.id === sizeKey)
        
        if (paper && size) {
          const sessionImages = allImages.filter((img: any) => img.sessionId === orderId)
          const imageCount = sessionImages.length
          const totalPrintCount = sessionImages.reduce((sum: number, img: any) => sum + (img.printCount || 1), 0)

          sizes.push({
            id: sizeId,
            paperId: paperKey,
            paperName: paper.name,
            sizeId: sizeKey,
            sizeName: size.name,
            width: size.width,
            height: size.height,
            imageCount,
            totalPrintCount,
          })
        }
      }
    })

    setAddedSizes(sizes)
  }, [orderNumber])

  // 显示 toast 提示
  const showToastMessage = (message: string) => {
    setShowToast(message)
    setTimeout(() => setShowToast(null), 2500)
  }

  // 添加新规格（不跳转）
  const handleAddSize = () => {
    if (!selectedPaper || !selectedSize || !orderNumber) return

    const paper = PAPER_TYPES.find(p => p.id === selectedPaper)
    const size = SIZE_OPTIONS.find(s => s.id === selectedSize)
    if (!paper || !size) return

    const fullSizeId = generateSizeId(selectedPaper, selectedSize)
    
    // 检查是否已存在
    const exists = addedSizes.some(s => s.id === fullSizeId)
    
    if (exists) {
      showToastMessage(`${paper.name} ${size.name} 规格已存在`)
      setShowAddModal(false)
      setSelectedPaper(null)
      setSelectedSize(null)
      return
    }

    // 添加新规格到列表（不跳转）
    const newSize: AddedSize = {
      id: fullSizeId,
      paperId: selectedPaper,
      paperName: paper.name,
      sizeId: selectedSize,
      sizeName: size.name,
      width: size.width,
      height: size.height,
      imageCount: 0,
      totalPrintCount: 0,
    }

    // 预先创建 session 并保存到 localStorage
    const photoSize = getPhotoSizeById(fullSizeId)
    if (photoSize) {
      const sessionId = `${orderNumber}-${fullSizeId}`
      const savedOrders = localStorage.getItem('photo-orders')
      const orders = savedOrders ? JSON.parse(savedOrders) : {}
      
      if (!orders[sessionId]) {
        const session: Session = {
          id: sessionId,
          sizeId: photoSize.id,
          sizeName: photoSize.name,
          targetCount: 0,
          currentCount: 0,
          canvasWidth: photoSize.width,
          canvasHeight: photoSize.height,
          unit: photoSize.unit,
          ratio: photoSize.ratio,
          createdAt: new Date().toISOString(),
        }
        orders[sessionId] = session
        localStorage.setItem('photo-orders', JSON.stringify(orders))
      }
    }

    setAddedSizes([...addedSizes, newSize])
    setShowAddModal(false)
    setSelectedPaper(null)
    setSelectedSize(null)
    
    showToastMessage(`已添加 ${paper.name} ${size.name}`)
  }

  // 选择规格进入上传
  const handleSelectSize = (sizeId: string) => {
    const photoSize = getPhotoSizeById(sizeId)
    if (!photoSize) return

    const sessionId = orderNumber ? `${orderNumber}-${sizeId}` : `ORDER-${Date.now()}-${sizeId}`

    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}

    if (orders[sessionId]) {
      const existingSession = orders[sessionId]
      const session = {
        ...existingSession,
        unit: existingSession.unit || '毫米',
        ratio: existingSession.ratio || photoSize.ratio,
      }
      setCurrentSession(session)
    } else {
      const session: Session = {
        id: sessionId,
        sizeId: photoSize.id,
        sizeName: photoSize.name,
        targetCount: 0,
        currentCount: 0,
        canvasWidth: photoSize.width,
        canvasHeight: photoSize.height,
        unit: photoSize.unit,
        ratio: photoSize.ratio,
        createdAt: new Date().toISOString(),
      }

      orders[sessionId] = session
      localStorage.setItem('photo-orders', JSON.stringify(orders))

      setCurrentSession(session)
      clearImages()
    }

    router.push(`/upload/${sizeId}`)
  }

  // 删除规格
  const handleDeleteSize = (sizeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const sizeInfo = addedSizes.find(s => s.id === sizeId)
    if (!sizeInfo) return

    // 始终弹出确认对话框
    const confirmMessage = sizeInfo.imageCount > 0
      ? `确定要删除「${sizeInfo.paperName} ${sizeInfo.sizeName}」吗？\n该规格已上传 ${sizeInfo.imageCount} 张照片，删除后数据将丢失。`
      : `确定要删除「${sizeInfo.paperName} ${sizeInfo.sizeName}」规格吗？`

    if (!confirm(confirmMessage)) {
      return
    }

    // 从 localStorage 中删除
    const sessionId = `${orderNumber}-${sizeId}`
    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}
    delete orders[sessionId]
    localStorage.setItem('photo-orders', JSON.stringify(orders))

    // 更新列表
    setAddedSizes(addedSizes.filter(s => s.id !== sizeId))
    showToastMessage('已删除规格')
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
          <h1 className="text-lg font-semibold">选择照片尺寸</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* 订单号显示 */}
        {orderNumber && (
          <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              📦 订单编号：<span className="font-bold">{orderNumber}</span>
            </p>
          </div>
        )}

        {/* 添加规格按钮 */}
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full mb-4 py-3.5 bg-white rounded-xl border-2 border-dashed border-[#ff4d6d]/40 flex items-center justify-center gap-2 text-[#ff4d6d] hover:bg-pink-50 transition-colors active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">添加规格</span>
        </button>

        {/* 已添加的规格列表 */}
        {addedSizes.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-gray-400 mb-1">还没有添加规格</p>
            <p className="text-sm text-gray-300">点击上方"添加规格"开始选择</p>
          </div>
        ) : (
          <div className="space-y-3">
            {addedSizes.map((size) => (
              <div
                key={size.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm active:bg-gray-50 transition-colors"
                onClick={() => handleSelectSize(size.id)}
              >
                <div className="flex items-center px-4 py-3">
                  {/* 左侧信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-bold text-gray-800">{size.paperName}</span>
                      <span className="text-lg font-bold text-[#ff4d6d]">{size.sizeName}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {size.width}×{size.height}mm
                    </div>
                  </div>

                  {/* 右侧：上传数量 + 箭头 */}
                  <div className="flex items-center gap-3">
                    {/* 上传数量 */}
                    <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                      size.totalPrintCount > 0
                        ? 'bg-green-50 text-green-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5" />
                        已上传{size.totalPrintCount}张
                      </span>
                    </div>

                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => handleDeleteSize(size.id, e)}
                      className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* 箭头 */}
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部提示 */}
        {addedSizes.length > 0 && (
          <p className="mt-6 text-center text-xs text-gray-400">
            点击规格可进入上传页面
          </p>
        )}
      </div>

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="px-6 py-3 bg-black/75 text-white text-sm rounded-lg shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" />
            {showToast}
          </div>
        </div>
      )}

      {/* 添加规格弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowAddModal(false)}>
          <div 
            className="bg-white w-full rounded-t-2xl max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setSelectedPaper(null)
                  setSelectedSize(null)
                }}
                className="text-gray-500 text-sm"
              >
                取消
              </button>
              <h3 className="font-semibold">添加规格</h3>
              <button
                onClick={handleAddSize}
                disabled={!selectedPaper || !selectedSize}
                className={`text-sm font-medium ${
                  selectedPaper && selectedSize
                    ? 'text-[#ff4d6d]'
                    : 'text-gray-300'
                }`}
              >
                添加
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {/* 选择相纸 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">选择相纸</h4>
                <div className="flex flex-wrap gap-2">
                  {PAPER_TYPES.map((paper) => (
                    <button
                      key={paper.id}
                      onClick={() => setSelectedPaper(paper.id)}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        selectedPaper === paper.id
                          ? 'bg-[#ff4d6d] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {paper.name}
                    </button>
                  ))}
                </div>
                {selectedPaper && (
                  <p className="mt-2 text-xs text-gray-500">
                    {PAPER_TYPES.find(p => p.id === selectedPaper)?.description}
                  </p>
                )}
              </div>

              {/* 选择尺寸 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">选择尺寸</h4>
                <div className="grid grid-cols-4 gap-2">
                  {SIZE_OPTIONS.map((size) => (
                    <button
                      key={size.id}
                      onClick={() => setSelectedSize(size.id)}
                      className={`py-3 rounded-lg text-sm font-medium transition-all ${
                        selectedSize === size.id
                          ? 'bg-[#ff4d6d] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {size.name}
                    </button>
                  ))}
                </div>
                {selectedSize && (
                  <p className="mt-2 text-xs text-gray-500">
                    尺寸：{SIZE_OPTIONS.find(s => s.id === selectedSize)?.width}×
                    {SIZE_OPTIONS.find(s => s.id === selectedSize)?.height}mm
                  </p>
                )}
              </div>

              {/* 当前选择预览 */}
              {selectedPaper && selectedSize && (
                <div className="mt-6 p-4 bg-gradient-to-r from-pink-50 to-orange-50 rounded-xl border border-pink-100">
                  <p className="text-sm text-gray-600">
                    当前选择：
                    <span className="font-bold text-[#ff4d6d]">
                      {' '}{PAPER_TYPES.find(p => p.id === selectedPaper)?.name}{' '}
                      {SIZE_OPTIONS.find(s => s.id === selectedSize)?.name}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {SIZE_OPTIONS.find(s => s.id === selectedSize)?.width}×
                    {SIZE_OPTIONS.find(s => s.id === selectedSize)?.height}mm
                  </p>
                </div>
              )}
            </div>

            {/* 底部安全区域 */}
            <div className="h-8 bg-white" />
          </div>
        </div>
      )}
    </div>
  )
}
