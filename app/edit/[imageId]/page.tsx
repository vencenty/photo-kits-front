'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStore, type PhotoTransform, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { GlobalLoading } from '@/components/GlobalLoading'
import { updatePhoto } from '@/lib/api'
import { mapCropModeToServer } from '@/lib/utils'
import type { Image as ImageType } from '@/lib/store'

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const imageId = params.imageId as string

  const images = useStore((state) => state.images)
  const currentSession = useStore((state) => state.currentSession)
  const hasHydrated = useStore((state) => state._hasHydrated)
  const updateImage = useStore((state) => state.updateImage)
  const setApiLoading = useStore((state) => state.setApiLoading)
  const addImages = useStore((state) => state.addImages)

  const [image, setImage] = useState<Image | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 等待 hydration 完成
    if (!hasHydrated || !currentSession) return

    // 最佳实践：按优先级查找图片数据
    // 1. 优先从 store 中查找（最快，无网络请求）
    // 2. 如果 store 中没有或没有 URL，从 sessionStorage 查找（点击编辑时保存的）
    // 3. 如果都没有，跳转到列表页
    
    let foundImage = images.find((img) => img.id === imageId)
    const hasValidUrl = foundImage && (foundImage.originalUrl || foundImage.thumbnailUrl)
    
    // 如果 store 中没有或没有有效的 URL，尝试从 sessionStorage 读取
    if (!foundImage || !hasValidUrl) {
      try {
        const sessionData = sessionStorage.getItem(`edit-image-${imageId}`)
        if (sessionData) {
          const imageData = JSON.parse(sessionData) as ImageType
          // 如果 store 中有图片但缺少 URL，更新它
          if (foundImage) {
            updateImage(imageId, {
              originalUrl: imageData.originalUrl,
              thumbnailUrl: imageData.thumbnailUrl,
            })
            foundImage = { ...foundImage, ...imageData }
          } else {
            // 添加到 store
            addImages([imageData])
            foundImage = imageData
          }
        }
      } catch (error) {
        console.error('从 sessionStorage 读取图片数据失败:', error)
      }
    }
    
    // 检查最终是否有有效的图片数据
    const finalHasValidUrl = foundImage && (foundImage.originalUrl || foundImage.thumbnailUrl)
    
    if (!foundImage || !finalHasValidUrl) {
      // 如果还是没有，跳转到列表页
      setIsLoading(false)
      setTimeout(() => {
        router.push(`/upload/${currentSession.sizeId}`)
      }, 0)
      return
    }
    
    // 找到完整的图片数据，直接使用
    setIsLoading(false)
    setImage(foundImage)
  }, [imageId, images, router, hasHydrated, currentSession, addImages, updateImage])

  const handleSave = async (transform: PhotoTransform) => {
    // 保存变换信息到本地 store
    updateImage(imageId, { 
      transform,
      editState: {
        mode: transform.styleType,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        canvasWidth: transform.outputWidth,
        canvasHeight: transform.outputHeight,
      }
    })
    
    // 同步保存到后端（异步执行，不阻塞UI）
    try {
      setApiLoading(true, '保存编辑中...')
      await updatePhoto({
        photoId: imageId,
        cropMode: mapCropModeToServer(transform.styleType),
        transform: {
          matrix: transform.matrix,
          outputWidth: transform.outputWidth,
          outputHeight: transform.outputHeight,
          sourceWidth: transform.sourceWidth,
          sourceHeight: transform.sourceHeight,
          styleType: transform.styleType,
        },
      })
      console.log('编辑状态已同步到后端:', imageId)
    } catch (error) {
      console.error('同步编辑状态到后端失败:', error)
    } finally {
      setApiLoading(false, '')
    }
    
    router.back()
  }

  if (!hasHydrated || isLoading || !image || !currentSession) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center">
          <button
            onClick={() => router.back()}
            className="mr-4 p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">照片编辑</h1>
        </div>
      </div>

      {/* Editor */}
      <ImageEditor
        image={image}
        canvasWidth={currentSession.canvasWidth}
        canvasHeight={currentSession.canvasHeight}
        onSave={handleSave}
        onCancel={() => router.back()}
      />

      {/* 全局 Loading */}
      <GlobalLoading />
    </div>
  )
}
