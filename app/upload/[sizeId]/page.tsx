'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Plus, X, Minus, Upload, AlertCircle } from 'lucide-react'
import Image from 'next/image'
import { useStore } from '@/lib/store'
import { getPhotoSizeById } from '@/lib/photo-sizes'
import { generateId, compressImage, getImageDimensions } from '@/lib/utils'
import type { Image as ImageType } from '@/lib/store'

export default function UploadPage() {
  const router = useRouter()
  const params = useParams()
  const sizeId = params.sizeId as string
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  const currentSession = useStore((state) => state.currentSession)
  const images = useStore((state) => state.images)
  const addImages = useStore((state) => state.addImages)
  const updateImage = useStore((state) => state.updateImage)
  const deleteImage = useStore((state) => state.deleteImage)
  const selectedIds = useStore((state) => state.selectedIds)
  const toggleSelection = useStore((state) => state.toggleSelection)
  const clearSelection = useStore((state) => state.clearSelection)

  const [isBatchMode, setIsBatchMode] = useState(false)

  useEffect(() => {
    // 如果没有 session，跳转回首页查询订单
    if (!currentSession || currentSession.sizeId !== sizeId) {
      router.push('/')
    }
  }, [currentSession, sizeId, router])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !currentSession) return

    const newImages: ImageType[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        // 获取原图尺寸
        const dimensions = await getImageDimensions(file)
        
        // 压缩生成缩略图
        const { dataUrl } = await compressImage(file, 400, 0.8)

        // 使用原图的 dataUrl 作为临时 URL
        const originalDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })

        const image: ImageType = {
          id: generateId(),
          sessionId: currentSession.id,
          originalUrl: originalDataUrl,
          thumbnailUrl: dataUrl,
          filename: file.name,
          width: dimensions.width,
          height: dimensions.height,
          printCount: 1,
          editState: null,
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

  const totalPrintCount = images.reduce((sum, img) => sum + img.printCount, 0)
  const canSubmit = currentSession && totalPrintCount >= currentSession.targetCount

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

  if (!currentSession) return null

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => router.back()}
              className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-lg font-semibold">
                {isBatchMode ? '批量编辑' : '已上传照片'}
              </h1>
              <p className="text-sm text-gray-500">
                订单: {currentSession.id} · {currentSession.sizeName}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">进度</p>
            <p className="text-lg font-semibold">
              <span className={totalPrintCount >= currentSession.targetCount ? 'text-green-500' : 'text-pink-500'}>
                {totalPrintCount}
              </span>
              <span className="text-gray-400">/{currentSession.targetCount}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Alert */}
      <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
        <div className="flex items-start max-w-4xl mx-auto">
          <AlertCircle className="w-5 h-5 text-orange-500 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-orange-700">
            请进行预览或编辑，未显示部分将不会冲印；预览图已压缩，冲印时会使用原图
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-6">还没有上传照片</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 gradient-primary text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
            >
              开始上传
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((image) => (
              <div
                key={image.id}
                className={`relative bg-white rounded-lg overflow-hidden shadow-sm ${
                  isBatchMode ? 'cursor-pointer' : ''
                } ${selectedIds.includes(image.id) ? 'ring-4 ring-pink-500' : ''}`}
                onClick={() => isBatchMode && toggleSelection(image.id)}
              >
                {/* Image */}
                <div className="relative aspect-[4/3]">
                  <Image
                    src={image.thumbnailUrl}
                    alt={image.filename}
                    fill
                    className="object-cover"
                  />
                  {!isBatchMode && (
                    <button
                      onClick={() => handleDelete(image.id)}
                      className="absolute top-2 right-2 w-8 h-8 bg-gray-800/60 hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  )}
                  {isBatchMode && selectedIds.includes(image.id) && (
                    <div className="absolute top-2 right-2 w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {!isBatchMode && (
                  <>
                    {/* Count Control */}
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCountChange(image.id, -1)}
                          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-semibold">
                          {image.printCount}
                        </span>
                        <button
                          onClick={() => handleCountChange(image.id, 1)}
                          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleEdit(image.id)}
                      className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium transition-colors"
                    >
                      编辑
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-4xl mx-auto p-4">
          {!isBatchMode ? (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsBatchMode(true)
                  clearSelection()
                }}
                className="px-6 py-3 bg-white border-2 border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                disabled={images.length === 0}
              >
                批量编辑
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 gradient-primary text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                继续上传 ({totalPrintCount}/{currentSession.targetCount})
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsBatchMode(false)
                  clearSelection()
                }}
                className="px-6 py-3 bg-white border-2 border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selectedIds.length === 0}
              >
                删除选中 ({selectedIds.length})
              </button>
            </div>
          )}

          {!isBatchMode && canSubmit && (
            <button
              onClick={handleSubmit}
              className="w-full mt-3 py-3 bg-green-500 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
            >
              已确认，提交打印 ({totalPrintCount}/{currentSession.targetCount})
            </button>
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
                本系统采用"全自动接单生产，没有人工参与设计和审核"。
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
                className="flex-1 py-3 border-2 border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                再检查一下
              </button>
              <button
                onClick={handleConfirmSubmit}
                className="flex-1 py-3 gradient-primary text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
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

