'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import type { Image as ImageType } from '@/lib/store'
import { getListImageUrl, buildOssCropUrl, SimpleCropInfo } from '@/lib/image-config'

// 配置常量
const WHITE_MARGIN_PERCENT = 1

interface PhotoPreviewCardProps {
  image: ImageType
  aspectRatio: number // 相纸宽高比
  onClick?: () => void
}

export function PhotoPreviewCard({ image, aspectRatio, onClick }: PhotoPreviewCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isClient, setIsClient] = useState(false)
  const [imageError, setImageError] = useState(false)

  // 客户端渲染检测
  useEffect(() => {
    setIsClient(true)
  }, [])

  // 图片变化时重置错误状态
  useEffect(() => {
    setImageError(false)
  }, [image.id, image.cropInfo])

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
  
  // 获取原图 URL
  const originalUrl = image.originalUrl || image.thumbnailUrl || ''
  
  // 统一使用 buildOssCropUrl 处理，列表页需要压缩和旋转（如果是横图）
  let previewUrl: string
  
  if (image.cropInfo && !imageError) {
    // 有裁剪信息，使用统一的 buildOssCropUrl
    // cover 模式会进行裁剪，full 和 lomo 模式不会裁剪但会添加压缩和旋转参数
    previewUrl = buildOssCropUrl(originalUrl, image.cropInfo as SimpleCropInfo, {
      targetWidth: 300,
      quality: 80,
      format: 'jpg',
      autoRotated: image.autoRotated
    })
  } else {
    // 没有裁剪信息，使用普通压缩 URL
    previewUrl = getListImageUrl(originalUrl, image.autoRotated)
  }

  // 渲染图片
  const renderImage = () => {
    const isLomo = styleType === 'lomo'
    const margin = isLomo ? WHITE_MARGIN_PERCENT : 0

    if (styleType === 'cover') {
      // Cover 模式：图片裁剪后填满整个区域（与 ImageEditor 保持一致）
      // 旋转已在 OSS 层面处理（通过 autoRotated 参数）
      return (
        <img
          src={previewUrl}
          alt={image.filename || '照片'}
          className="w-full h-full object-cover"
          onError={() => {
            console.warn('图片加载失败，降级使用原图:', previewUrl)
            setImageError(true)
          }}
        />
      )
    } else if (styleType === 'full') {
      // Full 模式：完整显示图片（与 ImageEditor 保持一致）
      // 旋转已在 OSS 层面处理（通过 autoRotated 参数）
      return (
        <div className="relative w-full h-full bg-white flex items-center justify-center">
          <img
            src={previewUrl}
            alt={image.filename || '照片'}
            className="max-w-full max-h-full object-contain"
            onError={() => setImageError(true)}
          />
        </div>
      )
    } else {
      // Lomo 模式：留白显示（与 ImageEditor 保持一致）
      // 旋转已在 OSS 层面处理（通过 autoRotated 参数）
      return (
        <div 
          className="relative w-full h-full bg-white flex items-center justify-center"
          style={{
            padding: isLomo ? `${margin}%` : 0,
          }}
        >
          <img
            src={previewUrl}
            alt={image.filename || '照片'}
            className="max-w-full max-h-full object-contain"
            style={{
              maxWidth: isLomo ? `${100 - margin * 2}%` : '100%',
              maxHeight: isLomo ? `${100 - margin * 2}%` : '100%',
            }}
            onError={() => setImageError(true)}
          />
        </div>
      )
    }
  }

  // 降级显示（OSS 裁剪失败时）
  const renderFallback = () => {
    const fallbackUrl = getListImageUrl(originalUrl, image.autoRotated)
    return (
      <img
        src={fallbackUrl}
        alt={image.filename || '照片'}
        className="w-full h-full object-cover"
      />
    )
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 cursor-pointer"
      onClick={onClick}
    >
      {isClient && (imageError ? renderFallback() : renderImage())}
    </div>
  )
}
