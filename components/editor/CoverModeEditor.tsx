'use client'

import { useState, useCallback, useMemo } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { buildOssCropUrl, SimpleCropInfo } from '@/lib/image-config'

interface CoverModeEditorProps {
  imageUrl: string
  imageId: string
  sourceWidth: number
  sourceHeight: number
  paperAspectRatio: number
  imageCompressOptions: { quality: number; format: string; interlace: number }
  onCropChange: (cropInfo: SimpleCropInfo | null, outputUrl: string) => void
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
}: CoverModeEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null)

  // 根据图片方向动态调整裁剪框比例
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

  const onCropComplete = useCallback((area: Area, areaPixels: Area) => {
    setCroppedAreaPercent(area)
    setCroppedAreaPixels(areaPixels)

    // 生成裁剪信息
    const cropInfo: SimpleCropInfo = {
      offsetX: Math.round(areaPixels.x),
      offsetY: Math.round(areaPixels.y),
      cropWidth: Math.round(areaPixels.width),
      cropHeight: Math.round(areaPixels.height),
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
    cropAreaStyle: { border: '3px dashed #ef4444' },
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

  return (
    <Cropper
      key={`cropper-${imageId}`}
      image={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
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
    />
  )
}

// 导出工具函数供外部使用
export { calculateCoverCropSize }
