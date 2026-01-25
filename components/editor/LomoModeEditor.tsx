'use client'

import { useMemo } from 'react'
import { buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface LomoModeEditorProps {
  imageUrl: string
  imageId: string
  /** 照片原始宽度 */
  sourceWidth: number
  /** 照片原始高度 */
  sourceHeight: number
  /** 相纸比例（来自 select-size，如 127/89 ≈ 1.43） */
  paperAspectRatio: number
  imageCompressOptions: {
    quality: number
    format: string
    interlace: number
  }
}

export function LomoModeEditor({
  imageUrl,
  imageId,
  sourceWidth,
  sourceHeight,
  paperAspectRatio,
  imageCompressOptions,
}: LomoModeEditorProps) {
  // 计算自适应画布比例：根据照片方向自动调整画布方向，最小化留白
  const adaptiveCanvasRatio = useMemo(() => {
    if (!sourceWidth || !sourceHeight) return paperAspectRatio

    const imageRatio = sourceWidth / sourceHeight
    const isImageLandscape = imageRatio > 1  // 照片是横图
    const isPaperLandscape = paperAspectRatio > 1  // 相纸是横版

    // 如果照片方向与相纸方向不一致，翻转相纸比例
    // 例如：横图 + 竖版相纸(2:3) → 使用横版相纸(3:2)
    if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
      return 1 / paperAspectRatio
    }
    return paperAspectRatio
  }, [sourceWidth, sourceHeight, paperAspectRatio])

  return (
    <div className="absolute inset-0 bg-neutral-200 flex items-center justify-center">
      {/* 画布外层：限制最大显示区域 */}
      <div className="w-full h-full flex items-center justify-center p-4">
        {/* 画布本体：比例自适应照片方向 */}
        <div
          className="bg-white box-border"
          style={{
            aspectRatio: adaptiveCanvasRatio,
            padding: `${WHITE_MARGIN_PERCENT}%`,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          <img
            key={`lomo-img-${imageId}`}
            src={buildOssCropUrl(imageUrl, undefined, imageCompressOptions)}
            className="w-full h-full object-contain"
            alt="preview"
          />
        </div>
      </div>
    </div>
  )
}
