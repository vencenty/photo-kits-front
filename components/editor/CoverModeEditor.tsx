'use client'

import { useState, useCallback, useMemo } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { buildOssCropUrl, SimpleCropInfo } from '@/lib/image-config'

interface CoverModeEditorProps {
  imageUrl: string
  imageId: string
  sourceWidth: number   // 原图宽度（用于计算真实裁剪坐标）
  sourceHeight: number  // 原图高度（用于计算真实裁剪坐标）
  paperAspectRatio: number
  imageCompressOptions: { quality: number; format: string; interlace: number }
  onCropChange: (cropInfo: SimpleCropInfo | null, outputUrl: string) => void
  /** 初始裁剪信息（用于恢复之前的裁剪位置） */
  initialCropInfo?: SimpleCropInfo | null
  /** 编辑用缩略图短边尺寸（默认 800px，加载更快） */
  thumbnailShortEdge?: number
}

/**
 * 计算 cover 模式下的裁剪尺寸
 */
function calculateCoverCropSize(
  sourceWidth: number,
  sourceHeight: number,
  paperRatio: number
) {
  const imageRatio = sourceWidth / sourceHeight
  if (imageRatio > paperRatio) {
    return {
      cropWidth: sourceHeight * paperRatio,
      cropHeight: sourceHeight,
    }
  }
  return {
    cropWidth: sourceWidth,
    cropHeight: sourceWidth / paperRatio,
  }
}

/**
 * Cover 模式编辑器 - 居中裁剪
 * 使用 react-easy-crop 实现拖拽裁剪
 */
