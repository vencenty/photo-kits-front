/**
 * 图片预加载 Hook
 * 用于预加载图片到浏览器缓存，提升切换体验
 */

import { useEffect, useRef } from 'react'
import { buildOssCropUrl } from './image-config'

interface PreloadOptions {
  quality?: number
  format?: string
}

/**
 * 预加载单张图片
 */
function preloadImage(url: string, options?: PreloadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    // 构建压缩图 URL
    const compressedUrl = buildOssCropUrl(url, undefined, {
      quality: options?.quality || 70,
      format: options?.format || 'jpg',
    })
    
    img.onload = () => {
      resolve()
    }
    
    img.onerror = () => {
      // 预加载失败不影响主流程，静默处理
      resolve()
    }
    
    img.src = compressedUrl
  })
}

/**
 * 批量预加载图片
 */
export function preloadImages(urls: string[], options?: PreloadOptions): Promise<void[]> {
  return Promise.all(urls.map(url => preloadImage(url, options)))
}

/**
 * 图片预加载 Hook
 * @param currentImageUrl 当前图片 URL
 * @param allImages 所有图片列表
 * @param currentIndex 当前图片索引
 * @param preloadCount 预加载数量（前后各几张）
 */
export function useImagePreload(
  currentImageUrl: string | undefined,
  allImages: Array<{ id: string; thumbnailUrl?: string; originalUrl?: string }>,
  currentIndex: number,
  preloadCount: number = 5
) {
  const preloadedRef = useRef<Set<string>>(new Set())
  
  useEffect(() => {
    if (!currentImageUrl || currentIndex < 0 || allImages.length === 0) return
    
    // 计算需要预加载的图片范围
    const startIndex = Math.max(0, currentIndex - preloadCount)
    const endIndex = Math.min(allImages.length - 1, currentIndex + preloadCount)
    
    // 收集需要预加载的图片 URL（包括当前图片的前后各 preloadCount 张）
    const urlsToPreload: string[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      const image = allImages[i]
      const url = image.thumbnailUrl || image.originalUrl
      if (url && !preloadedRef.current.has(url)) {
        urlsToPreload.push(url)
        preloadedRef.current.add(url)
      }
    }
    
    // 异步预加载（不阻塞主流程）
    if (urlsToPreload.length > 0) {
      console.log(`🔄 预加载 ${urlsToPreload.length} 张图片 (索引 ${startIndex}-${endIndex})...`)
      preloadImages(urlsToPreload)
        .then(() => {
          console.log(`✅ 预加载完成: ${urlsToPreload.length} 张图片`)
        })
        .catch((error) => {
          console.warn('预加载部分图片失败:', error)
        })
    }
  }, [currentImageUrl, currentIndex, allImages, preloadCount])
  
  // 清理函数：当组件卸载时，可以选择清理预加载缓存
  useEffect(() => {
    return () => {
      // 可以选择保留预加载缓存，或者清理
      // preloadedRef.current.clear()
    }
  }, [])
}
