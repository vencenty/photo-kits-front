'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Check, Lightbulb, Download, Loader2 } from 'lucide-react'
import { 
  PhotoTransform, 
  CropInfo,
  createAffineMatrix, 
  parseAffineMatrix,
  type Image as ImageType 
} from '@/lib/store'
import { 
  ImageAttrs, 
  StyleType, 
  imageAttrsToMatrix,
  constrainPosition,
  getMinScale,
  calculateInitialAttrs,
} from './PhotoCanvas'
import { getEditImageUrl } from '@/lib/image-config'

// 配置常量
const WHITE_MARGIN_PERCENT = 5

interface ImageEditorProps {
  image: ImageType
  canvasWidth: number
  canvasHeight: number
  onSave: (transform: PhotoTransform | undefined, cropInfo: CropInfo | undefined) => void
  onCancel: () => void
}

type EditMode = 'cover' | 'full' | 'lomo'

// Konva Canvas 组件
interface KonvaCanvasProps {
  image: HTMLImageElement
  stageSize: { width: number; height: number }
  imageAttrs: ImageAttrs
  styleType: StyleType
  effectiveX: number
  effectiveY: number
  effectiveWidth: number
  effectiveHeight: number
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onWheel: (deltaY: number) => void
  dragBoundFunc: (pos: { x: number; y: number }) => { x: number; y: number }
  stageRef?: React.RefObject<any>
  editable?: boolean // 是否可编辑（缩放、旋转）
  allowDrag?: boolean // 是否允许拖拽移动
}

