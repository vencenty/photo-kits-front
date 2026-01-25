'use client'

import { useState, useCallback, useMemo } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { buildOssCropUrl } from '@/lib/image-config'

interface CoverModeEditorProps {
  imageUrl: string
  imageId: string
  sourceWidth: number
  sourceHeight: number
  paperAspectRatio: number
  onCropChange: (croppedAreaPercent: Area, croppedAreaPixels: Area) => void
}

/**
 * Cover 模式编辑器
 * - 使用 react-easy-crop 实现可拖拽裁剪
 * - 根据图片方向动态调整裁剪框比例
 */
export function CoverModeEditor({
  imageUrl,
  imageId,
  sourceWidth,
  sourceHeight,
  paperAspectRatio,
  onCropChange,
}: CoverModeEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

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

  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  const cropperStyle = useMemo(() => ({
    containerStyle: { backgroundColor: 'black' },
    mediaStyle: { backgroundColor: '#ffffff' },
    cropAreaStyle: { border: '3px dashed #ef4444' },
  }), [])

  const handleCropComplete = useCallback((area: Area, areaPixels: Area) => {
    onCropChange(area, areaPixels)
  }, [onCropChange])

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
      onCropComplete={handleCropComplete}
      style={cropperStyle}
    />
  )
}

/**
 * 计算 cover 模式下的裁剪尺寸（默认居中裁剪）
 */
export function calculateCoverCropSize(
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
 * 获取裁剪框比例（根据图片方向调整）
 */
export function getCropAspectRatio(
  sourceWidth: number,
  sourceHeight: number,
  paperAspectRatio: number
) {
  if (!sourceWidth || !sourceHeight) return paperAspectRatio
  const imageRatio = sourceWidth / sourceHeight
  const isImageLandscape = imageRatio > 1
  const isPaperLandscape = paperAspectRatio > 1
  if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
    return 1 / paperAspectRatio
  }
  return paperAspectRatio
}
