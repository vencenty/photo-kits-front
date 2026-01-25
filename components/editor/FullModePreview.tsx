'use client'

import { useMemo } from 'react'
import { buildOssCropUrl } from '@/lib/image-config'

interface FullModePreviewProps {
  imageUrl: string
  imageId: string
}

/**
 * Full 模式预览
 * - 图片完整显示（object-contain）
 * - 无白边
 */
export function FullModePreview({ imageUrl, imageId }: FullModePreviewProps) {
  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  return (
    <div className="absolute inset-0 bg-white flex items-center justify-center">
      <img
        key={`full-img-${imageId}`}
        src={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
        className="max-w-full max-h-full object-contain"
        alt="preview"
      />
    </div>
  )
}
