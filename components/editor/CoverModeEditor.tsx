'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { buildOssCropUrl, buildWatermarkedOutputUrl } from '@/lib/image-config'
import {
  attachCoverWatermarkSize,
  DATE_WATERMARK_COLOR,
  DATE_WATERMARK_MARGIN_RATIO,
  DATE_WATERMARK_SHORT_EDGE_RATIO,
  type DateWatermarkOptions,
} from '@/lib/date-watermark'
import { calculateCoverCropSize } from '@/lib/utils'
import type { SimpleCropInfo } from '@/lib/types'

/** 与 cropAreaStyle 的 border 宽度一致，水印落在网格内侧 */
const CROP_AREA_BORDER_PX = 8

interface CoverModeEditorProps {
  imageUrl: string
  imageId: string
  sourceWidth: number
  sourceHeight: number
  paperAspectRatio: number
  imageCompressOptions: { quality: number; format: string; interlace: number }
  onCropChange: (cropInfo: SimpleCropInfo | null, outputUrl: string) => void
  initialCropInfo?: SimpleCropInfo | null
  thumbnailShortEdge?: number
  watermark?: DateWatermarkOptions
}

interface CropAreaLayout {
  left: number
  top: number
  width: number
  height: number
}

/** 读取 react-easy-crop 真实裁剪框在容器内的位置（比纯数学推算更准确） */
function readCropAreaLayout(container: HTMLElement): CropAreaLayout | null {
  const cropEl = container.querySelector<HTMLElement>('.reactEasyCrop_CropArea')
  if (!cropEl) return null

  const containerRect = container.getBoundingClientRect()
  const cropRect = cropEl.getBoundingClientRect()
  const inset = CROP_AREA_BORDER_PX

  return {
    left: cropRect.left - containerRect.left + inset,
    top: cropRect.top - containerRect.top + inset,
    width: Math.max(0, cropRect.width - inset * 2),
    height: Math.max(0, cropRect.height - inset * 2),
  }
}

export function CoverModeEditor({
  imageUrl,
  imageId,
  sourceWidth,
  sourceHeight,
  paperAspectRatio,
  imageCompressOptions,
  onCropChange,
  initialCropInfo,
  thumbnailShortEdge = 800,
  watermark,
}: CoverModeEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const [cropAreaLayout, setCropAreaLayout] = useState<CropAreaLayout | null>(null)

  const cropAspectRatio = useMemo(() => {
    if (!sourceWidth || !sourceHeight) return paperAspectRatio
    const imageRatio = sourceWidth / sourceHeight
    const isImageLandscape = imageRatio > 1
    const isPaperLandscape = paperAspectRatio > 1
    if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
      return 1 / paperAspectRatio
    }
    return paperAspectRatio
  }, [sourceWidth, sourceHeight, paperAspectRatio])

  const syncCropAreaLayout = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const layout = readCropAreaLayout(el)
    if (layout) setCropAreaLayout(layout)
  }, [])

  const initialCroppedAreaPercentages = useMemo(() => {
    if (initialCropInfo?.croppedAreaPercent) {
      return initialCropInfo.croppedAreaPercent
    }

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

  const cropperKey = useMemo(() => {
    if (initialCropInfo?.croppedAreaPercent) {
      const { x, y } = initialCropInfo.croppedAreaPercent
      return `cropper-${imageId}-${x.toFixed(2)}-${y.toFixed(2)}`
    }
    return `cropper-${imageId}-center`
  }, [imageId, initialCropInfo])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    syncCropAreaLayout()
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(syncCropAreaLayout)
    })
    observer.observe(el)

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(syncCropAreaLayout)
    })
    mutationObserver.observe(el, { childList: true, subtree: true, attributes: true })

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [syncCropAreaLayout, cropperKey])

  const emitCropChange = useCallback((cropInfo: SimpleCropInfo) => {
    const saveWatermark = attachCoverWatermarkSize(watermark, cropInfo)
    const outputUrl = buildWatermarkedOutputUrl(imageUrl, cropInfo, { watermark: saveWatermark })
    onCropChange(cropInfo, outputUrl)
  }, [imageUrl, onCropChange, watermark])

  const onCropComplete = useCallback((area: Area, _areaPixels: Area) => {
    const offsetX = Math.round((area.x / 100) * sourceWidth)
    const offsetY = Math.round((area.y / 100) * sourceHeight)
    const cropWidth = Math.round((area.width / 100) * sourceWidth)
    const cropHeight = Math.round((area.height / 100) * sourceHeight)

    emitCropChange({
      offsetX,
      offsetY,
      cropWidth,
      cropHeight,
      sourceWidth,
      sourceHeight,
      styleType: 'cover',
      croppedAreaPercent: area,
    })
    requestAnimationFrame(syncCropAreaLayout)
  }, [sourceWidth, sourceHeight, emitCropChange, syncCropAreaLayout])

  const handleCropChange = useCallback((point: Point) => {
    setCrop(point)
    requestAnimationFrame(syncCropAreaLayout)
  }, [syncCropAreaLayout])

  const cropperStyle = useMemo(() => ({
    containerStyle: { backgroundColor: 'black' },
    mediaStyle: { backgroundColor: '#ffffff' },
    cropAreaStyle: {
      border: `${CROP_AREA_BORDER_PX}px solid transparent`,
      borderImage: `repeating-linear-gradient(
        -45deg,
        #ef4444,
        #ef4444 2px,
         rgba(239, 68, 68, 0.2) 2px,
         rgba(239, 68, 68, 0.2) 4px
      ) ${CROP_AREA_BORDER_PX}`,
    },
  }), [])

  const thumbnailUrl = useMemo(() => {
    return buildOssCropUrl(imageUrl, undefined, {
      shortWidth: thumbnailShortEdge,
      ...imageCompressOptions,
    })
  }, [imageUrl, thumbnailShortEdge, imageCompressOptions])

  return (
    <div ref={containerRef} className="absolute inset-0">
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
        onCropChange={handleCropChange}
        onZoomChange={setZoom}
        onCropComplete={onCropComplete}
        onMediaLoaded={() => requestAnimationFrame(syncCropAreaLayout)}
        style={cropperStyle}
        initialCroppedAreaPercentages={initialCroppedAreaPercentages}
      />
      {/* 预览水印：固定在裁剪框内侧右下角，比例与留白/OSS 保存一致 */}
      {watermark?.text && cropAreaLayout && cropAreaLayout.width > 0 && cropAreaLayout.height > 0 && (
        <div
          className="absolute pointer-events-none z-[5] [container-type:size]"
          style={{
            left: cropAreaLayout.left,
            top: cropAreaLayout.top,
            width: cropAreaLayout.width,
            height: cropAreaLayout.height,
          }}
        >
          <span
            className="absolute font-medium leading-none whitespace-nowrap"
            style={{
              right: `${DATE_WATERMARK_MARGIN_RATIO * 100}%`,
              bottom: `${DATE_WATERMARK_MARGIN_RATIO * 100}%`,
              fontSize: `${DATE_WATERMARK_SHORT_EDGE_RATIO * 100}cqmin`,
              color: `#${DATE_WATERMARK_COLOR}`,
              textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {watermark.text}
          </span>
        </div>
      )}
    </div>
  )
}
