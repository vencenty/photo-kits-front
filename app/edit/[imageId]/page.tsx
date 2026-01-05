'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useStore, type PhotoTransform, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const imageId = params.imageId as string

  const images = useStore((state) => state.images)
  const currentSession = useStore((state) => state.currentSession)
  const updateImage = useStore((state) => state.updateImage)

  const [image, setImage] = useState<Image | null>(null)

  useEffect(() => {
    const foundImage = images.find((img) => img.id === imageId)
    if (!foundImage) {
      router.push('/')
      return
    }
    setImage(foundImage)
  }, [imageId, images, router])

  const handleSave = (transform: PhotoTransform) => {
    // 保存变换信息，同时也更新旧的 editState 保持兼容
    updateImage(imageId, { 
      transform,
      editState: {
        mode: transform.styleType,
        scale: 1, // 这些值已经在 transform 中了
        x: 0,
        y: 0,
        rotation: 0,
        canvasWidth: transform.outputWidth,
        canvasHeight: transform.outputHeight,
      }
    })
    router.back()
  }

  if (!image || !currentSession) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">加载中...</p>
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
