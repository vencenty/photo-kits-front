'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import { PhotoCanvas, type StyleType } from './PhotoCanvas'
import type { Image as ImageType, PhotoTransform } from '@/lib/store'

interface PhotoPreviewCardProps {
  image: ImageType
  aspectRatio: number // 相纸宽高比
  onClick?: () => void
}

/**
 * 给 OSS URL 添加压缩参数
 * 使用阿里云 OSS 图片处理服务进行压缩
 * 参数: w_300 宽度300px, q_80 质量80%, f_webp webp格式
 */
function getCompressedImageUrl(url: string): string {
  if (!url) return url
  
  // 如果是 data URL 或本地文件，不处理
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  
  // 如果是 OSS URL，添加图片处理参数
  // 阿里云 OSS 图片处理参数格式: ?x-oss-process=image/resize,w_300/quality,q_80/format,webp
  if (url.includes('aliyuncs.com') || url.includes('oss-proxy') || url.includes('vencenty.cc')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}x-oss-process=image/resize,w_300/quality,q_80/format,webp`
  }
  
  return url
}

export function PhotoPreviewCard({ image, aspectRatio, onClick }: PhotoPreviewCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [isClient, setIsClient] = useState(false)

  // 客户端渲染检测
  useEffect(() => {
    setIsClient(true)
  }, [])

  // 计算容器尺寸
  useEffect(() => {
    if (!containerRef.current) return
    
    const updateSize = () => {
      const container = containerRef.current
      if (!container) return
      
      const containerWidth = container.offsetWidth
      const containerHeight = container.offsetHeight
      
      if (containerWidth > 0 && containerHeight > 0) {
        setStageSize({
          width: containerWidth,
          height: containerHeight,
        })
      }
    }
    
    // 使用 requestAnimationFrame 确保容器已渲染
    const rafId = requestAnimationFrame(updateSize)
    
    // 监听窗口大小变化
    window.addEventListener('resize', updateSize)
    
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateSize)
    }
  }, [aspectRatio, image.id])

  // 如果没有 thumbnailUrl，显示占位符
  if (!image.thumbnailUrl) {
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
  const styleType: StyleType = image.transform?.styleType || image.editState?.mode || 'center'
  
  // 获取压缩后的图片 URL（用于列表显示）
  const compressedUrl = getCompressedImageUrl(image.thumbnailUrl)

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 cursor-pointer"
      onClick={onClick}
    >
      {isClient && stageSize.width > 0 && stageSize.height > 0 && (
        <PhotoCanvas
          imageUrl={compressedUrl}
          imageSize={{ width: image.width, height: image.height }}
          stageSize={stageSize}
          styleType={styleType}
          transform={image.transform}
          autoRotated={image.autoRotated}
          editable={false}
        />
      )}
    </div>
  )
}

