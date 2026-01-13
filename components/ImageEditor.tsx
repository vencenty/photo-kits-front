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
  
  // 原图尺寸（从 photoData 或加载的图片获取）
  const [sourceSize, setSourceSize] = useState({
    width: photoData.width || 0,
    height: photoData.height || 0,
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

    // 预加载图片获取尺寸（用于校验）
    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageLoaded(true)
      // 使用原图尺寸（从 photoData 获取，因为加载的可能是压缩图）
      if (!sourceSize.width || !sourceSize.height) {
        setSourceSize({
          width: photoData.width || img.width,
          height: photoData.height || img.height,
        })
      }
    }
    img.onerror = () => {
      // 降级使用原图
      if (editUrl !== originalUrl) {
        setImageUrl(originalUrl)
      }
    }
    img.src = editUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [photoData.thumbnailUrl, photoData.originalUrl, photoData.width, photoData.height])

  // 从保存的 cropInfo 恢复状态
  useEffect(() => {
    if (!photoData.cropInfo || !sourceSize.width || !sourceSize.height) return
    
    const { offsetX, offsetY, cropWidth, cropHeight, styleType } = photoData.cropInfo
    
    // 只有 cover 模式且有有效数据时才恢复
    if (styleType !== 'cover' || !cropWidth || !cropHeight) return
    
    // 计算 react-easy-crop 需要的 crop 位置
    // react-easy-crop 的 crop 是图片相对于裁剪框的偏移
    // 我们需要把 offsetX/Y 转换为 crop.x/y
    const { cropWidth: defaultCropW, cropHeight: defaultCropH } = calculateCoverCropSize(
      sourceSize.width,
      sourceSize.height,
      aspectRatio
    )
    
    // 计算中心偏移
    const centerOffsetX = (sourceSize.width - defaultCropW) / 2
    const centerOffsetY = (sourceSize.height - defaultCropH) / 2
    
    // offsetX/Y 是裁剪区域左上角在原图中的位置
    // crop.x/y 需要表示相对于默认中心位置的偏移（百分比或像素）
    // 这里先设置为默认值，让用户可以重新调整
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    
  }, [photoData.cropInfo, sourceSize, aspectRatio])

  // 裁剪完成回调
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
    
    // 打印 OSS 裁剪 URL（调试用）
    if (mode === 'cover' && sourceSize.width && sourceSize.height) {
      const cropInfo: SimpleCropInfo = {
        offsetX: croppedAreaPixels.x,
        offsetY: croppedAreaPixels.y,
        cropWidth: croppedAreaPixels.width,
        cropHeight: croppedAreaPixels.height,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        styleType: 'cover',
      }
      
      const originalUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
      const ossCropUrl = buildOssCropUrl(originalUrl, cropInfo)
      
      console.log('📐 裁剪参数:', {
        offsetX: Math.round(croppedAreaPixels.x),
        offsetY: Math.round(croppedAreaPixels.y),
        cropWidth: Math.round(croppedAreaPixels.width),
        cropHeight: Math.round(croppedAreaPixels.height),
        sourceSize,
      })
      console.log('🔗 x-oss-process URL:', ossCropUrl)
    }
  }, [mode, sourceSize, photoData.originalUrl, photoData.thumbnailUrl])

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

    // cover 模式，使用 react-easy-crop 返回的像素坐标
    if (!croppedAreaPixels) {
      // 如果没有裁剪过，使用默认居中裁剪
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
      console.log('💾 保存裁剪参数:', cropInfo)
      console.log('🔗 最终 x-oss-process URL:', ossCropUrl)

      onSave(cropInfo)
      return
    }

    const cropInfo: SimpleCropInfo = {
      offsetX: Math.round(croppedAreaPixels.x),
      offsetY: Math.round(croppedAreaPixels.y),
      cropWidth: Math.round(croppedAreaPixels.width),
      cropHeight: Math.round(croppedAreaPixels.height),
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      styleType: 'cover',
    }

    // 打印最终的 OSS URL
    const originalUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
    const ossCropUrl = buildOssCropUrl(originalUrl, cropInfo)
    console.log('💾 保存裁剪参数:', cropInfo)
    console.log('🔗 最终 x-oss-process URL:', ossCropUrl)

    onSave(cropInfo)
  }, [croppedAreaPixels, sourceSize, mode, aspectRatio, photoData.originalUrl, photoData.thumbnailUrl, onSave])

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
