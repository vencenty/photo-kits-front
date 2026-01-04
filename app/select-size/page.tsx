'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PHOTO_SIZES } from '@/lib/photo-sizes'
import { useStore } from '@/lib/store'
import { generateId, cn } from '@/lib/utils'

export default function SelectSizePage() {
  const router = useRouter()
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [showCountModal, setShowCountModal] = useState(false)
  const [targetCount, setTargetCount] = useState(50)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const clearImages = useStore((state) => state.clearImages)

  const handleSelectSize = (sizeId: string) => {
    const size = PHOTO_SIZES.find((s) => s.id === sizeId)
    if (size) {
      setSelectedSize(sizeId)
      setTargetCount(size.minCount)
      setShowCountModal(true)
    }
  }

  const handleConfirm = () => {
    const size = PHOTO_SIZES.find((s) => s.id === selectedSize)
    if (!size) return

    // 创建新的上传会话
    const session = {
      id: generateId(),
      sizeId: size.id,
      sizeName: size.name,
      displaySize: size.displaySize,
      targetCount,
      currentCount: 0,
      canvasWidth: size.width,
      canvasHeight: size.height,
      ratio: size.ratio,
      createdAt: new Date().toISOString(),
    }

    setCurrentSession(session)
    clearImages()
    setShowCountModal(false)
    
    // 跳转到上传页面
    router.push(`/upload/${size.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center">
          <button
            onClick={() => router.back()}
            className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold">选择照片尺寸</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4">
        <p className="text-gray-600 mb-6 text-center">
          请选择您要冲印的照片尺寸规格
        </p>

        <div className="grid gap-4">
          {PHOTO_SIZES.map((size) => (
            <div
              key={size.id}
              className={cn(
                'relative rounded-xl p-6 shadow-sm hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:scale-[1.02]',
                size.bgColor || 'bg-white',
                'hover:border-gray-200'
              )}
              onClick={() => handleSelectSize(size.id)}
              style={{
                borderColor: size.color ? `${size.color}20` : undefined,
              }}
            >
              {/* 推荐标签 */}
              {size.recommended && (
                <div className="absolute -top-2 -right-2 px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full shadow-md">
                  推荐
                </div>
              )}
              
              {/* 角标 */}
              {size.badge && !size.recommended && (
                <div 
                  className="absolute -top-2 -right-2 px-3 py-1 text-white text-xs font-semibold rounded-full shadow-md"
                  style={{ backgroundColor: size.color || '#FF6B9D' }}
                >
                  {size.badge}
                </div>
              )}

              <div className="flex items-start gap-4">
                {/* 图标 */}
                {size.icon && (
                  <div 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 shadow-sm"
                    style={{ 
                      backgroundColor: size.color ? `${size.color}15` : '#f3f4f6',
                    }}
                  >
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
                    <span className="px-2 py-1 bg-white rounded text-gray-700 font-medium">
                      {size.displaySize}
                    </span>
                    <span className="text-gray-500">
                      {size.width}×{size.height}px
                    </span>
                  </div>
                  
                  {/* 价格和数量 */}
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-gray-600">
                      {size.minCount} 张起
                    </span>
                    {size.price && (
                      <span 
                        className="font-bold text-lg"
                        style={{ color: size.color || '#FF6B9D' }}
                      >
                        ¥{size.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 箭头 */}
                <div className="flex-shrink-0 self-center">
                  <svg 
                    className="w-6 h-6 text-gray-400" 
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
          ))}
        </div>
      </div>

      {/* Count Modal */}
      {showCountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-center">
              请输入要冲印的数量
            </h3>
            <input
              type="number"
              value={targetCount}
              onChange={(e) => setTargetCount(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 text-center text-2xl font-semibold"
              min={1}
            />
            <p className="text-sm text-gray-500 mt-2 text-center">
              建议数量：
              {PHOTO_SIZES.find((s) => s.id === selectedSize)?.minCount || 50} 张
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCountModal(false)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 gradient-primary text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

