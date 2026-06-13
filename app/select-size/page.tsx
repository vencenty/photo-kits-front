'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useShopRouter } from '@/lib/useShopRouter'
import { ArrowLeft, Plus, ImageIcon, ChevronRight, X, Check, Loader2, Edit } from 'lucide-react'
import { useStore, Session } from '@/lib/store'
import {
  addSpec,
  deleteSpec,
  getOrderDetail,
  type SpecInfo,
} from '@/lib/api'
import { preloadCatalog, skuKey, type PublicSkuListResponse } from '@/lib/catalog'
import { setActiveOrderNo } from '@/lib/order-context'
import { OrderGateLoading, useRequireActiveOrder } from '@/lib/useRequireActiveOrder'
import { isOrderLocked as checkOrderLocked } from '@/lib/constants'
import { BusinessError, NetworkError, SystemError } from '@/lib/error-handler'
import type { CropMode } from '@/lib/types'
import { getSpecWatermarkPref, setSpecWatermarkPref } from '@/lib/spec-watermark-prefs'

interface AddedSize {
  specId: number
  skuId: number
  paperName: string
  sizeName: string
  width: number
  height: number
  cropDefaultMode: CropMode
  cropAvailableModes: CropMode[]
  dateWatermarkEnabled: boolean
  imageCount: number
  totalPrintCount: number
}

