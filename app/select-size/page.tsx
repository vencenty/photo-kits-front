'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, ImageIcon, ChevronRight, X, Check, Loader2, Edit } from 'lucide-react'
import { PAPER_TYPES, SIZE_OPTIONS, generateSizeId, getPhotoSizeById } from '@/lib/photo-sizes'
import { useStore, Session } from '@/lib/store'
import { addSpec, deleteSpec, createOrder, listSpecs, getOrderDetail, SpecInfo } from '@/lib/api'
import { GlobalLoading } from '@/components/GlobalLoading'

// 已添加的规格项（包含数据库 ID）
interface AddedSize {
  dbId: number        // 数据库 ID，用于删除
  id: string          // sessionId
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
  const [receiverName, setReceiverName] = useState<string>('') // 收货人信息
  const [addedSizes, setAddedSizes] = useState<AddedSize[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedPaper, setSelectedPaper] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [showToast, setShowToast] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const clearImages = useStore((state) => state.clearImages)
  const setApiLoading = useStore((state) => state.setApiLoading)

  // 获取从查询页传来的订单号（优先从 sessionStorage，其次从 localStorage）
  useEffect(() => {
    const pendingOrder = sessionStorage.getItem('pending-order-number')
    if (pendingOrder) {
      setOrderNumber(pendingOrder)
      // 同时保存到 localStorage，支持刷新后恢复
      localStorage.setItem('current-order-number', pendingOrder)
    } else {
      // 刷新时从 localStorage 恢复
      const savedOrder = localStorage.getItem('current-order-number')
      if (savedOrder) {
        setOrderNumber(savedOrder)
      }
    }
  }, [])

  // 从服务端加载已添加的规格
  const loadSpecs = useCallback(async () => {
    if (!orderNumber) return

    setIsLoading(true)
    try {
      setApiLoading(true, '加载规格列表...')
      // 先尝试创建/获取订单
      await createOrder(orderNumber)
      
      // 获取订单详情（包含收货人信息）
      const orderDetail = await getOrderDetail(orderNumber, false)
      setReceiverName(orderDetail.receiverName || '')
      
      // 从后端获取规格列表
      const response = await listSpecs(orderNumber)
      const specs = response.specs || []
      
      // 从后端数据构建 AddedSize 列表
      const sizes: AddedSize[] = specs.map((spec: SpecInfo) => ({
        dbId: spec.id,
        id: spec.sessionId,
        paperId: spec.paperType,
        paperName: spec.paperName,
        sizeId: spec.sizeId,
        sizeName: spec.sizeName,
        width: spec.canvasWidth,
        height: spec.canvasHeight,
        imageCount: spec.photoCount || 0,
        totalPrintCount: spec.printCount || 0,
      }))
      setAddedSizes(sizes)
    } catch (error) {
      console.error('加载规格失败:', error)
      showToastMessage('加载规格失败，请重试')
    } finally {
      setIsLoading(false)
      setApiLoading(false, '')
    }
  }, [orderNumber])

  // 加载规格
  useEffect(() => {
    if (orderNumber) {
      loadSpecs()
    }
  }, [orderNumber, loadSpecs])

  // 显示 toast 提示
  const showToastMessage = (message: string) => {
    setShowToast(message)
    setTimeout(() => setShowToast(null), 2500)
  }

