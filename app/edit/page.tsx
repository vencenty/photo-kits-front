'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useStore, type SimpleCropInfo, type Image } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { GlobalLoading } from '@/components/GlobalLoading'
import { updatePhoto, getPhotoDetail, listPhotos } from '@/lib/api'
import { mapCropModeToServer, mapCropModeFromServer } from '@/lib/utils'
import { buildOssCropUrl } from '@/lib/image-config'
import { isOrderLocked as checkOrderLocked } from '@/lib/constants'

function EditPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const imageId = searchParams.get('imageId') as string
  const filter = searchParams.get('filter') // 🎯 读取过滤参数：'unadjusted' 表示只浏览未调整的图片

  const currentSession = useStore((state) => state.currentSession)
  const setApiLoading = useStore((state) => state.setApiLoading)
  // 🚀 乐观更新：获取 store 方法
  const updateImage = useStore((state) => state.updateImage)
  const forceRefetch = useStore((state) => state.forceRefetch)
  const hasHydrated = useStore((state) => state._hasHydrated)
  // 获取所有图片列表（用于上一张/下一张导航）
  const allImages = useStore((state) => state.images)
  const addImages = useStore((state) => state.addImages)
  const updateImages = useStore((state) => state.updateImages)

  const [image, setImage] = useState<Image | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOrderLocked, setIsOrderLocked] = useState(false)
  const [imagesLoaded, setImagesLoaded] = useState(false) // 标记是否已加载图片列表
  const [currentImageId, setCurrentImageId] = useState<string | null>(imageId) // 🚀 优化：使用状态管理当前图片ID，避免路由跳转

  // 🎯 根据 filter 参数过滤图片列表（用于导航）
  const images = useMemo(() => {
    // 过滤当前 session 的图片
    const sessionImages = allImages.filter(img => 
      (img.thumbnailUrl || img.originalUrl) && img.sessionId === currentSession?.id
    )
    
    // 如果 filter=unadjusted，只返回未调整的图片
    if (filter === 'unadjusted') {
      return sessionImages.filter(img => !img.isAdjusted)
    }
    
    // 默认返回所有图片
    return sessionImages
  }, [allImages, currentSession?.id, filter])

  // 🚀 优化：使用 currentImageId 而不是 imageId 来计算位置
  const currentIndex = images.findIndex(img => img.id === (currentImageId || imageId))
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1
  
  // 🚀 优化：从 store 中获取当前图片数据，避免每次都从服务端加载
  const currentImage = useMemo(() => {
    const targetId = currentImageId || imageId
    return images.find(img => img.id === targetId) || null
  }, [images, currentImageId, imageId])


  // 🚀 优化：当 currentImageId 变化时，优先从 store 获取，如果没有再从服务端加载
  useEffect(() => {
    const targetImageId = currentImageId || imageId
    if (!targetImageId || !currentSession) return

    // 如果 store 中已有该图片的完整数据，直接使用
    if (currentImage && currentImage.originalUrl && currentImage.width && currentImage.height) {
      console.log('✅ 从 store 获取图片数据，跳过服务端请求:', targetImageId)
      setImage(currentImage)
      setIsLoading(false)
      return
    }

    // 否则从服务端加载
    const loadPhotoData = async () => {
      try {
        setIsLoading(true)
        const response = await getPhotoDetail(targetImageId)

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
            styleType: (response.photo.cropInfo.styleType || 'cover') as 'cover' | 'full' | 'lomo',
            // 🎯 恢复百分比坐标（官方推荐用于恢复裁剪位置）
            croppedAreaPercent: (response.photo.cropInfo as any).croppedAreaPercent,
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
          outputUrl: response.photo.outputUrl || response.photo.url, // 设置默认值：如果不存在outputUrl，则使用原图url
          isAdjusted: response.photo.isAdjusted || false, // 🎯 设置是否已调整
        }

        setImage(photoData)
        // 检查订单状态，设置是否锁单
        const locked = checkOrderLocked(response.orderStatus)
        setIsOrderLocked(locked)
        
        // 如果订单已锁定，直接跳转回列表页
        if (locked) {
          alert('订单已锁单，无法编辑照片。如需修改，请联系客服。')
          router.push(`/upload?sizeId=${currentSession?.sizeId}`)
          return
        }

      } catch (error) {
        console.error('获取图片详情失败:', error)
        // 出错时跳转回列表页
        router.push(`/upload?sizeId=${currentSession?.sizeId}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadPhotoData()
  }, [currentImageId, imageId, currentSession, router, currentImage])

  // 🚀 如果 images 为空（刷新后），从后端加载图片列表
  useEffect(() => {
    if (!hasHydrated || !currentSession || imagesLoaded) return
    if (images.length > 0) {
      // 如果已有图片，不需要加载
      setImagesLoaded(true)
      return
    }

    const loadImagesList = async () => {
      try {
        const orderSn = currentSession.orderNo || currentSession.id.split('-')[0]
        const specId = currentSession.sizeId
        
        if (!orderSn) return

        console.log('🔄 编辑页刷新后，从后端加载图片列表...')
        const result = await listPhotos(orderSn, specId)
        
        if (result.photos && result.photos.length > 0) {
          // 获取当前已有的图片（避免重复）
          const existingImagesMap = new Map(
            images
              .filter(img => img.sessionId === currentSession.id)
              .map(img => [img.id, img])
          )

          // 转换服务端数据为前端格式
          const newImages: Image[] = []
          const imagesToUpdate: { id: string; updates: Partial<Image> }[] = []

          result.photos.forEach(photo => {
            const finalStyleType = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : 'cover'
            
            let simpleCropInfo: SimpleCropInfo | undefined
            if (photo.cropInfo) {
              let cropWidth = photo.cropInfo.cropWidth || photo.cropInfo.sourceWidth
              let cropHeight = photo.cropInfo.cropHeight || photo.cropInfo.sourceHeight

              if (!photo.cropInfo.cropWidth || !photo.cropInfo.cropHeight) {
                if (photo.cropInfo.styleType === 'cover' && currentSession) {
                  const canvasAspectRatio = currentSession.canvasWidth / currentSession.canvasHeight
                  const imageAspectRatio = photo.cropInfo.sourceWidth / photo.cropInfo.sourceHeight

                  if (imageAspectRatio > canvasAspectRatio) {
                    cropWidth = photo.cropInfo.sourceHeight * canvasAspectRatio
                    cropHeight = photo.cropInfo.sourceHeight
                  } else {
                    cropWidth = photo.cropInfo.sourceWidth
                    cropHeight = photo.cropInfo.sourceWidth / canvasAspectRatio
                  }
                }
              }

              simpleCropInfo = {
                offsetX: photo.cropInfo.offsetX,
                offsetY: photo.cropInfo.offsetY,
                cropWidth: cropWidth,
                cropHeight: cropHeight,
                sourceWidth: photo.cropInfo.sourceWidth,
                sourceHeight: photo.cropInfo.sourceHeight,
                styleType: (photo.cropInfo.styleType || 'cover') as 'cover' | 'full' | 'lomo',
                // 🎯 恢复百分比坐标（官方推荐用于恢复裁剪位置）
                croppedAreaPercent: (photo.cropInfo as any).croppedAreaPercent,
              }
            }

            const imageData: Image = {
              id: photo.photoId,
              sessionId: currentSession.id,
              originalUrl: photo.url,
              thumbnailUrl: photo.url,
              filename: `photo-${photo.photoId}`,
              width: photo.originalWidth,
              height: photo.originalHeight,
              printCount: photo.quantity,
              isLandscape: photo.isLandscape,
              cropMode: finalStyleType,
              editState: null,
              cropInfo: simpleCropInfo,
              isAdjusted: photo.isAdjusted || false, // 🎯 设置是否已调整
              outputUrl: photo.outputUrl || photo.url,
              uploadStatus: {
                ossUploaded: true,
                backendSynced: true,
              },
            }

            const existingImage = existingImagesMap.get(photo.photoId)
            if (existingImage) {
              // 已存在的图片，更新数据
              imagesToUpdate.push({
                id: photo.photoId,
                updates: {
                  originalUrl: photo.url,
                  thumbnailUrl: existingImage.thumbnailUrl || photo.url,
                  printCount: photo.quantity,
                  cropMode: finalStyleType,
                  cropInfo: simpleCropInfo,
                  isAdjusted: photo.isAdjusted || false, // 🎯 设置是否已调整
                  outputUrl: photo.outputUrl || photo.url,
                  width: photo.originalWidth,
                  height: photo.originalHeight,
                  isLandscape: photo.isLandscape,
                },
              })
            } else {
              // 新图片，添加到列表
              newImages.push(imageData)
            }
          })

          // 批量更新和添加
          if (imagesToUpdate.length > 0) {
            updateImages(imagesToUpdate)
          }
          if (newImages.length > 0) {
            addImages(newImages)
          }
          
          setImagesLoaded(true)
          console.log('✅ 图片列表加载完成:', { 新增: newImages.length, 更新: imagesToUpdate.length })
        }
      } catch (error) {
        console.error('加载图片列表失败:', error)
        // 即使失败也标记为已加载，避免重复请求
        setImagesLoaded(true)
      }
    }

    loadImagesList()
  }, [hasHydrated, currentSession, images.length, imagesLoaded, addImages])

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

      // 1️⃣ 保存到后端
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
          rotateAngle: 0, // 不需要旋转，固定为 0
          originalUrl: image?.originalUrl || '',
          styleType: saveData.cropInfo.styleType,
        } : undefined,
        outputUrl: saveData.outputUrl,
      })

      console.log('✅ 编辑状态已保存到后端:', imageId)

      // 2️⃣ 🚀 乐观更新：立即更新本地 store
      updateImage(imageId, {
        cropInfo: saveData.cropInfo,
        cropMode: mode,
        outputUrl: saveData.outputUrl,
        isAdjusted: true, // 标记为已调整
      })
      console.log('✅ 本地缓存已更新:', { mode, cropInfo: saveData.cropInfo, isAdjusted: true })

      // 2.5️⃣ 更新本地 image 状态，以便 ImageEditor 显示"已调整"标签
      setImage(prev => prev ? {
        ...prev,
        cropInfo: saveData.cropInfo,
        cropMode: mode,
        outputUrl: saveData.outputUrl,
        isAdjusted: true,
      } : null)

      // 3️⃣ 🚀 标记需要后台刷新验证
      forceRefetch()
      console.log('✅ 已标记需要后台刷新')

      // 3.5️⃣ 🎯 如果是在 unadjusted 过滤模式下，检查是否还有未调整的图片
      if (filter === 'unadjusted') {
        // 获取当前 session 的所有图片
        const sessionImages = allImages.filter(img => 
          (img.thumbnailUrl || img.originalUrl) && img.sessionId === currentSession?.id
        )
        
        // 获取所有未调整的图片（排除当前刚保存的）
        const remainingUnadjusted = sessionImages.filter(img => 
          img.id !== imageId && !img.isAdjusted
        )
        
        if (remainingUnadjusted.length === 0) {
          // 🎯 所有图片都已调整，2秒后自动跳转到列表页
          console.log('✅ 所有图片已调整完成，2秒后跳转到列表页')
          toast.success('恭喜！所有照片已调整完成，即将返回列表页...', {
            duration: 2000,
          })
          setTimeout(() => {
            router.push(`/upload?sizeId=${currentSession?.sizeId}`)
          }, 2000)
          return // 提前返回，避免显示下面的提示
        } else {
          // 还有未调整的图片，自动跳转到下一张未调整的图片
          const nextUnadjusted = remainingUnadjusted[0]
          console.log(`✅ 还有 ${remainingUnadjusted.length} 张未调整，请到下一张未调整的照片进行编辑`)
          // 更新 URL，保持 filter 参数，并同步状态中的当前图片 ID
          const url = `/edit?imageId=${nextUnadjusted.id}&filter=unadjusted`
          router.replace(url)
          setCurrentImageId(nextUnadjusted.id)
          toast.success(`保存成功！还有 ${remainingUnadjusted.length} 张照片待调整，已为您跳转到下一张未调整的照片`)
          return // 提前返回，避免显示下面的提示
        }
      }

      // 4️⃣ 保存成功提示，不跳转，继续停留在编辑页
      toast.success('保存成功，请继续编辑其他照片')
      console.log('✅ 保存成功，继续停留在编辑页')

    } catch (error) {
      console.error('保存编辑状态失败:', error)
      toast.error('保存失败，请重试')
    } finally {
      setApiLoading(false)
    }
  }

  // 🚀 优化：上一张/下一张导航 - 只更新状态，不触发路由跳转
  const handlePrevious = () => {
    if (hasPrevious) {
      const prevImage = images[currentIndex - 1]
      // 只更新 URL 参数（用于浏览器历史记录），但不触发页面重新加载
      const url = filter 
        ? `/edit?imageId=${prevImage.id}&filter=${filter}`
        : `/edit?imageId=${prevImage.id}`
      // 使用 replace 而不是 push，避免产生过多历史记录
      router.replace(url)
      // 更新当前图片ID，触发图片切换
      setCurrentImageId(prevImage.id)
    }
  }

  const handleNext = () => {
    if (hasNext) {
      const nextImage = images[currentIndex + 1]
      // 只更新 URL 参数（用于浏览器历史记录），但不触发页面重新加载
      const url = filter 
        ? `/edit?imageId=${nextImage.id}&filter=${filter}`
        : `/edit?imageId=${nextImage.id}`
      // 使用 replace 而不是 push，避免产生过多历史记录
      router.replace(url)
      // 更新当前图片ID，触发图片切换
      setCurrentImageId(nextImage.id)
    }
  }
  
  // 🚀 优化：当 URL 中的 imageId 变化时（比如直接访问或刷新），同步更新 currentImageId
  useEffect(() => {
    if (imageId && imageId !== currentImageId) {
      setCurrentImageId(imageId)
    }
  }, [imageId])

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
            onClick={() => router.push(`/upload?sizeId=${currentSession?.sizeId}`)}
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
        sizeId={currentSession.sizeId}
        onSave={handleSave}
        onCancel={() => router.push(`/upload?sizeId=${currentSession?.sizeId}`)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        allImages={images}
        currentIndex={currentIndex}
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
