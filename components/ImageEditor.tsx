'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, Lightbulb } from 'lucide-react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import {
  type Image as ImageType
} from '@/lib/store'
import { getEditImageUrl, SimpleCropInfo, buildOssCropUrl } from '@/lib/image-config'

// 配置常量
const WHITE_MARGIN_PERCENT = 5

interface ImageEditorProps {
  image: ImageType
  canvasWidth: number
  canvasHeight: number
  onSave: (cropInfo: SimpleCropInfo | undefined) => void
  onCancel: () => void
}

type EditMode = 'cover' | 'full' | 'lomo'

/**
 * 计算 cover 模式下的裁剪尺寸
 * 图片需要完全覆盖相纸区域，所以取 max 比例
 */
function calculateCoverCropSize(
  sourceWidth: number,
  sourceHeight: number,
  paperRatio: number
): { cropWidth: number; cropHeight: number } {
  const imageRatio = sourceWidth / sourceHeight

  if (imageRatio > paperRatio) {
    // 图片更宽，裁剪左右
    const cropHeight = sourceHeight
    const cropWidth = sourceHeight * paperRatio
    return { cropWidth, cropHeight }
  } else {
    // 图片更高，裁剪上下
    const cropWidth = sourceWidth
    const cropHeight = sourceWidth / paperRatio
    return { cropWidth, cropHeight }
  }
}