export function CoverModeEditor({
  imageUrl,
  imageId,
  sourceWidth,
  sourceHeight,
  paperAspectRatio,
  imageCompressOptions,
  onCropChange,
  initialCropInfo,
  thumbnailShortEdge = 800,  // 默认短边 800px，平衡清晰度和加载速度
}: CoverModeEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null)

  // 根据图片方向动态调整裁剪框比例（提前计算，供后面使用）
  const cropAspectRatio = useMemo(() => {
    if (!sourceWidth || !sourceHeight) return paperAspectRatio
    const imageRatio = sourceWidth / sourceHeight
    const isImageLandscape = imageRatio > 1
    const isPaperLandscape = paperAspectRatio > 1
    // 如果图片和相纸方向不一致，反转相纸比例
    if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
      return 1 / paperAspectRatio
    }
    return paperAspectRatio
  }, [sourceWidth, sourceHeight, paperAspectRatio])

  // 用于恢复之前的裁剪位置（官方推荐使用百分比坐标）
  // 如果没有保存的位置，计算默认居中的百分比坐标
  const initialCroppedAreaPercentages = useMemo(() => {
    // 优先使用保存的百分比坐标
    if (initialCropInfo?.croppedAreaPercent) {
      return initialCropInfo.croppedAreaPercent
    }
    
    // 没有保存的位置时，计算默认居中的百分比坐标
    if (sourceWidth && sourceHeight) {
      const { cropWidth, cropHeight } = calculateCoverCropSize(sourceWidth, sourceHeight, cropAspectRatio)
      const offsetX = (sourceWidth - cropWidth) / 2
      const offsetY = (sourceHeight - cropHeight) / 2
      return {
        x: (offsetX / sourceWidth) * 100,
        y: (offsetY / sourceHeight) * 100,
        width: (cropWidth / sourceWidth) * 100,
        height: (cropHeight / sourceHeight) * 100,
      }
    }
    
    return undefined
  }, [initialCropInfo, sourceWidth, sourceHeight, cropAspectRatio])

  // 生成唯一 key，确保在 imageId 或 initialCropInfo 变化时组件重新挂载
  const cropperKey = useMemo(() => {
    if (initialCropInfo?.croppedAreaPercent) {
      const { x, y } = initialCropInfo.croppedAreaPercent
      return `cropper-${imageId}-${x.toFixed(2)}-${y.toFixed(2)}`
    }
    // 没有保存的位置时，使用 imageId 作为 key，确保切换图片时重新渲染
    return `cropper-${imageId}-center`
  }, [imageId, initialCropInfo])

  const onCropComplete = useCallback((area: Area, areaPixels: Area) => {
    setCroppedAreaPercent(area)
    setCroppedAreaPixels(areaPixels)

    // 🎯 关键：使用百分比坐标计算原图的像素坐标
    // 这样无论在缩略图还是原图上操作，得到的原图裁剪坐标都是准确的
    const offsetX = Math.round((area.x / 100) * sourceWidth)
    const offsetY = Math.round((area.y / 100) * sourceHeight)
    const cropWidth = Math.round((area.width / 100) * sourceWidth)
    const cropHeight = Math.round((area.height / 100) * sourceHeight)

    // 生成裁剪信息（基于原图尺寸）
    const cropInfo: SimpleCropInfo = {
      offsetX,
      offsetY,
      cropWidth,
      cropHeight,
      sourceWidth,
      sourceHeight,
      styleType: 'cover',
      croppedAreaPercent: area,
    }
    const outputUrl = buildOssCropUrl(imageUrl, cropInfo)
    onCropChange(cropInfo, outputUrl)
  }, [imageUrl, sourceWidth, sourceHeight, onCropChange])

  const cropperStyle = useMemo(() => ({
    containerStyle: { backgroundColor: 'black' },
    mediaStyle: { backgroundColor: '#ffffff' },
    cropAreaStyle: { 
      // 斜线条纹警示边框（斑马线效果）
      border: '8px solid transparent',
      borderImage: `repeating-linear-gradient(
        -45deg,
        #ef4444,
        #ef4444 2px,
        rgba(239, 68, 68, 0.2) 2px,
        rgba(239, 68, 68, 0.2) 4px
      ) 8`,
    },
  }), [])

  // 获取默认裁剪信息（用于首次保存时还没有拖动的情况）
  const getDefaultCropInfo = useCallback((): SimpleCropInfo => {
    if (croppedAreaPixels && croppedAreaPercent) {
      return {
        offsetX: Math.round(croppedAreaPixels.x),
        offsetY: Math.round(croppedAreaPixels.y),
        cropWidth: Math.round(croppedAreaPixels.width),
        cropHeight: Math.round(croppedAreaPixels.height),
        sourceWidth,
        sourceHeight,
        styleType: 'cover',
        croppedAreaPercent,
      }
    }
    // 默认居中裁剪
    const { cropWidth, cropHeight } = calculateCoverCropSize(sourceWidth, sourceHeight, cropAspectRatio)
    const offsetX = (sourceWidth - cropWidth) / 2
    const offsetY = (sourceHeight - cropHeight) / 2
    return {
      offsetX: Math.round(offsetX),
      offsetY: Math.round(offsetY),
      cropWidth: Math.round(cropWidth),
      cropHeight: Math.round(cropHeight),
      sourceWidth,
      sourceHeight,
      styleType: 'cover',
    }
  }, [croppedAreaPixels, croppedAreaPercent, sourceWidth, sourceHeight, cropAspectRatio])

  // 构建编辑用缩略图 URL（短边缩放 + 质量压缩）
  const thumbnailUrl = useMemo(() => {
    return buildOssCropUrl(imageUrl, undefined, {
      shortWidth: thumbnailShortEdge,
      ...imageCompressOptions,
    })
  }, [imageUrl, thumbnailShortEdge, imageCompressOptions])

  return (
    <Cropper
      key={cropperKey}
      image={thumbnailUrl}
      crop={crop}
      zoom={zoom}
      aspect={cropAspectRatio}
      minZoom={1}
      maxZoom={1}
      restrictPosition
      showGrid
      objectFit="contain"
      onCropChange={setCrop}
      onZoomChange={setZoom}
      onCropComplete={onCropComplete}
      style={cropperStyle}
      initialCroppedAreaPercentages={initialCroppedAreaPercentages}
    />
  )
}

// 导出工具函数供外部使用
export { calculateCoverCropSize }
