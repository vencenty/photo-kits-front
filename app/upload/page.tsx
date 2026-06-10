'use client'

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useShopRouter } from '@/lib/useShopRouter'
import { ArrowLeft, Plus, X, Minus, Upload, Home, CheckSquare, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore, EditState, type SimpleCropInfo } from '@/lib/store'
import { buildOssCropUrl } from '@/lib/image-config'
import { CropInfo } from '@/lib/api'
import { generatePhotoId, compressImage, getImageDimensions, mapCropModeToServer, mapCropModeFromServer, convertToJpeg, calculateCoverCropSize } from '@/lib/utils'
import { isOrderLocked as checkOrderLocked } from '@/lib/constants'
import type { Image as ImageType } from '@/lib/store'
import { PhotoPreviewCard } from '@/components/PhotoPreviewCard'
import {
  getOssSignature,
  uploadToOss,
  addPhotoToOrder,
  updatePhoto,
  deletePhotoFromOrder,
  listPhotos,
  batchUpdatePhotos,
  getOrderDetail,
  OssSignature
} from '@/lib/api'
import { getActiveOrderNo } from '@/lib/order-context'
import { getSpecWatermarkPref, setSpecWatermarkPref } from '@/lib/spec-watermark-prefs'

// 裁剪模式类型
type CropMode = 'cover' | 'full' | 'lomo'

/** 与页面 grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 保持一致的响应式列数 */
function useColumns() {
  const [columns, setColumns] = useState(3)
  useEffect(() => {
    const mqlXl = window.matchMedia('(min-width: 1280px)')
    const mqlLg = window.matchMedia('(min-width: 1024px)')
    const mqlMd = window.matchMedia('(min-width: 768px)')
    const update = () => {
      if (mqlXl.matches) setColumns(6)
      else if (mqlLg.matches) setColumns(5)
      else if (mqlMd.matches) setColumns(4)
      else setColumns(3)
    }
    update()
    mqlXl.addEventListener('change', update)
    mqlLg.addEventListener('change', update)
    mqlMd.addEventListener('change', update)
    return () => {
      mqlXl.removeEventListener('change', update)
      mqlLg.removeEventListener('change', update)
      mqlMd.removeEventListener('change', update)
    }
  }, [])
  return columns
}

