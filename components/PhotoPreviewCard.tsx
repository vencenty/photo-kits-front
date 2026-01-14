'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import type { Image as ImageType } from '@/lib/store'
import { getListImageUrl, buildOssCropAndResizeUrl, SimpleCropInfo } from '@/lib/image-config'

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
  
  // 根据是否有 cropInfo 来决定使用哪个 URL
  let previewUrl: string
  
  if (image.cropInfo && styleType === 'cover' && !imageError) {
    // 有裁剪信息且是 cover 模式，使用 OSS 裁剪 URL
    previewUrl = buildOssCropAndResizeUrl(originalUrl, image.cropInfo as SimpleCropInfo, 300, image.autoRotated)
  } else {
    // 没有裁剪信息或者是其他模式，使用普通压缩 URL
    previewUrl = getListImageUrl(originalUrl, image.autoRotated)
  }

  // 判断图片是否是横图（宽度大于高度）
  // 注意：编辑后的图片URL已经是正确的了（通过OSS处理），但原始图片尺寸信息可能还是横图的
  // 所以需要根据原始尺寸判断，如果是横图就在列表页旋转90度显示
  const isLandscape = () => {
    if (!image.width || !image.height) return false

    return image.width >image.height
  }

  // 渲染图片
  const renderImage = () => {
    const isLomo = styleType === 'lomo'
    const margin = isLomo ? WHITE_MARGIN_PERCENT : 0
    const isHorizontal = isLandscape() // 判断是否是横图

    if (styleType === 'cover') {
      // Cover 模式：图片裁剪后填满整个区域（与 ImageEditor 保持一致）
      // 如果是横图，旋转90度显示为竖图
      return (
        <img
          src={previewUrl}
          alt={image.filename || '照片'}
          className={`w-full h-full object-cover}`}
          onError={() => {
            console.warn('图片加载失败，降级使用原图:', previewUrl)
            setImageError(true)
          }}
        />
      )
    } else if (styleType === 'full') {
      // Full 模式：完整显示图片（与 ImageEditor 保持一致）
      // 如果是横图，旋转90度显示为竖图
      return (
        <div className="relative w-full h-full bg-white flex items-center justify-center">
          <img
            src={previewUrl}
            alt={image.filename || '照片'}
            className={`max-w-full max-h-full object-contain ${isHorizontal ? 'rotate-90' : ''}`}
            onError={() => setImageError(true)}
          />
        </div>
      )
    } else {
      // Lomo 模式：留白显示（与 ImageEditor 保持一致）
      // 如果是横图，旋转90度显示为竖图
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
            className={`max-w-full max-h-full object-contain ${isHorizontal ? 'rotate-90' : ''}`}
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
    const isHorizontal = isLandscape() // 判断是否是横图
    return (
      <img
        src={fallbackUrl}
        alt={image.filename || '照片'}
        className={`w-full h-full object-cover ${isHorizontal ? 'rotate-90' : ''}`}
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