export default function ImageEditor({
  image: photoData,
  canvasWidth,
  canvasHeight,
  onSave,
  onCancel,
}: ImageEditorProps) {
  // 获取初始模式
  const getInitialMode = (): EditMode => {
    if (photoData.cropInfo?.styleType) return photoData.cropInfo.styleType
    if (photoData.editState?.mode) return photoData.editState.mode
    return 'cover'
  }

  const [mode, setMode] = useState<EditMode>(getInitialMode())
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageLoaded, setImageLoaded] = useState(false)
  
  // react-easy-crop 状态
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  
  // 原图尺寸（从 photoData 获取，这是真实的原图尺寸）
  const [sourceSize, setSourceSize] = useState({
    width: photoData.width || 0,
    height: photoData.height || 0,
  })
  
  // 压缩图尺寸（前端实际加载的图片尺寸，用于坐标转换）
  const [displayImageSize, setDisplayImageSize] = useState({
    width: 0,
    height: 0,
  })
  
  const containerRef = useRef<HTMLDivElement>(null)

  // 计算相纸比例
  const aspectRatio = canvasWidth / canvasHeight

  // 加载图片
  useEffect(() => {
    const originalUrl = photoData.thumbnailUrl || photoData.originalUrl
    if (!originalUrl) return

    // 使用编辑页压缩配置
    const editUrl = getEditImageUrl(originalUrl)
    setImageUrl(editUrl)

    // 预加载图片获取尺寸
    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageLoaded(true)
      
      // 1. 设置原图尺寸（从 photoData 获取，这是真实的原图尺寸）
      if (!sourceSize.width || !sourceSize.height) {
        setSourceSize({
          width: photoData.width || img.naturalWidth,
          height: photoData.height || img.naturalHeight,
        })
      }
      
      // 2. 设置压缩图尺寸（这是前端实际加载的图片尺寸，用于坐标转换）
      // naturalWidth/naturalHeight 是图片的原始像素尺寸（即使被 CSS 缩放）
      setDisplayImageSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
      
      console.log('📏 图片尺寸信息:', {
        原图尺寸: { width: photoData.width || img.naturalWidth, height: photoData.height || img.naturalHeight },
        压缩图尺寸: { width: img.naturalWidth, height: img.naturalHeight },
        缩放比例: {
          x: (photoData.width || img.naturalWidth) / img.naturalWidth,
          y: (photoData.height || img.naturalHeight) / img.naturalHeight,
        },
      })
    }
    img.onerror = () => {
      // 降级使用原图
      if (editUrl !== originalUrl) {
        setImageUrl(originalUrl)
        // 如果降级到原图，压缩图尺寸就是原图尺寸
        setDisplayImageSize({
          width: photoData.width || 0,
          height: photoData.height || 0,
        })
      }
    }
    img.src = editUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [photoData.thumbnailUrl, photoData.originalUrl, photoData.width, photoData.height, sourceSize.width, sourceSize.height])

  // 从保存的 cropInfo 恢复状态
  // 注意：由于需要将原图坐标转换为压缩图坐标，且压缩图尺寸可能变化，
  // 这里简化处理，重置为默认居中位置，让用户可以重新调整
  useEffect(() => {
    if (!photoData.cropInfo || !sourceSize.width || !sourceSize.height) return
    
    const { styleType } = photoData.cropInfo
    
    // 只有 cover 模式时才处理
    if (styleType !== 'cover') return
    
    // 重置为默认居中位置（用户可以重新调整）
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    
  }, [photoData.cropInfo, sourceSize])

  // 裁剪完成回调
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    // 保存压缩图坐标（react-easy-crop 返回的）
    setCroppedAreaPixels(croppedAreaPixels)
    
    // 转换为原图坐标并打印 OSS 裁剪 URL（调试用）
    if (mode === 'cover' && sourceSize.width && sourceSize.height && displayImageSize.width && displayImageSize.height) {
      // 计算缩放比例：原图尺寸 / 压缩图尺寸
      const scaleX = sourceSize.width / displayImageSize.width
      const scaleY = sourceSize.height / displayImageSize.height
      
      // 将压缩图坐标转换为原图坐标
      const realOffsetX = Math.round(croppedAreaPixels.x * scaleX)
      const realOffsetY = Math.round(croppedAreaPixels.y * scaleY)
      const realCropWidth = Math.round(croppedAreaPixels.width * scaleX)
      const realCropHeight = Math.round(croppedAreaPixels.height * scaleY)
      
      const cropInfo: SimpleCropInfo = {
        offsetX: realOffsetX,
        offsetY: realOffsetY,
        cropWidth: realCropWidth,
        cropHeight: realCropHeight,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        styleType: 'cover',
      }
      
      const originalUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
      const ossCropUrl = buildOssCropUrl(originalUrl, cropInfo)
      
      console.log('📐 裁剪参数（压缩图坐标）:', {
        压缩图: {
          offsetX: Math.round(croppedAreaPixels.x),
          offsetY: Math.round(croppedAreaPixels.y),
          cropWidth: Math.round(croppedAreaPixels.width),
          cropHeight: Math.round(croppedAreaPixels.height),
        },
        缩放比例: { scaleX, scaleY },
      })
      console.log('📐 裁剪参数（原图坐标）:', {
        原图: {
          offsetX: realOffsetX,
          offsetY: realOffsetY,
          cropWidth: realCropWidth,
          cropHeight: realCropHeight,
        },
        原图尺寸: sourceSize,
      })
      console.log('🔗 x-oss-process URL:', ossCropUrl)
    }
  }, [mode, sourceSize, displayImageSize, photoData.originalUrl, photoData.thumbnailUrl])

  // 模式改变
  const handleModeChange = useCallback((newMode: EditMode) => {
    setMode(newMode)
    // 重置裁剪状态
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }, [])

  // 保存
  const handleSave = useCallback(() => {
    if (!sourceSize.width || !sourceSize.height) return

    // full 和 lomo 模式不需要裁剪参数
    if (mode === 'full' || mode === 'lomo') {
      const cropInfo: SimpleCropInfo = {
        offsetX: 0,
        offsetY: 0,
        cropWidth: sourceSize.width,
        cropHeight: sourceSize.height,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        styleType: mode,
      }
      onSave(cropInfo)
      return
    }

    // cover 模式，需要将压缩图坐标转换为原图坐标
    if (!croppedAreaPixels) {
      // 如果没有裁剪过，使用默认居中裁剪（基于原图尺寸）
      const { cropWidth, cropHeight } = calculateCoverCropSize(
        sourceSize.width,
        sourceSize.height,
        aspectRatio
      )
      const offsetX = (sourceSize.width - cropWidth) / 2
      const offsetY = (sourceSize.height - cropHeight) / 2

      const cropInfo: SimpleCropInfo = {
        offsetX: Math.round(offsetX),
        offsetY: Math.round(offsetY),
        cropWidth: Math.round(cropWidth),
        cropHeight: Math.round(cropHeight),
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        styleType: 'cover',
      }

      // 打印最终的 OSS URL
      const originalUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
      const ossCropUrl = buildOssCropUrl(originalUrl, cropInfo)
      console.log('💾 保存裁剪参数（默认居中）:', cropInfo)
      console.log('🔗 最终 x-oss-process URL:', ossCropUrl)

      onSave(cropInfo)
      return
    }

    // 有裁剪数据，需要转换坐标
    if (!displayImageSize.width || !displayImageSize.height) {
      console.warn('⚠️ 压缩图尺寸未加载，无法转换坐标')
      return
    }

    // 计算缩放比例：原图尺寸 / 压缩图尺寸
    const scaleX = sourceSize.width / displayImageSize.width
    const scaleY = sourceSize.height / displayImageSize.height

    // 将压缩图坐标转换为原图坐标
    const realOffsetX = Math.round(croppedAreaPixels.x * scaleX)
    const realOffsetY = Math.round(croppedAreaPixels.y * scaleY)
    const realCropWidth = Math.round(croppedAreaPixels.width * scaleX)
    const realCropHeight = Math.round(croppedAreaPixels.height * scaleY)

    const cropInfo: SimpleCropInfo = {
      offsetX: realOffsetX,
      offsetY: realOffsetY,
      cropWidth: realCropWidth,
      cropHeight: realCropHeight,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      styleType: 'cover',
    }

    // 打印最终的 OSS URL
    const originalUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
    const ossCropUrl = buildOssCropUrl(originalUrl, cropInfo)
    console.log('💾 保存裁剪参数（已转换）:', {
      压缩图坐标: {
        offsetX: Math.round(croppedAreaPixels.x),
        offsetY: Math.round(croppedAreaPixels.y),
        cropWidth: Math.round(croppedAreaPixels.width),
        cropHeight: Math.round(croppedAreaPixels.height),
      },
      缩放比例: { scaleX, scaleY },
      原图坐标: cropInfo,
    })
    console.log('🔗 最终 x-oss-process URL:', ossCropUrl)

    onSave(cropInfo)
  }, [croppedAreaPixels, sourceSize, displayImageSize, mode, aspectRatio, photoData.originalUrl, photoData.thumbnailUrl, onSave])

  // 渲染 full 或 lomo 模式（不可编辑）
  const renderStaticMode = () => {
    const isLomo = mode === 'lomo'
    const margin = isLomo ? WHITE_MARGIN_PERCENT : 0

    return (
      <div 
        className="relative w-full h-full bg-white flex items-center justify-center"
        style={{
          padding: isLomo ? `${margin}%` : 0,
        }}
      >
        <img
          src={imageUrl}
          alt="预览"
          className="max-w-full max-h-full object-contain"
          style={{
            maxWidth: isLomo ? `${100 - margin * 2}%` : '100%',
            maxHeight: isLomo ? `${100 - margin * 2}%` : '100%',
          }}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 提示信息 */}
      <div className="px-4 py-3 pt-8">
        <div className="flex items-center justify-center gap-2 text-sm">
          <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="text-blue-400">
            {mode === 'cover' ? '居中裁剪模式：可拖拽移动图片位置' : 
             mode === 'full' ? '打印整图模式：图片完整显示，不可编辑' : 
             '四周留白模式：图片完整显示，不可编辑'}
          </span>
        </div>
        {mode === 'cover' && (
          <p className="text-center text-red-400 text-sm mt-1">超出边框部分将被裁剪</p>
        )}
      </div>

      {/* 编辑区域 */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="relative w-full max-w-lg">
          <div
            ref={containerRef}
            className="relative w-full bg-white shadow-2xl overflow-hidden"
            style={{ paddingTop: `${(1 / aspectRatio) * 100}%` }}
          >
            <div className="absolute inset-0">
              {imageLoaded && imageUrl && (
                mode === 'cover' ? (
                  // Cover 模式：使用 react-easy-crop
                  <Cropper
                    image={imageUrl}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspectRatio}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    // 禁止缩放，只允许拖拽
                    minZoom={1}
                    maxZoom={1}
                    restrictPosition={true}
                    showGrid={false}
                    style={{
                      containerStyle: {
                        backgroundColor: 'white',
                      },
                      cropAreaStyle: {
                        border: '2px dashed #ef4444',
                      },
                    }}
                    classes={{
                      containerClassName: 'rounded-none',
                    }}
                  />
                ) : (
                  // Full 和 Lomo 模式：静态显示
                  renderStaticMode()
                )
              )}
              
              {/* 加载中 */}
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <span className="text-gray-400">加载中...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 裁剪提示 */}
        {mode === 'cover' && (
          <>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 text-xs">
              <span>✂</span>
              <span className="writing-mode-vertical">裁剪区域</span>
              <span>✂</span>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 text-xs">
              <span>✂</span>
              <span className="writing-mode-vertical">裁剪区域</span>
              <span>✂</span>
            </div>
          </>
        )}
      </div>

      {/* 底部控制栏 */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 pb-8">
        {/* 模式选择器 */}
        <div className="flex gap-2 mb-4 justify-center">
          <button
            onClick={() => handleModeChange('cover')}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${
              mode === 'cover'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <div className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center ${
              mode === 'cover' ? 'border-white bg-white' : 'border-gray-400'
            }`}>
              {mode === 'cover' && <div className="w-2 h-2 bg-pink-500 rounded-sm" />}
            </div>
            居中裁剪
          </button>
          <button
            onClick={() => handleModeChange('full')}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${
              mode === 'full'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <div className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center ${
              mode === 'full' ? 'border-white bg-white' : 'border-gray-400'
            }`}>
              {mode === 'full' && <div className="w-2 h-2 bg-pink-500 rounded-sm" />}
            </div>
            打印整图
          </button>
          <button
            onClick={() => handleModeChange('lomo')}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${
              mode === 'lomo'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <div className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center ${
              mode === 'lomo' ? 'border-white bg-white' : 'border-gray-400'
            }`}>
              {mode === 'lomo' && <div className="w-2 h-2 bg-pink-500 rounded-sm" />}
            </div>
            四周留白
          </button>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-700 text-white rounded-full font-medium transition-all hover:bg-gray-600"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 gradient-primary text-white rounded-full font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            编辑完毕
          </button>
        </div>
      </div>
    </div>
  )
}
