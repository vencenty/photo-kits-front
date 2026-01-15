'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import type { Image as ImageType } from '@/lib/store'
import { getListThumbnailUrl, buildOssCropUrl, WHITE_MARGIN_PERCENT } from '@/lib/image-config'

interface PhotoPreviewCardProps {
  image: ImageType
  aspectRatio: number // 相纸宽高比
  onClick?: () => void
}

export function PhotoPreviewCard({ image, aspectRatio, onClick }: PhotoPreviewCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isClient, setIsClient] = useState(false)

  // 客户端渲染检测
  useEffect(() => {
    setIsClient(true)
  }, [])

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

  // 获取样式类型
  const styleType = image.cropInfo?.styleType || image.editState?.mode || 'cover'
  
  // 获取原图 URL，使用列表页缩略图（短边300px，加载更快）
  // 如果是横图，追加 rotate,90 参数来旋转图片
  const originalUrl = image.originalUrl || image.thumbnailUrl || ''
  const previewUrl = getListThumbnailUrl(originalUrl, image.autoRotated)

  // 渲染图片 - 根据样式类型使用不同的 object-fit
  const renderImage = () => {
    if (styleType === 'cover' && image.cropInfo) {
      // Cover 模式：如果有 cropInfo，使用精确裁切的 OSS URL
      const croppedUrl = buildOssCropUrl(originalUrl, image.cropInfo, {
        autoRotated: image.autoRotated,
        targetWidth: 300, // 列表页缩略图短边宽度
        useShortEdge: true, // 使用短边缩放，与 getListThumbnailUrl 保持一致
        quality: 70,
        format: 'jpg',
      })

      return (
        <img
          src={croppedUrl}
          alt={image.filename || '照片'}
          className="w-full h-full object-cover"
        />
      )
    } else if (styleType === 'cover') {
      // Cover 模式：无 cropInfo 时，回退到居中裁切（兼容旧数据）
      return (
        <img
          src={previewUrl}
          alt={image.filename || '照片'}
          className="w-full h-full object-cover"
        />
      )
    } else if (styleType === 'full') {
      // Full 模式：使用 object-contain 完整显示图片
      return (
        <div className="relative w-full h-full bg-white flex items-center justify-center">
          <img
            src={previewUrl}
            alt={image.filename || '照片'}
            className="w-full h-full object-contain"
          />
        </div>
      )
    } else {
      // Lomo 模式：使用 object-contain + padding 实现留白
      const margin = WHITE_MARGIN_PERCENT
      return (
        <div 
          className="relative w-full h-full bg-white flex items-center justify-center"
          style={{
            padding: `${margin}%`,
          }}
        >
          <img
            src={previewUrl}
            alt={image.filename || '照片'}
            className="w-full h-full object-contain"
          />
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
      {isClient && renderImage()}
    </div>
  )
}
