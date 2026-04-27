import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { CropMode, SimpleCropInfo } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==================== ID 生成 ====================

/**
 * 生成照片等业务用的唯一 ID（类似 MongoDB ObjectId：24 位十六进制，无连字符）
 * - 前 4 字节：Unix 时间戳（秒），便于按创建时间排序、肉眼区分新旧
 * - 后 8 字节：crypto 随机数，碰撞概率极低
 */
export function generatePhotoId(): string {
  const bytes = new Uint8Array(12)
  const ts = Math.floor(Date.now() / 1000)
  bytes[0] = (ts >>> 24) & 0xff
  bytes[1] = (ts >>> 16) & 0xff
  bytes[2] = (ts >>> 8) & 0xff
  bytes[3] = ts & 0xff
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes.subarray(4))
  } else {
    for (let i = 4; i < 12; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let hex = ''
  for (let i = 0; i < 12; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** @deprecated 请优先使用 generatePhotoId，语义更清晰 */
export function generateId(): string {
  return generatePhotoId()
}

// ==================== 日期格式化 ====================

/** 格式化日期 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ==================== 图片处理（优化：避免同一文件重复读取） ====================

/** 图片读取结果缓存 */
const imageReadCache = new Map<string, string>()

/**
 * 读取文件为 Base64（带缓存）
 */
export function fileToBase64(file: File): Promise<string> {
  const cacheKey = `${file.name}-${file.size}`
  if (imageReadCache.has(cacheKey)) {
    return Promise.resolve(imageReadCache.get(cacheKey)!)
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      imageReadCache.set(cacheKey, result)
      resolve(result)
    }
    reader.onerror = (error) => reject(error)
  })
}

/**
 * 清除图片读取缓存
 */
export function clearImageReadCache(): void {
  imageReadCache.clear()
}

/**
 * 加载图片并返回 HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * 获取图片尺寸
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return fileToBase64(file).then(loadImage).then(img => ({
    width: img.width,
    height: img.height,
  }))
}

/**
 * 压缩图片
 */
export function compressImage(
  file: File,
  maxWidth: number = 800,
  quality: number = 0.8
): Promise<{ file: File; dataUrl: string }> {
  return fileToBase64(file)
    .then(loadImage)
    .then(img => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('无法获取 canvas context')
      }

      ctx.drawImage(img, 0, 0, width, height)

      return new Promise<{ file: File; dataUrl: string }>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('图片压缩失败'))
              return
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
            resolve({
              file: compressedFile,
              dataUrl: canvas.toDataURL('image/jpeg', quality),
            })
          },
          'image/jpeg',
          quality
        )
      })
    })
}

/**
 * 转换图片格式为 JPEG（支持 HEIC, HEIF, WebP, TIFF 等）
 */
export async function convertToJpeg(file: File): Promise<File> {
  const fileType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  // 如果已经是 JPEG 或 PNG，直接返回
  if (fileType === 'image/jpeg' || fileType === 'image/jpg' || fileType === 'image/png') {
    return file
  }

  // 处理 HEIC/HEIF 格式
  if (fileType === 'image/heic' || fileType === 'image/heif' ||
      fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
    try {
      const heic2any = (await import('heic2any')).default

      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9,
      })

      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob

      return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
    } catch (error) {
      console.error('HEIC 转换失败:', error)
      throw new Error('HEIC 格式转换失败，请尝试其他图片')
    }
  }

  // 处理其他格式（WebP, TIFF 等）- 使用 Canvas 转换
  const dataUrl = await fileToBase64(file)
  const img = await loadImage(dataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法获取 canvas context')
  }

  ctx.drawImage(img, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('图片格式转换失败'))
          return
        }
        const newFileName = file.name.replace(/\.[^.]+$/, '.jpg')
        const convertedFile = new File([blob], newFileName, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })
        resolve(convertedFile)
      },
      'image/jpeg',
      0.9
    )
  })
}

// ==================== 裁剪相关 ====================

/**
 * 计算 cover 模式下的居中裁切尺寸
 * 图片需要完全覆盖相纸区域，居中裁切
 */
export function calculateCoverCropSize(
  sourceWidth: number,
  sourceHeight: number,
  paperRatio: number
): { cropWidth: number; cropHeight: number; offsetX: number; offsetY: number } {
  const imageRatio = sourceWidth / sourceHeight

  let cropWidth: number
  let cropHeight: number

  if (imageRatio > paperRatio) {
    // 图片更宽，裁剪左右
    cropHeight = sourceHeight
    cropWidth = sourceHeight * paperRatio
  } else {
    // 图片更高，裁剪上下
    cropWidth = sourceWidth
    cropHeight = sourceWidth / paperRatio
  }

  // 居中裁切：计算偏移量
  const offsetX = (sourceWidth - cropWidth) / 2
  const offsetY = (sourceHeight - cropHeight) / 2

  return { cropWidth, cropHeight, offsetX, offsetY }
}

/**
 * 计算默认的 SimpleCropInfo（居中裁切）
 */
export function calculateDefaultCropInfo(
  sourceWidth: number,
  sourceHeight: number,
  paperRatio: number,
  styleType: CropMode = 'cover'
): SimpleCropInfo {
  const { cropWidth, cropHeight, offsetX, offsetY } = calculateCoverCropSize(
    sourceWidth,
    sourceHeight,
    paperRatio
  )

  return {
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    cropWidth: Math.round(cropWidth),
    cropHeight: Math.round(cropHeight),
    sourceWidth,
    sourceHeight,
    styleType,
    croppedAreaPercent: {
      x: (offsetX / sourceWidth) * 100,
      y: (offsetY / sourceHeight) * 100,
      width: (cropWidth / sourceWidth) * 100,
      height: (cropHeight / sourceHeight) * 100,
    },
  }
}

/**
 * 将前端的裁剪模式转换为后端的 cropMode
 */
export function mapCropModeToServer(mode: CropMode | string): string {
  if (mode === 'center') {
    return 'cover'
  }
  return mode
}

/**
 * 将后端的 cropMode 转换为前端的模式
 */
export function mapCropModeFromServer(cropMode: string): CropMode {
  if (cropMode === 'center') {
    return 'cover'
  }
  return cropMode as CropMode
}

// ==================== 类型别名（兼容旧代码） ====================

/** @deprecated 请从 @/lib/types 导入 */
export type { CropMode, SimpleCropInfo }

