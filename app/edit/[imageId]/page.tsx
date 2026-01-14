'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStore, type SimpleCropInfo, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { GlobalLoading } from '@/components/GlobalLoading'
import { updatePhoto, getPhotoDetail } from '@/lib/api'
import { mapCropModeToServer } from '@/lib/utils'
import { buildOssCropUrl } from '@/lib/image-config'
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
  
  // 使用 useMemo 稳定当前图片的引用，避免不必要的重新渲染
  const currentImageFromStore = useMemo(() => {
    return images.find((img) => img.id === imageId)
  }, [images, imageId])

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
      setIsLoading(true) // 重置加载状态
      setImage(null) // 清空当前图片
    }
    
    // 如果已经初始化过，跳过（避免重复处理）
    if (initializedRef.current) return
    
    // 最佳实践：按优先级查找图片数据
    // 1. 优先从 store 中查找（最快，无网络请求）
    // 2. 如果 store 中没有或没有 URL，从 sessionStorage 查找（点击编辑时保存的）
    // 3. 如果都没有，跳转到列表页
    
    let foundImage = currentImageFromStore
    const hasValidUrl = foundImage && (foundImage.originalUrl || foundImage.thumbnailUrl)
    
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
              (!foundImage.cropInfo && imageData.cropInfo) ||
              (!foundImage.editState && imageData.editState)
            
            if (needsUpdate) {
              updateImage(imageId, {
                originalUrl: imageData.originalUrl || foundImage.originalUrl,
                thumbnailUrl: imageData.thumbnailUrl || foundImage.thumbnailUrl,
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
            addImages([imageData])
            foundImage = imageData
          }
        }
      } catch (error) {
        console.error('从 sessionStorage 读取图片数据失败:', error)
      }
    } else {
      // store 中有图片，但需要确保编辑状态是最新的
      // 如果 sessionStorage 中有更新的数据，使用它（只检查一次）
      try {
        const sessionData = sessionStorage.getItem(`edit-image-${imageId}`)
        if (sessionData) {
          const imageData = JSON.parse(sessionData) as ImageType
          // 合并编辑状态（sessionStorage 中的数据可能更新）
          // 只在真正需要更新时才调用 updateImage
          const needsUpdate = 
            (imageData.cropInfo && (!foundImage.cropInfo || 
              JSON.stringify(foundImage.cropInfo) !== JSON.stringify(imageData.cropInfo))) ||
            (imageData.editState && (!foundImage.editState || 
              JSON.stringify(foundImage.editState) !== JSON.stringify(imageData.editState)))
          
          if (needsUpdate) {
            updateImage(imageId, {
              cropInfo: imageData.cropInfo,
              editState: imageData.editState,
            })
            foundImage = {
              ...foundImage,
              cropInfo: imageData.cropInfo || foundImage.cropInfo,
              editState: imageData.editState || foundImage.editState,
            }
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
    initializedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, currentImageFromStore, hasHydrated, currentSession?.id])

  const handleSave = async (cropInfo: SimpleCropInfo | undefined) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法保存编辑。如需修改，请联系客服。')
      return
    }
    
    // 确定模式
    const mode = cropInfo?.styleType || image?.cropInfo?.styleType || 'cover'
    
    // 打印 OSS 裁剪 URL（调试）
    if (cropInfo && image) {
      const originalUrl = image.originalUrl || image.thumbnailUrl || ''
      const ossCropUrl = buildOssCropUrl(originalUrl, cropInfo, image.autoRotated)
      console.log('💾 编辑页保存 - x-oss-process URL:', ossCropUrl)
    }
    
    // 保存裁剪信息到本地 store
    updateImage(imageId, { 
      cropInfo: cropInfo || undefined,
      // 同时更新 editState 保持兼容性
      editState: cropInfo ? {
        mode: cropInfo.styleType,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        canvasWidth: currentSession?.canvasWidth || 127,
        canvasHeight: currentSession?.canvasHeight || 89,
      } : null,
      // 清除旧的 transform（不再需要）
      transform: undefined,
    })
    
    // 同步保存到后端（异步执行，不阻塞UI）
    try {
      setApiLoading(true, '保存编辑中...')
      await updatePhoto({
        photoId: imageId,
        cropMode: mapCropModeToServer(mode),
        // 新版本：传递完整的 cropInfo，包含 cropWidth 和 cropHeight
        cropInfo: cropInfo ? {
          canvasWidth: currentSession?.canvasWidth || 127,
          canvasHeight: currentSession?.canvasHeight || 89,
          sourceWidth: cropInfo.sourceWidth,
          sourceHeight: cropInfo.sourceHeight,
          offsetX: cropInfo.offsetX,
          offsetY: cropInfo.offsetY,
          cropWidth: cropInfo.cropWidth, // 保存裁剪宽度
          cropHeight: cropInfo.cropHeight, // 保存裁剪高度
          rotateAngle: 0, // react-easy-crop 不支持旋转，固定为 0
          originalUrl: image?.originalUrl || '',
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
