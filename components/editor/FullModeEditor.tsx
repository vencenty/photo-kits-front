'use client'

import { useMemo } from 'react'
import { buildOssCropUrl } from '@/lib/image-config'

interface FullModeEditorProps {
  imageUrl: string
  imageId: string
  imageCompressOptions: { quality: number; format: string; interlace: number }
  /** 编辑用缩略图短边尺寸（默认 800px） */
  thumbnailShortEdge?: number
}

/**
 * Full 模式编辑器 - 打印整图
 * 图片完整显示，不裁剪，使用 object-contain 填充
 */
export function FullModeEditor({
  imageUrl,
  imageId,
  imageCompressOptions,
  thumbnailShortEdge = 800,
}: FullModeEditorProps) {
  // 构建编辑用缩略图 URL
  const thumbnailUrl = useMemo(() => {
    return buildOssCropUrl(imageUrl, undefined, {
      shortWidth: thumbnailShortEdge,
      ...imageCompressOptions,
    })
  }, [imageUrl, thumbnailShortEdge, imageCompressOptions])

  return (
    <div className="absolute inset-0 bg-white flex items-center justify-center">
      <div className="w-full h-full flex items-center justify-center">
        <img
          key={`full-img-${imageId}`}
          src={thumbnailUrl}
          className="max-w-full max-h-full object-contain"
          alt="preview"
        />
      </div>
    </div>
  )
}
