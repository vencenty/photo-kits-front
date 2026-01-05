'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Plus, X, Minus, Upload, Home, CheckSquare } from 'lucide-react'
import Image from 'next/image'
import { useStore, EditState, parseAffineMatrix } from '@/lib/store'
import { getPhotoSizeById } from '@/lib/photo-sizes'
import { generateId, compressImage, getImageDimensions } from '@/lib/utils'
import type { Image as ImageType } from '@/lib/store'
import { PhotoCanvas, type StyleType } from '@/components/PhotoCanvas'
import { PhotoPreviewCard } from '@/components/PhotoPreviewCard'

// 裁剪模式类型
type CropMode = 'center' | 'full' | 'lomo'

export default function UploadPage() {
  const router = useRouter()
  const params = useParams()
  const sizeId = params.sizeId as string
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  const currentSession = useStore((state) => state.currentSession)
  const allImages = useStore((state) => state.images)
  // 过滤掉没有 thumbnailUrl 的图片（可能是从 localStorage 恢复的不完整数据）
  const images = allImages.filter(img => img.thumbnailUrl)
  const addImages = useStore((state) => state.addImages)
  const updateImage = useStore((state) => state.updateImage)
  const updateImages = useStore((state) => state.updateImages)
  const deleteImage = useStore((state) => state.deleteImage)
  const selectedIds = useStore((state) => state.selectedIds)
  const toggleSelection = useStore((state) => state.toggleSelection)
  const clearSelection = useStore((state) => state.clearSelection)
  const selectAll = useStore((state) => state.selectAll)

  const [isBatchMode, setIsBatchMode] = useState(false)
  const [batchCropMode, setBatchCropMode] = useState<CropMode | null>(null)

  // 获取相纸尺寸配置
  const photoSize = getPhotoSizeById(sizeId)
  // 计算相纸比例
  const paperRatio = currentSession ? currentSession.canvasWidth / currentSession.canvasHeight : 1.43
  // 判断相纸是否为竖向（高度 > 宽度）
  const isPaperPortrait = currentSession ? currentSession.canvasHeight > currentSession.canvasWidth : false

  useEffect(() => {
    // 如果没有 session，跳转回首页查询订单
    if (!currentSession || currentSession.sizeId !== sizeId) {
      router.push('/')
    }
  }, [currentSession, sizeId, router])

  /**
   * 判断图片是否需要旋转
   * 规则：横图（宽>高）默认旋转为竖图，正方形图片不旋转
   */
  const shouldRotateImage = (imageWidth: number, imageHeight: number): boolean => {
    // 正方形图片不旋转（宽高差异小于5%视为正方形）
    const ratio = imageWidth / imageHeight
    const isSquare = ratio >= 0.95 && ratio <= 1.05
    if (isSquare) return false
    
    // 横图（宽 > 高）需要旋转为竖图
    const isImageLandscape = imageWidth > imageHeight
    return isImageLandscape
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !currentSession) return

    const newImages: ImageType[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        // 获取原图尺寸
        const dimensions = await getImageDimensions(file)
        
        // 压缩生成缩略图（用于显示）
        const { dataUrl } = await compressImage(file, 600, 0.85)

        // 使用原图的 dataUrl 作为临时 URL
        const originalDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })

        // 判断是否需要旋转（横图在竖向相纸上自动旋转）
        const needsRotation = shouldRotateImage(dimensions.width, dimensions.height)

        // 默认使用居中裁剪模式
        const defaultEditState: EditState = {
          mode: 'center',
          scale: 1,
          x: 0,
          y: 0,
          rotation: needsRotation ? 90 : 0, // 横图自动旋转90度
          canvasWidth: currentSession.canvasWidth,
          canvasHeight: currentSession.canvasHeight,
        }

        const image: ImageType = {
          id: generateId(),
          sessionId: currentSession.id,
          originalUrl: originalDataUrl,
          thumbnailUrl: dataUrl,
          filename: file.name,
          width: dimensions.width,
          height: dimensions.height,
          printCount: 1,
          editState: defaultEditState,
          autoRotated: needsRotation, // 横图自动旋转标记
          file,
        }

        newImages.push(image)
      } catch (error) {
        console.error('处理图片失败:', error)
      }
    }

    if (newImages.length > 0) {
      addImages(newImages)
    }

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这张图片吗？')) {
      deleteImage(id)
    }
  }

  const handleCountChange = (id: string, delta: number) => {
    const image = images.find((img) => img.id === id)
    if (image) {
      const newCount = Math.max(1, image.printCount + delta)
      updateImage(id, { printCount: newCount })
    }
  }

  const handleEdit = (id: string) => {
    router.push(`/edit/${id}`)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return
    if (confirm(`确定要删除选中的 ${selectedIds.length} 张图片吗？`)) {
      selectedIds.forEach((id) => deleteImage(id))
      clearSelection()
      setIsBatchMode(false)
    }
  }

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedIds.length === images.length) {
      // 已全选，取消全选
      clearSelection()
    } else {
      // 全选
      selectAll()
    }
  }

  const isAllSelected = images.length > 0 && selectedIds.length === images.length

  // 批量应用裁剪模式 - 使用批量更新
  const handleApplyBatchCrop = (mode: CropMode) => {
    // 获取目标图片列表
    const targetIds = selectedIds.length === 0 ? images.map(img => img.id) : selectedIds

    // 为每张图片计算正确的旋转角度
    const updates = targetIds.map((id) => {
      const img = images.find(i => i.id === id)
      if (!img) return null

      // 保持原有的旋转设置（横图自动旋转的逻辑）
      const currentRotation = img.editState?.rotation || 0
      
      const newEditState: EditState = {
        mode,
        scale: 1,
        x: 0,
        y: 0,
        rotation: currentRotation, // 保持旋转角度
        canvasWidth: currentSession?.canvasWidth || 127,
        canvasHeight: currentSession?.canvasHeight || 89,
      }

      return {
        id,
        updates: { editState: newEditState },
      }
    }).filter(Boolean) as { id: string; updates: { editState: EditState } }[]

    updateImages(updates)
    setBatchCropMode(mode)
  }

  const totalPrintCount = images.reduce((sum, img) => sum + img.printCount, 0)
  // 只要有图片就可以提交
  const canSubmit = images.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    setShowSubmitModal(true)
  }

  const handleConfirmSubmit = () => {
    if (!currentSession) return
    
    // 更新订单状态到 localStorage
    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}
    orders[currentSession.id] = {
      ...currentSession,
      currentCount: totalPrintCount,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    }
    localStorage.setItem('photo-orders', JSON.stringify(orders))
    
    setShowSubmitModal(false)
    router.push('/success')
  }

  // 返回尺寸选择页
  const handleBack = () => {
    router.push('/select-size')
  }

  // 获取图片的裁剪模式
  const getImageCropMode = (image: ImageType): CropMode => {
    if (image.transform?.styleType) return image.transform.styleType
    return image.editState?.mode || 'center'
  }

  // 获取图片的旋转角度
  const getImageRotation = (image: ImageType): number => {
    if (image.transform) {
      const { rotation } = parseAffineMatrix(image.transform.matrix)
      return rotation
    }
    return image.editState?.rotation || 0
  }

  if (!currentSession) return null

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-32 overscroll-none">
      {/* Header - 仿微信小程序风格 */}
      <div className="bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              className="p-1 text-gray-700"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => router.push('/')}
              className="p-1 text-gray-700"
            >
              <Home className="w-6 h-6" />
            </button>
            <span className="text-lg font-medium ml-2">已上传照片</span>
          </div>
          <div className="text-sm text-gray-500">
            {currentSession.sizeName}·{currentSession.canvasWidth}×{currentSession.canvasHeight}{currentSession.unit || 'mm'}
          </div>
        </div>
      </div>

      {/* 提示横幅 */}
      <div className="bg-[#fff8f5] px-4 py-3 flex items-start gap-2">
        <span className="text-xl">🔥</span>
        <p className="text-sm text-[#ff6b35] leading-relaxed flex-1">
          请进行预览或编辑，未显示部分将不会冲印；预览图已压缩，冲印时会使用原图
        </p>
      </div>

      {/* 图片列表 */}
      <div className="px-3 pt-3">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-6">还没有上传照片</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-[#ff4d6d] text-white rounded-full font-medium"
            >
              开始上传
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className={`bg-white rounded-lg overflow-hidden border border-gray-100 ${
                  isBatchMode ? 'cursor-pointer' : ''
                } ${selectedIds.includes(image.id) ? 'ring-2 ring-[#ff4d6d]' : ''}`}
                onClick={() => isBatchMode && toggleSelection(image.id)}
              >
                {/* 图片容器 */}
                <div 
                  className="relative bg-white"
                  style={{ paddingBottom: `${(1 / paperRatio) * 100}%` }}
                >
                  <PhotoPreviewCard 
                    image={image} 
                    aspectRatio={paperRatio}
                    onClick={!isBatchMode ? () => handleEdit(image.id) : undefined}
                  />
                  
                  {/* 删除按钮 - 右上角深灰色圆形 */}
                  {!isBatchMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(image.id)
                      }}
                      className="absolute top-2 right-2 w-6 h-6 bg-[#666] rounded-full flex items-center justify-center z-10"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                  
                  {/* 批量模式选中标记 */}
                  {isBatchMode && (
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10 ${
                      selectedIds.includes(image.id) 
                        ? 'bg-[#ff4d6d]' 
                        : 'bg-gray-400/80'
                    }`}>
                      {selectedIds.includes(image.id) && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  )}

                  {/* 旋转标记 - 显示图片已被自动旋转 */}
                  {!isBatchMode && getImageRotation(image) !== 0 && (
                    <div className="absolute top-2 left-2 w-6 h-6 bg-blue-500/80 rounded-full flex items-center justify-center z-10">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                  )}

                  {/* 数量控制 - 图片底部内嵌 */}
                  {!isBatchMode && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
                      <div className="flex items-center bg-[#e8e8e8] rounded-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCountChange(image.id, -1)
                          }}
                          className="w-7 h-7 flex items-center justify-center text-gray-600"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-gray-700">
                          {image.printCount}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCountChange(image.id, 1)
                          }}
                          className="w-7 h-7 flex items-center justify-center text-gray-600"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 编辑按钮 - 卡片底部独立区域 */}
                {!isBatchMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(image.id)
                    }}
                    className="w-full py-2.5 bg-[#f5f5f5] text-gray-600 text-sm font-medium"
                  >
                    编辑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="px-4 py-3 safe-area-inset-bottom">
          {!isBatchMode ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsBatchMode(true)
                    clearSelection()
                    setBatchCropMode(null)
                  }}
                  className="text-[#ff4d6d] font-medium text-sm whitespace-nowrap"
                  disabled={images.length === 0}
                >
                  批量编辑
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-3 bg-[#ff4d6d] text-white rounded-full font-medium text-base"
                >
                  继续上传(已上传{totalPrintCount}张)
                </button>
              </div>
              
              {/* 提交按钮 - 有图片就显示 */}
              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  className="w-full mt-3 py-3 bg-green-500 text-white rounded-full font-medium"
                >
                  确认提交打印({totalPrintCount}张)
                </button>
              )}
            </>
          ) : (
            <>
              {/* 批量编辑模式 - 全选按钮 */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={handleToggleSelectAll}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                    isAllSelected
                      ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>{isAllSelected ? '取消全选' : '全选'}</span>
                </button>
                <span className="text-sm text-gray-500">
                  已选择 {selectedIds.length}/{images.length} 张
                </span>
              </div>

              {/* 裁剪样式选择 */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex gap-2 flex-wrap">
                  {/* 居中裁剪 */}
                  <button
                    onClick={() => handleApplyBatchCrop('center')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm ${
                      batchCropMode === 'center'
                        ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                        : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      batchCropMode === 'center' ? 'border-[#ff4d6d] bg-[#ff4d6d]' : 'border-gray-400'
                    }`}>
                      {batchCropMode === 'center' && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <span>居中裁剪</span>
                  </button>

                  {/* 打印整图 */}
                  <button
                    onClick={() => handleApplyBatchCrop('full')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm ${
                      batchCropMode === 'full'
                        ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                        : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      batchCropMode === 'full' ? 'border-[#ff4d6d] bg-[#ff4d6d]' : 'border-gray-400'
                    }`}>
                      {batchCropMode === 'full' && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <span>打印整图</span>
                  </button>

                  {/* 四周留白 */}
                  <button
                    onClick={() => handleApplyBatchCrop('lomo')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm ${
                      batchCropMode === 'lomo'
                        ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                        : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      batchCropMode === 'lomo' ? 'border-[#ff4d6d] bg-[#ff4d6d]' : 'border-gray-400'
                    }`}>
                      {batchCropMode === 'lomo' && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <span>四周留白</span>
                  </button>
                </div>

                {/* 删除按钮 */}
                <button
                  onClick={handleBatchDelete}
                  className={`text-sm whitespace-nowrap font-medium ${
                    selectedIds.length === 0 ? 'text-gray-400' : 'text-red-500'
                  }`}
                  disabled={selectedIds.length === 0}
                >
                  删除
                </button>
              </div>

              {/* 返回按钮 */}
              <button
                onClick={() => {
                  setIsBatchMode(false)
                  clearSelection()
                  setBatchCropMode(null)
                }}
                className="w-full py-3 bg-[#ff4d6d] text-white rounded-full font-medium"
              >
                完成
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-center">温馨提示</h3>
            <div className="space-y-3 mb-6 text-sm">
              <p className="text-blue-600">
                本系统采用"<span className="text-blue-600 underline">全自动接单生产，没有人工参与设计和审核</span>"。
              </p>
              <p className="text-red-600 font-semibold">
                预览效果即为打印效果，工厂开始生产后，订单不能修改！
              </p>
              <p className="text-gray-700">
                如确认照片效果无误，点击【确认提交】按钮提交照片
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-full font-medium hover:bg-gray-50 transition-colors"
              >
                再检查一下
              </button>
              <button
                onClick={handleConfirmSubmit}
                className="flex-1 py-3 bg-[#ff4d6d] text-white rounded-full font-medium"
              >
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
