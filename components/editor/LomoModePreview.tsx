'use client'

import { useMemo } from 'react'
import { buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface LomoModePreviewProps {
  imageUrl: string
  imageId: string
}

/**
 * Lomo 模式预览
 * - 图片完整显示（object-contain）
 * - 四周有等比例白边
 * - 使用 transform: scale() 实现，确保白边比例一致
 */
export function LomoModePreview({ imageUrl, imageId }: LomoModePreviewProps) {
  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  // 计算缩放比例：如果白边是 5%，则 scale = 0.9
  const scale = (100 - WHITE_MARGIN_PERCENT * 2) / 100

  return (
    <div className="absolute inset-0 bg-white flex items-center justify-center">
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        <img
          key={`lomo-img-${imageId}`}
          src={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
          className="max-w-full max-h-full object-contain"
          alt="preview"
        />
      </div>
    </div>
  )
}
