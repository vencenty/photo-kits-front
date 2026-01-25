'use client'

import { useState, useCallback, useMemo } from 'react'
import { Check, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Area } from 'react-easy-crop'
import { type Image as ImageType } from '@/lib/store'
import { buildOssCropUrl, SimpleCropInfo } from '@/lib/image-config'
import { getCropConfigForSize } from '@/lib/photo-sizes'
import { useImagePreload } from '@/lib/use-image-preload'
import {
  CoverModeEditor,
  FullModePreview,
  LomoModePreview,
  calculateCoverCropSize,
  getCropAspectRatio,
} from './editor'

interface ImageEditorProps {
  image: ImageType
  canvasWidth: number
  canvasHeight: number
  sizeId?: string
  onSave: (saveData: SaveData) => void
  onCancel: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  allImages?: ImageType[]
  currentIndex?: number
}

type EditMode = 'cover' | 'full' | 'lomo'

interface SaveData {
  cropInfo: SimpleCropInfo | undefined
  outputUrl: string
}

export default function ImageEditor({
  image: photoData,
  canvasWidth,
  canvasHeight,
  sizeId,
  onSave,
  onCancel,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  allImages = [],
  currentIndex = -1,
}: ImageEditorProps) {
  // 安全检查
  if (!photoData || !canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-center">
          <p>图片编辑器加载失败</p>
          <button onClick={onCancel} className="mt-4 px-4 py-2 bg-red-500 rounded">
            返回
          </button>
        </div>
      </div>
    )
  }

  const cropConfig = sizeId
    ? getCropConfigForSize(sizeId)
    : { defaultMode: 'cover' as EditMode, availableModes: ['cover', 'full', 'lomo'] as EditMode[] }

  const [mode, setMode] = useState<EditMode>(
    photoData.cropMode && cropConfig.availableModes.includes(photoData.cropMode)
      ? photoData.cropMode
      : cropConfig.defaultMode
  )

  const imageUrl = photoData.originalUrl || photoData.thumbnailUrl
  const sourceSize = useMemo(
    () => ({
      width: photoData.width || 0,
      height: photoData.height || 0,
    }),
    [photoData.width, photoData.height]
  )

  // 相纸比例（固定，来自 select-size）
  const paperAspectRatio = useMemo(() => {
    if (!canvasWidth || !canvasHeight) return 1
    return canvasWidth / canvasHeight
  }, [canvasWidth, canvasHeight])

  // Cover 模式的裁剪数据
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null)

  // 预加载前后图片
  useImagePreload(imageUrl, allImages, currentIndex, 5)

  // Cover 模式裁剪回调
  const handleCropChange = useCallback((areaPercent: Area, areaPixels: Area) => {
    setCroppedAreaPercent(areaPercent)
    setCroppedAreaPixels(areaPixels)
  }, [])

  // 模式切换
  const handleModeChange = useCallback((newMode: EditMode) => {
    setMode(newMode)
    setCroppedAreaPixels(null)
    setCroppedAreaPercent(null)
  }, [])

  // 保存
  const handleSave = useCallback(() => {
    if (!sourceSize.width || !sourceSize.height) return

    let cropInfo: SimpleCropInfo | undefined
    let outputUrl = imageUrl || ''

    if (mode === 'cover') {
      if (croppedAreaPixels && croppedAreaPercent) {
        // 用户已调整裁剪位置
        cropInfo = {
          offsetX: Math.round(croppedAreaPixels.x),
          offsetY: Math.round(croppedAreaPixels.y),
          cropWidth: Math.round(croppedAreaPixels.width),
          cropHeight: Math.round(croppedAreaPixels.height),
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height,
          styleType: 'cover',
          croppedAreaPercent,
        }
      } else {
        // 默认居中裁剪
        const cropAspectRatio = getCropAspectRatio(sourceSize.width, sourceSize.height, paperAspectRatio)
        const { cropWidth, cropHeight } = calculateCoverCropSize(
          sourceSize.width,
          sourceSize.height,
          cropAspectRatio
        )
        const offsetX = (sourceSize.width - cropWidth) / 2
        const offsetY = (sourceSize.height - cropHeight) / 2
        cropInfo = {
          offsetX: Math.round(offsetX),
          offsetY: Math.round(offsetY),
          cropWidth: Math.round(cropWidth),
          cropHeight: Math.round(cropHeight),
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height,
          styleType: 'cover',
        }
      }
      outputUrl = buildOssCropUrl(outputUrl, cropInfo)
    } else {
      // full 或 lomo 模式
      cropInfo = {
        offsetX: 0,
        offsetY: 0,
        cropWidth: sourceSize.width,
        cropHeight: sourceSize.height,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        styleType: mode,
      }
    }

    onSave({ cropInfo, outputUrl })
  }, [mode, croppedAreaPixels, croppedAreaPercent, sourceSize, imageUrl, paperAspectRatio, onSave])

  // 渲染编辑区域内容
  const renderEditorContent = () => {
    if (!imageUrl) return null

    switch (mode) {
      case 'cover':
        return (
          <CoverModeEditor
            imageUrl={imageUrl}
            imageId={photoData.id}
            sourceWidth={sourceSize.width}
            sourceHeight={sourceSize.height}
            paperAspectRatio={paperAspectRatio}
            onCropChange={handleCropChange}
          />
        )
      case 'full':
        return (
          <FullModePreview
            imageUrl={imageUrl}
            imageId={photoData.id}
            paperAspectRatio={paperAspectRatio}
          />
        )
      case 'lomo':
        return (
          <LomoModePreview
            imageUrl={imageUrl}
            imageId={photoData.id}
            paperAspectRatio={paperAspectRatio}
          />
        )
      default:
        return null
    }
  }

  // 获取模式提示文本
  const getModeHint = () => {
    switch (mode) {
      case 'cover':
        return '居中裁剪模式：可拖拽移动图片位置'
      case 'full':
        return '打印整图模式：图片完整显示'
      case 'lomo':
        return '四周留白模式：图片完整显示，四周有等比例白边'
      default:
        return ''
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 提示信息 */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-sm">
          <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="text-blue-400">{getModeHint()}</span>
        </div>
        {mode === 'cover' && (
          <p className="text-center text-red-400 text-sm mt-1">超出红色边框部分将被裁剪</p>
        )}
      </div>

      {/* 编辑区域 */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden min-h-0">
        <div
          className="relative bg-white shadow-2xl overflow-hidden"
          style={{
            aspectRatio: paperAspectRatio,
            width: '100%',
            maxWidth: '32rem',
            maxHeight: '100%',
          }}
        >
          {renderEditorContent()}
        </div>
      </div>

      {/* 导航按钮区域 */}
      <div className="px-4 py-4 bg-gray-900 border-t border-gray-800">
        <div className="flex items-center justify-between gap-4 max-w-2xl mx-auto">
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            className={`
              group flex items-center gap-2 px-4 py-3 rounded-xl font-medium
              transition-all duration-200 ease-in-out
              ${hasPrevious
                ? 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg hover:scale-105 active:scale-100'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed opacity-50'
              }
            `}
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">上一张</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={onNext}
            disabled={!hasNext}
            className={`
              group flex items-center gap-2 px-4 py-3 rounded-xl font-medium
              transition-all duration-200 ease-in-out
              ${hasNext
                ? 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg hover:scale-105 active:scale-100'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed opacity-50'
              }
            `}
          >
            <span className="text-sm">下一张</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 pb-8">
        {/* 模式选择器 */}
        <div className="flex gap-2 mb-4 justify-center">
          {cropConfig.availableModes.includes('cover') && (
            <button
              onClick={() => handleModeChange('cover')}
              className={`px-3 py-3 rounded-lg font-medium transition-all text-sm ${
                mode === 'cover'
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              居中裁剪
            </button>
          )}
          {cropConfig.availableModes.includes('full') && (
            <button
              onClick={() => handleModeChange('full')}
              className={`px-3 py-3 rounded-lg font-medium transition-all text-sm ${
                mode === 'full'
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              打印整图
            </button>
          )}
          {cropConfig.availableModes.includes('lomo') && (
            <button
              onClick={() => handleModeChange('lomo')}
              className={`px-3 py-3 rounded-lg font-medium transition-all text-sm ${
                mode === 'lomo'
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              四周留白
            </button>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-700 text-white rounded-full font-medium transition-all hover:bg-gray-600"
          >
            返回列表
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 gradient-primary text-white rounded-full font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            <span>保存</span>
            {photoData.isAdjusted && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-green-500/90 text-xs flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
                <span>已调整</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
