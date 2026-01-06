'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Plus, X, Minus, Upload, Home, CheckSquare, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore, EditState, parseAffineMatrix } from '@/lib/store'
import { getPhotoSizeById } from '@/lib/photo-sizes'
import { generateId, compressImage, getImageDimensions, mapCropModeToServer, mapCropModeFromServer } from '@/lib/utils'
import type { Image as ImageType } from '@/lib/store'
import { PhotoPreviewCard } from '@/components/PhotoPreviewCard'
import { 
  getOssSignature, 
  uploadToOss, 
  addPhotoToOrder, 
  updatePhoto, 
  deletePhotoFromOrder, 
  submitOrder,
  listPhotos,
  batchUpdatePhotos,
  OssSignature,
  PhotoTransform
} from '@/lib/api'

// 裁剪模式类型
type CropMode = 'center' | 'full' | 'lomo'

export default function UploadPage() {
  const router = useRouter()
  const params = useParams()
  const sizeId = params.sizeId as string
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true)
  const [ossSignature, setOssSignature] = useState<OssSignature | null>(null)
  const loadedRef = useRef(false) // 防止重复加载

  const currentSession = useStore((state) => state.currentSession)
  const hasHydrated = useStore((state) => state._hasHydrated)
  const allImages = useStore((state) => state.images)
  // 过滤当前 session 的图片（有 thumbnailUrl 或 originalUrl）
  const images = allImages.filter(img => 
    (img.thumbnailUrl || img.originalUrl) && img.sessionId === currentSession?.id
  )
  const addImages = useStore((state) => state.addImages)
  const updateImage = useStore((state) => state.updateImage)
  const updateImages = useStore((state) => state.updateImages)
  const deleteImage = useStore((state) => state.deleteImage)
  const clearImages = useStore((state) => state.clearImages)
  const selectedIds = useStore((state) => state.selectedIds)
  const toggleSelection = useStore((state) => state.toggleSelection)
  const clearSelection = useStore((state) => state.clearSelection)
  const selectAll = useStore((state) => state.selectAll)

  const [isBatchMode, setIsBatchMode] = useState(false)
  const [batchCropMode, setBatchCropMode] = useState<CropMode | null>(null)

  // 虚拟滚动相关
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const COLUMNS = 3
  const GAP = 8 // gap-2 = 8px

  // 获取相纸尺寸配置
  const photoSize = getPhotoSizeById(sizeId)
  // 计算相纸比例
  const paperRatio = currentSession ? currentSession.canvasWidth / currentSession.canvasHeight : 1.43

  // 计算行数
  const rowCount = Math.ceil(images.length / COLUMNS)

  // 动态计算行高（基于容器宽度和相纸比例）
  const getRowHeight = useCallback((index: number) => {
    // 如果已经有实际测量的高度，使用实际高度
    const rowElement = rowRefs.current.get(index)
    if (rowElement) {
      const height = rowElement.getBoundingClientRect().height
      if (height > 0) {
        return height
      }
    }
    
    // 否则使用估算高度
    if (!scrollContainerRef.current) {
      // 如果容器还没有渲染，使用一个保守的估算值
      // 假设屏幕宽度约 375px（移动端），卡片宽度约 115px
      const estimatedCardWidth = 115
      const estimatedCardHeight = estimatedCardWidth / paperRatio + 50 // 50px 包含编辑按钮和间距
      return estimatedCardHeight + GAP
    }
    
    const containerWidth = scrollContainerRef.current.offsetWidth - 24 // px-3 = 12px * 2
    if (containerWidth <= 0) {
      // 容器宽度无效，使用保守估算
      const estimatedCardWidth = 115
      const estimatedCardHeight = estimatedCardWidth / paperRatio + 50
      return estimatedCardHeight + GAP
    }
    
    const cardWidth = (containerWidth - GAP * (COLUMNS - 1)) / COLUMNS
    // 卡片高度 = 图片区域（基于宽高比）+ 编辑按钮高度（py-2.5 ≈ 40px）+ 额外边距（10px）
    const cardHeight = cardWidth / paperRatio + 50
    return cardHeight + GAP
  }, [paperRatio])

  // 虚拟滚动器
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: getRowHeight,
    overscan: 3, // 上下各多渲染 3 行，滚动更平滑
  })

  // 使用 ResizeObserver 监听行高变化并触发重新测量
  useEffect(() => {
    if (rowRefs.current.size === 0) return
    
    const observer = new ResizeObserver(() => {
      // 当行高变化时，重新测量所有行（更安全，避免单个元素测量的问题）
      rowVirtualizer.measure()
    })
    
    // 观察所有已渲染的行
    rowRefs.current.forEach((element) => {
      observer.observe(element)
    })
    
    return () => {
      observer.disconnect()
    }
  }, [rowVirtualizer, images.length])

  // 窗口大小变化时重新测量行高
  useEffect(() => {
    const handleResize = () => {
      rowVirtualizer.measure()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [rowVirtualizer])

  // 当图片列表变化时，重新测量
  useEffect(() => {
    // 延迟测量，确保 DOM 已更新
    const timer = setTimeout(() => {
      rowVirtualizer.measure()
    }, 100)
    return () => clearTimeout(timer)
  }, [images.length, rowVirtualizer])

  // 获取订单号
  const getOrderSn = useCallback(() => {
    if (!currentSession) return ''
    // 优先使用 orderNo 字段
    if (currentSession.orderNo) {
      return currentSession.orderNo
    }
    // 兼容旧版本：从 sessionId 解析（格式: orderSn-specId）
    const parts = currentSession.id.split('-')
    return parts[0] || ''
  }, [currentSession])

  useEffect(() => {
    // 等待 hydration 完成后再判断
    if (!hasHydrated) return
    
    // 如果没有 session，跳转回首页查询订单
    if (!currentSession || currentSession.sizeId !== sizeId) {
      router.push('/')
    }
  }, [currentSession, sizeId, router, hasHydrated])

  // 从后端加载已上传的照片
  useEffect(() => {
    const loadPhotosFromServer = async () => {
      if (!currentSession || loadedRef.current) return
      
      const orderSn = getOrderSn()
      const specId = currentSession.sizeId
      
      if (!orderSn) {
        setIsLoadingPhotos(false)
        return
      }

      loadedRef.current = true
      setIsLoadingPhotos(true)

      try {
        const result = await listPhotos(orderSn, specId)
        
        if (result.photos && result.photos.length > 0) {
          // 获取当前 session 已有的图片
          const existingImagesMap = new Map(
            allImages
              .filter(img => img.sessionId === currentSession.id)
              .map(img => [img.id, img])
          )

          // 需要新增的照片
          const newImages: ImageType[] = []
          // 需要更新的照片（已存在但需要更新 transform 和 URL）
          const imagesToUpdate: { id: string; updates: Partial<ImageType> }[] = []

          result.photos.forEach(photo => {
            // 构建 transform 数据
            // 如果服务器返回的 styleType 是后端的值（cover/full/lomo），需要转换为前端值
            const serverStyleType = photo.transform?.styleType 
              ? mapCropModeFromServer(photo.transform.styleType) 
              : undefined
            const serverTransform = photo.transform ? {
              matrix: photo.transform.matrix as [number, number, number, number, number, number],
              outputWidth: photo.transform.outputWidth,
              outputHeight: photo.transform.outputHeight,
              sourceWidth: photo.transform.sourceWidth,
              sourceHeight: photo.transform.sourceHeight,
              styleType: (serverStyleType as 'center' | 'full' | 'lomo') || 'center',
            } : undefined

            const existingImage = existingImagesMap.get(photo.photoId)

            if (existingImage) {
              // 已存在的图片，更新 URL 和 transform（服务器数据优先）
              const updates: Partial<ImageType> = {
                originalUrl: photo.url,
                thumbnailUrl: existingImage.thumbnailUrl || photo.url,
                printCount: photo.quantity || existingImage.printCount || 1,
              }
              
              // 服务器有 transform 数据时，使用服务器数据
              if (serverTransform) {
                updates.transform = serverTransform
                updates.editState = {
                  mode: serverTransform.styleType,
                  scale: 1,
                  x: 0,
                  y: 0,
                  rotation: photo.autoRotated ? 90 : 0,
                  canvasWidth: currentSession.canvasWidth,
                  canvasHeight: currentSession.canvasHeight,
                }
              }
              
              imagesToUpdate.push({ id: photo.photoId, updates })
            } else {
              // 新照片，添加到列表
              // 如果服务器返回了 cropMode，需要转换为前端的 mode
              const serverCropMode = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : undefined
              const editState: EditState = {
                mode: serverTransform?.styleType || serverCropMode || 'center',
                scale: 1,
                x: 0,
                y: 0,
                rotation: photo.autoRotated ? 90 : 0,
                canvasWidth: currentSession.canvasWidth,
                canvasHeight: currentSession.canvasHeight,
              }

              newImages.push({
                id: photo.photoId,
                sessionId: currentSession.id,
                originalUrl: photo.url,
                thumbnailUrl: photo.url,
                filename: photo.photoId,
                width: photo.originalWidth,
                height: photo.originalHeight,
                printCount: photo.quantity || 1,
                editState,
                transform: serverTransform,
                autoRotated: photo.autoRotated,
              })
            }
          })

          // 批量更新已存在的图片
          if (imagesToUpdate.length > 0) {
            updateImages(imagesToUpdate)
          }

          // 添加新图片
          if (newImages.length > 0) {
            addImages(newImages)
          }
        }
      } catch (error) {
        console.error('从服务器加载照片失败:', error)
      } finally {
        setIsLoadingPhotos(false)
      }
    }

    loadPhotosFromServer()
  }, [currentSession, getOrderSn, allImages, addImages, updateImages])

  // 初始化获取 OSS 签名
  useEffect(() => {
    const fetchSignature = async () => {
      try {
        const signature = await getOssSignature()
        setOssSignature(signature)
      } catch (error) {
        console.error('获取 OSS 签名失败:', error)
      }
    }
    fetchSignature()
  }, [])

  /**
   * 判断图片是否需要旋转
   */
  const shouldRotateImage = (imageWidth: number, imageHeight: number): boolean => {
    const ratio = imageWidth / imageHeight
    const isSquare = ratio >= 0.95 && ratio <= 1.05
    if (isSquare) return false
    const isImageLandscape = imageWidth > imageHeight
    return isImageLandscape
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !currentSession) return

    // 文件大小限制：20MB
    const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
    const validFiles: File[] = []
    const oversizedFiles: string[] = []
    
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > MAX_FILE_SIZE) {
        oversizedFiles.push(files[i].name)
      } else {
        validFiles.push(files[i])
      }
    }
    
    // 提示用户有文件过大
    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles.slice(0, 5).join('\n')
      const moreText = oversizedFiles.length > 5 ? `\n...等${oversizedFiles.length}个文件` : ''
      alert(`以下文件超过20MB限制，已跳过：\n${fileList}${moreText}`)
    }
    
    if (validFiles.length === 0) {
      // 重置 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setIsUploading(true)
    const orderSn = getOrderSn()
    const specId = currentSession.sizeId

    // 如果没有签名，先获取
    let signature = ossSignature
    if (!signature) {
      try {
        console.log('开始获取 OSS 签名...')
        signature = await getOssSignature()
        console.log('OSS 签名获取成功:', {
          host: signature.host,
          dir: signature.dir,
          hasPolicy: !!signature.policy,
          hasSignature: !!signature.signature,
        })
        setOssSignature(signature)
      } catch (error) {
        console.error('获取 OSS 签名失败:', error)
        setIsUploading(false)
        alert('获取上传签名失败，请重试')
        return
      }
    }

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      setUploadProgress(`上传中 ${i + 1}/${validFiles.length}`)
      
      try {
        // 获取原图尺寸
        const dimensions = await getImageDimensions(file)
        
        // 压缩生成缩略图（用于显示）
        const { dataUrl } = await compressImage(file, 600, 0.85)

        // 判断是否需要旋转
        const needsRotation = shouldRotateImage(dimensions.width, dimensions.height)

        // 上传到 OSS（客户端直传）
        let ossUrl = ''
        try {
          ossUrl = await uploadToOss(file, signature)
          console.log('图片上传成功:', ossUrl)
        } catch (error) {
          console.error('上传到 OSS 失败:', error)
          // 上传失败时使用本地预览，但标记为未上传
          ossUrl = '' // 清空 URL，后续会用 thumbnailUrl 显示
        }

        const photoId = generateId()

        // 默认编辑状态
        const defaultEditState: EditState = {
          mode: 'center',
          scale: 1,
          x: 0,
          y: 0,
          rotation: needsRotation ? 90 : 0,
          canvasWidth: currentSession.canvasWidth,
          canvasHeight: currentSession.canvasHeight,
        }

        const image: ImageType = {
          id: photoId,
          sessionId: currentSession.id,
          originalUrl: ossUrl || dataUrl, // OSS URL 或本地缩略图
          thumbnailUrl: dataUrl, // 始终使用压缩后的缩略图显示
          filename: file.name,
          width: dimensions.width,
          height: dimensions.height,
          printCount: 1,
          editState: defaultEditState,
          autoRotated: needsRotation,
          file,
        }

        // 立即添加到列表显示（上传一张显示一张）
        addImages([image])

        // 同步到后端（只有成功上传到 OSS 后才同步）
        if (ossUrl) {
          try {
            await addPhotoToOrder({
              orderSn: orderSn,
              specId: specId,
              photoId: photoId,
              url: ossUrl,
              filename: file.name,
              originalWidth: dimensions.width,
              originalHeight: dimensions.height,
              quantity: 1,
              cropMode: mapCropModeToServer('center'),
              autoRotated: needsRotation,
            })
            console.log('照片已同步到后端:', photoId)
          } catch (error) {
            console.error('同步照片到后端失败:', error)
          }
        } else {
          console.warn('图片未上传到 OSS，仅本地显示:', photoId)
        }
      } catch (error) {
        console.error('处理图片失败:', error)
      }
    }

    setIsUploading(false)
    setUploadProgress('')

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    // 直接删除，不弹确认框
    deleteImage(id)
    // 后台异步删除，不阻塞 UI
    deletePhotoFromOrder(id).catch(error => {
      console.error('删除照片失败:', error)
    })
  }

  const handleCountChange = async (id: string, delta: number) => {
    const image = images.find((img) => img.id === id)
    if (image) {
      const newCount = Math.max(1, image.printCount + delta)
      updateImage(id, { printCount: newCount })
      
      // 同步到后端
      try {
        await updatePhoto({
          photoId: id,
          quantity: newCount,
        })
      } catch (error) {
        console.error('更新照片数量失败:', error)
      }
    }
  }

  const handleEdit = (id: string) => {
    // 最佳实践：点击编辑时，将图片数据保存到 sessionStorage
    // 这样即使刷新页面，编辑页也能获取到数据（sessionStorage 在标签页关闭前一直存在）
    const image = images.find((img) => img.id === id)
    if (image) {
      // 只保存必要的数据（URL、尺寸、transform 等）
      const imageData = {
        id: image.id,
        sessionId: image.sessionId,
        originalUrl: image.originalUrl,
        thumbnailUrl: image.thumbnailUrl,
        filename: image.filename,
        width: image.width,
        height: image.height,
        printCount: image.printCount,
        editState: image.editState,
        transform: image.transform,
        autoRotated: image.autoRotated,
      }
      sessionStorage.setItem(`edit-image-${id}`, JSON.stringify(imageData))
    }
    router.push(`/edit/${id}`)
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return
    if (confirm(`确定要删除选中的 ${selectedIds.length} 张图片吗？`)) {
      for (const id of selectedIds) {
        try {
          await deletePhotoFromOrder(id)
        } catch (error) {
          console.error('删除照片失败:', error)
        }
        deleteImage(id)
      }
      clearSelection()
      setIsBatchMode(false)
    }
  }

  const handleToggleSelectAll = () => {
    if (selectedIds.length === images.length) {
      clearSelection()
    } else {
      selectAll()
    }
  }

  const isAllSelected = images.length > 0 && selectedIds.length === images.length

  // 批量应用裁剪模式
  const handleApplyBatchCrop = async (mode: CropMode) => {
    const targetIds = selectedIds.length === 0 ? images.map(img => img.id) : selectedIds

    const updates = targetIds.map((id) => {
      const img = images.find(i => i.id === id)
      if (!img) return null

      // 获取当前旋转角度（优先从 transform 获取，兼容单独编辑过的图片）
      let currentRotation = 0
      if (img.transform?.matrix) {
        const { rotation } = parseAffineMatrix(img.transform.matrix as [number, number, number, number, number, number])
        currentRotation = rotation
      } else if (img.editState?.rotation) {
        currentRotation = img.editState.rotation
      } else if (img.autoRotated) {
        currentRotation = 90
      }
      
      const newEditState: EditState = {
        mode,
        scale: 1,
        x: 0,
        y: 0,
        rotation: currentRotation,
        canvasWidth: currentSession?.canvasWidth || 127,
        canvasHeight: currentSession?.canvasHeight || 89,
      }

      return {
        id,
        updates: { 
          editState: newEditState,
          // 清除 transform，让 PhotoCanvas 使用 editState
          transform: undefined,
        },
      }
    }).filter(Boolean) as { id: string; updates: Partial<ImageType> }[]

    updateImages(updates)
    setBatchCropMode(mode)

    // 使用批量 API 同步到后端（一次性更新所有照片，而不是循环调用）
    try {
      const result = await batchUpdatePhotos({
        photoIds: targetIds,
        cropMode: mapCropModeToServer(mode),
      })
      console.log(`批量更新成功: ${result.updatedCount} 张照片`)
    } catch (error) {
      console.error('批量更新照片裁剪模式失败:', error)
      // 如果批量更新失败，可以回退到单个更新（可选）
      // 但通常批量更新失败是网络或服务器问题，单个更新也会失败
    }
  }

  const totalPrintCount = images.reduce((sum, img) => sum + img.printCount, 0)
  const canSubmit = images.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    setShowSubmitModal(true)
  }

  const handleConfirmSubmit = async () => {
    if (!currentSession) return
    
    setIsSubmitting(true)
    const orderSn = getOrderSn()

    try {
      // 构建照片列表
      const photos = images.map(img => ({
        id: img.id,
        url: img.originalUrl,
        quantity: img.printCount,
        transform: img.transform ? {
          matrix: img.transform.matrix,
          outputWidth: img.transform.outputWidth,
          outputHeight: img.transform.outputHeight,
          sourceWidth: img.transform.sourceWidth,
          sourceHeight: img.transform.sourceHeight,
        } : undefined,
      }))

      // 调用后端提交订单
      await submitOrder({
        orderSn: orderSn,
        photos,
        submitTime: new Date().toISOString(),
        watermarkConfig: {
          enabled: false,
          position: 'bottom-right',
        },
        size: currentSession.sizeName,
        style: '',
        total: 0,
        totalQuantity: totalPrintCount,
      })

      // 更新本地订单状态
      const savedOrders = localStorage.getItem('photo-orders')
      const orders = savedOrders ? JSON.parse(savedOrders) : {}
      orders[currentSession.id] = {
        ...currentSession,
        currentCount: totalPrintCount,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      }
      localStorage.setItem('photo-orders', JSON.stringify(orders))
      
      setShowSubmitModal(false)
      router.push('/success')
    } catch (error) {
      console.error('提交订单失败:', error)
      alert('提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    router.push('/select-size')
  }

  const getImageRotation = (image: ImageType): number => {
    if (image.transform) {
      const { rotation } = parseAffineMatrix(image.transform.matrix)
      return rotation
    }
    return image.editState?.rotation || 0
  }

  // 等待 hydration 和 session 加载
  if (!hasHydrated || !currentSession) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#ff4d6d] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-32 overscroll-none">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={handleBack} className="p-1 text-gray-700">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button onClick={() => router.push('/')} className="p-1 text-gray-700">
              <Home className="w-6 h-6" />
            </button>
            <span className="text-lg font-medium ml-2">已上传照片</span>
          </div>
          <div className="text-sm text-gray-500">
            {currentSession.sizeName}·{currentSession.canvasWidth}×{currentSession.canvasHeight}{currentSession.unit || 'mm'}
          </div>
        </div>
      </div>

      {/* 提示横幅 */}
      <div className="bg-[#fff8f5] px-4 py-3 flex items-start gap-2">
        <span className="text-xl">🔥</span>
        <p className="text-sm text-[#ff6b35] leading-relaxed flex-1">
          请进行预览或编辑，未显示部分将不会冲印；预览图已压缩，冲印时会使用原图
        </p>
      </div>

      {/* 上传进度 */}
      {isUploading && (
        <div className="bg-blue-50 px-4 py-3 flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <p className="text-sm text-blue-600">{uploadProgress}</p>
        </div>
      )}

      {/* 图片列表 */}
      <div className="px-3 pt-3">
        {isLoadingPhotos ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg">
            <Loader2 className="w-12 h-12 text-[#ff4d6d] animate-spin mb-4" />
            <p className="text-gray-500">正在加载照片...</p>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-6">还没有上传照片</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-3 bg-[#ff4d6d] text-white rounded-full font-medium disabled:opacity-50"
            >
              开始上传
            </button>
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="overflow-auto hide-scrollbar"
            style={{ height: 'calc(100vh - 280px)' }} // 减去 header + footer 高度
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const startIndex = virtualRow.index * COLUMNS
                const rowImages = images.slice(startIndex, startIndex + COLUMNS)
                
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={(el) => {
                      if (el) {
                        rowRefs.current.set(virtualRow.index, el)
                      } else {
                        rowRefs.current.delete(virtualRow.index)
                      }
                    }}
                    className="absolute left-0 right-0 grid grid-cols-3 gap-2"
                    style={{
                      top: `${virtualRow.start}px`,
                    }}
                  >
                    {rowImages.map((image) => (
                      <div
                        key={image.id}
                        className={`bg-white rounded-lg overflow-hidden border border-gray-100 ${
                          isBatchMode ? 'cursor-pointer' : ''
                        } ${selectedIds.includes(image.id) ? 'ring-2 ring-[#ff4d6d]' : ''}`}
                        onClick={() => isBatchMode && toggleSelection(image.id)}
                      >
                        <div 
                          className="relative bg-white"
                          style={{ paddingBottom: `${(1 / paperRatio) * 100}%` }}
                        >
                          <PhotoPreviewCard 
                            image={image} 
                            aspectRatio={paperRatio}
                            onClick={!isBatchMode ? () => handleEdit(image.id) : undefined}
                          />
                          
                          {!isBatchMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(image.id)
                              }}
                              className="absolute top-2 right-2 w-6 h-6 bg-[#666] rounded-full flex items-center justify-center z-10"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          )}
                          
                          {isBatchMode && (
                            <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10 ${
                              selectedIds.includes(image.id) ? 'bg-[#ff4d6d]' : 'bg-gray-400/80'
                            }`}>
                              {selectedIds.includes(image.id) && (
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          )}

                          {!isBatchMode && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
                              <div className="flex items-center bg-[#e8e8e8] rounded-full">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCountChange(image.id, -1)
                                  }}
                                  className="w-7 h-7 flex items-center justify-center text-gray-600"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-6 text-center text-sm font-medium text-gray-700">
                                  {image.printCount}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCountChange(image.id, 1)
                                  }}
                                  className="w-7 h-7 flex items-center justify-center text-gray-600"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {!isBatchMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(image.id)
                            }}
                            className="w-full py-2.5 bg-[#f5f5f5] text-gray-600 text-sm font-medium"
                          >
                            编辑
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="px-4 py-3 safe-area-inset-bottom">
          {!isBatchMode ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsBatchMode(true)
                    clearSelection()
                    setBatchCropMode(null)
                  }}
                  className="text-[#ff4d6d] font-medium text-sm whitespace-nowrap"
                  disabled={images.length === 0}
                >
                  批量编辑
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1 py-3 bg-[#ff4d6d] text-white rounded-full font-medium text-base disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading && <Loader2 className="w-5 h-5 animate-spin" />}
                  继续上传(已上传{totalPrintCount}张)
                </button>
              </div>
              
              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full mt-3 py-3 bg-green-500 text-white rounded-full font-medium disabled:opacity-50"
                >
                  确认提交打印({totalPrintCount}张)
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={handleToggleSelectAll}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                    isAllSelected
                      ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>{isAllSelected ? '取消全选' : '全选'}</span>
                </button>
                <span className="text-sm text-gray-500">
                  已选择 {selectedIds.length}/{images.length} 张
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex gap-2 flex-wrap">
                  {(['center', 'full', 'lomo'] as CropMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleApplyBatchCrop(mode)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm ${
                        batchCropMode === mode
                          ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                          : 'border-gray-300 text-gray-600'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        batchCropMode === mode ? 'border-[#ff4d6d] bg-[#ff4d6d]' : 'border-gray-400'
                      }`}>
                        {batchCropMode === mode && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span>{mode === 'center' ? '居中裁剪' : mode === 'full' ? '打印整图' : '四周留白'}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleBatchDelete}
                  className={`text-sm whitespace-nowrap font-medium ${
                    selectedIds.length === 0 ? 'text-gray-400' : 'text-red-500'
                  }`}
                  disabled={selectedIds.length === 0}
                >
                  删除
                </button>
              </div>

              <button
                onClick={() => {
                  setIsBatchMode(false)
                  clearSelection()
                  setBatchCropMode(null)
                }}
                className="w-full py-3 bg-[#ff4d6d] text-white rounded-full font-medium"
              >
                完成
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp,.heic,.heif"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-center">温馨提示</h3>
            <div className="space-y-3 mb-6 text-sm">
              <p className="text-blue-600">
                本系统采用"<span className="text-blue-600 underline">全自动接单生产，没有人工参与设计和审核</span>"。
              </p>
              <p className="text-red-600 font-semibold">
                预览效果即为打印效果，工厂开始生产后，订单不能修改！
              </p>
              <p className="text-gray-700">
                如确认照片效果无误，点击【确认提交】按钮提交照片
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-3 border-2 border-gray-200 rounded-full font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                再检查一下
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-[#ff4d6d] text-white rounded-full font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
