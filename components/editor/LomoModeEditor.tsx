'use client'

import { buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface LomoModeEditorProps {
  imageUrl: string
  imageId: string
  imageCompressOptions: { quality: number; format: string; interlace: number }
}

/**
 * Lomo 模式编辑器 - 四周留白
 * 使用 transform: scale() 实现等比例缩放，四周白边自然形成
 * - scale(0.9) 让内容缩小到 90%，四周各留 5% 白边
 * - 无论相纸比例如何，白边都保持等比例
 */
export function LomoModeEditor({
  imageUrl,
  imageId,
  imageCompressOptions,
}: LomoModeEditorProps) {
  // 计算缩放比例：如果 WHITE_MARGIN_PERCENT = 5，则 scale = 0.9
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
