'use client'

import { useState, useCallback, useMemo } from 'react'
import { Check, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react'
import { type Image as ImageType } from '@/lib/store'
import { buildOssCropUrl, SimpleCropInfo } from '@/lib/image-config'
import { getCropConfigForSize } from '@/lib/photo-sizes'
import { useImagePreload } from '@/lib/use-image-preload'
import {
  CoverModeEditor,
  FullModeEditor,
  LomoModeEditor,
  calculateCoverCropSize,
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

  const imageUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
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

  // 根据图片方向动态调整裁剪框比例
  const cropAspectRatio = useMemo(() => {
    if (!sourceSize.width || !sourceSize.height) return paperAspectRatio
    const imageRatio = sourceSize.width / sourceSize.height
    const isImageLandscape = imageRatio > 1
    const isPaperLandscape = paperAspectRatio > 1
    if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
      return 1 / paperAspectRatio
    }
    return paperAspectRatio
  }, [sourceSize, paperAspectRatio])

  // Cover 模式的裁剪信息
  const [coverCropInfo, setCoverCropInfo] = useState<SimpleCropInfo | null>(null)
  const [coverOutputUrl, setCoverOutputUrl] = useState<string>('')

  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  // 预加载前后图片
  useImagePreload(imageUrl, allImages, currentIndex, 5)

  // Cover 模式裁剪变化回调
  const handleCoverCropChange = useCallback((cropInfo: SimpleCropInfo | null, outputUrl: string) => {
    setCoverCropInfo(cropInfo)
    setCoverOutputUrl(outputUrl)
  }, [])

  // 模式切换
  const handleModeChange = useCallback((newMode: EditMode) => {
    setMode(newMode)
    // 切换模式时重置 cover 的裁剪信息
    if (newMode !== 'cover') {
      setCoverCropInfo(null)
      setCoverOutputUrl('')
    }
  }, [])

  // 保存
  const handleSave = useCallback(() => {
    if (!sourceSize.width || !sourceSize.height) return

    let cropInfo: SimpleCropInfo | undefined
    let outputUrl = imageUrl

    if (mode === 'cover') {
      if (coverCropInfo) {
        cropInfo = coverCropInfo
        outputUrl = coverOutputUrl
      } else {
        // 默认居中裁剪
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
        outputUrl = buildOssCropUrl(imageUrl, cropInfo)
      }
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
  }, [mode, coverCropInfo, coverOutputUrl, sourceSize, imageUrl, cropAspectRatio, onSave])

  // 渲染当前模式的编辑器
  const renderEditor = () => {
    switch (mode) {
      case 'cover':
        return (
          <CoverModeEditor
            imageUrl={imageUrl}
            imageId={photoData.id}
            sourceWidth={sourceSize.width}
            sourceHeight={sourceSize.height}
            paperAspectRatio={paperAspectRatio}
            imageCompressOptions={imageCompressOptions}
            onCropChange={handleCoverCropChange}
          />
        )
      case 'full':
        return (
          <FullModeEditor
            imageUrl={imageUrl}
            imageId={photoData.id}
            imageCompressOptions={imageCompressOptions}
          />
        )
      case 'lomo':
        return (
          <LomoModeEditor
            imageUrl={imageUrl}
            imageId={photoData.id}
            sourceWidth={sourceSize.width}
            sourceHeight={sourceSize.height}
            paperAspectRatio={paperAspectRatio}
            imageCompressOptions={imageCompressOptions}
          />
        )
    }
  }

  // 获取当前模式的提示信息
  const getModeHint = () => {
    switch (mode) {
      case 'cover':
        return '居中裁剪模式：可拖拽移动图片位置'
      case 'full':
        return '打印整图模式：图片完整显示'
      case 'lomo':
        return '四周留白模式：图片完整显示，四周有等比例白边'
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
          {renderEditor()}
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
