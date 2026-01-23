'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Check, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import {
  type Image as ImageType
} from '@/lib/store'
import { getEditThumbnailUrl, SimpleCropInfo, buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'
import { getCropConfigForSize } from '@/lib/photo-sizes'
import { useImagePreload } from '@/lib/use-image-preload'

interface ImageEditorProps {
  image: ImageType
  canvasWidth: number
  canvasHeight: number
  sizeId?: string  // 新增：用于获取裁剪配置
  onSave: (saveData: SaveData) => void
  onCancel: () => void
  // 导航功能
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  // 预加载相关
  allImages?: ImageType[]  // 所有图片列表（用于预加载）
  currentIndex?: number    // 当前图片索引（用于预加载）
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
  // 安全检查：确保必需的 props 有效
  if (!photoData || !canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
    console.error('ImageEditor: 无效的 props', { photoData, canvasWidth, canvasHeight })
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

  // 获取当前尺寸的裁剪样式配置
  const cropConfig = sizeId 
    ? getCropConfigForSize(sizeId) 
    : { defaultMode: 'cover' as EditMode, availableModes: ['cover', 'full', 'lomo'] as EditMode[] }

  // 获取初始模式
  const getInitialMode = useCallback((): 'cover' | 'full' | 'lomo' => {
    const mode = photoData.cropMode || cropConfig.defaultMode
    // 确保初始模式在可选模式列表中
    return cropConfig.availableModes.includes(mode) ? mode : cropConfig.defaultMode
  }, [photoData.cropMode, cropConfig])

  const [mode, setMode] = useState<'cover' | 'full' | 'lomo'>(getInitialMode())
  
  // 🚀 优化：当图片切换时，立即更新模式（确保模式切换和图片切换同步）
  const prevPhotoIdForModeRef = useRef<string | undefined>(photoData.id)
  useEffect(() => {
    // 只有当图片ID真正变化时才更新模式
    if (prevPhotoIdForModeRef.current !== photoData.id) {
      const newMode = getInitialMode()
      // 🎯 关键：立即更新模式，确保切换图片时模式也同步切换
      setMode(newMode)
      prevPhotoIdForModeRef.current = photoData.id
      
      // 🚀 优化：模式切换时，重置相关状态，确保新图片使用正确的模式
      restoredRef.current = false
      isRestoringRef.current = false
      setCroppedAreaPixels(null)
      setInitialCroppedAreaPixels(undefined)
      setInitialCroppedAreaPercentages(undefined)
    }
  }, [photoData.id, photoData.cropMode, getInitialMode])
  // 🎯 关键修复：优先使用 originalUrl（OSS URL），而不是 thumbnailUrl（可能是 600px 的压缩 data URL）
  // 原因：react-easy-crop 的 croppedAreaPixels 是相对于实际加载图片的坐标
  // 如果加载的是 600px 缩略图，坐标就是 600px 图的坐标，无法直接用于原图裁剪
  // 使用 originalUrl 后，通过 buildOssCropUrl 会添加 q_70 质量压缩，不影响尺寸
  const imageUrl = photoData.originalUrl || photoData.thumbnailUrl
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  // 保存上一个图片的引用，用于过渡动画
  const prevImageRef = useRef<ImageType | null>(null)
  const prevImageUrlRef = useRef<string | undefined>(undefined)
  const prevImageLoadedRef = useRef<boolean>(false)
  const prevPhotoIdForTransitionRef = useRef<string | undefined>(photoData.id) // 🚀 优化：用于检测图片切换

  // react-easy-crop 状态
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  // 安全的 setCrop 包装函数，防止设置无效值
  const safetSetCrop = useCallback((newCrop: Point | ((prev: Point) => Point)) => {
    if (typeof newCrop === 'function') {
      setCrop(prev => {
        const computed = newCrop(prev)
        if (isNaN(computed.x) || isNaN(computed.y) || !isFinite(computed.x) || !isFinite(computed.y)) {
          console.error('尝试设置无效的 crop 值:', computed)
          return prev
        }
        return computed
      })
    } else {
      if (isNaN(newCrop.x) || isNaN(newCrop.y) || !isFinite(newCrop.x) || !isFinite(newCrop.y)) {
        console.error('尝试设置无效的 crop 值:', newCrop)
        return
      }
      setCrop(newCrop)
    }
  }, [])

  // 安全的 setZoom 包装函数，防止设置无效值
  const safeSetZoom = useCallback((newZoom: number | ((prev: number) => number)) => {
    if (typeof newZoom === 'function') {
      setZoom(prev => {
        const computed = newZoom(prev)
        if (isNaN(computed) || !isFinite(computed) || computed <= 0) {
          console.error('尝试设置无效的 zoom 值:', computed)
          return prev
        }
        return computed
      })
    } else {
      if (isNaN(newZoom) || !isFinite(newZoom) || newZoom <= 0) {
        console.error('尝试设置无效的 zoom 值:', newZoom)
        return
      }
      setZoom(newZoom)
    }
  }, [])
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null) // 🎯 百分比坐标（官方推荐用于恢复）
  const [initialCroppedAreaPixels, setInitialCroppedAreaPixels] = useState<Area | undefined>(undefined)
  // 用于追踪是否需要重新应用初始值（图片切换时）
  const [initialCroppedAreaPercentages, setInitialCroppedAreaPercentages] = useState<Area | undefined>(undefined)

  // 🚀 优化：直接从 photoData 获取尺寸，避免异步加载
  const sourceSize = useMemo(() => ({
    width: photoData.width || 0,
    height: photoData.height || 0,
  }), [photoData.width, photoData.height])

  // 实际加载的图片尺寸（原图尺寸，只做了质量压缩，没有尺寸缩放）
  // 所以直接使用 sourceSize，不需要额外的坐标转换
  const thumbImageSize = sourceSize

  const containerRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false) // 标记是否已恢复过位置
  const isRestoringRef = useRef(false) // 标记是否正在恢复位置，用于防止 onCropComplete 触发更新

  // 🚀 优化：稳定化相纸比例，避免每次render重新计算
  const paperAspectRatio = useMemo(() => {
    if (!canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
      return 1 // 默认 1:1，防止除以 0
    }
    return canvasWidth / canvasHeight
  }, [canvasWidth, canvasHeight])

  // 🚀 优化：根据图片方向动态调整裁剪框比例，让图片可保留的区域最大化
  // 如果图片是横图，裁剪框也应该是横的；如果图片是竖图，裁剪框也应该是竖的
  // 使用 useMemo 确保稳定性，避免无限循环
  const baseAspectRatio = useMemo(() => {
    if (!sourceSize.width || !sourceSize.height || sourceSize.width <= 0 || sourceSize.height <= 0) {
      return paperAspectRatio
    }

    const imageRatio = sourceSize.width / sourceSize.height
    const isImageLandscape = imageRatio > 1 // 横图
    const isPaperLandscape = paperAspectRatio > 1 // 相纸是横的

    // 计算基础比例
    let baseRatio: number
    // 如果图片和相纸方向一致，直接使用相纸比例
    if ((isImageLandscape && isPaperLandscape) || (!isImageLandscape && !isPaperLandscape)) {
      baseRatio = paperAspectRatio
    } else {
      // 🚀 关键：如果图片和相纸方向不一致，反转相纸比例
      // 例如：相纸是 3:4（竖 0.75），图片是横图，则使用 4:3（横 1.33）
      baseRatio = paperAspectRatio > 0 ? 1 / paperAspectRatio : 1
    }

    return baseRatio
  }, [sourceSize.width, sourceSize.height, paperAspectRatio])

  // 裁剪框的 aspectRatio（用于 Cropper 组件）
  const aspectRatio = baseAspectRatio

  // 容器的高度比例（保持固定，不随裁剪框旋转而改变，这样图片大小不会变）
  const containerAspectRatio = baseAspectRatio

  // 🎯 关键修复：使用 useMemo 同步计算初始值，而不是在 useEffect 中异步设置
  // 因为 initialCroppedAreaPercentages 只在 Cropper 首次挂载时生效，必须在渲染前就计算好
  const computedInitialCroppedAreaPercentages = useMemo((): Area | undefined => {
    // 只有 cover 模式才需要恢复
    if (mode !== 'cover') return undefined
    if (!photoData.cropInfo || !sourceSize.width || !sourceSize.height) return undefined
    
    const { styleType, croppedAreaPercent: savedPercent } = photoData.cropInfo
    
    // 只有 cover 模式且有有效数据时才恢复
    if (styleType !== 'cover') return undefined
    
    // 🎯 优先使用保存的百分比坐标
    if (savedPercent) {
      const { x, y, width, height } = savedPercent
      if (typeof x === 'number' && typeof y === 'number' && 
          typeof width === 'number' && typeof height === 'number' &&
          !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height) &&
          isFinite(x) && isFinite(y) && isFinite(width) && isFinite(height)) {
        console.log('📍 使用保存的百分比坐标恢复:', savedPercent)
        return { x, y, width, height }
      }
    }
    
    // 🔄 兼容旧数据：从像素坐标计算百分比
    const { offsetX, offsetY, cropWidth, cropHeight } = photoData.cropInfo
    
    if (typeof offsetX !== 'number' || typeof offsetY !== 'number' || 
        isNaN(offsetX) || isNaN(offsetY) || !isFinite(offsetX) || !isFinite(offsetY)) {
      return undefined
    }
    
    let finalCropWidth = cropWidth
    let finalCropHeight = cropHeight
    if (!finalCropWidth || !finalCropHeight) {
      const calculated = calculateCoverCropSize(sourceSize.width, sourceSize.height, baseAspectRatio)
      finalCropWidth = calculated.cropWidth
      finalCropHeight = calculated.cropHeight
    }
    
    console.log('📍 从像素坐标计算百分比恢复（兼容模式）')
    return {
      x: (offsetX / sourceSize.width) * 100,
      y: (offsetY / sourceSize.height) * 100,
      width: (finalCropWidth / sourceSize.width) * 100,
      height: (finalCropHeight / sourceSize.height) * 100,
    }
  }, [photoData.cropInfo, photoData.id, sourceSize, mode, baseAspectRatio])

  // 🚀 优化：固化图片压缩参数，避免每次render创建新对象
  const imageCompressOptions = useMemo(() => ({
    quality: 70,
    format: 'jpg',
    interlace: 1 // 渐进显示，提升加载体验
  }), [])

  // 🚀 优化：固化样式对象，避免每次render创建新对象
  const cropperStyle = useMemo(() => ({
    containerStyle: {
      backgroundColor: 'black',
    },
    mediaStyle: {
      backgroundColor: '#ffffff',
    },
    cropAreaStyle: {
      border: '3px dashed #ef4444',
    },
  }), [])

  const cropperClasses = useMemo(() => ({
    containerClassName: 'rounded-none',
  }), [])

  // 🚀 预加载前后各5张图片（不包括当前图片，避免重复加载）
  useImagePreload(imageUrl, allImages, currentIndex, 5)

  // 🚀 优化：直接使用 photoData 的尺寸计算压缩图尺寸，避免重复加载图片
  // 压缩图尺寸可以通过原图尺寸和压缩比例计算得出
  useEffect(() => {
    if (!imageUrl) return

    // 🚀 优化：检测图片是否切换（通过 ID 而不是 URL，更准确）
    const imageChanged = prevPhotoIdForTransitionRef.current !== photoData.id
    if (imageChanged) {
      // 保存上一个图片的状态（用于过渡动画）
      if (prevImageUrlRef.current && prevPhotoIdForTransitionRef.current) {
        prevImageRef.current = {
          ...photoData,
          id: prevPhotoIdForTransitionRef.current,
          thumbnailUrl: prevImageUrlRef.current,
          originalUrl: prevImageUrlRef.current,
        }
        prevImageLoadedRef.current = imageLoaded
      }
      
      // 🚀 优化：只有在图片真正切换时才开始过渡，避免不必要的重置
      // 如果上一个图片已经加载完成，可以立即开始过渡
      if (prevImageLoadedRef.current) {
        setIsTransitioning(true)
      }
      setImageLoaded(false)
      prevImageUrlRef.current = imageUrl
      prevPhotoIdForTransitionRef.current = photoData.id
      
      // 🎯 关键：图片切换时，状态重置已经在模式切换的 useEffect 中处理了
      // 这里只需要确保过渡状态正确
    }

    // 图片切换时的过渡处理已在上面完成
    // 不需要计算压缩图尺寸，因为实际加载的是原图（只做了质量压缩）
  }, [imageUrl, sourceSize, photoData, imageLoaded, safetSetCrop, safeSetZoom])

  // 🚀 监听图片加载完成（使用与 Cropper 相同的 URL，但只加载一次用于检测）
  // 由于浏览器缓存，这个加载会很快，不会浪费带宽
  useEffect(() => {
    if (!imageUrl) return

    // 使用与 Cropper 相同的压缩 URL
    const compressedUrl = buildOssCropUrl(imageUrl, undefined, imageCompressOptions)
    
    // 创建一个隐藏的 img 元素来检测图片是否加载完成
    // 如果图片已经在缓存中（预加载过），onload 会立即触发
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      setImageLoaded(true)
      // 🚀 优化：减少过渡时间，让切换更快速
      setTimeout(() => {
        setIsTransitioning(false)
        // 清除上一个图片的引用，释放内存
        prevImageRef.current = null
      }, 50)
    }
    
    img.onerror = () => {
      // 即使加载失败，也标记为已加载，避免卡住
      setImageLoaded(true)
      setIsTransitioning(false)
    }
    
    img.src = compressedUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl, imageCompressOptions])

  // 🚀 优化：当 computedInitialCroppedAreaPercentages 变化时，同步更新 state
  // 这确保在图片切换时，Cropper 组件能收到正确的初始值
  useEffect(() => {
    if (computedInitialCroppedAreaPercentages) {
      setInitialCroppedAreaPercentages(computedInitialCroppedAreaPercentages)
      // 标记正在恢复，防止 onCropComplete 触发更新
      isRestoringRef.current = true
      requestAnimationFrame(() => {
        isRestoringRef.current = false
      })
    }
  }, [computedInitialCroppedAreaPercentages])
  
  // 🚀 优化：当图片切换且没有 cropInfo 时，重置裁剪状态为默认值
  useEffect(() => {
    if (!photoData.cropInfo && prevPhotoIdForTransitionRef.current !== photoData.id) {
      // 新图片且没有保存的裁剪信息，重置为默认居中位置
      // 但只在 cover 模式下重置，full 和 lomo 模式不需要裁剪
      if (mode === 'cover') {
        safetSetCrop({ x: 0, y: 0 })
        safeSetZoom(1)
      }
    }
  }, [photoData.id, photoData.cropInfo, mode, safetSetCrop, safeSetZoom])

  // 🚀 优化：模式改变时重置恢复标记和相关状态
  useEffect(() => {
    restoredRef.current = false
    isRestoringRef.current = false
    setInitialCroppedAreaPercentages(undefined)
    setInitialCroppedAreaPixels(undefined)
    
    // 🎯 关键：当模式切换到 full 或 lomo 时，不需要裁剪状态
    // 当模式切换到 cover 时，重置裁剪状态为默认值
    if (mode === 'cover') {
      safetSetCrop({ x: 0, y: 0 })
      safeSetZoom(1)
      setCroppedAreaPixels(null)
      setCroppedAreaPercent(null)
    }
  }, [mode, safetSetCrop, safeSetZoom])

  // 裁剪完成回调 - 同时保存百分比和像素坐标
  // 官方最佳实践：
  // - croppedArea（百分比）用于恢复裁剪位置
  // - croppedAreaPixels（像素）用于服务端裁剪
  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    try {
      // 如果正在恢复位置，不更新状态，避免无限循环
      if (isRestoringRef.current) return

      console.log('📐 onCropComplete:', { croppedArea, croppedAreaPixels })

      // 🎯 同时保存百分比和像素坐标
      setCroppedAreaPercent(croppedArea)    // 百分比坐标（用于恢复）
      setCroppedAreaPixels(croppedAreaPixels) // 像素坐标（用于服务端）

      // 记录用户当前的编辑状态，用于下次进入页面时恢复
      if (mode === 'cover' && sourceSize.width && sourceSize.height) {
        setInitialCroppedAreaPixels(croppedAreaPixels)
      }

    } catch (error) {
      console.error('onCropComplete 出错:', error)
    }
  }, [mode, sourceSize])

  // 模式改变
  const handleModeChange = useCallback((newMode: EditMode) => {
    setMode(newMode)
    // 重置裁剪状态
    safetSetCrop({ x: 0, y: 0 })
    safeSetZoom(1)
    setCroppedAreaPixels(null)
    setCroppedAreaPercent(null)
    setInitialCroppedAreaPixels(undefined)
    setInitialCroppedAreaPercentages(undefined)
  }, [safetSetCrop, safeSetZoom])

  // 保存 - 生成带有crop参数的outputUrl
  // 🎯 官方最佳实践：同时保存百分比坐标（用于恢复）和像素坐标（用于服务端裁剪）
  const handleSave = useCallback(() => {
    try {
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
        if (croppedAreaPixels && croppedAreaPercent) {
          // 🎯 关键：同时保存像素坐标和百分比坐标
          cropInfo = {
            offsetX: Math.round(croppedAreaPixels.x),
            offsetY: Math.round(croppedAreaPixels.y),
            cropWidth: Math.round(croppedAreaPixels.width),
            cropHeight: Math.round(croppedAreaPixels.height),
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height,
            styleType: 'cover',
            // 🎯 保存百分比坐标（官方推荐用于恢复）
            croppedAreaPercent: {
              x: croppedAreaPercent.x,
              y: croppedAreaPercent.y,
              width: croppedAreaPercent.width,
              height: croppedAreaPercent.height,
            },
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

          // 计算默认的百分比坐标
          const defaultPercent = {
            x: (offsetX / sourceSize.width) * 100,
            y: (offsetY / sourceSize.height) * 100,
            width: (cropWidth / sourceSize.width) * 100,
            height: (cropHeight / sourceSize.height) * 100,
          }

          cropInfo = {
            offsetX: Math.round(offsetX),
            offsetY: Math.round(offsetY),
            cropWidth: Math.round(cropWidth),
            cropHeight: Math.round(cropHeight),
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height,
            styleType: 'cover',
            croppedAreaPercent: defaultPercent,
          }
        }

        // cover 模式：在原图URL基础上拼接crop参数
        if (cropInfo) {
          outputUrl = buildOssCropUrl(outputUrl, cropInfo)
        }
      }

      if (cropInfo) {
        console.log('🎯 保存 cropInfo（包含百分比）:', cropInfo)
        console.log('🔗 生成的 outputUrl:', outputUrl)

        // 传递crop meta和生成的outputUrl
        onSave({
        cropInfo,
        outputUrl,
      })
    }
    } catch (error) {
      console.error('handleSave 出错:', error)
      alert('保存失败，请重试')
    }
  }, [croppedAreaPixels, croppedAreaPercent, sourceSize, mode, aspectRatio, photoData.originalUrl, photoData.thumbnailUrl, onSave])

  // 渲染 full 或 lomo 模式（不可编辑）
  // 🎯 关键：添加 key 确保模式切换时重新渲染
  const renderStaticMode = () => {
    const isLomo = mode === 'lomo'
    const margin = isLomo ? WHITE_MARGIN_PERCENT : 0
    return (
      <div
        key={`static-${photoData.id}-${mode}`}
        className="relative w-full h-full bg-white flex items-center justify-center"
        style={{
          padding: isLomo ? `${margin}%` : 0,
        }}
      >
        <img
          key={`static-img-${photoData.id}-${mode}-${imageUrl}`}
          src={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
          alt="预览"
          className="w-full h-full object-contain"
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 顶部导航栏 */}
     
      {/* 提示信息 */}
      <div className="px-4 py-3">
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
            style={{ paddingTop: `${(1 / containerAspectRatio) * 100}%` }}
          >
            <div className="absolute inset-0">
              {/* 🚀 优化：当前图片 - 使用更平滑的淡入淡出效果，避免黑屏 */}
              {/* 🎯 关键：添加 mode 到 key 中，确保模式切换时组件重新渲染 */}
              <div 
                key={`current-${photoData.id}-${mode}`}
                className={`absolute inset-0 transition-opacity duration-200 ease-in-out ${
                  imageLoaded && !isTransitioning ? 'opacity-100 z-20' : 'opacity-0 z-10'
                }`}
              >
                {imageLoaded && imageUrl && aspectRatio > 0 && 
                 sourceSize.width > 0 && sourceSize.height > 0 && (
                  mode === 'cover' ? (
                    // Cover 模式：使用 react-easy-crop 
                    <Cropper
                      key={`cropper-${photoData.id}-${mode}-${imageUrl}`}
                      image={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
                      crop={crop}
                      zoom={zoom}
                      aspect={aspectRatio}
                      onCropChange={safetSetCrop}
                      onZoomChange={safeSetZoom}
                      onCropComplete={onCropComplete}
                      {...(computedInitialCroppedAreaPercentages && {
                        initialCroppedAreaPercentages: computedInitialCroppedAreaPercentages
                      })}
                      // 禁止缩放，只允许拖拽
                      objectFit='contain'
                      minZoom={1}
                      maxZoom={1}
                      restrictPosition={true}
                      showGrid={true}
                      style={cropperStyle}
                      classes={cropperClasses}
                    />
                  ) : (
                    // Full 和 Lomo 模式：静态显示
                    renderStaticMode()
                  )
                )}
              </div>
              
              {/* 🚀 优化：显示上一个图片作为背景，避免黑屏 */}
              {prevImageRef.current && isTransitioning && (
                <div 
                  className="absolute inset-0 opacity-100 z-0 transition-opacity duration-200"
                  style={{ 
                    backgroundImage: `url(${buildOssCropUrl(prevImageRef.current.thumbnailUrl || prevImageRef.current.originalUrl || '', undefined, imageCompressOptions)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(2px)',
                  }}
                />
              )}

              {/* 加载中指示器 - 只在真正加载时显示，且不遮挡已加载的图片 */}
              {!imageLoaded && isTransitioning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin" />
                    <span className="text-gray-400 text-sm">加载中...</span>
                  </div>
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
      {/* 导航按钮区域 */}
      <div className="px-4 py-4 bg-gray-900 border-t border-gray-800">
        <div className="flex items-center justify-between gap-4 max-w-2xl mx-auto">
          {/* 上一张按钮 */}
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            className={`
              group flex items-center gap-2 px-4 py-3 rounded-xl font-medium
              transition-all duration-200 ease-in-out
              ${
                hasPrevious
                  ? 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg hover:scale-105 active:scale-100'
                  : 'bg-gray-800/50 text-gray-500 cursor-not-allowed opacity-50'
              }
            `}
            aria-label="上一张"
          >
            <ChevronLeft 
              className={`w-5 h-5 transition-transform duration-200 ${
                hasPrevious ? 'group-hover:-translate-x-0.5' : ''
              }`} 
            />
            <span className="text-sm">上一张</span>
          </button>
          
          {/* 中间占位（可以放图片计数器等） */}
          <div className="flex-1" />
          
          {/* 下一张按钮 */}
          <button
            onClick={onNext}
            disabled={!hasNext}
            className={`
              group flex items-center gap-2 px-4 py-3 rounded-xl font-medium
              transition-all duration-200 ease-in-out
              ${
                hasNext
                  ? 'bg-gray-700 text-white hover:bg-gray-600 hover:shadow-lg hover:scale-105 active:scale-100'
                  : 'bg-gray-800/50 text-gray-500 cursor-not-allowed opacity-50'
              }
            `}
            aria-label="下一张"
          >
            <span className="text-sm">下一张</span>
            <ChevronRight 
              className={`w-5 h-5 transition-transform duration-200 ${
                hasNext ? 'group-hover:translate-x-0.5' : ''
              }`} 
            />
          </button>
        </div>
      </div>


      {/* 底部控制栏 */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 pb-8">
        {/* 模式选择器 - 根据配置显示可选模式 */}
        <div className="flex gap-2 mb-4 justify-center">
          {cropConfig.availableModes.includes('cover') && (
            <button
              onClick={() => handleModeChange('cover')}
              className={`px-3 py-3 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${mode === 'cover'
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
              className={`px-3 py-3 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${mode === 'full'
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
              className={`px-3 py-3 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${mode === 'lomo'
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
