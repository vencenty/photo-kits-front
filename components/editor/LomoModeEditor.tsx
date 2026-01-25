'use client'

import { buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface LomoModeEditorProps {
  imageUrl: string
  imageId: string
  canvasAspectRatio: number // ⚠️ 画布比例（外部传入）
  imageCompressOptions: {
    quality: number
    format: string
    interlace: number
  }
}

export function LomoModeEditor({
  imageUrl,
  imageId,
  canvasAspectRatio,
  imageCompressOptions,
}: LomoModeEditorProps) {
  return (
    <div className="absolute inset-0 bg-neutral-200 flex items-center justify-center">
      {/* 画布外层：限制最大显示区域 */}
      <div className="w-full h-full flex items-center justify-center p-4">
        {/* 画布本体 */}
        <div
          className="bg-white box-border"
          style={{
            aspectRatio: canvasAspectRatio,
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
