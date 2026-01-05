'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStore, type PhotoTransform, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { updatePhoto } from '@/lib/api'

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const imageId = params.imageId as string

  const images = useStore((state) => state.images)
  const currentSession = useStore((state) => state.currentSession)
  const hasHydrated = useStore((state) => state._hasHydrated)
  const updateImage = useStore((state) => state.updateImage)

  const [image, setImage] = useState<Image | null>(null)

  useEffect(() => {
    // 等待 hydration 完成
    if (!hasHydrated) return
    
    const foundImage = images.find((img) => img.id === imageId)
    if (!foundImage) {
      router.push('/')
      return
    }
    setImage(foundImage)
  }, [imageId, images, router, hasHydrated])

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
      await updatePhoto({
        photoId: imageId,
        cropMode: transform.styleType,
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
    }
    
    router.back()
  }

  if (!hasHydrated || !image || !currentSession) {
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
    </div>
  )
}
