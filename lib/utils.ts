import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import heic2any from 'heic2any'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 生成唯一ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// 格式化日期
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

// 文件转为 Base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
}

// 转换图片格式为 JPEG（支持 HEIC, HEIF, WebP, TIFF 等）
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
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9,
      })
      
      // heic2any 可能返回 Blob 或 Blob[]
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法获取 canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0)

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
      }
      img.onerror = () => reject(new Error('不支持的图片格式'))
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
  })
}

// 压缩图片
export function compressImage(
  file: File,
  maxWidth: number = 800,
  quality: number = 0.8
): Promise<{ file: File; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // 计算缩放比例
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法获取 canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

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
      }
      img.onerror = () => reject(new Error('图片加载失败'))
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
  })
}

// 获取图片尺寸
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = () => reject(new Error('图片加载失败'))
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
  })
}

// 裁剪模式类型
export type CropMode = 'cover' | 'full' | 'lomo'

/**
 * 将前端的裁剪模式转换为后端的 cropMode（现在前后端统一，直接返回）
 * - cover (居中裁剪) → cover
 * - full (打印整图) → full
 * - lomo (四周留白) → lomo
 */
export function mapCropModeToServer(mode: CropMode | string): string {
  // 兼容旧数据：如果传入 center，转换为 cover
  if (mode === 'center') {
    return 'cover'
  }
  return mode
}

/**
 * 将后端的 cropMode 转换为前端的模式（现在前后端统一，直接返回）
 * - cover → cover (居中裁剪)
 * - full → full (打印整图)
 * - lomo → lomo (四周留白)
 */
export function mapCropModeFromServer(cropMode: string): CropMode {
  // 兼容旧数据：如果后端返回 center，转换为 cover
  if (cropMode === 'center') {
    return 'cover'
  }
  return cropMode as CropMode
}

