'use client'

import { useMemo } from 'react'
import { buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface LomoModePreviewProps {
  imageUrl: string
  imageId: string
  /** 相纸宽高比，比如 3/4、4/3、5/7 */
  paperAspectRatio: number
}

/**
 * Lomo 模式预览
 * 
 * 核心原则：
 * 1. 相纸比例永远固定（由 paperAspectRatio 决定）
 * 2. 白边是等比例的（使用 transform: scale 实现）
 * 3. 浏览器窗口变化时，只会整体等比缩放，比例不变
 */
export function LomoModePreview({
  imageUrl,
  imageId,
  paperAspectRatio,
}: LomoModePreviewProps) {
  const imageCompressOptions = useMemo(
    () => ({ quality: 70, format: 'jpg', interlace: 1 }),
    []
  )

  // 白边缩放比例：如果 WHITE_MARGIN_PERCENT=5，则 scale=0.9
  const scale = (100 - WHITE_MARGIN_PERCENT * 2) / 100

  return (
    // 外层容器：填满父元素，提供居中能力
    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
      {/* 
        相纸容器：
        - aspect-ratio 强制保持相纸比例
        - height: 100% 让高度尽可能大
        - max-width: 100% 防止超出父容器宽度
        - 当宽度不够时，CSS 会自动根据 aspect-ratio 缩小高度
      */}
      <div
        className="relative bg-white"
        style={{
          aspectRatio: paperAspectRatio,
          height: '100%',
          maxWidth: '100%',
        }}
      >
        {/* 
          图片层：
          - 使用 transform: scale 实现等比例缩小
          - 四周自然形成等宽的白边
        */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          <img
            key={`lomo-img-${imageId}`}
            src={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
            alt="preview"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    </div>
  )
}
