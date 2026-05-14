'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Check, Lightbulb, ChevronLeft, ChevronRight, Loader2, Crop, Image as ImageIcon, Frame } from 'lucide-react'
import { type Image as ImageType } from '@/lib/store'
import { buildOssCropUrl, EDITOR_THUMBNAIL_SHORT_EDGE } from '@/lib/image-config'
import { getCropConfigForSize } from '@/lib/photo-sizes'
import { useImagePreload } from '@/lib/use-image-preload'
import { getPhotoDetail } from '@/lib/api'
import { mapCropModeFromServer, calculateCoverCropSize } from '@/lib/utils'
import type { SimpleCropInfo } from '@/lib/types'
import {
  CoverModeEditor,
  FullModeEditor,
  LomoModeEditor,
} from './editor'

type EditMode = 'cover' | 'full' | 'lomo'

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

  // 使用 useMemo 缓存 cropConfig，避免 useEffect 依赖问题
  const cropConfig = useMemo(() =>
    sizeId
      ? getCropConfigForSize(sizeId)
      : { defaultMode: 'cover' as EditMode, availableModes: ['cover', 'full', 'lomo'] as EditMode[] },
    [sizeId]
  )

  const [mode, setMode] = useState<EditMode>(
    photoData.cropMode && cropConfig.availableModes.includes(photoData.cropMode)
      ? photoData.cropMode
      : cropConfig.defaultMode
  )

  const imageUrl = photoData.originalUrl || photoData.thumbnailUrl || ''

  // 切图时先按 props 同步状态（无闪烁），再后台用 API 校正，保证与后端一致
  // 使用 ref 跟踪最新请求，避免竞态条件
  const fetchIdRef = useRef<string>('')
  useEffect(() => {
    const photoId = photoData.id
    if (!photoId || !imageUrl) return

    // 更新当前请求 ID
    fetchIdRef.current = photoId

    // 立即用 props 设置状态（无闪烁）
    const fromProps =
      photoData.cropMode && cropConfig.availableModes.includes(photoData.cropMode)
        ? photoData.cropMode
        : cropConfig.defaultMode
    setMode(fromProps)
    if (fromProps === 'cover' && photoData.cropInfo) {
      setCoverCropInfo(photoData.cropInfo)
      setCoverOutputUrl(photoData.outputUrl || buildOssCropUrl(imageUrl, photoData.cropInfo))
    } else {
      setCoverCropInfo(null)
      setCoverOutputUrl('')
    }

    // 后台请求后端校正
    getPhotoDetail(photoId)
      .then((res) => {
        // 检查是否已被取消或新的请求已开始
        if (fetchIdRef.current !== photoId) return

        const nextMode = res.photo.cropMode && cropConfig.availableModes.includes(res.photo.cropMode as EditMode)
          ? (mapCropModeFromServer(res.photo.cropMode) as EditMode)
          : cropConfig.defaultMode
        setMode(nextMode)

        if (nextMode === 'cover' && res.photo.cropInfo) {
          const c = res.photo.cropInfo
          const cropWidth = c.cropWidth ?? c.sourceWidth
          const cropHeight = c.cropHeight ?? c.sourceHeight
          const backendPercent = (c as { croppedAreaPercent?: { x: number; y: number; width: number; height: number } }).croppedAreaPercent
          const simple: SimpleCropInfo = {
            offsetX: c.offsetX,
            offsetY: c.offsetY,
            cropWidth,
            cropHeight,
            sourceWidth: c.sourceWidth,
            sourceHeight: c.sourceHeight,
            styleType: (c.styleType || 'cover') as EditMode,
            croppedAreaPercent: backendPercent ?? (c.sourceWidth && c.sourceHeight
              ? {
                  x: (c.offsetX / c.sourceWidth) * 100,
                  y: (c.offsetY / c.sourceHeight) * 100,
                  width: (cropWidth / c.sourceWidth) * 100,
                  height: (cropHeight / c.sourceHeight) * 100,
                }
              : undefined),
          }
          setCoverCropInfo(simple)
          setCoverOutputUrl(buildOssCropUrl(imageUrl, simple))
        } else {
          setCoverCropInfo(null)
          setCoverOutputUrl('')
        }
      })
      .catch(() => {
        // 未同步到后端的照片会 404，上面已用 props 设好，无需再改
      })
  }, [photoData.id, photoData.cropMode, photoData.cropInfo, photoData.outputUrl, imageUrl, cropConfig])

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

  // 图片加载状态
  const [isImageLoading, setIsImageLoading] = useState(true)

  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  // 监听图片加载（使用缩略图）
  useEffect(() => {
    if (!imageUrl) return
    
    setIsImageLoading(true)
    const img = new window.Image()
    img.onload = () => setIsImageLoading(false)
    img.onerror = () => setIsImageLoading(false)
    // 使用短边缩略图加载，大幅提升加载速度
    img.src = buildOssCropUrl(imageUrl, undefined, {
      shortWidth: EDITOR_THUMBNAIL_SHORT_EDGE,
      ...imageCompressOptions,
    })
    
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl, imageCompressOptions])

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
        // 默认满版裁剪
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
          // 计算百分比坐标
          croppedAreaPercent: {
            x: (offsetX / sourceSize.width) * 100,
            y: (offsetY / sourceSize.height) * 100,
            width: (cropWidth / sourceSize.width) * 100,
            height: (cropHeight / sourceSize.height) * 100,
          },
        }
        outputUrl = buildOssCropUrl(imageUrl, cropInfo)
      }
    } else {
      // full 或 lomo 模式（使用整张图片，不需要 croppedAreaPercent）
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
            initialCropInfo={photoData.cropInfo}
            thumbnailShortEdge={EDITOR_THUMBNAIL_SHORT_EDGE}
          />
        )
      case 'full':
        return (
          <FullModeEditor
            imageUrl={imageUrl}
            imageId={photoData.id}
            sourceWidth={sourceSize.width}
            sourceHeight={sourceSize.height}
            paperAspectRatio={paperAspectRatio}
            imageCompressOptions={imageCompressOptions}
            thumbnailShortEdge={EDITOR_THUMBNAIL_SHORT_EDGE}
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
            thumbnailShortEdge={EDITOR_THUMBNAIL_SHORT_EDGE}
          />
        )
    }
  }

  // 获取当前模式的提示信息
  const getModeHint = () => {
    switch (mode) {
      case 'cover':
        return '满版裁剪模式：照片不存在白边，四周存在出血线'
      case 'full':
        return '打印整图模式：图片完整显示'
      case 'lomo':
        return '四周留白模式：图片完整显示，四周有等比例白边'
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 提示信息：移动端略大，PC/iPad 紧凑 */}
      <div className="px-4 py-3 md:py-2 md:px-6">
        <div className="flex items-center justify-center gap-2 text-sm md:text-xs">
          <Lightbulb className="w-5 h-5 md:w-4 md:h-4 text-blue-400 flex-shrink-0" />
          <span className="text-blue-400">{getModeHint()}</span>
        </div>
        {mode === 'cover' && (
          <p className="text-center text-red-400 text-sm md:text-xs mt-1">红色虚线区域为图像裁切区域参考，并非绝对精准，照片内容不希望有任何裁切的，一定要选择四周留白样式</p>
        )}
      </div>

      {/* 编辑区域：PC 上画布可略大 */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6 relative overflow-hidden min-h-0">
        <div
          className="relative bg-white shadow-2xl overflow-hidden w-full max-w-[32rem] md:max-w-[36rem] lg:max-w-[42rem]"
          style={{
            aspectRatio: paperAspectRatio,
            maxHeight: '100%',
          }}
        >
          {/* 加载状态 */}
          {isImageLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
              <Loader2 className="w-10 h-10 md:w-8 md:h-8 text-pink-500 animate-spin" />
              <p className="mt-3 text-gray-500 text-sm md:text-xs">图片加载中...</p>
            </div>
          )}
          {renderEditor()}
        </div>
      </div>

      {/* 导航按钮区域：PC/iPad 缩小按钮 */}
      <div className="px-4 py-4 md:py-3 bg-gray-900 border-t border-gray-800">
        <div className="flex items-center justify-between gap-4 max-w-2xl mx-auto">
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            className={`
              group flex items-center gap-2 px-4 py-3 md:px-3 md:py-2 rounded-xl font-medium text-sm md:text-xs
              transition-all duration-200 ease-in-out
              ${hasPrevious
                ? 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg md:hover:scale-105 active:scale-100'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed opacity-50'
              }
            `}
          >
            <ChevronLeft className="w-5 h-5 md:w-4 md:h-4" />
            <span>上一张</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={onNext}
            disabled={!hasNext}
            className={`
              group flex items-center gap-2 px-4 py-3 md:px-3 md:py-2 rounded-xl font-medium text-sm md:text-xs
              transition-all duration-200 ease-in-out
              ${hasNext
                ? 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg md:hover:scale-105 active:scale-100'
                : 'bg-gray-800/50 text-gray-500 cursor-not-allowed opacity-50'
              }
            `}
          >
            <span>下一张</span>
            <ChevronRight className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      {/* 底部控制栏：PC 下 max-width + 更小按钮，避免巨大按钮 */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 pb-8 md:pb-6 md:p-4">
        <div className="max-w-2xl mx-auto">
          {/* 模式选择器 */}
          <div className="flex gap-2 mb-4 md:mb-3 justify-center flex-wrap">
            {cropConfig.availableModes.includes('cover') && (
              <button
                onClick={() => handleModeChange('cover')}
                className={`flex items-center gap-2 px-3 py-3 md:px-3 md:py-2 rounded-lg font-medium transition-all text-sm md:text-xs ${
                  mode === 'cover'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Crop className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" />
                满版裁剪
              </button>
            )}
            {cropConfig.availableModes.includes('full') && (
              <button
                onClick={() => handleModeChange('full')}
                className={`flex items-center gap-2 px-3 py-3 md:px-3 md:py-2 rounded-lg font-medium transition-all text-sm md:text-xs ${
                  mode === 'full'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <ImageIcon className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" />
                打印整图
              </button>
            )}
            {cropConfig.availableModes.includes('lomo') && (
              <button
                onClick={() => handleModeChange('lomo')}
                className={`flex items-center gap-2 px-3 py-3 md:px-3 md:py-2 rounded-lg font-medium transition-all text-sm md:text-xs ${
                  mode === 'lomo'
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Frame className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" />
                四周留白
              </button>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 md:gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 md:py-2.5 bg-gray-700 text-white rounded-full font-medium text-sm md:text-xs transition-all hover:bg-gray-600"
            >
              返回列表
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 md:py-2.5 gradient-primary text-white rounded-full font-medium text-sm md:text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5 md:w-4 md:h-4" />
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
    </div>
  )
}
