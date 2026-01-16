'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Check, Lightbulb } from 'lucide-react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import {
  type Image as ImageType
} from '@/lib/store'
import { getEditThumbnailUrl, SimpleCropInfo, buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface ImageEditorProps {
  image: ImageType
  canvasWidth: number
  canvasHeight: number
  onSave: (saveData: SaveData) => void
  onCancel: () => void
}

type EditMode = 'cover' | 'full' | 'lomo'

interface SaveData {
  cropInfo: SimpleCropInfo | undefined
  outputUrl: string
}

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

  // 计算出的URL状态
  const [outputUrl, setOutputUrl] = useState<string>('')
  const [thumbUrl, setThumbUrl] = useState<string>('')

  // react-easy-crop 状态
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [initialCroppedAreaPixels, setInitialCroppedAreaPixels] = useState<Area | undefined>(undefined)

  // 原图尺寸（从 photoData 获取，这是真实的原图尺寸）
  const [sourceSize, setSourceSize] = useState({
    width: photoData.width || 0,
    height: photoData.height || 0,
  })

  // 压缩图尺寸（前端实际加载的图片尺寸，用于坐标转换）
  const [thumbImageSize, setDisplayImageSize] = useState({
    width: 0,
    height: 0,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false) // 标记是否已恢复过位置
  const isRestoringRef = useRef(false) // 标记是否正在恢复位置，用于防止 onCropComplete 触发更新

  // 计算相纸比例
  const paperAspectRatio = canvasWidth / canvasHeight

  // 根据图片方向动态调整裁剪框比例，让图片可保留的区域最大化
  // 如果图片是横图，裁剪框也应该是横的；如果图片是竖图，裁剪框也应该是竖的
  const aspectRatio = useMemo(() => {
    if (!sourceSize.width || !sourceSize.height) {
      return paperAspectRatio // 默认使用相纸比例
    }

    const imageRatio = sourceSize.width / sourceSize.height
    const isImageLandscape = imageRatio > 1 // 横图
    const isPaperLandscape = paperAspectRatio > 1 // 相纸是横的

    // 如果图片和相纸方向一致，直接使用相纸比例
    if ((isImageLandscape && isPaperLandscape) || (!isImageLandscape && !isPaperLandscape)) {
      return paperAspectRatio
    }

    // 如果图片和相纸方向不一致，反转相纸比例
    // 例如：相纸是 3:4（竖），图片是横图，则使用 4:3（横）
    return canvasHeight / canvasWidth
  }, [sourceSize.width, sourceSize.height, paperAspectRatio, canvasWidth, canvasHeight])

  // 加载图片
  useEffect(() => {
    const originalUrl = photoData.thumbnailUrl || photoData.originalUrl
    if (!originalUrl) return

    // 直接加载 OSS 返回的原图，不要拼接任何参数
    setImageUrl(originalUrl)

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
      console.error('加载原图失败:', originalUrl)
      // 原图加载失败时的处理（可以显示错误提示或使用默认图片）
    }
    img.src = originalUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [photoData.thumbnailUrl, photoData.originalUrl, photoData.width, photoData.height])

  // 从保存的 cropInfo 恢复状态
  // 
  // 【坐标转换原理】
  // 1. 保存时：用户在压缩图（600px短边）上编辑，react-easy-crop 返回压缩图坐标
  //    → 转换为原图坐标保存：原图坐标 = 压缩图坐标 × (原图尺寸 / 压缩图尺寸)
  //    → 例如：压缩图300×400，原图3000×4000，压缩图上移动10px → 原图移动100px
  //
  // 2. 恢复时：从数据库读取的是原图坐标（cropInfo）
  //    → 转换为压缩图坐标：压缩图坐标 = 原图坐标 × (压缩图尺寸 / 原图尺寸)
  //    → 例如：原图移动100px → 压缩图移动10px，设置到 react-easy-crop
  //
  // 3. react-easy-crop 的 crop Point：
  //    - 表示图片中心相对于裁剪框中心的偏移（像素单位）
  //    - 裁剪框是居中的，所以需要计算图片中心位置
  useEffect(() => {
    // 防止重复恢复
    if (restoredRef.current) return
    if (!photoData.cropInfo || !sourceSize.width || !sourceSize.height) return
    if (!thumbImageSize.width || !thumbImageSize.height) return // 等待压缩图尺寸加载完成
    if (mode !== 'cover') return

    const { offsetX, offsetY, cropWidth, cropHeight, styleType } = photoData.cropInfo

    console.log("photoData.cropInfo",photoData.cropInfo, "fuck")

    // 只有 cover 模式且有有效数据时才恢复
    if (styleType !== 'cover') return

    // 如果 cropWidth 和 cropHeight 不存在，从裁剪框比例计算
    let finalCropWidth = cropWidth
    let finalCropHeight = cropHeight
    if (!finalCropWidth || !finalCropHeight) {
      const calculated = calculateCoverCropSize(
        sourceSize.width,
        sourceSize.height,
        aspectRatio // 使用动态计算的裁剪框比例
      )
      finalCropWidth = calculated.cropWidth
      finalCropHeight = calculated.cropHeight
    }

    // 【步骤1】计算缩放比例：压缩图尺寸 / 原图尺寸
    // 例如：压缩图600×800，原图3000×4000 → scaleX = 600/3000 = 0.2, scaleY = 800/4000 = 0.2
    const scaleX = thumbImageSize.width / sourceSize.width
    const scaleY = thumbImageSize.height / sourceSize.height

    // 【步骤2】将原图坐标转换为压缩图坐标
    // 例如：原图 offsetX=100 → 压缩图 offsetX = 100 × 0.2 = 20
    const displayOffsetX = offsetX * scaleX
    const displayOffsetY = offsetY * scaleY
    const displayCropWidth = finalCropWidth * scaleX
    const displayCropHeight = finalCropHeight * scaleY

    // 【步骤3】计算 react-easy-crop 的 crop Point
    // 
    // react-easy-crop 的 crop Point 表示：图片中心相对于裁剪框中心的偏移（像素单位）
    // 
    // 理解要点：
    // 1. 保存的 offsetX/offsetY 是裁剪区域左上角在原图中的位置
    // 2. 裁剪区域中心在原图上的位置 = offsetX + cropWidth/2, offsetY + cropHeight/2
    // 3. 裁剪区域中心在压缩图上的位置 = (offsetX + cropWidth/2) × scaleX, (offsetY + cropHeight/2) × scaleY
    // 4. 在 react-easy-crop 中，裁剪框是居中的，所以裁剪框中心 = 压缩图中心 = displayImageSize.width/2
    // 5. crop.x = 图片中心 - 裁剪框中心 = 裁剪区域中心 - 压缩图中心
    //
    // 示例计算：
    // - 原图：3000×4000，offsetX=100, cropWidth=2000
    // - 压缩图：600×800，scaleX=0.2
    // - 裁剪区域中心在原图：100 + 2000/2 = 1100
    // - 裁剪区域中心在压缩图：1100 × 0.2 = 220
    // - 压缩图中心：600/2 = 300
    // - crop.x = 220 - 300 = -80（图片中心在裁剪框中心左侧80px）

    // 计算裁剪区域中心在压缩图上的位置
    const cropAreaCenterX = (offsetX + finalCropWidth / 2) * scaleX
    const cropAreaCenterY = (offsetY + finalCropHeight / 2) * scaleY

    // 计算压缩图中心（也是裁剪框中心）
    const containerCenterX = thumbImageSize.width / 2
    const containerCenterY = thumbImageSize.height / 2

    // 计算图片中心相对于裁剪框中心的偏移（这就是 react-easy-crop 需要的 crop Point）
    const cropX = cropAreaCenterX - containerCenterX
    const cropY = cropAreaCenterY - containerCenterY

    // 【步骤4】设置恢复的位置和区域
    // 
    // setCrop：设置图片中心相对于裁剪框中心的偏移，react-easy-crop 会根据这个值定位图片
    setCrop({ x: cropX, y: cropY })
    setZoom(1) // 缩放设为1（不缩放）

    // setCroppedAreaPixels：保存压缩图上的裁剪区域坐标
    // 这个值会在用户保存时使用，避免重新计算（因为 react-easy-crop 的 onCropComplete 会更新它）
    const initialArea: Area = {
      x: displayOffsetX,      // 裁剪区域左上角在压缩图上的X坐标
      y: displayOffsetY,      // 裁剪区域左上角在压缩图上的Y坐标
      width: displayCropWidth, // 裁剪区域在压缩图上的宽度
      height: displayCropHeight, // 裁剪区域在压缩图上的高度
    }
    setCroppedAreaPixels(initialArea)
    setInitialCroppedAreaPixels(initialArea) // 设置初始值，只设置一次

    restoredRef.current = true // 标记已恢复，防止重复恢复

  }, [photoData.cropInfo, sourceSize, thumbImageSize, mode, aspectRatio])

  // 模式改变时重置恢复标记
  useEffect(() => {
    restoredRef.current = false
    isRestoringRef.current = false
  }, [mode])

  // 裁剪完成回调 - 直接基于原图尺寸计算crop meta
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    // 如果正在恢复位置，不更新状态，避免无限循环
    if (isRestoringRef.current) return

    // 保存压缩图坐标（用于后续计算，但不做复杂转换）
    setCroppedAreaPixels(croppedAreaPixels)

    // 记录用户当前的编辑状态，用于下次进入页面时恢复
    // 只有在 cover 模式且图片尺寸已知时才更新
    if (mode === 'cover' && thumbImageSize.width && thumbImageSize.height) {
      setInitialCroppedAreaPixels(croppedAreaPixels)
    }

    // 基于原图尺寸直接计算crop meta（简化版）
    if (mode === 'cover' && sourceSize.width && sourceSize.height && thumbImageSize.width && thumbImageSize.height) {
      // 计算缩放比例：原图尺寸 / 压缩图尺寸
      const scaleX = sourceSize.width / thumbImageSize.width
      const scaleY = sourceSize.height / thumbImageSize.height

      // 将压缩图坐标转换为原图坐标 - 这是我们唯一需要做的转换
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

      console.log("基于原图的crop meta:", cropInfo)

      // 只保存crop meta，不再生成URL（让服务端处理）
      // URL生成逻辑移到服务端统一处理
    }
  }, [mode, sourceSize, thumbImageSize])

  // 模式改变
  const handleModeChange = useCallback((newMode: EditMode) => {
    setMode(newMode)
    // 重置裁剪状态
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setInitialCroppedAreaPixels(undefined)
  }, [])

  // 保存 - 生成带有crop参数的outputUrl
  const handleSave = useCallback(() => {
    if (!sourceSize.width || !sourceSize.height) return

    let cropInfo: SimpleCropInfo | undefined
    let outputUrl = photoData.originalUrl || photoData.thumbnailUrl || ''

    // full 和 lomo 模式不需要裁剪参数，直接使用原图URL
    if (mode === 'full' || mode === 'lomo') {
      cropInfo = {
        offsetX: 0,
        offsetY: 0,
        cropWidth: sourceSize.width,
        cropHeight: sourceSize.height,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        styleType: mode,
      }
      // full 和 lomo 模式直接使用原图URL，不拼接crop参数
    } else if (mode === 'cover') {
      // cover 模式：使用当前裁剪数据或默认居中裁剪
      if (croppedAreaPixels && thumbImageSize.width && thumbImageSize.height) {
        // 将压缩图坐标转换为原图坐标
        // const scaleX = sourceSize.width / thumbImageSize.width
        // const scaleY = sourceSize.height / thumbImageSize.height

        cropInfo = {
          offsetX: croppedAreaPixels.x,
          offsetY: croppedAreaPixels.y,
          cropWidth: croppedAreaPixels.width,
          cropHeight: croppedAreaPixels.height,
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height,
          styleType: 'cover',
        }
      } else {
        // 默认居中裁剪
        const { cropWidth, cropHeight } = calculateCoverCropSize(
          sourceSize.width,
          sourceSize.height,
          aspectRatio
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

      // cover 模式：在原图URL基础上拼接crop参数
      if (cropInfo) {
        outputUrl = buildOssCropUrl(outputUrl, cropInfo)
      }
    }

    if (cropInfo) {
      console.log('🎯 保存基于原图的crop meta:', cropInfo)
      console.log('🔗 生成的outputUrl:', outputUrl)

      // 传递crop meta和生成的outputUrl
      onSave({
        cropInfo,
        outputUrl,
      })
    }
  }, [croppedAreaPixels, sourceSize, thumbImageSize, mode, aspectRatio, photoData.originalUrl, photoData.thumbnailUrl, onSave])

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
          <p className="text-center text-red-400 text-sm mt-1">超出红色边框部分将被裁剪</p>
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
                    initialCroppedAreaPixels={initialCroppedAreaPixels}
                    // 禁止缩放，只允许拖拽
                    objectFit='contain'
                    minZoom={1}
                    maxZoom={1}
                    restrictPosition={true}
                    showGrid={true}
                    style={{
                      containerStyle: {
                        backgroundColor: 'white',
                      },
                      mediaStyle: {
                        backgroundColor: '#ffffff',
                      },
                      cropAreaStyle: {
                        border: '3px dashed #ef4444',
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
          </div>
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 pb-8">
        {/* 模式选择器 */}
        <div className="flex gap-2 mb-4 justify-center">
          <button
            onClick={() => handleModeChange('cover')}
            className={`px-3 py-3 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${mode === 'cover'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            居中裁剪
          </button>
          <button
            onClick={() => handleModeChange('full')}
            className={`px-3 py-3 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${mode === 'full'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            打印整图
          </button>
          <button
            onClick={() => handleModeChange('lomo')}
            className={`px-3 py-3 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${mode === 'lomo'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >

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
