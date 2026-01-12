'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStore, type PhotoTransform, type CropInfo, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { GlobalLoading } from '@/components/GlobalLoading'
import { updatePhoto, getPhotoDetail } from '@/lib/api'
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
  const [isOrderLocked, setIsOrderLocked] = useState(false)
  
  // 使用 ref 跟踪是否已经初始化，避免无限循环
  const initializedRef = useRef(false)
  const lastImageIdRef = useRef<string | null>(null)
  const orderStatusCheckedRef = useRef<string | null>(null) // 跟踪已检查过订单状态的 photo_id

  // 检查订单状态（根据 photo_id 获取照片信息和订单状态）- 只调用一次
  useEffect(() => {
    const checkOrderStatus = async () => {
      if (!imageId) return
      
      // 如果已经检查过这个 photo_id，不再重复调用
      if (orderStatusCheckedRef.current === imageId) {
        return
      }
      
      try {
        orderStatusCheckedRef.current = imageId // 标记为已检查
        const photoDetail = await getPhotoDetail(imageId)
        // 状态2（生产中）表示客户已确认/锁单
        setIsOrderLocked(photoDetail.orderStatus === 2)
        
        // 如果已锁单，提示并返回
        if (photoDetail.orderStatus === 2) {
          alert('订单已锁单，无法编辑照片。如需修改，请联系客服。')
          router.back()
        }
      } catch (error) {
        console.error('获取照片详情失败:', error)
        // 即使失败也标记为已检查，避免重复调用
      }
    }
    
    if (imageId && orderStatusCheckedRef.current !== imageId) {
      checkOrderStatus()
    }
  }, [imageId, router])

  useEffect(() => {
    // 等待 hydration 完成
    if (!hasHydrated || !currentSession) return
    
    // 如果 imageId 改变，重置初始化状态
    if (lastImageIdRef.current !== imageId) {
      initializedRef.current = false
      lastImageIdRef.current = imageId
    }
    
    // 最佳实践：按优先级查找图片数据
    // 1. 优先从 store 中查找（最快，无网络请求）
    // 2. 如果 store 中没有或没有 URL，从 sessionStorage 查找（点击编辑时保存的）
    // 3. 如果都没有，跳转到列表页
    
    let foundImage = images.find((img) => img.id === imageId)
    const hasValidUrl = foundImage && (foundImage.originalUrl || foundImage.thumbnailUrl)
    
    // 如果已经初始化过，且找到了有效的图片，直接设置（避免重复处理）
    if (initializedRef.current && foundImage && hasValidUrl) {
      // 只在图片数据真正改变时才更新 state
      if (image?.id !== foundImage.id || 
          image?.originalUrl !== foundImage.originalUrl ||
          image?.transform !== foundImage.transform) {
        setImage(foundImage)
      }
      return
    }
    
    // 如果 store 中没有或没有有效的 URL，尝试从 sessionStorage 读取
    if (!foundImage || !hasValidUrl) {
      try {
        const sessionData = sessionStorage.getItem(`edit-image-${imageId}`)
        if (sessionData) {
          const imageData = JSON.parse(sessionData) as ImageType
          // 如果 store 中有图片但缺少 URL 或编辑状态，更新它
          if (foundImage) {
            // 只在真正需要更新时才调用 updateImage（避免循环）
            const needsUpdate = 
              (!foundImage.originalUrl && imageData.originalUrl) ||
              (!foundImage.thumbnailUrl && imageData.thumbnailUrl) ||
              (!foundImage.transform && imageData.transform) ||
              (!foundImage.cropInfo && imageData.cropInfo) ||
              (!foundImage.editState && imageData.editState)
            
            if (needsUpdate && !initializedRef.current) {
              updateImage(imageId, {
                originalUrl: imageData.originalUrl || foundImage.originalUrl,
                thumbnailUrl: imageData.thumbnailUrl || foundImage.thumbnailUrl,
                transform: imageData.transform || foundImage.transform,
                cropInfo: imageData.cropInfo || foundImage.cropInfo,
                editState: imageData.editState || foundImage.editState,
              })
            }
            foundImage = { 
              ...foundImage, 
              ...imageData,
              // 确保 URL 优先使用 sessionStorage 中的数据
              originalUrl: imageData.originalUrl || foundImage.originalUrl,
              thumbnailUrl: imageData.thumbnailUrl || foundImage.thumbnailUrl,
            }
          } else {
            // 添加到 store（只添加一次，避免循环）
            if (!initializedRef.current) {
              addImages([imageData])
            }
            foundImage = imageData
          }
        }
      } catch (error) {
        console.error('从 sessionStorage 读取图片数据失败:', error)
      }
    } else {
      // store 中有图片，但需要确保编辑状态是最新的
      // 如果 sessionStorage 中有更新的数据，使用它（只检查一次）
      if (!initializedRef.current) {
        try {
          const sessionData = sessionStorage.getItem(`edit-image-${imageId}`)
          if (sessionData) {
            const imageData = JSON.parse(sessionData) as ImageType
            // 合并编辑状态（sessionStorage 中的数据可能更新）
            // 只在真正需要更新时才调用 updateImage
            const needsUpdate = 
              (imageData.transform && (!foundImage.transform || 
                JSON.stringify(foundImage.transform) !== JSON.stringify(imageData.transform))) ||
              (imageData.editState && (!foundImage.editState || 
                JSON.stringify(foundImage.editState) !== JSON.stringify(imageData.editState)))
            
            if (needsUpdate) {
              updateImage(imageId, {
                transform: imageData.transform,
                cropInfo: imageData.cropInfo,
                editState: imageData.editState,
              })
              foundImage = {
                ...foundImage,
                transform: imageData.transform || foundImage.transform,
                cropInfo: imageData.cropInfo || foundImage.cropInfo,
                editState: imageData.editState || foundImage.editState,
              }
            }
          }
        } catch (error) {
          console.error('从 sessionStorage 读取图片数据失败:', error)
        }
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
    initializedRef.current = true
  }, [imageId, images, hasHydrated, currentSession, router, image, updateImage, addImages])

  const handleSave = async (transform: PhotoTransform | undefined, cropInfo: CropInfo | undefined) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法保存编辑。如需修改，请联系客服。')
      return
    }
    
    // 确定模式（从 transform 或当前图片的 transform 中获取）
    const mode = transform?.styleType || image?.transform?.styleType || 'cover'
    
    // 保存变换信息到本地 store
    // 即使 transform 是 undefined，也要确保 editState 包含正确的 mode（从 cropMode 或其他地方获取）
    updateImage(imageId, { 
      transform: transform || undefined,
      cropInfo: cropInfo || undefined,
      editState: transform ? {
        mode: transform.styleType,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        canvasWidth: transform.outputWidth,
        canvasHeight: transform.outputHeight,
      } : (mode ? {
        mode: mode as 'cover' | 'full' | 'lomo',
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        canvasWidth: currentSession?.canvasWidth || 127,
        canvasHeight: currentSession?.canvasHeight || 89,
      } : null),
    })
    
    // 同步保存到后端（异步执行，不阻塞UI）
    try {
      setApiLoading(true, '保存编辑中...')
      await updatePhoto({
        photoId: imageId,
        cropMode: mapCropModeToServer(mode),
        // transform 用于前端回显（包括 lomo 和 full 模式）
        // cropInfo 只用于 cover 模式的服务端处理
        transform: transform ? {
          matrix: transform.matrix,
          outputWidth: transform.outputWidth,
          outputHeight: transform.outputHeight,
          sourceWidth: transform.sourceWidth,
          sourceHeight: transform.sourceHeight,
          styleType: transform.styleType,
          // 变换参数（用于前端回显）
          rotateAngle: transform.rotateAngle,
          scale: transform.scale,
          translateX: transform.translateX,
          translateY: transform.translateY,
          originalUrl: transform.originalUrl,
        } : undefined,
        cropInfo: cropInfo ? {
          canvasWidth: cropInfo.canvasWidth,
          canvasHeight: cropInfo.canvasHeight,
          sourceWidth: cropInfo.sourceWidth,
          sourceHeight: cropInfo.sourceHeight,
          offsetX: cropInfo.offsetX,
          offsetY: cropInfo.offsetY,
          rotateAngle: cropInfo.rotateAngle,
          originalUrl: cropInfo.originalUrl,
          styleType: cropInfo.styleType,
        } : undefined,
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
