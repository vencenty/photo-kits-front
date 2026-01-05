'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  PhotoTransform, 
  parseAffineMatrix, 
  createAffineMatrix,
  AffineMatrix,
} from '@/lib/store'

// 配置常量
const WHITE_MARGIN_PERCENT = 5 // 留白边框百分比

/**
 * 图片属性（Konva 格式）
 */
export interface ImageAttrs {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  offsetX: number
  offsetY: number
}

export type StyleType = 'center' | 'full' | 'lomo'

interface PhotoCanvasProps {
  /** 图片URL */
  imageUrl: string
  /** 图片原始尺寸 */
  imageSize: { width: number; height: number }
  /** 画布尺寸 */
  stageSize: { width: number; height: number }
  /** 样式类型 */
  styleType: StyleType
  /** 已保存的变换信息 */
  transform?: PhotoTransform
  /** 是否自动旋转（横图转竖图） */
  autoRotated?: boolean
  /** 是否可编辑（可拖拽、缩放） */
  editable?: boolean
  /** 变换改变回调 */
  onTransformChange?: (attrs: ImageAttrs, hasChanges: boolean) => void
  /** 点击回调（用于列表页进入编辑） */
  onClick?: () => void
}

/**
 * 计算初始图片属性
 */
function calculateInitialAttrs(
  image: HTMLImageElement,
  stageSize: { width: number; height: number },
  styleType: StyleType,
  transform?: PhotoTransform,
  autoRotated?: boolean
): ImageAttrs {
  const imgWidth = image.width
  const imgHeight = image.height
  
  // 如果有保存的变换，恢复它
  if (transform) {
    const savedStyleType = transform.styleType || styleType
    const margin = savedStyleType === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
    
    const { scaleX: savedScaleX, scaleY: savedScaleY, rotation, tx: savedTx, ty: savedTy } = parseAffineMatrix(transform.matrix)
    
    // 计算画布尺寸比例
    const scaleRatio = stageSize.width / transform.outputWidth
    
    // 计算图片尺寸变化的比例
    const imageSizeRatioX = transform.sourceWidth / imgWidth
    const imageSizeRatioY = transform.sourceHeight / imgHeight
    
    // 最终缩放 = 保存时的缩放 * 图片尺寸比例 * 画布尺寸比例
    const finalScaleX = savedScaleX * imageSizeRatioX * scaleRatio
    const finalScaleY = savedScaleY * imageSizeRatioY * scaleRatio
    
    return {
      x: savedTx * scaleRatio,
      y: savedTy * scaleRatio,
      scaleX: finalScaleX,
      scaleY: finalScaleY,
      rotation,
      offsetX: imgWidth / 2,
      offsetY: imgHeight / 2,
    }
  }
  
  // 没有transform时，使用传入的styleType进行初始化
  const margin = styleType === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
  const effectiveWidth = stageSize.width * (1 - margin * 2)
  const effectiveHeight = stageSize.height * (1 - margin * 2)
  const marginX = stageSize.width * margin
  const marginY = stageSize.height * margin
  
  // 计算初始缩放
  const initialRotation = autoRotated ? 90 : 0
  const rad = (initialRotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const rotatedWidth = imgWidth * cos + imgHeight * sin
  const rotatedHeight = imgWidth * sin + imgHeight * cos
  
  let scale: number
  if (styleType === 'lomo') {
    // 留白模式：照片完整显示
    scale = Math.min(effectiveWidth / rotatedWidth, effectiveHeight / rotatedHeight)
  } else if (styleType === 'full') {
    // 打印整图：照片完整显示（contain）
    scale = Math.min(stageSize.width / rotatedWidth, stageSize.height / rotatedHeight)
  } else {
    // 居中裁剪：照片覆盖整个画布（cover）
    scale = Math.max(stageSize.width / rotatedWidth, stageSize.height / rotatedHeight)
  }
  
  const centerX = marginX + effectiveWidth / 2
  const centerY = marginY + effectiveHeight / 2
  
  return {
    x: styleType === 'lomo' ? centerX : stageSize.width / 2,
    y: styleType === 'lomo' ? centerY : stageSize.height / 2,
    scaleX: scale,
    scaleY: scale,
    rotation: initialRotation,
    offsetX: imgWidth / 2,
    offsetY: imgHeight / 2,
  }
}

/**
 * 计算边界约束 - 确保图片不会超出裁剪框
 */
function constrainPosition(
  x: number,
  y: number,
  scale: number,
  rotation: number,
  image: HTMLImageElement,
  stageSize: { width: number; height: number },
  styleType: StyleType
): { x: number; y: number } {
  const margin = styleType === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
  const effectiveWidth = stageSize.width * (1 - margin * 2)
  const effectiveHeight = stageSize.height * (1 - margin * 2)
  const marginX = stageSize.width * margin
  const marginY = stageSize.height * margin
  
  const rad = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const scaledWidth = (image.width * cos + image.height * sin) * scale
  const scaledHeight = (image.width * sin + image.height * cos) * scale
  
  const centerX = marginX + effectiveWidth / 2
  const centerY = marginY + effectiveHeight / 2
  
  // 计算图片可以移动的最大偏移量
  const maxOffsetX = Math.max(0, (scaledWidth - effectiveWidth) / 2)
  const maxOffsetY = Math.max(0, (scaledHeight - effectiveHeight) / 2)
  
  return {
    x: Math.max(centerX - maxOffsetX, Math.min(centerX + maxOffsetX, x)),
    y: Math.max(centerY - maxOffsetY, Math.min(centerY + maxOffsetY, y)),
  }
}

/**
 * 计算最小缩放比例
 */
function getMinScale(
  image: HTMLImageElement,
  stageSize: { width: number; height: number },
  styleType: StyleType,
  rotation: number
): number {
  const margin = styleType === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
  const effectiveWidth = stageSize.width * (1 - margin * 2)
  const effectiveHeight = stageSize.height * (1 - margin * 2)
  
  const rad = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const rotatedWidth = image.width * cos + image.height * sin
  const rotatedHeight = image.width * sin + image.height * cos
  
  if (styleType === 'lomo' || styleType === 'full') {
    // 留白/整图模式：最小缩放为照片完整显示
    return Math.min(effectiveWidth / rotatedWidth, effectiveHeight / rotatedHeight)
  } else {
    // 居中裁剪模式：最小缩放为照片完全覆盖画布
    return Math.max(effectiveWidth / rotatedWidth, effectiveHeight / rotatedHeight)
  }
}

/**
 * 共享的照片 Canvas 组件
 */
export function PhotoCanvas({
  imageUrl,
  imageSize,
  stageSize,
  styleType,
  transform,
  autoRotated,
  editable = false,
  onTransformChange,
  onClick,
}: PhotoCanvasProps) {
  const [konvaComponents, setKonvaComponents] = useState<{
    Stage: any
    Layer: any
    Image: any
    Rect: any
  } | null>(null)
  
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageAttrs, setImageAttrs] = useState<ImageAttrs | null>(null)

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

  // 加载图片
  useEffect(() => {
    if (!imageUrl) return
    
    const img = document.createElement('img')
    
    // 只对非 data URL 设置跨域（data URL 不需要跨域）
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    
    img.onload = () => {
      setImage(img)
    }
    
    img.onerror = (e) => {
      console.error('图片加载失败:', imageUrl, e)
      // 如果跨域失败，尝试不设置 crossOrigin 重新加载
      if (img.crossOrigin) {
        const retryImg = document.createElement('img')
        retryImg.onload = () => setImage(retryImg)
        retryImg.onerror = () => console.error('图片重试加载也失败:', imageUrl)
        retryImg.src = imageUrl
      }
    }
    
    img.src = imageUrl
    
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl])

  // 计算图片属性
  useEffect(() => {
    if (!image || !stageSize.width || !stageSize.height) return
    
    const attrs = calculateInitialAttrs(image, stageSize, styleType, transform, autoRotated)
    setImageAttrs(attrs)
  }, [image, stageSize.width, stageSize.height, styleType, transform, autoRotated])

  // 创建 dragBoundFunc - 实时约束拖拽位置
  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    if (!image || !imageAttrs) return pos
    return constrainPosition(
      pos.x,
      pos.y,
      imageAttrs.scaleX,
      imageAttrs.rotation,
      image,
      stageSize,
      styleType
    )
  }, [image, imageAttrs, stageSize, styleType])

  // 处理拖拽
  const handleDragMove = useCallback((e: any) => {
    if (!editable || !image || !imageAttrs) return
    
    const constrained = constrainPosition(
      e.target.x(),
      e.target.y(),
      imageAttrs.scaleX,
      imageAttrs.rotation,
      image,
      stageSize,
      styleType
    )
    
    const newAttrs = { ...imageAttrs, x: constrained.x, y: constrained.y }
    setImageAttrs(newAttrs)
    onTransformChange?.(newAttrs, true)
  }, [editable, image, imageAttrs, stageSize, styleType, onTransformChange])

  // 处理滚轮缩放
  const handleWheel = useCallback((e: any) => {
    if (!editable || !image || !imageAttrs) return
    
    e.evt.preventDefault()
    
    const scaleBy = 1.05
    const minScale = getMinScale(image, stageSize, styleType, imageAttrs.rotation)
    const maxScale = minScale * 5
    
    let newScale = e.evt.deltaY < 0 
      ? imageAttrs.scaleX * scaleBy 
      : imageAttrs.scaleX / scaleBy
    
    newScale = Math.max(minScale, Math.min(maxScale, newScale))
    
    const constrained = constrainPosition(
      imageAttrs.x,
      imageAttrs.y,
      newScale,
      imageAttrs.rotation,
      image,
      stageSize,
      styleType
    )
    
    const newAttrs = {
      ...imageAttrs,
      scaleX: newScale,
      scaleY: newScale,
      x: constrained.x,
      y: constrained.y,
    }
    
    setImageAttrs(newAttrs)
    onTransformChange?.(newAttrs, true)
  }, [editable, image, imageAttrs, stageSize, styleType, onTransformChange])

  // 计算有效区域
  const effectiveStyleType = transform?.styleType || styleType
  const margin = effectiveStyleType === 'lomo' ? WHITE_MARGIN_PERCENT / 100 : 0
  const effectiveX = stageSize.width * margin
  const effectiveY = stageSize.height * margin
  const effectiveWidth = stageSize.width * (1 - margin * 2)
  const effectiveHeight = stageSize.height * (1 - margin * 2)

  // 加载中状态
  if (!konvaComponents || !image || !imageAttrs) {
    return (
      <div 
        style={{ width: stageSize.width, height: stageSize.height }}
        className="bg-white flex items-center justify-center cursor-pointer"
        onClick={onClick}
      >
        <span className="text-gray-300 text-xs">加载中...</span>
      </div>
    )
  }

  const { Stage, Layer, Image: KonvaImage, Rect } = konvaComponents

  return (
    <Stage 
      width={stageSize.width} 
      height={stageSize.height}
      onWheel={editable ? handleWheel : undefined}
      onClick={onClick}
      onTap={onClick}
    >
      <Layer>
        {/* 背景 */}
        <Rect x={0} y={0} width={stageSize.width} height={stageSize.height} fill="white" />
        
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
          draggable={editable}
          dragBoundFunc={editable ? dragBoundFunc : undefined}
          onDragMove={editable ? handleDragMove : undefined}
        />
        
        {/* 留白模式的白色边框 */}
        {effectiveStyleType === 'lomo' && (
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

/**
 * 从 ImageAttrs 创建仿射矩阵
 */
export function imageAttrsToMatrix(attrs: ImageAttrs): AffineMatrix {
  return createAffineMatrix(
    attrs.scaleX,
    attrs.scaleY,
    attrs.rotation,
    attrs.x,
    attrs.y
  )
}

/**
 * 导出获取约束后的位置
 */
export { constrainPosition, getMinScale, calculateInitialAttrs }