export default function SelectSizePage() {
  const router = useShopRouter()
  const orderNumber = useRequireActiveOrder()
  const [receiverName, setReceiverName] = useState<string>('')
  const [isOrderLocked, setIsOrderLocked] = useState(false)
  const [addedSizes, setAddedSizes] = useState<AddedSize[]>([])
  const [catalog, setCatalog] = useState<PublicSkuListResponse | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeleteSize, setPendingDeleteSize] = useState<AddedSize | null>(null)
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null)
  const [showToast, setShowToast] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const clearImages = useStore((state) => state.clearImages)

  const skuByKey = useMemo(() => {
    const map = new Map<string, PublicSkuListResponse['skus'][number]>()
    catalog?.skus.forEach((sku) => {
      map.set(skuKey(sku.paperTypeId, sku.paperSizeId), sku)
    })
    return map
  }, [catalog])

  const disabledSizeIds = useMemo(() => {
    if (!selectedPaperId || !catalog) return new Set<number>()
    const paper = catalog.paperTypes.find((p) => p.id === selectedPaperId)
    if (!paper) return new Set<number>()
    const enabled = new Set(paper.supportedSizeIds)
    return new Set(catalog.sizes.filter((s) => !enabled.has(s.id)).map((s) => s.id))
  }, [selectedPaperId, catalog])

  const disabledPaperIds = useMemo(() => {
    if (!selectedSizeId || !catalog) return new Set<number>()
    return new Set(
      catalog.paperTypes
        .filter((p) => !p.supportedSizeIds.includes(selectedSizeId))
        .map((p) => p.id),
    )
  }, [selectedSizeId, catalog])

  const handleSelectPaper = useCallback(
    (paperTypeId: number) => {
      setSelectedPaperId(paperTypeId)
      if (selectedSizeId && !skuByKey.has(skuKey(paperTypeId, selectedSizeId))) {
        setSelectedSizeId(null)
      }
    },
    [selectedSizeId, skuByKey],
  )

  const handleSizeOptionClick = useCallback(
    (paperSizeId: number) => {
      setSelectedSizeId(paperSizeId)
      if (selectedPaperId && !skuByKey.has(skuKey(selectedPaperId, paperSizeId))) {
        setSelectedPaperId(null)
      }
    },
    [selectedPaperId, skuByKey],
  )

  const specToAddedSize = useCallback(
    (spec: SpecInfo): AddedSize => {
      const sku = catalog?.skus.find((s) => s.id === spec.skuId)
      return {
        specId: spec.id,
        skuId: spec.skuId,
        paperName: spec.paperName,
        sizeName: spec.sizeName,
        width: spec.canvasWidth,
        height: spec.canvasHeight,
        cropDefaultMode: (sku?.cropDefaultMode || 'lomo') as CropMode,
        cropAvailableModes: (sku?.cropAvailableModes || ['cover', 'lomo', 'full']) as CropMode[],
        dateWatermarkEnabled: orderNumber
          ? getSpecWatermarkPref(orderNumber, spec.id)
          : false,
        imageCount: spec.photoCount || 0,
        totalPrintCount: spec.photoCount || 0,
      }
    },
    [catalog, orderNumber],
  )

  useEffect(() => {
    preloadCatalog()
      .then(setCatalog)
      .catch((err) => console.error('加载 SKU 目录失败:', err))
  }, [])

  const loadSpecs = useCallback(async () => {
    if (!orderNumber) return
    setIsLoading(true)
    try {
      const orderDetail = await getOrderDetail(undefined, false)
      setReceiverName(orderDetail.receiverName || '')
      setIsOrderLocked(checkOrderLocked(orderDetail.status))
      const specs = orderDetail.specs || []
      setAddedSizes(specs.map(specToAddedSize))
    } catch (error) {
      console.error('加载规格失败:', error)
      showToastMessage('加载规格失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }, [orderNumber, specToAddedSize])

  useEffect(() => {
    if (orderNumber && catalog) loadSpecs()
  }, [orderNumber, catalog, loadSpecs])

  const showToastMessage = (message: string) => {
    setShowToast(message)
    setTimeout(() => setShowToast(null), 2500)
  }

  const handleAddSize = async () => {
    if (!selectedPaperId || !selectedSizeId || !orderNumber) return
    if (isOrderLocked) {
      showToastMessage('订单已锁定，无法添加规格')
      setShowAddModal(false)
      return
    }

    const sku = skuByKey.get(skuKey(selectedPaperId, selectedSizeId))
    if (!sku) {
      showToastMessage('该组合不可售')
      return
    }

    if (addedSizes.some((s) => s.skuId === sku.id)) {
      showToastMessage(`${sku.paperName} ${sku.sizeName} 规格已存在`)
      setShowAddModal(false)
      setSelectedPaperId(null)
      setSelectedSizeId(null)
      return
    }

    setIsAdding(true)
    try {
      const result = await addSpec({ skuId: sku.id }, { silent: true })
      const newSize = specToAddedSize(result)
      setAddedSizes((prev) => [...prev, newSize])
      showToastMessage(`已添加 ${sku.paperName} ${sku.sizeName}`)
    } catch (error) {
      console.error('添加规格失败:', error)
      const message =
        error instanceof BusinessError || error instanceof SystemError
          ? error.msg
          : error instanceof NetworkError
            ? error.message
            : '添加失败，请重试'
      showToastMessage(message)
    } finally {
      setIsAdding(false)
      setShowAddModal(false)
      setSelectedPaperId(null)
      setSelectedSizeId(null)
    }
  }

  const handleToggleWatermark = (specId: number, enabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!orderNumber) return
    setSpecWatermarkPref(orderNumber, specId, enabled)
    setAddedSizes((prev) =>
      prev.map((s) => (s.specId === specId ? { ...s, dateWatermarkEnabled: enabled } : s)),
    )
  }

  const handleSelectSize = (size: AddedSize) => {
    if (!orderNumber) return
    setActiveOrderNo(orderNumber)

    const session: Session = {
      specId: size.specId,
      skuId: size.skuId,
      orderNo: orderNumber,
      sizeName: `${size.paperName} ${size.sizeName}`,
      targetCount: 0,
      currentCount: size.imageCount,
      canvasWidth: size.width,
      canvasHeight: size.height,
      unit: '毫米',
      ratio: size.width / size.height,
      cropDefaultMode: size.cropDefaultMode,
      cropAvailableModes: size.cropAvailableModes,
      dateWatermarkEnabled: size.dateWatermarkEnabled,
      createdAt: new Date().toISOString(),
    }

    setCurrentSession(session)
    clearImages()
    router.push(`/upload?specId=${size.specId}`)
  }

  const handleDeleteSize = async (size: AddedSize, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!orderNumber) return
    if (isOrderLocked) {
      showToastMessage('订单已锁定，无法删除规格')
      return
    }
    setPendingDeleteSize(size)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteSize = async () => {
    if (!orderNumber || !pendingDeleteSize) return
    const size = pendingDeleteSize
    setIsDeleting(size.specId)
    try {
      await deleteSpec(size.specId)
      setAddedSizes((prev) => prev.filter((s) => s.specId !== size.specId))
      showToastMessage('已删除规格')
      setShowDeleteConfirm(false)
      setPendingDeleteSize(null)
    } catch (error) {
      console.error('删除规格失败:', error)
      showToastMessage('删除失败，请重试')
    } finally {
      setIsDeleting(null)
    }
  }

  if (!orderNumber) {
    return <OrderGateLoading />
  }

  return (
    <div className="min-h-screen bg-app">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 shadow-sm desktop-nav">
        <div className="desktop-container flex items-center px-4 py-3">
          <button
            onClick={() => router.push('/')}
            className="mr-3 p-1 text-gray-700 hover:text-gray-900 transition-colors desktop-hover"
          >
            <ArrowLeft className="w-6 h-6 md:w-7 md:h-7" />
          </button>
          <h1 className="text-lg font-semibold md:text-xl">选择照片尺寸</h1>
        </div>
      </div>

      {/* Content */}
      <div className="desktop-container p-4">
        {/* 订单信息显示 */}
        {orderNumber && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden desktop-shadow">
            {/* 订单号 */}
            <div className="px-4 py-2.5">
              <p className="text-sm text-blue-700 md:text-base">
                📦 订单编号：<span className="font-bold">{orderNumber}</span>
              </p>
            </div>
            
            {/* 收货人信息 */}
            {receiverName && (
              <div className="px-4 py-2.5 bg-blue-100/50 border-t border-blue-200 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-blue-700 md:text-base">
                    👤 收货人：<span className="font-medium">{receiverName}</span>
                  </p>
                </div>
                {!isOrderLocked && (
                  <button
                    onClick={() => router.push(`/guide?orderNo=${orderNumber}`)}
                    className="ml-2 p-1.5 text-blue-600 hover:bg-blue-200 rounded transition-colors flex-shrink-0 desktop-hover"
                    title="编辑收货人信息"
                  >
                    <Edit className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                )}
              </div>
            )}
            
            {/* 锁定状态提示 */}
            {isOrderLocked && (
              <div className="px-4 py-2.5 bg-amber-50 border-t-2 border-amber-500">
                <p className="text-sm text-amber-800 font-medium md:text-base">
                  🔒 订单已锁定，正在制作中
                </p>
              </div>
            )}
          </div>
        )}

        {/* 添加规格按钮 */}
        {!isOrderLocked && (
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full mb-4 py-3.5 bg-white rounded-xl border-2 border-dashed border-[#ff4d6d]/40 flex items-center justify-center gap-2 text-primary-600 hover:bg-pink-50 transition-colors active:scale-[0.98] md:py-4 desktop-hover"
          >
            <Plus className="w-5 h-5 md:w-6 md:h-6" />
            <span className="font-medium md:text-base">添加规格</span>
          </button>
        )}

        {/* 加载中 */}
        {isLoading && (
          <div className="py-20 text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary-600 animate-spin" />
            <p className="text-gray-400 md:text-lg">加载中...</p>
          </div>
        )}

        {/* 已添加的规格列表 */}
        {!isLoading && addedSizes.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-gray-400 mb-1 md:text-lg">还没有添加规格</p>
            <p className="text-sm text-gray-300 md:text-base">点击上方"添加规格"开始选择</p>
          </div>
        ) : !isLoading && (
          <div className="space-y-3">
            {addedSizes.map((size) => (
              <div
                key={size.specId}
                className="bg-white rounded-xl overflow-hidden shadow-sm active:bg-gray-50 transition-colors desktop-shadow desktop-hover"
                onClick={() => handleSelectSize(size)}
              >
                <div className="px-4 py-3 md:py-4">
                <div className="flex items-center">
                  {/* 左侧信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-bold text-gray-800 md:text-lg">{size.paperName}</span>
                      <span className="text-lg font-bold text-primary-600 md:text-xl">{size.sizeName}</span>
                    </div>
                    <div className="text-xs text-gray-400 md:text-sm">
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
                    } md:px-4 md:py-2`}>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        已上传{size.totalPrintCount}张
                      </span>
                    </div>

                    {/* 删除按钮 */}
                    {!isOrderLocked && (
                      <button
                        onClick={(e) => handleDeleteSize(size, e)}
                        disabled={isDeleting === size.specId}
                        className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50 md:w-8 md:h-8 desktop-hover"
                      >
                        {isDeleting === size.specId ? (
                          <Loader2 className="w-4 h-4 animate-spin md:w-5 md:h-5" />
                        ) : (
                          <X className="w-4 h-4 md:w-5 md:h-5" />
                        )}
                      </button>
                    )}

                    {/* 箭头 */}
                    <ChevronRight className="w-5 h-5 text-gray-300 md:w-6 md:h-6" />
                  </div>
                </div>
                {!isOrderLocked && (
                  <div
                    className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <p className="text-sm text-gray-700 md:text-base">添加日期水印</p>
                      <p className="text-xs text-gray-400 mt-0.5">从照片 EXIF 读取拍摄日期，叠加在右下角</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={size.dateWatermarkEnabled}
                      onClick={(e) => handleToggleWatermark(size.specId, !size.dateWatermarkEnabled, e)}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                        size.dateWatermarkEnabled ? 'bg-[#ff4d6d]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          size.dateWatermarkEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部提示 */}
        {!isLoading && addedSizes.length > 0 && (
          <p className="mt-6 text-center text-xs text-gray-400 md:text-sm">
            可先开启日期水印，再点击规格进入上传
          </p>
        )}
      </div>

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="px-6 py-3 bg-black/75 text-white text-sm rounded-lg shadow-lg flex items-center gap-2 md:text-base">
            <Check className="w-4 h-4 md:w-5 md:h-5" />
            {showToast}
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && pendingDeleteSize && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-5"
          onClick={() => {
            if (isDeleting) return
            setShowDeleteConfirm(false)
            setPendingDeleteSize(null)
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden desktop-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4">
              <h3 className="text-base font-semibold text-gray-900 md:text-lg">确认删除</h3>
              <div className="mt-2 text-sm text-gray-600 leading-relaxed md:text-base">
                <p>
                  确定要删除「{pendingDeleteSize.paperName} {pendingDeleteSize.sizeName}」吗？
                </p>
                {pendingDeleteSize.imageCount > 0 ? (
                  <p className="mt-2 text-red-500">
                    该规格已上传 {pendingDeleteSize.imageCount} 张照片，删除后数据将丢失且无法恢复。
                  </p>
                ) : (
                  <p className="mt-2 text-gray-400">
                    删除后该规格将从列表移除。
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 pb-5 flex items-center gap-3">
              <button
                type="button"
                disabled={!!isDeleting}
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setPendingDeleteSize(null)
                }}
                className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-700 font-medium active:scale-[0.99] disabled:opacity-50 desktop-hover"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeleting === pendingDeleteSize.specId}
                onClick={confirmDeleteSize}
                className="flex-1 h-11 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 desktop-hover"
              >
                {isDeleting === pendingDeleteSize.specId && <Loader2 className="w-4 h-4 animate-spin" />}
                确认删除
              </button>
            </div>
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
                  setSelectedPaperId(null)
                  setSelectedSizeId(null)
                }}
                className="text-gray-500 text-sm md:text-base desktop-hover"
              >
                取消
              </button>
              <h3 className="font-semibold md:text-lg">添加规格</h3>
              <button
                onClick={handleAddSize}
                disabled={!selectedPaperId || !selectedSizeId || isAdding}
                className={`text-sm font-medium flex items-center gap-1 md:text-base ${
                  selectedPaperId && selectedSizeId && !isAdding
                    ? 'text-primary-600'
                    : 'text-gray-300'
                } desktop-hover`}
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                添加
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {/* 选择相纸 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3 md:text-base">选择相纸</h4>
                <div className="flex flex-wrap gap-2">
                  {(catalog?.paperTypes || []).map((paper) => {
                    const isDisabled = disabledPaperIds.has(paper.id)
                    return (
                      <button
                        key={paper.id}
                        onClick={() => !isDisabled && handleSelectPaper(paper.id)}
                        disabled={isDisabled}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all md:px-5 md:py-3 md:text-base ${
                          selectedPaperId === paper.id
                            ? 'bg-[#ff4d6d] text-white shadow-sm'
                            : isDisabled
                              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        } desktop-hover`}
                      >
                        {paper.name}
                      </button>
                    )
                  })}
                </div>
                {selectedPaperId && (
                  <p className="mt-2 text-xs text-gray-500 md:text-sm">
                    {catalog?.paperTypes.find((p) => p.id === selectedPaperId)?.description}
                  </p>
                )}
              </div>

              {/* 选择尺寸 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3 md:text-base">选择尺寸</h4>
                <div className="grid grid-cols-4 gap-2 md:grid-cols-6 md:gap-3">
                  {(catalog?.sizes || []).map((size) => {
                    const isDisabled = disabledSizeIds.has(size.id)
                    return (
                      <button
                        key={size.id}
                        onClick={() => !isDisabled && handleSizeOptionClick(size.id)}
                        disabled={isDisabled}
                        className={`py-3 rounded-lg text-sm font-medium transition-all md:py-4 md:text-base ${
                          selectedSizeId === size.id
                            ? 'bg-[#ff4d6d] text-white shadow-sm'
                            : isDisabled
                              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        } desktop-hover`}
                      >
                        {size.name}
                      </button>
                    )
                  })}
                </div>
                {selectedSizeId && (
                  <p className="mt-2 text-xs text-gray-500 md:text-sm">
                    尺寸：{catalog?.sizes.find((s) => s.id === selectedSizeId)?.width}×
                    {catalog?.sizes.find((s) => s.id === selectedSizeId)?.height}mm
                  </p>
                )}
              </div>

              {/* 当前选择预览 */}
              {selectedPaperId && selectedSizeId && (
                <div className="mt-6 p-4 bg-gradient-to-r from-pink-50 to-orange-50 rounded-xl border border-pink-100">
                  <p className="text-sm text-gray-600 md:text-base">
                    当前选择：
                    <span className="font-bold text-primary-600">
                      {' '}{catalog?.paperTypes.find((p) => p.id === selectedPaperId)?.name}{' '}
                      {catalog?.sizes.find((s) => s.id === selectedSizeId)?.name}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1 md:text-sm">
                    {catalog?.sizes.find((s) => s.id === selectedSizeId)?.width}×
                    {catalog?.sizes.find((s) => s.id === selectedSizeId)?.height}mm
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
