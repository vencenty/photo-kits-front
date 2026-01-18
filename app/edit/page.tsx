'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStore, type SimpleCropInfo, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { GlobalLoading } from '@/components/GlobalLoading'
import { updatePhoto, getPhotoDetail } from '@/lib/api'
import { mapCropModeToServer, mapCropModeFromServer } from '@/lib/utils'
import { buildOssCropUrl } from '@/lib/image-config'

function EditPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const imageId = searchParams.get('imageId') as string

  const currentSession = useStore((state) => state.currentSession)
  const setApiLoading = useStore((state) => state.setApiLoading)

  const [image, setImage] = useState<Image | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOrderLocked, setIsOrderLocked] = useState(false)


  useEffect(() => {
    // 直接从服务端获取图片数据
    const loadPhotoData = async () => {
      if (!currentSession) return

      try {
        setIsLoading(true)
        const response = await getPhotoDetail(imageId)

        // 根据cropMode设置初始编辑状态
        const getInitialMode = (): 'cover' | 'full' | 'lomo' => {
          // 将后端的cropMode转换为前端的编辑模式
          const cropMode = response.photo.cropMode ? mapCropModeFromServer(response.photo.cropMode) : 'cover'
          return cropMode
        }

        const initialMode = getInitialMode()

        // 从后端cropInfo创建前端SimpleCropInfo
        let simpleCropInfo: SimpleCropInfo | undefined
        if (response.photo.cropInfo && currentSession) {
          // 优先使用后端保存的cropWidth和cropHeight，如果没有则重新计算
          let cropWidth = response.photo.cropInfo.cropWidth || response.photo.cropInfo.sourceWidth
          let cropHeight = response.photo.cropInfo.cropHeight || response.photo.cropInfo.sourceHeight

          // 如果后端没有保存cropWidth/cropHeight，则根据样式类型重新计算
          if (!response.photo.cropInfo.cropWidth || !response.photo.cropInfo.cropHeight) {
            if (response.photo.cropInfo.styleType === 'cover') {
              // cover模式：根据当前session的相纸比例计算裁剪尺寸
              const canvasAspectRatio = currentSession.canvasWidth / currentSession.canvasHeight
              const imageAspectRatio = response.photo.cropInfo.sourceWidth / response.photo.cropInfo.sourceHeight

              if (imageAspectRatio > canvasAspectRatio) {
                // 图片更宽，裁剪左右
                cropWidth = response.photo.cropInfo.sourceHeight * canvasAspectRatio
                cropHeight = response.photo.cropInfo.sourceHeight
              } else {
                // 图片更高，裁剪上下
                cropWidth = response.photo.cropInfo.sourceWidth
                cropHeight = response.photo.cropInfo.sourceWidth / canvasAspectRatio
              }
            }
            // full和lomo模式使用原图尺寸（已经是默认值了）
          }

          simpleCropInfo = {
            offsetX: response.photo.cropInfo.offsetX,
            offsetY: response.photo.cropInfo.offsetY,
            cropWidth: cropWidth,
            cropHeight: cropHeight,
            sourceWidth: response.photo.cropInfo.sourceWidth,
            sourceHeight: response.photo.cropInfo.sourceHeight,
            styleType: (response.photo.cropInfo.styleType || 'cover') as 'cover' | 'full' | 'lomo'
          }
        }

        // 转换服务端数据为前端格式
        const photoData: Image = {
          id: response.photo.photoId,
          sessionId: currentSession.id, // 从当前会话获取
          originalUrl: response.photo.url,
          thumbnailUrl: response.photo.url, // 暂时使用相同 URL
          filename: `photo-${response.photo.photoId}`, // 构造文件名
          width: response.photo.originalWidth,
          height: response.photo.originalHeight,
          printCount: response.photo.quantity,
          isLandscape: response.photo.isLandscape,
          cropMode: response.photo.cropMode ? mapCropModeFromServer(response.photo.cropMode) : 'cover', // 保存后端的cropMode
          editState: {
            mode: initialMode,
            scale: 1,
            x: 0,
            y: 0,
            rotation: response.photo.isLandscape ? 90 : 0,
            canvasWidth: currentSession?.canvasWidth || 127,
            canvasHeight: currentSession?.canvasHeight || 89,
          },
          cropInfo: simpleCropInfo, // 使用从服务端转换的cropInfo
          transform: undefined, // 服务端和前端的 PhotoTransform 类型不兼容，先设为 undefined
          outputUrl: response.photo.outputUrl || response.photo.url, // 设置默认值：如果不存在outputUrl，则使用原图url
        }

        setImage(photoData)
        // 检查订单状态，设置是否锁单
        setIsOrderLocked(response.orderStatus > 1) // 1-已提交 2-生产中等状态锁单

      } catch (error) {
        console.error('获取图片详情失败:', error)
        // 出错时跳转回列表页
        router.push(`/upload?sizeId=${currentSession?.sizeId}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadPhotoData()
  }, [imageId, currentSession, router])

  const handleSave = async (saveData: { cropInfo: SimpleCropInfo | undefined, outputUrl: string }) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法保存编辑。如需修改，请联系客服。')
      return
    }

    // 确定模式
    const mode = saveData.cropInfo?.styleType || 'cover'

    // 打印调试信息
    console.log('💾 编辑页保存:')
    console.log('  - 模式:', mode)
    console.log('  - 输出URL:', saveData.outputUrl)

    try {
      setApiLoading(true, '保存编辑中...')

      await updatePhoto({
        photoId: imageId,
        cropMode: mapCropModeToServer(mode),
        cropInfo: saveData.cropInfo ? {
          canvasWidth: currentSession?.canvasWidth || 127,
          canvasHeight: currentSession?.canvasHeight || 89,
          sourceWidth: saveData.cropInfo.sourceWidth,
          sourceHeight: saveData.cropInfo.sourceHeight,
          offsetX: saveData.cropInfo.offsetX,
          offsetY: saveData.cropInfo.offsetY,
          cropWidth: saveData.cropInfo.cropWidth,
          cropHeight: saveData.cropInfo.cropHeight,
          rotateAngle: 0, // react-easy-crop 不支持旋转，固定为 0
          originalUrl: image?.originalUrl || '',
          styleType: saveData.cropInfo.styleType,
        } : undefined,
        outputUrl: saveData.outputUrl,
      })

      console.log('编辑状态已保存到后端:', imageId)

      // 保存成功，跳转回列表页
      router.push(`/upload?sizeId=${currentSession?.sizeId}`)

    } catch (error) {
      console.error('保存编辑状态失败:', error)
      alert('保存失败，请重试')
    } finally {
      setApiLoading(false)
    }
  }

  if (isLoading || !image || !currentSession) {
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

export default function EditPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    }>
      <EditPageContent />
    </Suspense>
  )
}
