'use client'

import { useRef } from 'react'
import { Upload } from 'lucide-react'
import type { Image as ImageType } from '@/lib/store'
import { buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

type CropMode = 'cover' | 'full' | 'lomo'

interface PhotoPreviewCardProps {
  image: ImageType
  aspectRatio: number // 相纸宽高比
  /** 预览时覆盖的裁剪模式（用于批量编辑即时预览） */
  previewCropMode?: CropMode
  onClick?: () => void
}

export function PhotoPreviewCard({ image, aspectRatio, previewCropMode, onClick }: PhotoPreviewCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 如果没有 thumbnailUrl，显示占位符
  if (!image.thumbnailUrl && !image.originalUrl) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center"
      >
        <Upload className="w-8 h-8 text-gray-300 mb-1" />
        <span className="text-xs text-gray-400">图片待加载</span>
      </div>
    )
  }


  // 获取原图 URL，使用列表页缩略图（短边300px，加载更快）
  // 如果是横图，追加 rotate,90 参数来旋转图片
  const originalUrl = image.originalUrl || image.thumbnailUrl || ''

  // 对于 full/lomo 模式，竖图（height > width）必须不旋转，否则会错误铺满
  // 苹果截图等无 EXIF 的图片可能被误判为横图，用实际尺寸做二次校验
  const displayMode = previewCropMode ?? image.cropMode
  const isPortraitByDimensions = image.width && image.height && image.height > image.width
  const effectiveIsLandscape =
    displayMode === 'full' || displayMode === 'lomo'
      ? image.isLandscape && !isPortraitByDimensions // 竖图强制不旋转
      : image.isLandscape

  // 批量预览为 full/lomo 时不能用旧的 image.cropInfo（常为 cover），否则会沿用 OSS crop 参数
  const cropInfoForPreview =
    previewCropMode === 'full' || previewCropMode === 'lomo' ? undefined : image.cropInfo

  const previewUrl = buildOssCropUrl(originalUrl, cropInfoForPreview, {
    isLandscape: effectiveIsLandscape,
    shortWidth: 300, // 列表页缩略图短边宽度
    quality: 70,
    format: 'jpg',
  })

  // 渲染图片 - 优先使用 outputUrl（最终成品），否则根据cropInfo和样式类型决定显示方式
  // previewCropMode 用于批量编辑时的即时预览，选中后切换模式立即呈现效果
  const renderImage = () => {
    // 没有cropInfo时，根据样式类型使用不同的显示方式
    if (displayMode === 'cover') {
      // Cover 模式：直接使用缩略图压缩格式
      return (
        <img
          src={previewUrl}
          alt={image.filename || '照片'}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )
    } else if (displayMode === 'full') {
      // Full 模式：使用 object-contain 完整显示图片
      return (
        <div className="relative w-full h-full bg-white flex items-center justify-center">
          <img
            src={previewUrl}
            alt={image.filename || '照片'}
            className="w-full h-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </div>
      )
    } else {
      // Lomo 模式（四周留白）：使用 transform: scale() 实现等比例缩放，四周白边自然形成
      const scale = (100 - WHITE_MARGIN_PERCENT * 2) / 100 // 如果白边是 5%，scale = 0.9
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
              src={previewUrl}
              alt={image.filename || '照片'}
              className="max-w-full max-h-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      )
    }
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-pointer"
      onClick={onClick}
    >
      {renderImage()}

      {/* 已调整角标 - z-20 确保在删除按钮(z-10)等元素之上 */}
      {image.isAdjusted && (
        <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded shadow-md z-20">
          已调整
        </div>
      )}
    </div>
  )
}
