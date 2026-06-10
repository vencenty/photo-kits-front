'use client'

import { useEffect, useState, Suspense, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useShopRouter } from '@/lib/useShopRouter'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useStore, type SimpleCropInfo, type Image, type Session } from '@/lib/store'
import ImageEditor from '@/components/ImageEditor'
import { updatePhoto, getPhotoDetail, listPhotos, getOrderDetail } from '@/lib/api'
import { mapCropModeToServer, mapCropModeFromServer } from '@/lib/utils'
import { buildOssCropUrl } from '@/lib/image-config'
import { isOrderLocked as checkOrderLocked } from '@/lib/constants'
import { setActiveOrderNo } from '@/lib/order-context'
import { preloadCatalog, getCropConfigForSku } from '@/lib/catalog'
import { getSpecWatermarkPref } from '@/lib/spec-watermark-prefs'

function EditPageContent() {
  const router = useShopRouter()
  const searchParams = useSearchParams()
  const imageId = searchParams.get('imageId') as string
  const filter = searchParams.get('filter') // 🎯 读取过滤参数：'unadjusted' 表示只浏览未调整的图片

  const currentSession = useStore((state) => state.currentSession)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  // 🚀 乐观更新：获取 store 方法
  const updateImage = useStore((state) => state.updateImage)
  const forceRefetch = useStore((state) => state.forceRefetch)
  const hasHydrated = useStore((state) => state._hasHydrated)
  // 获取所有图片列表（用于上一张/下一张导航）
  const allImages = useStore((state) => state.images)
  const [image, setImage] = useState<Image | null>(null)
  const [isOrderLocked, setIsOrderLocked] = useState(false)
  const [currentImageId, setCurrentImageId] = useState<string | null>(imageId)
  const loadGenerationRef = useRef(0)
  const listFetchedSpecRef = useRef<number | null>(null)

  const buildImageFromPhoto = useCallback((
    photo: Awaited<ReturnType<typeof getPhotoDetail>>['photo'],
    session: Session,
    orderStatus?: number,
  ): Image | null => {
    const getInitialMode = (): 'cover' | 'full' | 'lomo' => {
      const cropMode = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : 'cover'
      return cropMode
    }
    const initialMode = getInitialMode()

    let simpleCropInfo: SimpleCropInfo | undefined
    if (photo.cropInfo) {
      let cropWidth = photo.cropInfo.cropWidth || photo.cropInfo.sourceWidth
      let cropHeight = photo.cropInfo.cropHeight || photo.cropInfo.sourceHeight

      if (!photo.cropInfo.cropWidth || !photo.cropInfo.cropHeight) {
        if (photo.cropInfo.styleType === 'cover') {
          const canvasAspectRatio = session.canvasWidth / session.canvasHeight
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

      const backendCroppedAreaPercent = (photo.cropInfo as { croppedAreaPercent?: SimpleCropInfo['croppedAreaPercent'] }).croppedAreaPercent
      const calculatedCroppedAreaPercent = photo.cropInfo.sourceWidth && photo.cropInfo.sourceHeight ? {
        x: (photo.cropInfo.offsetX / photo.cropInfo.sourceWidth) * 100,
        y: (photo.cropInfo.offsetY / photo.cropInfo.sourceHeight) * 100,
        width: (cropWidth / photo.cropInfo.sourceWidth) * 100,
        height: (cropHeight / photo.cropInfo.sourceHeight) * 100,
      } : undefined

      simpleCropInfo = {
        offsetX: photo.cropInfo.offsetX,
        offsetY: photo.cropInfo.offsetY,
        cropWidth,
        cropHeight,
        sourceWidth: photo.cropInfo.sourceWidth,
        sourceHeight: photo.cropInfo.sourceHeight,
        styleType: (photo.cropInfo.styleType || 'cover') as 'cover' | 'full' | 'lomo',
        croppedAreaPercent: backendCroppedAreaPercent || calculatedCroppedAreaPercent,
      }
    }

    if (orderStatus !== undefined) {
      const locked = checkOrderLocked(orderStatus)
      setIsOrderLocked(locked)
      if (locked) {
        alert('订单已锁单，无法编辑照片。如需修改，请联系客服。')
        router.push(`/upload?specId=${session.specId}`)
        return null
      }
    }

    return {
      id: photo.photoId,
      specId: session.specId,
      originalUrl: photo.url,
      thumbnailUrl: photo.url,
      filename: `photo-${photo.photoId}`,
      width: photo.originalWidth,
      height: photo.originalHeight,
      printCount: photo.quantity,
      isLandscape: photo.isLandscape,
      cropMode: photo.cropMode ? mapCropModeFromServer(photo.cropMode) : 'cover',
      editState: {
        mode: initialMode,
        scale: 1,
        x: 0,
        y: 0,
        rotation: photo.isLandscape ? 90 : 0,
        canvasWidth: session.canvasWidth || 127,
        canvasHeight: session.canvasHeight || 89,
      },
      cropInfo: simpleCropInfo,
      outputUrl: photo.outputUrl || photo.url,
      isAdjusted: photo.isAdjusted || false,
    }
  }, [router])

  const isStoreImageReady = useCallback((img: Image | undefined): img is Image => {
    return !!(img?.originalUrl && img.width && img.height)
  }, [])
  const images = useMemo(() => {
    // 过滤当前 session 的图片
    const sessionImages = allImages.filter(img => 
      (img.thumbnailUrl || img.originalUrl) && img.specId === currentSession?.specId
    )
    
    // 如果 filter=unadjusted，只返回未调整的图片
    if (filter === 'unadjusted') {
      return sessionImages.filter(img => !img.isAdjusted)
    }
    
    // 默认返回所有图片
    return sessionImages
  }, [allImages, currentSession?.specId, filter])

  // 🚀 优化：使用 currentImageId 而不是 imageId 来计算位置
  const currentIndex = images.findIndex(img => img.id === (currentImageId || imageId))
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1

  const sessionSpecId = currentSession?.specId

  // 刷新 / 直链进入：无 session 时根据照片详情恢复规格上下文
  useEffect(() => {
    if (!hasHydrated || !imageId) return
    if (useStore.getState().currentSession) return

    let cancelled = false

    const restoreSession = async () => {
      try {
        const detail = await getPhotoDetail(imageId)
        if (cancelled) return

        setActiveOrderNo(detail.orderNo)
        await preloadCatalog().catch(() => null)

        const order = await getOrderDetail(undefined, false)
        if (cancelled) return

        const spec = order.specs?.find((s) => s.id === detail.photo.specId)
        if (!spec) {
          router.push('/')
          return
        }

        const crop = getCropConfigForSku(spec.skuId)
        setCurrentSession({
          specId: spec.id,
          skuId: spec.skuId,
          orderNo: detail.orderNo,
          sizeName: `${spec.paperName} ${spec.sizeName}`,
          targetCount: 0,
          currentCount: spec.photoCount || 0,
          canvasWidth: spec.canvasWidth,
          canvasHeight: spec.canvasHeight,
          unit: '毫米',
          ratio: spec.canvasWidth / spec.canvasHeight,
          cropDefaultMode: crop.defaultMode,
          cropAvailableModes: crop.availableModes,
          dateWatermarkEnabled: getSpecWatermarkPref(detail.orderNo, spec.id),
          createdAt: new Date().toISOString(),
        })
      } catch (error) {
        if (cancelled) return
        console.error('恢复编辑会话失败:', error)
        router.push('/')
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [hasHydrated, imageId, setCurrentSession, router])

  // 列表加载进 store 后，优先用 store 中的完整图片数据
  useEffect(() => {
    if (!hasHydrated) return
    const targetImageId = currentImageId || imageId
    const session = useStore.getState().currentSession
    if (!targetImageId || !session) return

    const storeImage = allImages.find(
      (img) => img.id === targetImageId && img.specId === session.specId,
    )
    if (isStoreImageReady(storeImage)) {
      setImage(storeImage)
    }
  }, [hasHydrated, allImages, currentImageId, imageId, sessionSpecId, isStoreImageReady])

  // 切换照片：优先 store，缺失时请求 detail（被打断后可重试，不用 ref 卡死）
  useEffect(() => {
    const targetImageId = currentImageId || imageId
    if (!hasHydrated || !targetImageId) return

    const session = useStore.getState().currentSession
    if (!session) return

    const storeImage = useStore.getState().images.find(
      (img) => img.id === targetImageId && img.specId === session.specId,
    )
    if (isStoreImageReady(storeImage)) {
      setImage(storeImage)
      return
    }

    const generation = ++loadGenerationRef.current
    let cancelled = false

    const loadPhotoData = async () => {
      try {
        const response = await getPhotoDetail(targetImageId)
        if (cancelled || generation !== loadGenerationRef.current) return

        const liveSession = useStore.getState().currentSession
        if (!liveSession) return

        const photoData = buildImageFromPhoto(response.photo, liveSession, response.orderStatus)
        if (photoData) {
          setImage(photoData)
        }
      } catch (error) {
        if (cancelled || generation !== loadGenerationRef.current) return
        console.error('获取图片详情失败:', error)
        const specId = useStore.getState().currentSession?.specId
        router.push(specId ? `/upload?specId=${specId}` : '/')
      }
    }

    loadPhotoData()
    return () => {
      cancelled = true
    }
  }, [hasHydrated, currentImageId, imageId, sessionSpecId, buildImageFromPhoto, isStoreImageReady, router])

  // 🚀 如果 images 为空（刷新后），从后端加载图片列表（每个 spec 只拉一次）
  useEffect(() => {
    if (!hasHydrated || !sessionSpecId) return
    if (listFetchedSpecRef.current === sessionSpecId) return

    const hasSpecImages = useStore.getState().images.some(
      (img) => img.specId === sessionSpecId && (img.thumbnailUrl || img.originalUrl),
    )
    if (hasSpecImages) {
      listFetchedSpecRef.current = sessionSpecId
      return
    }

    listFetchedSpecRef.current = sessionSpecId
    let cancelled = false

    const loadImagesList = async () => {
      try {
        const specId = sessionSpecId
        const session = useStore.getState().currentSession
        if (!session || session.specId !== specId) return

        console.log('🔄 编辑页刷新后，从后端加载图片列表...')
        const result = await listPhotos(specId)
        if (cancelled) return
        
        if (result.photos && result.photos.length > 0) {
          const latestImages = useStore.getState().images
          const existingImagesMap = new Map(
            latestImages
              .filter(img => img.specId === session.specId)
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
                if (photo.cropInfo.styleType === 'cover') {
                  const canvasAspectRatio = session.canvasWidth / session.canvasHeight
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
              specId: session.specId,
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
            useStore.getState().updateImages(imagesToUpdate)
          }
          if (newImages.length > 0) {
            useStore.getState().addImages(newImages)
          }
          
          console.log('✅ 图片列表加载完成:', { 新增: newImages.length, 更新: imagesToUpdate.length })
        }
      } catch (error) {
        if (!cancelled) {
          console.error('加载图片列表失败:', error)
        }
      }
    }

    loadImagesList()
    return () => {
      cancelled = true
    }
  }, [hasHydrated, sessionSpecId])

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
          // 🎯 保存百分比坐标，用于恢复裁剪位置（官方推荐）
          croppedAreaPercent: saveData.cropInfo.croppedAreaPercent,
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
          (img.thumbnailUrl || img.originalUrl) && img.specId === currentSession?.specId
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
            router.push(`/upload?specId=${currentSession?.specId}`)
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
    }
  }

  // 🚀 优化：上一张/下一张导航 - 只更新状态，不触发路由跳转
  const handlePrevious = () => {
    if (hasPrevious) {
      const prevImage = images[currentIndex - 1]
      loadGenerationRef.current += 1
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
      loadGenerationRef.current += 1
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
      loadGenerationRef.current += 1
      setCurrentImageId(imageId)
    }
  }, [imageId, currentImageId])

  const dateWatermarkEnabled = currentSession?.dateWatermarkEnabled ?? false

  if (!hasHydrated || !currentSession || !image) {
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center md:py-6">
          <button
            onClick={() => router.push(`/upload?specId=${currentSession?.specId}`)}
            className="mr-4 p-2 hover:bg-white/10 rounded-full transition-colors desktop-hover"
          >
            <ArrowLeft className="w-6 h-6 md:w-7 md:h-7 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white md:text-xl">照片编辑</h1>
        </div>
      </div>

      {/* Editor */}
      <ImageEditor
        image={image}
        canvasWidth={currentSession.canvasWidth}
        canvasHeight={currentSession.canvasHeight}
        cropDefaultMode={currentSession.cropDefaultMode}
        cropAvailableModes={currentSession.cropAvailableModes}
        dateWatermarkEnabled={dateWatermarkEnabled}
        onSave={handleSave}
        onCancel={() => router.push(`/upload?specId=${currentSession?.specId}`)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        allImages={images}
        currentIndex={currentIndex}
      />
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