function UploadPageContent() {
  const router = useShopRouter()
  const searchParams = useSearchParams()
  const specIdParam = searchParams.get('specId')
  const routeSpecId = specIdParam ? Number(specIdParam) : NaN
  const fileInputRef = useRef<HTMLInputElement>(null)
  // const [showSubmitModal, setShowSubmitModal] = useState(false) // 已废弃：不再使用弹框
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true)
  const [ossSignature, setOssSignature] = useState<OssSignature | null>(null)
  const photosSyncVersionRef = useRef(-1) // 本页实例已同步到的 photosListVersion
  const photosFetchInFlightRef = useRef(false)
  const [isOrderLocked, setIsOrderLocked] = useState(false) // 订单是否已锁单

  const currentSession = useStore((state) => state.currentSession)
  const setCurrentSession = useStore((state) => state.setCurrentSession)
  const hasHydrated = useStore((state) => state._hasHydrated)
  const allImages = useStore((state) => state.images)
  const images = useMemo(() => {
    const seen = new Set<string>()
    return allImages.filter((img) => {
      if (!(img.thumbnailUrl || img.originalUrl) || img.specId !== currentSession?.specId) {
        return false
      }
      if (seen.has(img.id)) return false
      seen.add(img.id)
      return true
    })
  }, [allImages, currentSession?.specId])
  const imagesById = useMemo(() => new Map(images.map((img) => [img.id, img])), [images])
  const imageIndexById = useMemo(() => new Map(images.map((img, index) => [img.id, index])), [images])
  const addImages = useStore((state) => state.addImages)
  const updateImage = useStore((state) => state.updateImage)
  const updateImages = useStore((state) => state.updateImages)
  const deleteImage = useStore((state) => state.deleteImage)
  const clearImages = useStore((state) => state.clearImages)
  const selectedIds = useStore((state) => state.selectedIds)
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const toggleSelection = useStore((state) => state.toggleSelection)
  const clearSelection = useStore((state) => state.clearSelection)
  const selectAll = useStore((state) => state.selectAll)
  
  // 缓存管理
  const photosListVersion = useStore((state) => state.photosListVersion)
  const forceRefetch = useStore((state) => state.forceRefetch)

  const [isBatchMode, setIsBatchMode] = useState(false)
  const [batchCropMode, setBatchCropMode] = useState<CropMode | null>(null)
  const [isRestoringScroll, setIsRestoringScroll] = useState(false) // 是否正在恢复滚动位置
  const [showUnadjustedDialog, setShowUnadjustedDialog] = useState(false) // 显示未调整照片确认对话框
  const [unadjustedImages, setUnadjustedImages] = useState<ImageType[]>([]) // 未调整的照片列表
  const [showBatchCoverConfirmDialog, setShowBatchCoverConfirmDialog] = useState(false)
  const [batchCoverAcknowledgeInput, setBatchCoverAcknowledgeInput] = useState('')

  // 虚拟滚动相关（列数与 grid-cols-3 md:4 lg:5 xl:6 一致，避免只占半屏）
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const columns = useColumns()
  const GAP = 8 // 水平间距 gap-x-2.5 估算
  const ROW_GAP = 16 // gap-y-4，卡片行与行之间的垂直间距
  const MAX_CONCURRENT_UPLOADS = 5 // ⚙️ 最大并发上传数量

  const paperRatio = currentSession ? currentSession.canvasWidth / currentSession.canvasHeight : 1.43

  const cropConfig = useMemo(() => {
    if (currentSession?.cropDefaultMode && currentSession?.cropAvailableModes?.length) {
      return {
        defaultMode: currentSession.cropDefaultMode,
        availableModes: currentSession.cropAvailableModes,
      }
    }
    return { defaultMode: 'cover' as CropMode, availableModes: ['cover', 'full', 'lomo'] as CropMode[] }
  }, [currentSession])

  const rowImagesList = useMemo(() => {
    const rows: ImageType[][] = []
    for (let index = 0; index < images.length; index += columns) {
      rows.push(images.slice(index, index + columns))
    }
    return rows
  }, [images, columns])

  // 计算行数
  const rowCount = rowImagesList.length

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
      const estimatedCardHeight = estimatedCardWidth / paperRatio + 62 // 数量条 + 调整按钮
      return estimatedCardHeight + ROW_GAP
    }
    
    const containerWidth = scrollContainerRef.current.offsetWidth - 24 // px-3 = 12px * 2
    if (containerWidth <= 0) {
      // 容器宽度无效，使用保守估算
      const estimatedCardWidth = 115
      const estimatedCardHeight = estimatedCardWidth / paperRatio + 62
      return estimatedCardHeight + ROW_GAP
    }
    
    const cardWidth = (containerWidth - GAP * (columns - 1)) / columns
    // 卡片高度 = 图片区域 + 数量条 + 调整按钮
    const cardHeight = cardWidth / paperRatio + 62
    return cardHeight + ROW_GAP
  }, [paperRatio, columns])

  // 虚拟滚动器
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: getRowHeight,
    overscan: 3, // 上下各多渲染 3 行，滚动更平滑
  })

  // 🚀 优化：合并虚拟滚动测量逻辑，减少重复测量
  useEffect(() => {
    if (!rowVirtualizer) return
    
    // Debounce 测量函数，避免频繁调用
    let measureTimer: NodeJS.Timeout | null = null
    const debouncedMeasure = () => {
      if (measureTimer) clearTimeout(measureTimer)
      measureTimer = setTimeout(() => {
        rowVirtualizer.measure()
      }, 50) // 减少延迟从 100ms 到 50ms
    }
    
    // 1. ResizeObserver - 监听行高变化
    let resizeObserver: ResizeObserver | null = null
    if (rowRefs.current.size > 0) {
      resizeObserver = new ResizeObserver(debouncedMeasure)
      rowRefs.current.forEach((element) => {
        resizeObserver?.observe(element)
      })
    }
    
    // 2. 窗口大小变化监听
    const handleResize = debouncedMeasure
    window.addEventListener('resize', handleResize)
    
    // 3. 图片列表变化时测量（仅在数量变化时）
    if (images.length > 0) {
      debouncedMeasure()
    }
    
    return () => {
      if (measureTimer) clearTimeout(measureTimer)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [rowVirtualizer, images.length]) // 🚀 优化：只在必要时触发

  // 🎯 虚拟列表最佳实践：精确恢复到编辑的图片位置
  useEffect(() => {
    if (!hasHydrated || !currentSession || images.length === 0 || isLoadingPhotos) return
    if (!scrollContainerRef.current || !rowVirtualizer) return
    
    const scrollKey = `upload-list-scroll-${currentSession.specId || specIdParam}`
    const savedData = sessionStorage.getItem(scrollKey)
    
    if (savedData) {
      try {
        const scrollData = JSON.parse(savedData)
        
        console.log('📍 开始恢复位置:', scrollData)
        
        // 设置恢复标志，隐藏内容避免闪烁
        setIsRestoringScroll(true)
        
        // 🎯 关键优化：等待虚拟列表完成初次渲染
        const restoreScroll = () => {
          if (!scrollContainerRef.current || !rowVirtualizer) return
          
          try {
            // 优先使用 imageId 找到图片的当前位置（处理图片顺序变化的情况）
            let targetRowIndex = scrollData.rowIndex
            
            if (scrollData.imageId) {
              const currentImageIndex = images.findIndex(img => img.id === scrollData.imageId)
              if (currentImageIndex !== -1) {
                targetRowIndex = Math.floor(currentImageIndex / columns)
                console.log('📍 找到图片当前位置:', { imageId: scrollData.imageId, newRowIndex: targetRowIndex })
              }
            }
            
            // 确保行索引有效
            if (targetRowIndex < 0 || targetRowIndex >= rowCount) {
              console.warn('⚠️ 行索引无效，使用降级方案')
              targetRowIndex = Math.min(Math.max(0, targetRowIndex), rowCount - 1)
            }
            
            // 🎯 虚拟列表 API：使用 scrollToIndex + align: 'center'
            // align: 'center' 会将目标行尽可能放在视口中央，用户体验最好
            rowVirtualizer.scrollToIndex(targetRowIndex, { 
              align: 'center',  // 居中对齐，避免图片在顶部或底部被遮挡
              behavior: 'auto', // 立即跳转，不使用平滑滚动
            })
            
            console.log('✅ 已定位到行:', targetRowIndex)
            
            // 等待一帧，让虚拟列表完成渲染后再移除遮罩
            requestAnimationFrame(() => {
              setIsRestoringScroll(false)
              sessionStorage.removeItem(scrollKey)
            })
            
          } catch (error) {
            console.error('❌ 恢复滚动位置失败:', error)
            setIsRestoringScroll(false)
            sessionStorage.removeItem(scrollKey)
          }
        }
        
        // 🎯 关键：延迟100ms，确保虚拟列表已经完成初次测量
        // 太短：虚拟列表还没准备好，定位不准
        // 太长：用户看到明显等待
        const timer = setTimeout(restoreScroll, 100)
        
        return () => {
          clearTimeout(timer)
          setIsRestoringScroll(false)
        }
      } catch (error) {
        console.error('❌ 解析滚动位置数据失败:', error)
        sessionStorage.removeItem(scrollKey)
        setIsRestoringScroll(false)
      }
    }
  }, [hasHydrated, currentSession, routeSpecId, images.length, isLoadingPhotos, rowVirtualizer, rowCount])

  const getOrderNo = useCallback(() => {
    if (!currentSession) return getActiveOrderNo()
    return currentSession.orderNo || getActiveOrderNo()
  }, [currentSession])

  useEffect(() => {
    if (!hasHydrated) return
    if (!currentSession || currentSession.specId !== routeSpecId) {
      router.push('/')
    }
  }, [currentSession, routeSpecId, router, hasHydrated])

  const sessionSpecId = currentSession?.specId
  const sessionOrderNo = currentSession?.orderNo

  // 从本地偏好恢复客户选择的日期水印开关（仅 spec 切换时同步，避免改 session 触发列表重复拉取）
  useEffect(() => {
    if (!hasHydrated || !sessionSpecId) return
    const orderNo = sessionOrderNo || getActiveOrderNo()
    if (!orderNo) return
    const session = useStore.getState().currentSession
    if (!session || session.specId !== sessionSpecId) return
    const pref = getSpecWatermarkPref(orderNo, sessionSpecId)
    if (session.dateWatermarkEnabled === pref) return
    setCurrentSession({ ...session, dateWatermarkEnabled: pref })
  }, [hasHydrated, sessionSpecId, sessionOrderNo, setCurrentSession])

  const handleToggleDateWatermark = useCallback(() => {
    if (!currentSession || isOrderLocked) return
    const orderNo = currentSession.orderNo || getActiveOrderNo()
    if (!orderNo) return
    const next = !currentSession.dateWatermarkEnabled
    setSpecWatermarkPref(orderNo, currentSession.specId, next)
    setCurrentSession({ ...currentSession, dateWatermarkEnabled: next })
  }, [currentSession, isOrderLocked, setCurrentSession])

  // 从后端加载已上传的照片（按 photosListVersion 消费 forceRefetch，每版本只拉一次）
  useEffect(() => {
    let cancelled = false

    if (!hasHydrated || !sessionSpecId) return

    const session = useStore.getState().currentSession
    if (!session || session.specId !== sessionSpecId) return

    if (photosFetchInFlightRef.current) return
    if (photosSyncVersionRef.current === photosListVersion) {
      setIsLoadingPhotos(false)
      return
    }
    const specId = sessionSpecId
    const targetVersion = photosListVersion

    const loadPhotosFromServer = async () => {
      const orderNo = session.orderNo || getActiveOrderNo()
      const defaultCropMode =
        session.cropDefaultMode && session.cropAvailableModes?.length
          ? session.cropDefaultMode
          : 'cover'
      
      if (!orderNo && !getActiveOrderNo()) {
        setIsLoadingPhotos(false)
        photosSyncVersionRef.current = targetVersion
        return
      }

      photosFetchInFlightRef.current = true
      
      const storeState = useStore.getState()
      const cachedSpecImageCount = storeState.images.filter(
        (img) => img.specId === specId && (img.thumbnailUrl || img.originalUrl),
      ).length
      const needNetwork = storeState.shouldRefetch()
      
      // 本地缓存有效：跳过 listPhotos（从编辑页返回且未 forceRefetch 时走此分支）
      if (!needNetwork && cachedSpecImageCount > 0) {
        console.log('📦 使用缓存数据，跳过 API 调用 (图片数:', cachedSpecImageCount, ')')
        setIsLoadingPhotos(false)
        photosSyncVersionRef.current = targetVersion

        getOrderDetail()
          .then(orderDetail => {
            if (!cancelled) setIsOrderLocked(checkOrderLocked(orderDetail.status))
          })
          .catch(error => {
            console.error('获取订单状态失败:', error)
          })

        photosFetchInFlightRef.current = false
        return
      }
      
      console.log('🔄 需要刷新数据:', needNetwork ? '缓存失效或 forceRefetch' : '首次加载')

      setIsLoadingPhotos(true)

      try {
        // 检查订单状态（是否锁单等；过期逻辑交给全局错误处理）
        try {
          const orderDetail = await getOrderDetail()
          // 使用常量检查订单是否已锁定
          setIsOrderLocked(checkOrderLocked(orderDetail.status))
        } catch (error) {
          console.error('获取订单状态失败:', error)
        }
        
        const result = await listPhotos(specId)
        
        if (cancelled) return

        useStore.getState().setLastFetchTime(Date.now())
        photosSyncVersionRef.current = targetVersion

        if (result.photos && result.photos.length > 0) {
          // 合并时用 store 最新快照，避免闭包 allImages 过期导致重复 addImages
          const latestImages = useStore.getState().images
          const existingImagesMap = new Map(
            latestImages
              .filter(img => img.specId === session.specId)
              .map(img => [img.id, img])
          )

          // 需要新增的照片
          const newImages: ImageType[] = []
          // 需要更新的照片（已存在但需要更新 transform 和 URL）
          const imagesToUpdate: { id: string; updates: Partial<ImageType> }[] = []

          result.photos.forEach(photo => {
            // 从 cropMode 获取样式类型
            const finalStyleType = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : 'cover'

            // 将服务端的 CropInfo 转换为前端的 SimpleCropInfo
            let simpleCropInfo: SimpleCropInfo | undefined
            if (photo.cropInfo) {
              // 优先使用后端保存的cropWidth和cropHeight，如果没有则重新计算
              let cropWidth = photo.cropInfo.cropWidth || photo.cropInfo.sourceWidth
              let cropHeight = photo.cropInfo.cropHeight || photo.cropInfo.sourceHeight

              // 如果后端没有保存cropWidth/cropHeight，则根据样式类型重新计算
              if (!photo.cropInfo.cropWidth || !photo.cropInfo.cropHeight) {
                if (photo.cropInfo.styleType === 'cover') {
                  // cover模式：根据当前session的相纸比例计算裁剪尺寸
                  const canvasAspectRatio = session.canvasWidth / session.canvasHeight
                  const imageAspectRatio = photo.cropInfo.sourceWidth / photo.cropInfo.sourceHeight

                  if (imageAspectRatio > canvasAspectRatio) {
                    // 图片更宽，裁剪左右
                    cropWidth = photo.cropInfo.sourceHeight * canvasAspectRatio
                    cropHeight = photo.cropInfo.sourceHeight
                  } else {
                    // 图片更高，裁剪上下
                    cropWidth = photo.cropInfo.sourceWidth
                    cropHeight = photo.cropInfo.sourceWidth / canvasAspectRatio
                  }
                }
                // full和lomo模式使用原图尺寸（已经是默认值了）
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

            const existingImage = existingImagesMap.get(photo.photoId)

            if (existingImage) {
              // 已存在的图片，更新 URL 和 transform（服务器数据优先）
              const updates: Partial<ImageType> = {
                originalUrl: photo.url,
                thumbnailUrl: existingImage.thumbnailUrl || photo.url,
                printCount: photo.quantity || existingImage.printCount || 1,
                outputUrl: photo.outputUrl || photo.url, // 保存最终成品URL，如果不存在则使用原图url作为默认值
                cropMode: photo.cropMode ? mapCropModeFromServer(photo.cropMode) : defaultCropMode, // 设置从服务端获取的cropMode，否则使用配置的默认模式
                isAdjusted: photo.isAdjusted || false, // 🎯 设置是否已调整
                // 从服务器加载的照片，标记为已上传
                uploadStatus: {
                  ossUploaded: true,
                  backendSynced: true,
                },
                // 设置从服务端获取的 cropInfo
                cropInfo: simpleCropInfo,
                // 清除 editState，因为现在使用 cropInfo
                editState: undefined,
              }
              
       
              
              imagesToUpdate.push({ id: photo.photoId, updates })
            } else {
              // 新照片，添加到列表
              // 如果服务器返回了 cropMode，需要转换为前端的 mode
              const serverCropMode = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : undefined

              newImages.push({
                id: photo.photoId,
                specId: session.specId,
                originalUrl: photo.url,
                thumbnailUrl: photo.url,
                filename: photo.photoId,
                editState: null,
                width: photo.originalWidth,
                height: photo.originalHeight,
                printCount: photo.quantity || 1,
                cropMode: photo.cropMode ? mapCropModeFromServer(photo.cropMode) : defaultCropMode, // 设置从服务端获取的cropMode，否则使用配置的默认模式
                cropInfo: simpleCropInfo, // 使用从服务端转换的cropInfo
                isLandscape: photo.isLandscape,
                isAdjusted: photo.isAdjusted || false, // 🎯 设置是否已调整
                outputUrl: photo.outputUrl || photo.url, // 保存最终成品URL，如果不存在则使用原图url作为默认值
                // 从服务器加载的照片，标记为已上传
                uploadStatus: {
                  ossUploaded: true,
                  backendSynced: true,
                },
              })
            }
          })

          if (cancelled) return

          // 批量更新已存在的图片
          if (imagesToUpdate.length > 0) {
            useStore.getState().updateImages(imagesToUpdate)
          }

          // 添加新图片
          if (newImages.length > 0) {
            useStore.getState().addImages(newImages)
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('从服务器加载照片失败:', error)
        }
      } finally {
        photosFetchInFlightRef.current = false
        if (!cancelled) {
          setIsLoadingPhotos(false)
        }
      }
    }

    loadPhotosFromServer()
    return () => {
      cancelled = true
      photosFetchInFlightRef.current = false
    }
  }, [hasHydrated, sessionSpecId, photosListVersion])

  // 切换规格时允许重新拉取
  useEffect(() => {
    photosSyncVersionRef.current = -1
  }, [sessionSpecId])

  // 初始化获取 OSS 签名（静默预获取，不显示 loading）
  // 🎯 优化：静默获取，不影响用户体验。如果失败或还没完成，上传时会重新获取
  useEffect(() => {
    const fetchSignature = async () => {
      try {
        const signature = await getOssSignature()
        setOssSignature(signature)
        console.log('✅ OSS 签名预获取成功')
      } catch (error) {
        console.error('OSS 签名预获取失败（上传时会重试）:', error)
      }
    }
    fetchSignature()
  }, []) // 只在组件挂载时执行一次

  /**
   * 判断图片是否需要旋转（横图转竖图以适配相纸）
   * 竖图（含 9:16 长截图）绝不旋转，避免苹果截图等无 EXIF 图片被误判
   */
  const shouldRotateImage = (imageWidth: number, imageHeight: number): boolean => {
    if (!imageWidth || !imageHeight) return false
    const ratio = imageWidth / imageHeight
    const isSquare = ratio >= 0.95 && ratio <= 1.05
    if (isSquare) return false
    // 竖图（height > width）不旋转，包括 9:16 长条图
    if (imageHeight > imageWidth) return false
    return imageWidth > imageHeight
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !currentSession) return
    
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法继续上传照片。如需修改，请联系客服。')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // 文件大小限制：50MB
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
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
      alert(`以下文件超过50MB限制，已跳过：\n${fileList}${moreText}`)
    }
    
    if (validFiles.length === 0) {
      // 重置 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // 🎯 全局上传中弹层：从这里开始到所有图片上传完毕才关闭
    const totalCount = validFiles.length
    let completedCount = 0
    setIsUploading(true)
    const orderNo = getOrderNo()
    const specId = currentSession.specId

    // 获取 OSS 签名（带缓存）
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

    // 安全校验：此时 signature 一定存在
    if (!signature) {
      setIsUploading(false)
      setUploadProgress('')
      return
    }

    // 单个文件的完整上传流程（包含：转换格式、压缩、上传 OSS、更新本地 & 同步后端）
    const uploadSingleFile = async (file: File, index: number, total: number) => {
      let currentFile = file
      setUploadProgress(`处理中 ${index + 1}/${total}`)

      try {
        // 转换图片格式为 JPEG（如果需要）
        try {
          currentFile = await convertToJpeg(currentFile)
        } catch (conversionError) {
          console.error('图片格式转换失败:', conversionError)
          alert(`"${file.name}" 格式转换失败，已跳过`)
          return
        }

        setUploadProgress(`上传中 ${index + 1}/${total}`)

        // 获取原图尺寸
        const dimensions = await getImageDimensions(currentFile)

        // 压缩生成缩略图（用于显示）
        const { dataUrl } = await compressImage(currentFile, 600, 0.85)

        // 判断是否需要旋转
        const needsRotation = shouldRotateImage(dimensions.width, dimensions.height)

        // 上传到 OSS（客户端直传）
        // 🎯 按照 订单号/规格ID/文件名 的结构上传，方便在 OSS 上查找
        // 禁止使用中文路径，避免 Safari 等浏览器的兼容问题
        let ossUrl = ''
        try {
          // signature 在上层已校验非空，使用非空断言
          ossUrl = await uploadToOss(currentFile, signature!, {
            orderNo: orderNo,
            specId: specId, // 使用规格ID（纯英文/数字）
          })
          console.log('图片上传成功:', ossUrl)
        } catch (error) {
          console.error('上传到 OSS 失败:', error)
          // 上传失败时使用本地预览，但标记为未上传
          ossUrl = '' // 清空 URL，后续会用 thumbnailUrl 显示
        }

        const photoId = generatePhotoId()

        // 默认编辑状态
        const defaultEditState: EditState = {
          mode: cropConfig.defaultMode, // 使用配置的默认裁剪模式
          scale: 1,
          x: 0,
          y: 0,
          rotation: needsRotation ? 90 : 0,
          canvasWidth: currentSession.canvasWidth,
          canvasHeight: currentSession.canvasHeight,
        }

        const image: ImageType = {
          cropMode: cropConfig.defaultMode, // 使用配置的默认裁剪模式
          id: photoId,
          specId: currentSession.specId,
          originalUrl: ossUrl || dataUrl, // OSS URL 或本地缩略图
          thumbnailUrl: dataUrl, // 始终使用压缩后的缩略图显示
          filename: currentFile.name,
          width: dimensions.width,
          height: dimensions.height,
          printCount: 1,
          editState: defaultEditState,
          isLandscape: needsRotation,
          outputUrl: ossUrl || dataUrl, // 刚上传的图片，outputUrl等于originalUrl
          file: currentFile,
          cropInfo: undefined,
          uploadStatus: {
            ossUploaded: !!ossUrl,
            backendSynced: false,
          }
        }

        // 立即添加到列表显示（上传一张显示一张）
        addImages([image])

        // 同步到后端（只有成功上传到 OSS 后才同步）
        if (ossUrl) {
          try {
            await addPhotoToOrder({
              specId: specId,
              photoId: photoId,
              url: ossUrl,
              filename: currentFile.name,
              originalWidth: dimensions.width,
              originalHeight: dimensions.height,
              quantity: 1,
              cropInfo: undefined,
              cropMode: mapCropModeToServer(cropConfig.defaultMode), // 使用配置的默认裁剪模式
              isLandscape: needsRotation,
            })
            // 更新上传状态
            updateImage(photoId, {
              uploadStatus: {
                ossUploaded: true,
                backendSynced: true,
              },
            })
            console.log('照片已同步到后端:', photoId)
          } catch (error) {
            console.error('同步照片到后端失败:', error)
            // 更新上传状态为失败
            updateImage(photoId, {
              uploadStatus: {
                ossUploaded: true,
                backendSynced: false,
              },
            })
          } finally {
            // 不在这里关闭全局 loading，由外层在全部上传完成后统一关闭
          }
        } else {
          console.warn('图片未上传到 OSS，仅本地显示:', photoId)
        }
      } catch (error) {
        console.error('处理图片失败:', error)
      } finally {
        // 更新已完成数量，并刷新全局提示文案
        completedCount += 1
      }
    }

    // 并发控制：限制同时上传的文件数量
    const runWithConcurrency = async (filesToUpload: File[], maxConcurrent: number) => {
      return new Promise<void>((resolve) => {
        const total = filesToUpload.length
        let currentIndex = 0
        let activeCount = 0

        const next = () => {
          // 所有任务都已经分配且没有活动任务时，结束
          if (currentIndex >= total) {
            if (activeCount === 0) {
              resolve()
            }
            return
          }

          const index = currentIndex++
          activeCount++

          uploadSingleFile(filesToUpload[index], index, total).finally(() => {
            activeCount--
            // 启动下一个任务
            next()
          })
        }

        const initial = Math.min(maxConcurrent, total)
        for (let i = 0; i < initial; i++) {
          next()
        }
      })
    }

    // 按最大并发数执行上传任务
    await runWithConcurrency(validFiles, MAX_CONCURRENT_UPLOADS)

    setIsUploading(false)
    setUploadProgress('')

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const hasUnfinishedUploads = useMemo(
    () => images.some((img) => {
      const status = img.uploadStatus
      return !status || !status.ossUploaded || !status.backendSynced
    }),
    [images]
  )

  const totalPrintCount = useMemo(() => images.reduce((sum, img) => sum + img.printCount, 0), [images])
  const unadjustedCandidates = useMemo(() => images.filter((img) => !img.isAdjusted), [images])

  // 检查是否有未完成上传的图片

  const handleDelete = async (id: string) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法删除照片。如需修改，请联系客服。')
      return
    }
    if (!getActiveOrderNo() && !getOrderNo()) {
      alert('订单号不存在，无法删除')
      return
    }

    const image = imagesById.get(id)
    const syncedToServer = image?.uploadStatus?.backendSynced

    try {
      // 已同步到服务端的照片须等接口成功后再删本地，避免 API 失败 UI 仍消失
      if (syncedToServer) {
        await deletePhotoFromOrder(id)
      }
      deleteImage(id)
    } catch (error) {
      console.error('删除照片失败:', error)
    }
  }

  const handleCountChange = async (id: string, delta: number) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法修改照片数量。如需修改，请联系客服。')
      return
    }
    
    const image = imagesById.get(id)
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
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法编辑照片。如需修改，请联系客服。')
      return
    }
    // 检查图片是否已完成上传
    const image = imagesById.get(id)
    if (!image) return

    const status = image.uploadStatus
    if (!status || !status.ossUploaded || !status.backendSynced) {
      alert('照片尚未上传完成，请等待上传完成后再编辑')
      return
    }
    
    // 🎯 虚拟列表最佳实践：保存图片索引
    const imageIndex = imageIndexById.get(id) ?? -1
    if (imageIndex === -1) return
    
    // 计算该图片所在的行索引（与当前响应式列数一致）
    const rowIndex = Math.floor(imageIndex / columns)
    
    const scrollData = {
      imageId: id,           // 保存图片ID（用于精确定位）
      imageIndex: imageIndex, // 保存图片索引（用于计算行号）
      rowIndex: rowIndex,    // 保存行索引（用于 scrollToIndex）
      scrollTop: scrollContainerRef.current?.scrollTop || 0, // 备用方案
    }
    
    console.log('💾 保存编辑位置:', scrollData)
    sessionStorage.setItem(
      `upload-list-scroll-${currentSession?.specId || routeSpecId}`,
      JSON.stringify(scrollData)
    )
    
    // 最佳实践：点击编辑时，将图片数据保存到 sessionStorage
    // 这样即使刷新页面，编辑页也能获取到数据（sessionStorage 在标签页关闭前一直存在）
    const imageData = {
      id: image.id,
      specId: image.specId,
      originalUrl: image.originalUrl,
      thumbnailUrl: image.thumbnailUrl,
      filename: image.filename,
      width: image.width,
      height: image.height,
      printCount: image.printCount,
      editState: image.editState,
      cropInfo: image.cropInfo, // 新版本：保存裁剪信息
      isLandscape: image.isLandscape,
    }
    sessionStorage.setItem(`edit-image-${id}`, JSON.stringify(imageData))
    router.push(`/edit?imageId=${id}`)
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return
    if (!getActiveOrderNo() && !getOrderNo()) {
      alert('订单号不存在，无法删除')
      return
    }
    if (confirm(`确定要删除选中的 ${selectedIds.length} 张图片吗？`)) {
      try {
        // 🚀 优化：使用批量删除接口，一条 SQL 删除所有照片
        await deletePhotoFromOrder(selectedIds)
        
        // 批量从本地 store 删除
        for (const id of selectedIds) {
          deleteImage(id)
        }
        
        clearSelection()
        setIsBatchMode(false)
      } catch (error) {
        console.error('批量删除照片失败:', error)
        alert('批量删除失败，请重试')
      }
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

  // 当没有选中图片时，清空裁剪模式选择，照片恢复为原始样式
  useEffect(() => {
    if (isBatchMode && selectedIds.length === 0) {
      setBatchCropMode(null)
    }
  }, [isBatchMode, selectedIds.length])

  // 批量应用裁剪模式 - 只设置选择状态，不执行操作
  const handleApplyBatchCrop = (mode: CropMode) => {
    setBatchCropMode(mode)
  }

  /** 实际执行批量裁剪并同步后端（满版需先在弹窗中输入「我了解」确认） */
  const applyBatchCropToSelection = async () => {
    if (selectedIds.length === 0 || !batchCropMode) return
    const targetIds = selectedIds
    const mode = batchCropMode

    // 计算相纸比例
    const canvasW = currentSession?.canvasWidth || 127
    const canvasH = currentSession?.canvasHeight || 89

    // 为每张图片计算 cropInfo 和 outputUrl
    const photosWithCropInfo: { photoId: string; cropInfo?: CropInfo; outputUrl?: string }[] = []

    const updates = targetIds.map((id) => {
      const img = imagesById.get(id)
      if (!img) return null

      const newEditState: EditState = {
        mode,
        scale: 1,
        x: 0,
        y: 0,
        rotation: img.isLandscape ? 90 : 0,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      }

      // 获取原图尺寸（考虑横图旋转后的尺寸）
      const sourceWidth = img.width || 0
      const sourceHeight = img.height || 0
      const originalUrl = img.originalUrl || ''

      // 计算相纸比例（根据图片方向调整）
      let targetPaperRatio = canvasW / canvasH
      if (sourceWidth && sourceHeight) {
        const imageRatio = sourceWidth / sourceHeight
        const isImageLandscape = imageRatio > 1
        const isPaperLandscape = targetPaperRatio > 1
        // 如果图片和相纸方向不一致，反转相纸比例
        if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
          targetPaperRatio = 1 / targetPaperRatio
        }
      }

      let simpleCropInfo: SimpleCropInfo | undefined
      let outputUrl = originalUrl

      if (mode === 'cover' && sourceWidth && sourceHeight) {
        // cover 模式：计算居中裁切坐标
        const { cropWidth, cropHeight, offsetX, offsetY } = calculateCoverCropSize(
          sourceWidth,
          sourceHeight,
          targetPaperRatio
        )

        // 计算百分比坐标（用于恢复裁剪位置）
        const croppedAreaPercent = {
          x: (offsetX / sourceWidth) * 100,
          y: (offsetY / sourceHeight) * 100,
          width: (cropWidth / sourceWidth) * 100,
          height: (cropHeight / sourceHeight) * 100,
        }

        simpleCropInfo = {
          offsetX: Math.round(offsetX),
          offsetY: Math.round(offsetY),
          cropWidth: Math.round(cropWidth),
          cropHeight: Math.round(cropHeight),
          sourceWidth,
          sourceHeight,
          styleType: 'cover',
          croppedAreaPercent,
        }

        // 生成提交给服务端的 outputUrl（不带 rotate，旋转由服务端/sync 按 cropInfo.rotateAngle 处理）
        outputUrl = buildOssCropUrl(originalUrl, simpleCropInfo, {})

        // 准备传给后端的数据
        const cropInfoForServer: CropInfo = {
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          sourceWidth,
          sourceHeight,
          offsetX: Math.round(offsetX),
          offsetY: Math.round(offsetY),
          cropWidth: Math.round(cropWidth),
          cropHeight: Math.round(cropHeight),
          rotateAngle: img.isLandscape ? 90 : 0,
          originalUrl,
          styleType: 'cover',
        }

        photosWithCropInfo.push({
          photoId: id,
          cropInfo: cropInfoForServer,
          outputUrl,
        })
      } else if (mode === 'full' || mode === 'lomo') {
        // full/lomo：不裁切，outputUrl 不带 OSS crop（仅满版才带 crop；原图 URL 上可能残留旧 crop，由 buildOssCropUrl 剥掉）
        simpleCropInfo = sourceWidth && sourceHeight ? {
          offsetX: 0,
          offsetY: 0,
          cropWidth: sourceWidth,
          cropHeight: sourceHeight,
          sourceWidth,
          sourceHeight,
          styleType: mode,
        } : undefined

        outputUrl = buildOssCropUrl(originalUrl, undefined, {})

        photosWithCropInfo.push({
          photoId: id,
          outputUrl,
        })
      }

      return {
        id,
        updates: {
          editState: newEditState,
          cropMode: mode,
          cropInfo: simpleCropInfo,
          outputUrl,
        },
      }
    }).filter(Boolean) as { id: string; updates: Partial<ImageType> }[]

    updateImages(updates)

    // 使用批量 API 同步到后端（传递计算好的 cropInfo 和 outputUrl）
    try {
      const result = await batchUpdatePhotos({
        photoIds: targetIds,
        cropMode: mapCropModeToServer(mode),
        photos: photosWithCropInfo, // 🎯 关键：传递前端计算好的裁切数据
      })
      console.log(`批量更新成功: ${result.updatedCount} 张照片`)

      // 批量更新成功后，清空选择状态，退出批量模式
      setIsBatchMode(false)
      clearSelection()
      setBatchCropMode(null)

      // 🎯 强制刷新数据，确保 isAdjusted 等字段与后端同步
      forceRefetch()
    } catch (error) {
      console.error('批量更新照片裁剪模式失败:', error)
    }
  }

  const BATCH_COVER_ACK_PHRASE = '确认'

  /** 点击「完成」：未选或未选模式则退出批量；满版裁剪先弹窗确认 */
  const handleBatchFinishClick = () => {
    if (selectedIds.length === 0 || !batchCropMode) {
      setIsBatchMode(false)
      clearSelection()
      setBatchCropMode(null)
      return
    }
    if (batchCropMode === 'cover') {
      setBatchCoverAcknowledgeInput('')
      setShowBatchCoverConfirmDialog(true)
      return
    }
    void applyBatchCropToSelection()
  }

  const confirmBatchCoverAndApply = () => {
    if (batchCoverAcknowledgeInput.trim() !== BATCH_COVER_ACK_PHRASE) return
    setShowBatchCoverConfirmDialog(false)
    setBatchCoverAcknowledgeInput('')
    void applyBatchCropToSelection()
  }

  const canSubmit = images.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法提交。如需修改，请联系客服。')
      return
    }
    
    // 直接跳转到 success 页面，不再显示弹框
    handleConfirmSubmit()
  }

  const handleConfirmSubmit = async () => {
    if (!currentSession) return
    
    // 🎯 检测未调整的照片
    if (unadjustedCandidates.length > 0) {
      setUnadjustedImages(unadjustedCandidates)
      setShowUnadjustedDialog(true)
      return
    }
    // 简化逻辑：直接跳转到 success 页面
    // 照片已经通过 addPhotoToOrder 实时同步到数据库了
    // 在 success 页面会有"确认订单，提交制作"按钮来最终提交
    
    // 更新本地订单状态（可选）
    const savedOrders = localStorage.getItem('photo-orders')
    const orders = savedOrders ? JSON.parse(savedOrders) : {}
    orders[currentSession.specId] = {
      ...currentSession,
      currentCount: totalPrintCount,
      status: 'uploaded', // 状态改为已上传，尚未最终提交
      uploadedAt: new Date().toISOString(),
    }
    localStorage.setItem('photo-orders', JSON.stringify(orders))
    
    // 直接跳转到 success 页面
    router.push('/success')
  }

  const handleBack = () => {
    router.push('/select-size')
  }

  // 等待 hydration 和 session 加载
  if (!hasHydrated || !currentSession) {
    return (
      <div className="min-h-screen bg-[#eae9e7] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#ff4d6d] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#eae9e7] pb-32 overscroll-none">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 desktop-nav">
        <div className="desktop-container flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={handleBack} className="p-1 text-gray-700 hover:text-gray-900 transition-colors">
              <ArrowLeft className="w-6 h-6 md:w-7 md:h-7" />
            </button>
            <button onClick={() => router.push('/')} className="p-1 text-gray-700 hover:text-gray-900 transition-colors">
              <Home className="w-6 h-6 md:w-7 md:h-7" />
            </button>
            <span className="text-lg font-medium ml-2 md:text-xl">已上传照片</span>
          </div>
          <div className="text-sm text-gray-500 md:text-base">
            {currentSession.sizeName}·{currentSession.canvasWidth}×{currentSession.canvasHeight}{currentSession.unit || 'mm'}
          </div>
        </div>
      </div>

      {/* 日期水印开关 */}
      {currentSession && !isOrderLocked && (
        <div className="desktop-container bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 md:text-base">日期水印</p>
            <p className="text-xs text-gray-400 mt-0.5">编辑保存时从 EXIF 读取拍摄日期，叠加在照片右下角</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!currentSession.dateWatermarkEnabled}
            onClick={handleToggleDateWatermark}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              currentSession.dateWatermarkEnabled ? 'bg-[#ff4d6d]' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                currentSession.dateWatermarkEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* 提示横幅 */}
      <div className="desktop-container bg-[#fff8f5] px-4 py-3 flex items-start gap-2">
        <span className="text-xl">🔥</span>
        <p className="text-sm text-[#ff6b35] leading-relaxed flex-1 md:text-base">
          列表预览图已压缩，冲印时会使用原图。列表页所见即冲印最终效果参考。
        </p>
      </div>

      {/* 上传进度 */}
      {/* {isUploading && (
        <div className="bg-blue-50 px-4 py-3 flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <p className="text-sm text-blue-600">{uploadProgress}</p>
        </div>
      )} */}
      
      {/* 未完成上传提示 */}
      {hasUnfinishedUploads && !isUploading && (
        <div className="desktop-container bg-yellow-50 px-4 py-3 flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
          <p className="text-sm text-yellow-600 md:text-base">有照片正在上传中，请等待上传完成后再编辑</p>
        </div>
      )}

      {/* 图片列表：PC 铺满可用宽度并居中，超宽屏限制最大宽度 */}
      <div className="w-full max-w-[1600px] mx-auto px-3 pt-3 md:px-4 lg:px-6">
        {isLoadingPhotos ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg desktop-shadow">
            <Loader2 className="w-12 h-12 text-[#ff4d6d] animate-spin mb-4" />
            <p className="text-gray-500 md:text-lg">正在加载照片...</p>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg desktop-shadow">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-6 md:text-lg">还没有上传照片</p>
            {isOrderLocked ? (
              <div className="px-6 py-3 md:px-6 md:py-2.5 bg-amber-50 border-2 border-amber-500 text-amber-800 rounded-full font-medium text-center md:text-sm">
                订单已锁定，正在制作中
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-6 py-3 md:px-6 md:py-2.5 bg-[#ff4d6d] text-white rounded-full font-medium text-sm disabled:opacity-50 desktop-hover"
              >
                开始上传
              </button>
            )}
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="overflow-auto hide-scrollbar h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] md:max-h-[720px]"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
                visibility: isRestoringScroll ? 'hidden' : 'visible', // 恢复期间隐藏内容
                opacity: isRestoringScroll ? 0 : 1, // 双重保障
                transition: isRestoringScroll ? 'none' : 'opacity 0.1s ease-in', // 恢复完成后淡入
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowImages = rowImagesList[virtualRow.index] || []

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
                    className="absolute left-0 right-0 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2.5 gap-y-4"
                    style={{
                      top: `${virtualRow.start}px`,
                    }}
                  >
                    {rowImages.map((image) => (
                      <div
                        key={image.id}
                        className={`bg-[#faf8f5] overflow-hidden border border-gray-200 ${
                          isBatchMode && !isOrderLocked ? 'cursor-pointer' : ''
                        }`}
                        style={{
                          ...(selectedIdSet.has(image.id) && isBatchMode
                            ? { 
                                outline: '2px solid #ff4d6d',
                                outlineOffset: '2px' // outline与元素之间的间距
                              }
                            : {})
                        }}
                        onClick={() => {
                          if (isBatchMode && !isOrderLocked) {
                            toggleSelection(image.id)
                          }
                        }}
                      >
                        <div 
                          className="relative bg-[#faf8f5]"
                          style={{ paddingBottom: `${(1 / paperRatio) * 100}%` }}
                        >
                  <PhotoPreviewCard
                    key={image.id}
                    image={image}
                    aspectRatio={paperRatio}
                    previewCropMode={isBatchMode && selectedIdSet.has(image.id) && batchCropMode ? batchCropMode : undefined}
                    onClick={
                      isBatchMode
                        ? undefined // 批量模式下，由外层 div 处理点击，避免重复触发
                        : (image.uploadStatus?.ossUploaded && image.uploadStatus?.backendSynced && !isOrderLocked
                          ? () => handleEdit(image.id)
                          : undefined)
                    }
                  />
                          
                          {!isBatchMode && !isOrderLocked && (
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
                            <div 
                              className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10 pointer-events-none ${
                                selectedIdSet.has(image.id) ? 'bg-[#ff4d6d]' : 'bg-gray-400/80'
                              }`}
                            >
                              {selectedIdSet.has(image.id) && (
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          )}

                        </div>

                        {!isBatchMode && !isOrderLocked && (
                          <div
                            className="flex items-center justify-center py-1.5 bg-[#faf8f5] border-t border-gray-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center bg-[#e8e8e8] rounded-full">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCountChange(image.id, -1)
                                }}
                                className="w-7 h-7 md:w-6 md:h-6 flex items-center justify-center text-gray-600"
                              >
                                <Minus className="w-4 h-4 md:w-3.5 md:h-3.5" />
                              </button>
                              <span className="w-6 md:w-5 text-center text-sm md:text-xs font-medium text-gray-700">
                                {image.printCount}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCountChange(image.id, 1)
                                }}
                                className="w-7 h-7 md:w-6 md:h-6 flex items-center justify-center text-gray-600"
                              >
                                <Plus className="w-4 h-4 md:w-3.5 md:h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {!isBatchMode && isOrderLocked && (
                          <div className="flex items-center justify-center py-1.5 bg-[#faf8f5] border-t border-gray-100">
                            <div className="flex items-center bg-[#e8e8e8] rounded-full px-3 py-0.5">
                              <span className="text-sm font-medium text-gray-700">
                                ×{image.printCount}
                              </span>
                            </div>
                          </div>
                        )}

                        {!isBatchMode && !isOrderLocked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(image.id)
                            }}
                            disabled={!image.uploadStatus?.ossUploaded || !image.uploadStatus?.backendSynced}
                            className="w-full py-2.5 md:py-2 bg-[#f5f5f5] text-gray-600 text-sm md:text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {image.uploadStatus?.ossUploaded && image.uploadStatus?.backendSynced ? '调整' : '上传中...'}
                          </button>
                        )}
                        
                        {/* 锁定状态下显示"仅查看"文字 */}
                        {!isBatchMode && isOrderLocked && (
                          <div className="w-full py-2.5 md:py-2 bg-[#f5f5f5] text-gray-500 text-sm md:text-xs font-medium text-center">
                            仅查看
                          </div>
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

      {/* 底部操作栏：PC/iPad 下约束宽度、缩小按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="desktop-container px-4 pt-3 pb-4 md:pt-2 md:pb-3 safe-area-inset-bottom" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px) + 1rem)' }}>
          {!isBatchMode ? (
            <>
              <div className="flex items-center gap-3 md:gap-2">
                {isOrderLocked ? (
                  <div className="flex-1 py-3 md:py-2.5 bg-amber-50 border-2 border-amber-500 text-amber-800 rounded-full font-medium text-center text-sm md:text-xs">
                    订单已锁定，正在制作中
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (hasUnfinishedUploads) {
                          alert('有照片尚未上传完成，请等待上传完成后再进行批量调整')
                          return
                        }
                        setIsBatchMode(true)
                        clearSelection()
                        setBatchCropMode(null)
                      }}
                      className="text-[#ff4d6d] font-medium text-sm md:text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={images.length === 0 || hasUnfinishedUploads}
                    >
                      批量调整
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="flex-1 py-3 md:py-2.5 bg-[#ff4d6d] text-white rounded-full font-medium text-base md:text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isUploading && <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin" />}
                      继续上传
                    </button>
                  </>
                )}
              </div>
              
              {canSubmit && !isOrderLocked && (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full mt-3 mb-1 py-3 md:py-2.5 md:mt-2 md:mb-0 bg-green-500 text-white rounded-full font-medium text-sm md:text-xs disabled:opacity-50"
                >
                  确认(共上传{totalPrintCount}张)
                </button>
              )}
            </>
          ) : !isOrderLocked ? (
            <>
              <div className="flex items-center justify-between mb-3 md:mb-2">
                <button
                  onClick={handleToggleSelectAll}
                  className={`flex items-center gap-2 px-3 py-1.5 md:py-1 rounded-full border text-sm md:text-xs ${
                    isAllSelected
                      ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d]'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  <span>{isAllSelected ? '取消全选' : '全选'}</span>
                </button>
                <span className="text-sm md:text-xs text-gray-500">
                  已选择 {selectedIds.length}/{images.length} 张
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 mb-3 md:mb-2">
                <div className="flex gap-2 flex-wrap">
                  {cropConfig.availableModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleApplyBatchCrop(mode)}
                      disabled={selectedIds.length === 0}
                      className={`flex items-center gap-1 px-3 py-1.5 md:px-2.5 md:py-1 rounded-full border text-sm md:text-xs transition-colors ${
                        selectedIds.length === 0
                          ? 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                          : batchCropMode === mode
                          ? 'border-[#ff4d6d] bg-pink-50 text-[#ff4d6d] cursor-pointer hover:bg-pink-100'
                          : 'border-gray-300 text-gray-600 cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-4 h-4 md:w-3.5 md:h-3.5 rounded border-2 flex items-center justify-center ${
                        batchCropMode === mode ? 'border-[#ff4d6d] bg-[#ff4d6d]' : 'border-gray-400'
                      }`}>
                        {batchCropMode === mode && (
                          <svg className="w-3 h-3 md:w-2.5 md:h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span>{mode === 'cover' ? '满版裁剪' : mode === 'full' ? '打印整图' : '四周留白'}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleBatchDelete}
                  className={`text-sm md:text-xs whitespace-nowrap font-medium ${
                    selectedIds.length === 0 ? 'text-gray-400' : 'text-red-500'
                  }`}
                  disabled={selectedIds.length === 0}
                >
                  批量删除
                </button>
              </div>

              <button
                onClick={handleBatchFinishClick}
                className="w-full py-3 md:py-2.5 rounded-full font-medium text-sm md:text-xs bg-[#ff4d6d] text-white"
              >
                完成
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Submit Modal - 已废弃，不再使用弹框确认 */}
      {/* 
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
      */}

      {/* 未调整照片确认对话框 */}
      {showUnadjustedDialog && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowUnadjustedDialog(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">还有照片未调整</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                您还有 <span className="font-semibold text-orange-600">{unadjustedImages.length}</span> 张照片未调整。
                <br />
                为确保打印效果，请先调整所有照片。
                <br />
                可以通过<span className="font-semibold text-orange-600">左下角批量编辑</span>来调整所有照片。
              </p>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowUnadjustedDialog(false)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-full font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                稍后调整
              </button>
              <button
                onClick={() => {
                  const firstUnadjusted = unadjustedImages[0]
                  setShowUnadjustedDialog(false)
                  // 跳转到第一张未调整的照片进行编辑，并添加 filter=unadjusted 参数
                  router.push(`/edit?imageId=${firstUnadjusted.id}&filter=unadjusted`)
                }}
                className="flex-1 py-3 bg-[#ff4d6d] text-white rounded-full font-medium hover:bg-[#ff3d5d] transition-colors"
              >
                去调整
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量满版裁剪确认：须输入「我了解」 */}
      {showBatchCoverConfirmDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowBatchCoverConfirmDialog(false)
            setBatchCoverAcknowledgeInput('')
          }}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-3">确认批量满版裁剪</h3>
            <div className="text-sm text-gray-600 leading-relaxed space-y-3">
              <p>
                批量满版裁剪后，所选照片的裁剪位置都会<strong className="text-gray-900">按相纸比例默认居中重置</strong>；
                若您曾在单张编辑里拖动过裁切框，这些调整<strong className="text-gray-900">不会保留</strong>。
              </p>
              <p>
                请务必确认构图是否合适。<strong className="text-gray-900">图片比例与相纸差距较大</strong>的照片更容易出现
                <strong className="text-gray-900">裁手裁脚</strong>等废片；重要内容贴边、带日期水印等情况请谨慎选择满版。建议您手动逐个确认每张照片的裁剪位置更保险。
              </p>
              <p className="text-[#ff4d6d] font-medium">
                请在下方输入「{BATCH_COVER_ACK_PHRASE}」以确认已知上述风险，然后再应用批量满版裁剪。
              </p>
            </div>
            <label className="block mt-4 text-xs text-gray-500 mb-1">输入确认</label>
            <input
              type="text"
              value={batchCoverAcknowledgeInput}
              onChange={(e) => setBatchCoverAcknowledgeInput(e.target.value)}
              placeholder={`请输入：${BATCH_COVER_ACK_PHRASE}`}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#ff4d6d] focus:outline-none text-base"
              autoComplete="off"
            />
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowBatchCoverConfirmDialog(false)
                  setBatchCoverAcknowledgeInput('')
                }}
                className="flex-1 py-3 border-2 border-gray-200 rounded-full font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmBatchCoverAndApply}
                disabled={batchCoverAcknowledgeInput.trim() !== BATCH_COVER_ACK_PHRASE}
                className={`flex-1 py-3 rounded-full font-medium transition-colors ${
                  batchCoverAcknowledgeInput.trim() === BATCH_COVER_ACK_PHRASE
                    ? 'bg-[#ff4d6d] text-white hover:bg-[#ff3d5d]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                确认应用
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#eae9e7] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#ff4d6d] animate-spin" />
      </div>
    }>
      <UploadPageContent />
    </Suspense>
  )
}