  // 添加新规格
  const handleAddSize = async () => {
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

    setIsAdding(true)
    try {
      setApiLoading(true, '添加规格中...')
      // 调用后端 API 添加规格
      const result = await addSpec(orderNumber, {
        sessionId: fullSizeId,
        paperType: selectedPaper,
        paperName: paper.name,
        sizeId: selectedSize,
        sizeName: size.name,
        canvasWidth: size.width,
        canvasHeight: size.height,
      })

      // 添加到列表（使用后端返回的数据）
      const newSize: AddedSize = {
        dbId: result.id,
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

      setAddedSizes([...addedSizes, newSize])
      showToastMessage(`已添加 ${paper.name} ${size.name}`)
    } catch (error) {
      console.error('添加规格失败:', error)
      showToastMessage('添加失败，请重试')
    } finally {
      setIsAdding(false)
      setShowAddModal(false)
      setSelectedPaper(null)
      setSelectedSize(null)
      setApiLoading(false, '')
    }
  }

  // 选择规格进入上传
  const handleSelectSize = (size: AddedSize) => {
    const photoSize = getPhotoSizeById(size.id)
    if (!photoSize) return

    const currentOrderNo = orderNumber || `ORDER-${Date.now()}`
    const sessionId = `${currentOrderNo}-${size.id}`

    // 构建 session 用于上传页面
    const session: Session = {
      id: sessionId,
      orderNo: currentOrderNo,
      sizeId: size.id,
      sizeName: `${size.paperName} ${size.sizeName}`,
      targetCount: 0,
      currentCount: size.imageCount,
      canvasWidth: size.width,
      canvasHeight: size.height,
      unit: '毫米',
      ratio: size.width / size.height,
      createdAt: new Date().toISOString(),
    }

    setCurrentSession(session)
    clearImages()

    router.push(`/upload?sizeId=${size.id}`)
  }

  // 删除规格
  const handleDeleteSize = async (size: AddedSize, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!orderNumber) return

    // 始终弹出确认对话框
    const confirmMessage = size.imageCount > 0
      ? `确定要删除「${size.paperName} ${size.sizeName}」吗？\n该规格已上传 ${size.imageCount} 张照片，删除后数据将丢失。`
      : `确定要删除「${size.paperName} ${size.sizeName}」规格吗？`

    if (!confirm(confirmMessage)) {
      return
    }

    setIsDeleting(size.id)
    try {
      setApiLoading(true, '删除规格中...')
      // 调用后端 API 删除规格
      await deleteSpec(orderNumber, size.dbId)

      // 更新列表
      setAddedSizes(addedSizes.filter(s => s.id !== size.id))
      showToastMessage('已删除规格')
    } catch (error) {
      console.error('删除规格失败:', error)
      showToastMessage('删除失败，请重试')
    } finally {
      setIsDeleting(null)
      setApiLoading(false, '')
    }
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
        {/* 订单信息显示 */}
        {orderNumber && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
            {/* 订单号 */}
            <div className="px-4 py-2.5">
              <p className="text-sm text-blue-700">
                📦 订单编号：<span className="font-bold">{orderNumber}</span>
              </p>
            </div>
            
            {/* 收货人信息 */}
            {receiverName && (
              <div className="px-4 py-2.5 bg-blue-100/50 border-t border-blue-200 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-blue-700">
                    👤 收货人：<span className="font-medium">{receiverName}</span>
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/guide?orderNo=${orderNumber}`)}
                  className="ml-2 p-1.5 text-blue-600 hover:bg-blue-200 rounded transition-colors flex-shrink-0"
                  title="编辑收货人信息"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            )}
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

        {/* 加载中 */}
        {isLoading && (
          <div className="py-20 text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-[#ff4d6d] animate-spin" />
            <p className="text-gray-400">加载中...</p>
          </div>
        )}

        {/* 已添加的规格列表 */}
        {!isLoading && addedSizes.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-gray-400 mb-1">还没有添加规格</p>
            <p className="text-sm text-gray-300">点击上方"添加规格"开始选择</p>
          </div>
        ) : !isLoading && (
          <div className="space-y-3">
            {addedSizes.map((size) => (
              <div
                key={size.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm active:bg-gray-50 transition-colors"
                onClick={() => handleSelectSize(size)}
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
                      onClick={(e) => handleDeleteSize(size, e)}
                      disabled={isDeleting === size.id}
                      className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                    >
                      {isDeleting === size.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
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
        {!isLoading && addedSizes.length > 0 && (
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
                disabled={!selectedPaper || !selectedSize || isAdding}
                className={`text-sm font-medium flex items-center gap-1 ${
                  selectedPaper && selectedSize && !isAdding
                    ? 'text-[#ff4d6d]'
                    : 'text-gray-300'
                }`}
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
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

      {/* 全局 Loading */}
      <GlobalLoading />
    </div>
  )
}
