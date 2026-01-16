'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Plus, X, Minus, Upload, Home, CheckSquare, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore, EditState, type SimpleCropInfo } from '@/lib/store'
import { getPhotoSizeById } from '@/lib/photo-sizes'
import { generateId, compressImage, getImageDimensions, mapCropModeToServer, mapCropModeFromServer } from '@/lib/utils'
import type { Image as ImageType } from '@/lib/store'
import { PhotoPreviewCard } from '@/components/PhotoPreviewCard'
import { GlobalLoading } from '@/components/GlobalLoading'
import { 
  getOssSignature, 
  uploadToOss, 
  addPhotoToOrder, 
  updatePhoto, 
  deletePhotoFromOrder, 
  submitOrder,
  listPhotos,
  batchUpdatePhotos,
  getOrderDetail,
  OssSignature,
  PhotoTransform
} from '@/lib/api'

// 裁剪模式类型
type CropMode = 'cover' | 'full' | 'lomo'

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
  const ossSignatureFetchedRef = useRef(false) // 防止重复获取 OSS 签名
  const [isOrderLocked, setIsOrderLocked] = useState(false) // 订单是否已锁单

  const currentSession = useStore((state) => state.currentSession)
  const hasHydrated = useStore((state) => state._hasHydrated)
  const allImages = useStore((state) => state.images)
  const setApiLoading = useStore((state) => state.setApiLoading)
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
  const [isRestoringScroll, setIsRestoringScroll] = useState(false) // 是否正在恢复滚动位置

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

  // 恢复滚动位置（从编辑页返回时）- 无感恢复方案
  // 使用 useLayoutEffect 确保在浏览器 paint 前完成定位
  useEffect(() => {
    if (!hasHydrated || !currentSession || images.length === 0 || isLoadingPhotos) return
    if (!scrollContainerRef.current || !rowVirtualizer) return
    
    const scrollKey = `upload-list-scroll-${currentSession.id || sizeId}`
    const savedData = sessionStorage.getItem(scrollKey)
    
    if (savedData) {
      try {
        const scrollData = JSON.parse(savedData)
        const container = scrollContainerRef.current
        
        // 步骤1：隐藏内容，防止用户看到中间态
        setIsRestoringScroll(true)
        
        // 步骤2：锁定滚动容器，防止意外滚动
        const originalOverflow = container.style.overflow
        const originalScrollBehavior = container.style.scrollBehavior
        container.style.overflow = 'hidden'
        container.style.scrollBehavior = 'auto'
        
        // 步骤3：等待虚拟滚动初始化完成
        const restoreScroll = () => {
          if (!container || !rowVirtualizer) return
          
          try {
            // 方案A：使用 index + offset（推荐）
            if (scrollData.index !== undefined && scrollData.offset !== undefined) {
              console.log('恢复滚动位置:', scrollData)
              
              // 先强制测量所有行，确保虚拟滚动器有准确的数据
              rowVirtualizer.measure()
              
              // 使用 scrollToIndex 定位到目标行
              rowVirtualizer.scrollToIndex(scrollData.index, {
                align: 'start',
              })
              
              // 等待虚拟滚动器完成测量和渲染
              // 使用多个 RAF 确保虚拟滚动已完成
              const applyOffset = () => {
                if (!container || !rowVirtualizer) return
                
                // 再次测量，确保数据最新
                rowVirtualizer.measure()
                
                // 获取虚拟 items
                const virtualItems = rowVirtualizer.getVirtualItems()
                const targetItem = virtualItems.find(
                  item => item.index === scrollData.index
                )
                
                if (targetItem) {
                  // 使用虚拟滚动器的 start 值 + offset
                  const finalScrollTop = targetItem.start + scrollData.offset
                  container.scrollTop = finalScrollTop
                  console.log('恢复完成，最终位置:', finalScrollTop, '目标:', scrollData)
                  
                  // 恢复并显示
                  container.style.overflow = originalOverflow
                  container.style.scrollBehavior = originalScrollBehavior
                  setIsRestoringScroll(false)
                  sessionStorage.removeItem(scrollKey)
                } else {
                  // 如果找不到目标 item，再等一帧
                  console.warn('找不到目标 item，等待下一帧')
                  requestAnimationFrame(applyOffset)
                }
              }
              
              // 三重 RAF 确保虚拟滚动完成
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(applyOffset)
                })
              })
            } else if (scrollData.scrollTop !== undefined) {
              console.log('恢复滚动位置（降级）:', scrollData.scrollTop)
              // 方案B：降级使用 scrollTop（备用方案）
              container.scrollTop = scrollData.scrollTop
              
              requestAnimationFrame(() => {
                container.style.overflow = originalOverflow
                container.style.scrollBehavior = originalScrollBehavior
                setIsRestoringScroll(false)
                sessionStorage.removeItem(scrollKey)
              })
            }
          } catch (error) {
            console.error('恢复滚动位置失败:', error)
            // 恢复状态
            container.style.overflow = originalOverflow
            container.style.scrollBehavior = originalScrollBehavior
            setIsRestoringScroll(false)
            sessionStorage.removeItem(scrollKey)
          }
        }
        
        // 延迟执行，确保虚拟滚动已初始化
        const timer = setTimeout(() => {
          // 使用 requestAnimationFrame 确保在渲染前执行
          requestAnimationFrame(restoreScroll)
        }, 150) // 增加延迟，确保虚拟滚动完全初始化
        
        return () => {
          clearTimeout(timer)
          // 清理时恢复状态
          if (container) {
            container.style.overflow = originalOverflow
            container.style.scrollBehavior = originalScrollBehavior
          }
          setIsRestoringScroll(false)
        }
      } catch (error) {
        console.error('解析滚动位置数据失败:', error)
        sessionStorage.removeItem(scrollKey)
        setIsRestoringScroll(false)
      }
    }
  }, [hasHydrated, currentSession, sizeId, images.length, isLoadingPhotos, rowVirtualizer])

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
        setApiLoading(true, '加载照片列表...')
        
        // 检查订单状态
        try {
          const orderDetail = await getOrderDetail(orderSn)
          // 状态2（生产中）表示客户已确认/锁单
          setIsOrderLocked(orderDetail.status === 2)
        } catch (error) {
          console.error('获取订单状态失败:', error)
        }
        
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
            // 如果 transform 存在但 styleType 缺失，从 cropMode 获取
            const fallbackCropMode = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : undefined
            const finalStyleType = (serverStyleType || fallbackCropMode || 'cover') as 'cover' | 'full' | 'lomo'
            
            const existingImage = existingImagesMap.get(photo.photoId)

            if (existingImage) {
              // 已存在的图片，更新 URL 和 transform（服务器数据优先）
              const updates: Partial<ImageType> = {
                originalUrl: photo.url,
                thumbnailUrl: existingImage.thumbnailUrl || photo.url,
                printCount: photo.quantity || existingImage.printCount || 1,
                outputUrl: photo.outputUrl, // 保存最终成品URL
                // 从服务器加载的照片，标记为已上传
                uploadStatus: {
                  ossUploaded: true,
                  backendSynced: true,
                },
                // 清除本地可能存在的 cropInfo，因为服务器数据中没有 cropInfo
                cropInfo: undefined,
              }
              
       
              
              imagesToUpdate.push({ id: photo.photoId, updates })
            } else {
              // 新照片，添加到列表
              // 如果服务器返回了 cropMode，需要转换为前端的 mode
              const serverCropMode = photo.cropMode ? mapCropModeFromServer(photo.cropMode) : undefined
              const editState: EditState = {
                mode: finalStyleType,
                scale: 1,
                x: 0,
                y: 0,
                rotation: photo.isLandscape ? 90 : 0,
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
                isLandscape: photo.isLandscape,
                outputUrl: photo.outputUrl, // 保存最终成品URL
                // 从服务器加载的照片，标记为已上传
                uploadStatus: {
                  ossUploaded: true,
                  backendSynced: true,
                },
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
        setApiLoading(false, '')
      }
    }

    loadPhotosFromServer()
  }, [currentSession, getOrderSn, allImages, addImages, updateImages])

  // 初始化获取 OSS 签名（只获取一次）
  useEffect(() => {
    // 防止重复调用（React StrictMode 会执行两次，或者已经获取过）
    if (ossSignatureFetchedRef.current) {
      return
    }
    
    const fetchSignature = async () => {
      // 双重检查，防止并发调用
      if (ossSignatureFetchedRef.current) {
        return
      }
      
      ossSignatureFetchedRef.current = true
      try {
        setApiLoading(true, '获取上传签名...')
        const signature = await getOssSignature()
        setOssSignature(signature)
      } catch (error) {
        console.error('获取 OSS 签名失败:', error)
        // 如果获取失败，重置标志，允许重试
        ossSignatureFetchedRef.current = false
      } finally {
        setApiLoading(false, '')
      }
    }
    fetchSignature()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在组件挂载时执行一次

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
    
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法继续上传照片。如需修改，请联系客服。')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

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

    // 如果没有签名，先获取（防止并发调用）
    let signature = ossSignature
    if (!signature) {
      // 如果正在获取，等待一下再检查
      if (ossSignatureFetchedRef.current) {
        // 等待一小段时间，让初始化完成
        await new Promise(resolve => setTimeout(resolve, 200))
        signature = ossSignature
      }
      
      // 如果还是没有，且没有正在获取，则获取
      if (!signature && !ossSignatureFetchedRef.current) {
        try {
          console.log('开始获取 OSS 签名...')
          ossSignatureFetchedRef.current = true
          setApiLoading(true, '获取上传签名...')
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
          ossSignatureFetchedRef.current = false // 允许重试
          setIsUploading(false)
          alert('获取上传签名失败，请重试')
          return
        } finally {
          setApiLoading(false, '')
        }
      } else if (!signature) {
        // 如果正在获取但还没完成，提示用户等待
        setIsUploading(false)
        alert('正在获取上传签名，请稍候再试')
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
          mode: 'cover',
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
          isLandscape: needsRotation,
          file,
          uploadStatus: {
            ossUploaded: !!ossUrl,
            backendSynced: false,
          },
        }

        // 立即添加到列表显示（上传一张显示一张）
        addImages([image])

        // 同步到后端（只有成功上传到 OSS 后才同步）
        if (ossUrl) {
          try {
            setApiLoading(true, `同步照片 ${i + 1}/${validFiles.length}...`)
            await addPhotoToOrder({
              orderSn: orderSn,
              specId: specId,
              photoId: photoId,
              url: ossUrl,
              filename: file.name,
              originalWidth: dimensions.width,
              originalHeight: dimensions.height,
              quantity: 1,
              cropMode: mapCropModeToServer('cover'),
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
            setApiLoading(false, '')
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

  // 检查是否有未完成上传的图片
  const hasUnfinishedUploads = images.some(img => {
    const status = img.uploadStatus
    return !status || !status.ossUploaded || !status.backendSynced
  })

  const handleDelete = async (id: string) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法删除照片。如需修改，请联系客服。')
      return
    }
    // 直接删除，不弹确认框
    deleteImage(id)
    // 后台异步删除，不阻塞 UI
    try {
      setApiLoading(true, '删除照片中...')
      await deletePhotoFromOrder(id)
    } catch (error) {
      console.error('删除照片失败:', error)
    } finally {
      setApiLoading(false, '')
    }
  }

  const handleCountChange = async (id: string, delta: number) => {
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法修改照片数量。如需修改，请联系客服。')
      return
    }
    
    const image = images.find((img) => img.id === id)
    if (image) {
      const newCount = Math.max(1, image.printCount + delta)
      updateImage(id, { printCount: newCount })
      
      // 同步到后端
      try {
        setApiLoading(true, '更新数量中...')
        await updatePhoto({
          photoId: id,
          quantity: newCount,
        })
      } catch (error) {
        console.error('更新照片数量失败:', error)
      } finally {
        setApiLoading(false, '')
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
    const image = images.find((img) => img.id === id)
    if (!image) return
    
    const status = image.uploadStatus
    if (!status || !status.ossUploaded || !status.backendSynced) {
      alert('照片尚未上传完成，请等待上传完成后再编辑')
      return
    }
    
    // 保存当前滚动位置（使用 index + offset 方案）
    if (scrollContainerRef.current && rowVirtualizer) {
      const scrollTop = scrollContainerRef.current.scrollTop
      
      // 计算当前可见的第一个 item 的 index
      const virtualItems = rowVirtualizer.getVirtualItems()
      if (virtualItems.length > 0) {
        const firstVisibleItem = virtualItems[0]
        const firstVisibleIndex = firstVisibleItem.index
        
        // 计算 offset（使用虚拟滚动器的 start 值，更准确）
        // start 是虚拟滚动器计算的位置，比 offsetTop 更可靠
        const offset = scrollTop - firstVisibleItem.start
        
        // 保存 index 和 offset
        const scrollData = {
          index: firstVisibleIndex,
          offset: offset,
          scrollTop: scrollTop, // 备用方案
        }
        console.log('保存滚动位置:', scrollData)
        sessionStorage.setItem(
          `upload-list-scroll-${currentSession?.id || sizeId}`,
          JSON.stringify(scrollData)
        )
      } else {
        // 降级方案：只保存 scrollTop
        const scrollData = { scrollTop }
        console.log('保存滚动位置（降级）:', scrollData)
        sessionStorage.setItem(
          `upload-list-scroll-${currentSession?.id || sizeId}`,
          JSON.stringify(scrollData)
        )
      }
    }
    
    // 最佳实践：点击编辑时，将图片数据保存到 sessionStorage
    // 这样即使刷新页面，编辑页也能获取到数据（sessionStorage 在标签页关闭前一直存在）
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
      cropInfo: image.cropInfo, // 新版本：保存裁剪信息
      isLandscape: image.isLandscape,
    }
    sessionStorage.setItem(`edit-image-${id}`, JSON.stringify(imageData))
    router.push(`/edit/${id}`)
  }

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return
    if (confirm(`确定要删除选中的 ${selectedIds.length} 张图片吗？`)) {
      try {
        setApiLoading(true, `删除 ${selectedIds.length} 张照片...`)
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
      } finally {
        setApiLoading(false, '')
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

  // 批量应用裁剪模式
  const handleApplyBatchCrop = async (mode: CropMode) => {
    if (selectedIds.length === 0) {
      return
    }
    const targetIds = selectedIds

    const updates = targetIds.map((id) => {
      const img = images.find(i => i.id === id)
      if (!img) return null
      
      const newEditState: EditState = {
        mode,
        scale: 1,
        x: 0,
        y: 0,
        rotation: img.isLandscape ? 90 : 0,
        canvasWidth: currentSession?.canvasWidth || 127,
        canvasHeight: currentSession?.canvasHeight || 89,
      }

      return {
        id,
        updates: {
          editState: newEditState,
          // 注意：批量操作不设置 cropInfo，只有真正编辑过（有精确裁剪坐标）时才设置
          // cropInfo: undefined, // 清除现有的 cropInfo
          // 清除旧的 transform
          transform: undefined,
        },
      }
    }).filter(Boolean) as { id: string; updates: Partial<ImageType> }[]

    updateImages(updates)
    setBatchCropMode(mode)

    // 使用批量 API 同步到后端（一次性更新所有照片，而不是循环调用）
    try {
      setApiLoading(true, `批量更新 ${targetIds.length} 张照片...`)
      const result = await batchUpdatePhotos({
        photoIds: targetIds,
        cropMode: mapCropModeToServer(mode),
      })
      console.log(`批量更新成功: ${result.updatedCount} 张照片`)
    } catch (error) {
      console.error('批量更新照片裁剪模式失败:', error)
    } finally {
      setApiLoading(false, '')
    }
  }

  const totalPrintCount = images.reduce((sum, img) => sum + img.printCount, 0)
  const canSubmit = images.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    
    // 检查订单是否已锁单
    if (isOrderLocked) {
      alert('订单已锁单，无法提交。如需修改，请联系客服。')
      return
    }
    
    setShowSubmitModal(true)
  }

  const handleConfirmSubmit = async () => {
    if (!currentSession) return
    
    setIsSubmitting(true)
    const orderSn = getOrderSn()

    try {
      // 构建照片列表
      const photos = images.map(img => {
        // 获取模式（从 cropInfo 或 editState 中获取）
        const mode = img.cropInfo?.styleType || img.editState?.mode || 'cover'
        
        // lomo 和 full 模式不需要裁剪信息
        const shouldClearCropInfo = mode === 'lomo' || mode === 'full'
        
        // 将 SimpleCropInfo 转换为 API 期望的 CropInfo 格式
        const apiCropInfo = (!shouldClearCropInfo && img.cropInfo) ? {
          canvasWidth: currentSession.canvasWidth,
          canvasHeight: currentSession.canvasHeight,
          sourceWidth: img.cropInfo.sourceWidth,
          sourceHeight: img.cropInfo.sourceHeight,
          offsetX: img.cropInfo.offsetX,
          offsetY: img.cropInfo.offsetY,
          rotateAngle: 0, // react-easy-crop 不支持旋转
          originalUrl: img.originalUrl,
          styleType: img.cropInfo.styleType,
        } : undefined
        
        return {
          id: img.id,
          url: img.originalUrl,
          quantity: img.printCount,
          // 创建简化的 transform（只包含 styleType）
          transform: {
            outputWidth: currentSession.canvasWidth,
            outputHeight: currentSession.canvasHeight,
            sourceWidth: img.width,
            sourceHeight: img.height,
            styleType: mode,
          },
          cropInfo: apiCropInfo,
        }
      })

      // 调用后端提交订单
      setApiLoading(true, '提交订单中...')
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
      setApiLoading(false, '')
    }
  }

  const handleBack = () => {
    router.push('/select-size')
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
      
      {/* 未完成上传提示 */}
      {hasUnfinishedUploads && !isUploading && (
        <div className="bg-yellow-50 px-4 py-3 flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
          <p className="text-sm text-yellow-600">有照片正在上传中，请等待上传完成后再编辑</p>
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
            {isOrderLocked ? (
              <div className="px-6 py-3 bg-green-50 border-2 border-green-400 text-green-700 rounded-full font-medium text-center">
                订单已锁单，正在制作中
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-6 py-3 bg-[#ff4d6d] text-white rounded-full font-medium disabled:opacity-50"
              >
                开始上传
              </button>
            )}
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
                visibility: isRestoringScroll ? 'hidden' : 'visible', // 恢复期间隐藏内容
                opacity: isRestoringScroll ? 0 : 1, // 双重保障
                transition: isRestoringScroll ? 'none' : 'opacity 0.1s ease-in', // 恢复完成后淡入
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
                    className="absolute left-0 right-0 grid grid-cols-3 gap-2.5"
                    style={{
                      top: `${virtualRow.start}px`,
                    }}
                  >
                    {rowImages.map((image) => (
                      <div
                        key={image.id}
                        className={`bg-white rounded-lg overflow-hidden border border-gray-100 ${
                          isBatchMode ? 'cursor-pointer' : ''
                        }`}
                        style={{
                          ...(selectedIds.includes(image.id) && isBatchMode 
                            ? { 
                                outline: '2px solid #ff4d6d',
                                outlineOffset: '2px' // outline与元素之间的间距
                              }
                            : {})
                        }}
                        onClick={() => {
                          if (isBatchMode) {
                            toggleSelection(image.id)
                          }
                        }}
                      >
                        <div 
                          className="relative bg-white"
                          style={{ paddingBottom: `${(1 / paperRatio) * 100}%` }}
                        >
                  <PhotoPreviewCard 
                    image={image} 
                    aspectRatio={paperRatio}
                    onClick={
                      isBatchMode 
                        ? undefined // 批量模式下，由外层 div 处理点击，避免重复触发
                        : (image.uploadStatus?.ossUploaded && image.uploadStatus?.backendSynced 
                          ? () => handleEdit(image.id) 
                          : undefined)
                    }
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
                            <div 
                              className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10 pointer-events-none ${
                                selectedIds.includes(image.id) ? 'bg-[#ff4d6d]' : 'bg-gray-400/80'
                              }`}
                            >
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
                            disabled={!image.uploadStatus?.ossUploaded || !image.uploadStatus?.backendSynced}
                            className="w-full py-2.5 bg-[#f5f5f5] text-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {image.uploadStatus?.ossUploaded && image.uploadStatus?.backendSynced ? '编辑' : '上传中...'}
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
        <div className="px-4 pt-3 pb-4 safe-area-inset-bottom" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px) + 1rem)' }}>
          {!isBatchMode ? (
            <>
              <div className="flex items-center gap-3">
                {isOrderLocked ? (
                  <div className="flex-1 py-3 bg-green-50 border-2 border-green-400 text-green-700 rounded-full font-medium text-center">
                    订单已锁单，正在制作中
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (hasUnfinishedUploads) {
                          alert('有照片尚未上传完成，请等待上传完成后再进行批量编辑')
                          return
                        }
                        setIsBatchMode(true)
                        clearSelection()
                        setBatchCropMode(null)
                      }}
                      className="text-[#ff4d6d] font-medium text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={images.length === 0 || hasUnfinishedUploads}
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
                  </>
                )}
              </div>
              
              {canSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full mt-3 mb-1 py-3 bg-green-500 text-white rounded-full font-medium disabled:opacity-50"
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
                  {(['cover', 'full', 'lomo'] as CropMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleApplyBatchCrop(mode)}
                      disabled={selectedIds.length === 0}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm ${
                        selectedIds.length === 0
                          ? 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                          : batchCropMode === mode
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
                      <span>{mode === 'cover' ? '居中裁剪' : mode === 'full' ? '打印整图' : '四周留白'}</span>
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
                className={`w-full py-3 rounded-full font-medium ${
                  selectedIds.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#ff4d6d] text-white'
                }`}
                disabled={selectedIds.length === 0}
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

      {/* 全局 Loading */}
      <GlobalLoading />
    </div>
  )
}