function KonvaCanvas({
  image,
  stageSize,
  imageAttrs,
  styleType,
  effectiveX,
  effectiveY,
  effectiveWidth,
  effectiveHeight,
  onDragMove,
  onDragEnd,
  onWheel,
  dragBoundFunc,
  stageRef,
  editable = true,
  allowDrag = true,
}: KonvaCanvasProps) {
  const [konvaComponents, setKonvaComponents] = useState<{
    Stage: any
    Layer: any
    Image: any
    Rect: any
  } | null>(null)

  // 动态加载 react-konva
  useEffect(() => {
    import('react-konva').then((mod) => {
      setKonvaComponents({
        Stage: mod.Stage,
        Layer: mod.Layer,
        Image: mod.Image,
        Rect: mod.Rect,
      })
    })
  }, [])

  if (!konvaComponents) {
    return (
      <div 
        style={{ width: stageSize.width, height: stageSize.height }}
        className="bg-gray-100 flex items-center justify-center"
      >
        <span className="text-gray-400">加载中...</span>
      </div>
    )
  }

  const { Stage, Layer, Image: KonvaImage, Rect } = konvaComponents

  return (
    <Stage
      ref={stageRef}
      width={stageSize.width}
      height={stageSize.height}
      onWheel={(e: any) => {
        if (!editable) {
          e.evt.preventDefault()
          return
        }
        e.evt.preventDefault()
        onWheel(e.evt.deltaY)
      }}
    >
      <Layer>
        {/* 背景 */}
        <Rect
          x={0}
          y={0}
          width={stageSize.width}
          height={stageSize.height}
          fill="white"
        />
        
        {/* 图片 */}
        <KonvaImage
          image={image}
          x={imageAttrs.x}
          y={imageAttrs.y}
          scaleX={imageAttrs.scaleX}
          scaleY={imageAttrs.scaleY}
          rotation={imageAttrs.rotation}
          offsetX={imageAttrs.offsetX}
          offsetY={imageAttrs.offsetY}
          draggable={allowDrag}
          dragBoundFunc={allowDrag ? dragBoundFunc : undefined}
          onDragMove={allowDrag ? (e: any) => {
            onDragMove(e.target.x(), e.target.y())
          } : undefined}
          onDragEnd={allowDrag ? (e: any) => {
            onDragEnd(e.target.x(), e.target.y())
          } : undefined}
        />
        
        {/* 居中裁剪模式的出血线遮罩（红色半透明区域表示会被裁切的部分） */}
        {styleType === 'cover' && (
          <>
            {/* 出血区域指示 - 这里可以根据需要添加 */}
          </>
        )}
        
        {/* 留白模式的白色边框 */}
        {styleType === 'lomo' && (
          <>
            <Rect x={0} y={0} width={effectiveX} height={stageSize.height} fill="white" />
            <Rect x={stageSize.width - effectiveX} y={0} width={effectiveX} height={stageSize.height} fill="white" />
            <Rect x={effectiveX} y={0} width={effectiveWidth} height={effectiveY} fill="white" />
            <Rect x={effectiveX} y={stageSize.height - effectiveY} width={effectiveWidth} height={effectiveY} fill="white" />
          </>
        )}
      </Layer>
    </Stage>
  )
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
    if (photoData.transform?.styleType) return photoData.transform.styleType
    if (photoData.editState?.mode) return photoData.editState.mode
    return 'cover'
  }
  
  const [mode, setMode] = useState<EditMode>(getInitialMode())
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: 300, height: 400 })
  const [imageAttrs, setImageAttrs] = useState<ImageAttrs>({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)

  // 计算相纸比例
  const aspectRatio = canvasWidth / canvasHeight

  // 客户端渲染检测
  useEffect(() => {
    setIsClient(true)
  }, [])

  // 加载图片
  useEffect(() => {
    const originalUrl = photoData.thumbnailUrl || photoData.originalUrl
    if (!originalUrl) return
    
    // 使用编辑页压缩配置
    const imageUrl = getEditImageUrl(originalUrl)
    
    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.onerror = () => {
      // 如果压缩后的 URL 加载失败，降级使用原图
      if (imageUrl !== originalUrl) {
        const fallbackImg = document.createElement('img')
        fallbackImg.crossOrigin = 'anonymous'
        fallbackImg.onload = () => setImage(fallbackImg)
        fallbackImg.src = originalUrl
      }
    }
    img.src = imageUrl
    
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [photoData.thumbnailUrl, photoData.originalUrl])

  // 计算容器尺寸
  useEffect(() => {
    if (!containerRef.current) return
    
    const updateSize = () => {
      const container = containerRef.current
      if (!container) return
      
      const containerWidth = container.offsetWidth
      const containerHeight = containerWidth / aspectRatio
      
      setStageSize({
        width: containerWidth,
        height: containerHeight,
      })
    }
    
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [aspectRatio])

  // 稳定化 transform 引用，避免无限循环
  const transformKey = useMemo(() => {
    if (!photoData.transform) return null
    // 使用关键字段创建唯一标识
    return JSON.stringify({
      styleType: photoData.transform.styleType,
      outputWidth: photoData.transform.outputWidth,
      outputHeight: photoData.transform.outputHeight,
      sourceWidth: photoData.transform.sourceWidth,
      sourceHeight: photoData.transform.sourceHeight,
      rotateAngle: photoData.transform.rotateAngle,
      scale: photoData.transform.scale,
      translateX: photoData.transform.translateX,
      translateY: photoData.transform.translateY,
    })
  }, [
    photoData.transform?.styleType,
    photoData.transform?.outputWidth,
    photoData.transform?.outputHeight,
    photoData.transform?.sourceWidth,
    photoData.transform?.sourceHeight,
    photoData.transform?.rotateAngle,
    photoData.transform?.scale,
    photoData.transform?.translateX,
    photoData.transform?.translateY,
  ])

  // 使用 ref 跟踪上一次的值，避免不必要的更新
  const prevValuesRef = useRef<{
    image: HTMLImageElement | null
    stageSize: { width: number; height: number }
    mode: EditMode
    transformKey: string | null
    autoRotated: boolean | undefined
  }>({
    image: null,
    stageSize: { width: 0, height: 0 },
    mode: 'cover',
    transformKey: null,
    autoRotated: undefined,
  })

  // 使用单独的 ref 跟踪上一次的 attrs
  const prevAttrsRef = useRef<ImageAttrs | null>(null)

  // 初始化图片位置和缩放
  useEffect(() => {
    if (!image || !stageSize.width || !stageSize.height) return
    
    // 检查是否真的需要更新
    const prev = prevValuesRef.current
    if (
      prev.image === image &&
      prev.stageSize.width === stageSize.width &&
      prev.stageSize.height === stageSize.height &&
      prev.mode === mode &&
      prev.transformKey === transformKey &&
      prev.autoRotated === photoData.autoRotated
    ) {
      return // 没有变化，不需要更新
    }
    
    // 更新 ref
    prevValuesRef.current = {
      image,
      stageSize,
      mode,
      transformKey,
      autoRotated: photoData.autoRotated,
    }
    
    // 只有在相同模式下才使用保存的 transform，否则重新计算
    const shouldUseTransform = photoData.transform && 
      photoData.transform.styleType === mode
    
    const attrs = calculateInitialAttrs(
      image,
      stageSize,
      mode,
      shouldUseTransform ? photoData.transform : undefined,
      photoData.autoRotated
    )
    
    // 比较新旧 attrs 是否相同，避免不必要的状态更新
    const prevAttrs = prevAttrsRef.current
    if (prevAttrs &&
        prevAttrs.x === attrs.x &&
        prevAttrs.y === attrs.y &&
        prevAttrs.scaleX === attrs.scaleX &&
        prevAttrs.scaleY === attrs.scaleY &&
        prevAttrs.rotation === attrs.rotation &&
        prevAttrs.offsetX === attrs.offsetX &&
        prevAttrs.offsetY === attrs.offsetY) {
      return // attrs 没有变化，不需要更新
    }
    
    // 更新 attrs ref
    prevAttrsRef.current = attrs
    
    setImageAttrs(attrs)
    setHasChanges(false)
  }, [image, stageSize, mode, transformKey, photoData.transform, photoData.autoRotated])

  // 模式改变时重新计算
  const handleModeChange = useCallback((newMode: EditMode) => {
    if (!image || !stageSize.width) return
    
    setMode(newMode)
    
    // 重新计算初始属性（不使用保存的transform）
    const attrs = calculateInitialAttrs(
      image,
      stageSize,
      newMode,
      undefined, // 不使用保存的transform
      photoData.autoRotated
    )
    setImageAttrs(attrs)
    setHasChanges(true)
  }, [image, stageSize, photoData.autoRotated])

  // 获取最小缩放比例
  const getMinScaleValue = useCallback(() => {
    if (!image || !stageSize.width) return 0.1
    return getMinScale(image, stageSize, mode, imageAttrs.rotation)
  }, [image, stageSize, mode, imageAttrs.rotation])

  // 限制位置
  const constrainPositionValue = useCallback((x: number, y: number, scale: number, rotation: number) => {
    if (!image || !stageSize.width) return { x, y }
    return constrainPosition(x, y, scale, rotation, image, stageSize, mode)
  }, [image, stageSize, mode])

  // 创建 dragBoundFunc
  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    return constrainPositionValue(pos.x, pos.y, imageAttrs.scaleX, imageAttrs.rotation)
  }, [constrainPositionValue, imageAttrs.scaleX, imageAttrs.rotation])

  // 处理拖拽
  const handleDragMove = useCallback((x: number, y: number) => {
    const constrained = constrainPositionValue(x, y, imageAttrs.scaleX, imageAttrs.rotation)
    setImageAttrs(prev => ({
      ...prev,
      x: constrained.x,
      y: constrained.y,
    }))
    setHasChanges(true)
  }, [constrainPositionValue, imageAttrs.scaleX, imageAttrs.rotation])

  const handleDragEnd = useCallback((x: number, y: number) => {
    const constrained = constrainPositionValue(x, y, imageAttrs.scaleX, imageAttrs.rotation)
    setImageAttrs(prev => ({
      ...prev,
      x: constrained.x,
      y: constrained.y,
    }))
  }, [constrainPositionValue, imageAttrs.scaleX, imageAttrs.rotation])

  // 处理滚轮缩放
  const handleWheel = useCallback((deltaY: number) => {
    if (!image) return
    
    const scaleBy = 1.05
    const minScale = getMinScaleValue()
    const maxScale = minScale * 5
    
    let newScale = deltaY < 0 
      ? imageAttrs.scaleX * scaleBy 
      : imageAttrs.scaleX / scaleBy
    
    newScale = Math.max(minScale, Math.min(maxScale, newScale))
    
    const constrained = constrainPositionValue(
      imageAttrs.x, 
      imageAttrs.y, 
      newScale, 
      imageAttrs.rotation
    )
    
    setImageAttrs(prev => ({
      ...prev,
      scaleX: newScale,
      scaleY: newScale,
      x: constrained.x,
      y: constrained.y,
    }))
    setHasChanges(true)
  }, [imageAttrs, getMinScaleValue, constrainPositionValue, image])


  // 规范化旋转角度到 0/90/180/270
  const normalizeRotation = (angle: number): number => {
    // 将角度规范化到 0-360 范围
    let normalized = ((angle % 360) + 360) % 360
    // 四舍五入到最近的 90 度倍数
    return Math.round(normalized / 90) * 90
  }

  // 保存
  const handleSave = useCallback(() => {
    if (!image) return
    
    // 规范化旋转角度到 0/90/180/270
    const rotateAngle = normalizeRotation(imageAttrs.rotation)
    
    // 提取简单参数
    const scale = imageAttrs.scaleX // 等比例缩放（scaleX 和 scaleY 应该相等）
    const translateX = imageAttrs.x // X平移
    const translateY = imageAttrs.y // Y平移
    
    // 计算有效区域的左上角坐标（画布坐标系）
    const margin = mode === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
    const canvasX = mode === 'lomo' ? stageSize.width * margin : 0
    const canvasY = mode === 'lomo' ? stageSize.height * margin : 0
    
    // 计算 offsetX 和 offsetY：将画布有效区域左上角转换到原图坐标系
    // 注意：Konva 的旋转中心是图片中心（通过 offsetX 和 offsetY 设置）
    // 图片中心在画布上的位置就是 (translateX, translateY)
    
    // 1. 将画布坐标转换为相对于图片中心的坐标（画布坐标系）
    const centerRelativeX = canvasX - translateX
    const centerRelativeY = canvasY - translateY
    
    // 2. 应用逆旋转（将画布坐标系转换回原图坐标系）
    const rad = (-rotateAngle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const rotatedX = centerRelativeX * cos - centerRelativeY * sin
    const rotatedY = centerRelativeX * sin + centerRelativeY * cos
    
    // 3. 应用逆缩放，得到相对于图片中心的原图坐标
    const scaledX = rotatedX / scale
    const scaledY = rotatedY / scale
    
    // 4. 转换为相对于图片左上角的原图坐标
    const imageCenterX = image.width / 2
    const imageCenterY = image.height / 2
    const offsetX = scaledX + imageCenterX
    const offsetY = scaledY + imageCenterY
    
    // 获取原图地址
    const originalUrl = photoData.originalUrl || photoData.thumbnailUrl || ''
    
    // lomo 和 full 模式不需要裁剪信息（cropInfo），但仍需要 transform 用于前端回显
    if (mode === 'lomo' || mode === 'full') {
      // 对于 lomo 和 full 模式，创建一个只包含 styleType 的 transform，用于前端回显
      // 服务端会根据 cropMode 自动处理，不需要裁剪参数（cropInfo）
      const transformForDisplay: PhotoTransform = {
        outputWidth: stageSize.width,
        outputHeight: stageSize.height,
        sourceWidth: image.width,
        sourceHeight: image.height,
        styleType: mode,
        originalUrl,
      }
      onSave(transformForDisplay, undefined)
      return
    }
    
    // cover 模式需要裁剪信息
    // 为了兼容性，仍然计算矩阵（但服务端可以优先使用简单参数）
    const matrix = imageAttrsToMatrix(imageAttrs)
    
    // 生成 transform（用于前端回显，不包含服务端处理相关的字段）
    const transform: PhotoTransform = {
      // 兼容旧版本的矩阵
      matrix,
      // 输出尺寸（前端显示尺寸）
      outputWidth: stageSize.width,
      outputHeight: stageSize.height,
      // 原图尺寸
      sourceWidth: image.width,
      sourceHeight: image.height,
      // 样式类型
      styleType: mode,
      // 变换参数（用于前端回显）
      rotateAngle,
      scale,
      translateX,
      translateY,
      originalUrl,
    }
    
    // 生成 cropInfo（用于服务端处理，只包含服务端需要的字段）
    const cropInfo: CropInfo = {
      canvasWidth,
      canvasHeight,
      sourceWidth: image.width,
      sourceHeight: image.height,
      offsetX,
      offsetY,
      rotateAngle,
      originalUrl,
      styleType: mode,
    }
    
    onSave(transform, cropInfo)
  }, [image, imageAttrs, stageSize, mode, photoData.originalUrl, photoData.thumbnailUrl, onSave])

  // 下载编辑后的图片
  const handleDownload = useCallback(async () => {
    if (!image || !stageRef.current) return
    
    setIsDownloading(true)
    try {
      const stage = stageRef.current
      
      // 导出整个 Stage
      const fullDataURL = stage.toDataURL({
        pixelRatio: 2, // 提高清晰度
        mimeType: 'image/png',
        quality: 1,
      })
      
      let finalDataURL = fullDataURL
      let downloadWidth = stageSize.width * 2 // pixelRatio = 2
      let downloadHeight = stageSize.height * 2
      
      // 如果是留白模式，裁剪掉白边，只保留有效区域
      if (mode === 'lomo') {
        const margin = WHITE_MARGIN_PERCENT / 100
        const marginX = stageSize.width * margin * 2 // 考虑 pixelRatio
        const marginY = stageSize.height * margin * 2
        const effectiveWidth = stageSize.width * (1 - margin * 2) * 2
        const effectiveHeight = stageSize.height * (1 - margin * 2) * 2
        
        // 创建临时 Canvas 来裁剪
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = effectiveWidth
        tempCanvas.height = effectiveHeight
        const tempCtx = tempCanvas.getContext('2d')
        
        if (tempCtx) {
          // 加载完整图片
          const fullImg = new Image()
          await new Promise((resolve, reject) => {
            fullImg.onload = resolve
            fullImg.onerror = reject
            fullImg.src = fullDataURL
          })
          
          // 只绘制有效区域（裁剪掉白边）
          tempCtx.drawImage(
            fullImg,
            marginX, // 源图片的起始 x
            marginY, // 源图片的起始 y
            effectiveWidth, // 裁剪宽度
            effectiveHeight, // 裁剪高度
            0, // 目标 x
            0, // 目标 y
            effectiveWidth, // 目标宽度
            effectiveHeight // 目标高度
          )
          
          finalDataURL = tempCanvas.toDataURL('image/png', 1.0)
          downloadWidth = effectiveWidth
          downloadHeight = effectiveHeight
        }
      }
      
      // 创建下载链接
      const link = document.createElement('a')
      link.download = `edited-${mode}${mode === 'lomo' ? '-no-border' : ''}-${Date.now()}.png`
      link.href = finalDataURL
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      console.log('图片已下载:', {
        mode,
        stageSize,
        downloadSize: { width: downloadWidth, height: downloadHeight },
        imageAttrs,
        hasWhiteBorder: mode === 'lomo' ? '已裁剪' : '无白边',
      })
    } catch (error) {
      console.error('下载图片失败:', error)
      alert('下载失败，请重试')
    } finally {
      setIsDownloading(false)
    }
  }, [image, mode, stageSize, imageAttrs])

  // 计算有效区域
  const margin = mode === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
  const effectiveX = stageSize.width * margin
  const effectiveY = stageSize.height * margin
  const effectiveWidth = stageSize.width * (1 - margin * 2)
  const effectiveHeight = stageSize.height * (1 - margin * 2)

  // cover 模式允许移动图片，但禁止放大缩小和旋转
  // full 和 lomo 模式完全禁止编辑
  const isEditable = false // 禁止缩放和旋转
  const allowDrag = mode === 'cover' // cover 模式允许拖拽移动

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 下载按钮 */}
      <button
        onClick={handleDownload}
        disabled={isDownloading || !image}
        className="absolute top-4 left-4 z-50 w-10 h-10 bg-gray-800/80 hover:bg-gray-700/80 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="下载编辑后的图片"
      >
        {isDownloading ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        ) : (
          <Download className="w-5 h-5 text-white" />
        )}
      </button>

      {/* 提示信息 */}
      <div className="px-4 py-3 pt-16">
        <div className="flex items-center justify-center gap-2 text-sm">
          <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="text-blue-400">
            {mode === 'cover' ? '居中裁剪模式：可拖拽移动图片位置，禁止缩放和旋转' : 
             mode === 'full' ? '打印整图模式：图片完整显示，不可编辑' : 
             '四周留白模式：图片完整显示，不可编辑'}
          </span>
        </div>
        {mode === 'cover' && (
          <p className="text-center text-red-400 text-sm mt-1">超出边框部分将被裁剪</p>
        )}
      </div>

      {/* Konva 编辑区域 */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="relative w-full max-w-lg">
          <div 
            ref={containerRef}
            className="relative w-full bg-white shadow-2xl overflow-hidden"
            style={{ paddingTop: `${(1 / aspectRatio) * 100}%` }}
          >
            <div className="absolute inset-0">
              {isClient && image && (
                <KonvaCanvas
                  image={image}
                  stageSize={stageSize}
                  imageAttrs={imageAttrs}
                  styleType={mode}
                  effectiveX={effectiveX}
                  effectiveY={effectiveY}
                  effectiveWidth={effectiveWidth}
                  effectiveHeight={effectiveHeight}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                  onWheel={handleWheel}
                  dragBoundFunc={dragBoundFunc}
                  stageRef={stageRef}
                  editable={isEditable}
                  allowDrag={allowDrag}
                />
              )}
            </div>
          </div>
          
          {/* 裁剪区域边框指示 */}
          {mode === 'cover' && (
            <div className="absolute inset-0 pointer-events-none" style={{ top: 0 }}>
              <div 
                className="absolute border-2 border-red-500 border-dashed"
                style={{
                  top: `${(1 - effectiveHeight / stageSize.height) / 2 * 100}%`,
                  left: `${(1 - effectiveWidth / stageSize.width) / 2 * 100}%`,
                  right: `${(1 - effectiveWidth / stageSize.width) / 2 * 100}%`,
                  bottom: `${(1 - effectiveHeight / stageSize.height) / 2 * 100}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* 左侧裁剪提示 */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 text-xs">
          <span>✂</span>
          <span className="writing-mode-vertical">裁剪区域</span>
          <span>✂</span>
        </div>

        {/* 右侧裁剪提示 */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 text-xs">
          <span>✂</span>
          <span className="writing-mode-vertical">裁剪区域</span>
          <span>✂</span>
        </div>
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
            disabled={mode === 'full'}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${
              mode === 'full'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${mode === 'full' ? 'cursor-default' : ''}`}
            title={mode === 'full' ? '打印整图模式不可编辑' : '切换到打印整图模式'}
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
            disabled={mode === 'lomo'}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 text-sm ${
              mode === 'lomo'
                ? 'bg-pink-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${mode === 'lomo' ? 'cursor-default' : ''}`}
            title={mode === 'lomo' ? '四周留白模式不可编辑' : '切换到四周留白模式'}
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
