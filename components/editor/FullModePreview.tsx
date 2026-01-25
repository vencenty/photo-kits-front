'use client'

import { useMemo } from 'react'
import { buildOssCropUrl } from '@/lib/image-config'

interface FullModePreviewProps {
  imageUrl: string
  imageId: string
  /** 相纸宽高比 */
  paperAspectRatio: number
}

/**
 * Full 模式预览
 * - 图片完整显示（object-contain）
 * - 无白边
 * - 相纸比例始终固定
 */
export function FullModePreview({
  imageUrl,
  imageId,
  paperAspectRatio,
}: FullModePreviewProps) {
  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  return (
    // 外层容器：填满父元素，提供居中能力
    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
      {/* 
        相纸容器：
        - aspect-ratio 强制保持相纸比例
        - height: 100% 让高度尽可能大
        - max-width: 100% 防止超出父容器宽度
      */}
      <div
        className="relative bg-white flex items-center justify-center"
        style={{
          aspectRatio: paperAspectRatio,
          height: '100%',
          maxWidth: '100%',
        }}
      >
        <img
          key={`full-img-${imageId}`}
          src={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
          alt="preview"
          className="max-w-full max-h-full object-contain"
        />
      </div>
    </div>
  )
}
