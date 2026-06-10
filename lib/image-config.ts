/**
 * 图片压缩配置
 * 用于统一管理不同场景下的图片压缩参数
 *
 * 使用说明：
 * 1. 修改 IMAGE_COMPRESS_CONFIG 中的配置来调整压缩参数
 * 2. width/height: 设置图片尺寸（0 表示不限制该维度）
 * 3. quality: 图片质量 0-100（数值越大质量越高，文件越大）
 * 4. format: 输出格式（jpg/webp/png），空字符串表示不转换格式
 *
 * 注意事项：
 * - 阿里云 OSS 图片处理对 HEIC/HEIF 格式需要开通「图片高级处理」功能
 * - 源文件建议不超过 50MB
 * - 格式转换（format）会消耗额外的处理时间
 */

import { toCdnUrl, isOssUrl } from '@/lib/url'
import { buildDateWatermarkParam, resolveWatermarkOutputSize, type DateWatermarkOptions } from '@/lib/date-watermark'
import type { SimpleCropInfo, CropMode } from './types'

/**
 * OSS 图片处理配置
 */
export interface OssImageConfig {
  /** 宽度（像素），0 表示不限制宽度 */
  width: number
  /** 高度（像素），0 表示不限制高度 */
  height: number
  /** 质量（0-100），0 表示不设置质量 */
  quality: number
  /** 输出格式（jpg/webp/png），空字符串表示不转换格式 */
  format: string
  /** 是否渐进显示（0：标准显示，1：渐进显示），默认1。仅适用于JPG格式 */
  interlace?: number
}

/**
 * 编辑器缩略图短边尺寸（像素）
 * 用于图片编辑页面，平衡清晰度和加载速度
 * - 600: 更快加载，适合网络较慢的场景
 * - 800: 默认值，平衡清晰度和速度
 * - 1000: 更清晰，适合高端设备
 */
export const EDITOR_THUMBNAIL_SHORT_EDGE = 600

/**
 * 图片压缩场景配置
 * 
 * 修改这里的配置来调整不同场景下的图片压缩参数
 */
export const IMAGE_COMPRESS_CONFIG = {
  /**
   * 列表页压缩配置
   * 用于上传列表页的缩略图显示
   * 建议：较小的尺寸和较低的质量，以提升加载速度
   */
  list: {
    width: 200,      // 列表页缩略图宽度（像素）
    height: 0,      // 0 表示按宽度等比例缩放
    quality: 65,    // 图片质量（0-100）
    format: 'webp',  // 输出格式：jpg/webp/png，空字符串表示不转换
    interlace: 1,    // 渐进显示（仅JPG格式有效）
  } as OssImageConfig,

  /**
   * 编辑页压缩配置
   * 用于编辑页面的图片显示（需要更高的清晰度）
   * 建议：较大的尺寸和较高的质量，以保证编辑时的清晰度
   */
  edit: {
    width: 600,      // 编辑页图片宽度（像素）
    height: 0,      // 0 表示按宽度等比例缩放
    quality: 70,    // 图片质量（0-100）
    format: 'jpg',  // 输出格式：jpg/webp/png，空字符串表示不转换
    interlace: 1,    // 渐进显示（仅JPG格式有效）
  } as OssImageConfig,

  /**
   * 编辑缩略图配置
   * 用于编辑时的快速加载和显示，尺寸小速度快
   * 使用短边缩放：按照短边压缩到600px，质量70%，格式化为jpg
   */
  editThumbnail: {
    width: 600,      // 短边缩放尺寸（像素）
    height: 0,      // 0 表示按宽度等比例缩放
    quality: 70,    // 图片质量（0-100）
    format: 'jpg',  // 输出格式：jpg/webp/png，空字符串表示不转换
    interlace: 1,    // 渐进显示（仅JPG格式有效）
    useShortEdge: true, // 使用短边缩放
  } as OssImageConfig & { useShortEdge?: boolean },
} as const

/**
 * Lomo 模式白边配置
 * 用于控制四周留白模式下的白边宽度（百分比）
 */
export const WHITE_MARGIN_PERCENT = 5

/**
 * 构建 OSS 图片处理参数
 * @param config 压缩配置
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 * @returns OSS 图片处理参数字符串
 */
export function buildOssImageParams(config: OssImageConfig, isLandscape?: boolean): string {
  const params: string[] = []


  // // 添加尺寸参数
  // if ((config as any).useShortEdge && config.width > 0) {
  //   // 使用短边缩放：s_600 表示按照短边压缩到600px
  //   params.push(`resize,s_${config.width}`)
  // } else if (config.width > 0 && config.height > 0) {
  //   params.push(`resize,w_${config.width},h_${config.height}`)
  // } else if (config.width > 0) {
  //   params.push(`resize,w_${config.width}`)
  // } else if (config.height > 0) {
  //   params.push(`resize,h_${config.height}`)
  // }

  // 添加质量参数
  if (config.quality > 0) {
    params.push(`quality,q_${config.quality}`)
  }

  // 添加格式转换参数
  if (config.format) {
    params.push(`format,${config.format}`)
  }

  // 添加渐进显示参数（仅JPG格式有效）
  // 如果格式是jpg或转换为jpg，则添加渐进显示参数
  if (config.interlace !== undefined && config.interlace !== 0) {
    // 如果已经设置了format为jpg，或者原图是jpg格式，则添加渐进显示
    if (config.format === 'jpg' || config.format === '') {
      params.push('interlace,1')
    }
  }

  // 如果 isLandscape 为 true，添加旋转参数（旋转应该在所有操作之后）
  if (isLandscape) {
    params.push('rotate,90')
  }

  return params.length > 0 ? `image/${params.join('/')}` : ''
}

/**
 * 给 OSS URL 添加压缩参数
 * @param url 原始图片 URL
 * @param config 压缩配置
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 * @returns 添加了压缩参数的 URL
 */
export function applyOssImageCompress(url: string, config: OssImageConfig, isLandscape?: boolean): string {
  if (!url) return url

  // 如果是 data URL 或本地文件，不处理
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }

  // 展示走 CDN 加速
  url = toCdnUrl(url)

  // 判断是否为 OSS URL
  const isOssUrl = url.includes('aliyuncs.com') || 
                   url.includes('oss-proxy') || 
                   url.includes('vencenty.cc')

  if (!isOssUrl) {
    return url
  }

  // 构建 OSS 图片处理参数
  const ossParams = buildOssImageParams(config, isLandscape)
  if (!ossParams) {
    return url
  }

  // 添加参数到 URL
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}x-oss-process=${ossParams}`
}

/**
 * 获取列表页压缩后的图片 URL
 * @param url 原始图片 URL
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 */
export function getListImageUrl(url: string, isLandscape?: boolean): string {
  return applyOssImageCompress(url, IMAGE_COMPRESS_CONFIG.list, isLandscape)
}

/**
 * 获取编辑页压缩后的图片 URL
 * @param url 原始图片 URL
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 */
export function getEditImageUrl(url: string, isLandscape?: boolean): string {
  return applyOssImageCompress(url, IMAGE_COMPRESS_CONFIG.edit)
}

/**
 * 获取短边缩略图 URL（通用方法）
 * 可以自定义短边宽度、质量、格式等参数
 * @param url 原始图片 URL
 * @param options 可选参数
 * @param options.shortEdge 短边宽度（像素），默认600
 * @param options.quality 图片质量（0-100），默认70
 * @param options.format 输出格式（jpg/webp/png），默认jpg
 * @param options.isLandscape 是否自动旋转（横图转竖图，旋转90度）
 * @param options.interlace 是否渐进显示（0：标准显示，1：渐进显示），默认1。仅JPG格式有效
 * @returns 缩略图 URL
 */
export function getShortEdgeThumbnailUrl(
  url: string,
  options?: {
    shortEdge?: number
    quality?: number
    format?: string
    isLandscape?: boolean
    interlace?: number
  }
): string {
  const { shortEdge = 600, quality = 70, format = 'jpg', isLandscape, interlace = 1 } = options || {}
  
  const config: OssImageConfig & { useShortEdge?: boolean } = {
    width: shortEdge,
    height: 0,
    quality,
    format,
    interlace,
    useShortEdge: true,
  }
  
  return applyOssImageCompress(url, config, isLandscape)
}

/**
 * 获取编辑缩略图 URL
 * 用于编辑时的快速加载和显示，图片小体验友好
 * 使用短边600px，清晰度更高
 * @param url 原始图片 URL
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 * @returns 编辑缩略图 URL
 */
export function getEditThumbnailUrl(url: string, isLandscape?: boolean): string {
  return getShortEdgeThumbnailUrl(url, {
    shortEdge: 600,
    quality: 70,
    format: 'jpg',
    isLandscape,
  })
}

/**
 * 获取列表页缩略图 URL
 * 用于列表页的快速加载，使用短边300px，加载更快
 * @param url 原始图片 URL
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 * @returns 列表页缩略图 URL
 */
export function getListThumbnailUrl(url: string, isLandscape?: boolean): string {
  return getShortEdgeThumbnailUrl(url, {
    shortEdge: 300,
    quality: 70,
    format: 'jpg',
    isLandscape,
  })
}

/**
 * 获取预览图 URL（用于列表页）
 * 基于裁切参数拼接，支持横图自动旋转为竖图显示
 * @param url 原始图片 URL
 * @param cropInfo 裁剪信息
 * @param isLandscape 是否自动旋转（横图转竖图，旋转90度）
 * @returns 预览图 URL
 */
export function getPreviewImageUrl(url: string, cropInfo: SimpleCropInfo, isLandscape?: boolean): string {
  return buildOssCropUrl(url, cropInfo, {
    isLandscape,
    shortWidth: IMAGE_COMPRESS_CONFIG.list.width,
    quality: IMAGE_COMPRESS_CONFIG.list.quality,
    format: IMAGE_COMPRESS_CONFIG.list.format,
  })
}

/**
 * 去掉 URL 上的 x-oss-process 查询参数（保留其它 query）。
 * 满版以外的样式不应带 OSS crop；从 cover 切到 full/lomo 时原 URL 可能仍带旧 crop，需先剥掉。
 */
export function stripOssImageProcessFromUrl(url: string): string {
  if (!url || !url.includes('x-oss-process=')) return url
  let out = url.replace(/[?&]x-oss-process=[^&]+/, '')
  out = out.replace(/\?$/, '').replace(/\?&/, '?').replace(/&&/, '&')
  return out
}

// ==================== 类型重新导出（保持向后兼容） ====================

// 从 types.ts 重新导出，不再重复定义
export type { SimpleCropInfo, CropMode } from './types'

export interface BuildWatermarkedOutputUrlOptions {
  /** true：按缩略图链（resize,s_N）算水印比例，与编辑预览一致 */
  forPreview?: boolean
  previewShortEdge?: number
  watermark?: DateWatermarkOptions
  quality?: number
  format?: string
  interlace?: number
  isLandscape?: boolean
}

/**
 * 构建输出图 URL（预览 / 保存冲印共用同一套水印比例算法）
 * - 预览：forPreview + resize,s_N，水印按缩略图输出尺寸 × 比例
 * - 保存：无 resize，水印按 crop/原图输出尺寸 × 同一比例 → 冲印观感与预览一致
 */
export function buildWatermarkedOutputUrl(
  imageUrl: string,
  sizeInfo: SimpleCropInfo | undefined,
  options?: BuildWatermarkedOutputUrlOptions,
): string {
  const shortWidth = options?.forPreview
    ? (options.previewShortEdge ?? EDITOR_THUMBNAIL_SHORT_EDGE)
    : undefined
  return buildOssCropUrl(imageUrl, sizeInfo, {
    shortWidth,
    quality: options?.quality,
    format: options?.format,
    interlace: options?.interlace,
    isLandscape: options?.isLandscape,
    watermark: options?.watermark,
  })
}

/**
 * 构建 OSS 裁剪 URL
 * @param originalUrl 原图 URL
 * @param cropInfo 裁剪信息
 * @param options 可选参数
 * @param options.isLandscape 是否自动旋转（横图转竖图，旋转90度）- 用于列表页展示
 * @param options.targetWidth 目标宽度（用于压缩）- 用于列表页展示
 * @param options.quality 图片质量（0-100）- 用于列表页展示
 * @param options.format 输出格式（jpg/webp/png）- 用于列表页展示
 * @param options.interlace 是否渐进显示（0：标准显示，1：渐进显示）- 仅JPG格式有效
 * @returns 带裁剪参数的 URL
 */
export function buildOssCropUrl(
  originalUrl: string,
  cropInfo?: SimpleCropInfo,
  options?: {
    isLandscape?: boolean
    shortWidth?: number
    quality?: number
    format?: string
    interlace?: number
    /** 日期水印（OSS watermark，在 crop 之后拼接） */
    watermark?: DateWatermarkOptions
  }
): string {
  if (!originalUrl) return originalUrl

  // 如果是 data URL 或本地文件，不处理
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl
  }

  // 展示走 CDN 加速
  originalUrl = toCdnUrl(originalUrl)

  // 判断是否为 OSS URL
  if (!isOssUrl(originalUrl)) {
    return originalUrl
  }

  const { isLandscape, shortWidth, quality, format, interlace, watermark } = options || {}
  const params: string[] = []

  // 只有满版（cover）才拼接 OSS crop；full / lomo 不应带裁剪参数
  if (cropInfo && cropInfo.styleType === 'cover') {
    const { offsetX, offsetY, cropWidth, cropHeight } = cropInfo
    const x = Math.round(offsetX)
    const y = Math.round(offsetY)
    const w = Math.round(cropWidth)
    const h = Math.round(cropHeight)
    params.push(`crop,x_${x},y_${y},w_${w},h_${h}`)
  }

  // 无论是否有cropInfo，都增加这些基础处理参数
  // 增加短边缩放参数
  if (shortWidth) {
      params.push(`resize,s_${shortWidth}`)
  }

  if (quality) {
    params.push(`quality,q_${quality}`)
  }

  if (format) {
    params.push(`format,${format}`)
  }

  // 添加渐进显示参数（仅JPG格式有效）
  // 如果格式是jpg或转换为jpg，则添加渐进显示参数
  if (interlace !== undefined && interlace !== 0) {
    // 如果已经设置了format为jpg，或者没有设置format（可能是原图就是jpg），则添加渐进显示
    if (format === 'jpg' || format === '') {
      params.push('interlace,1')
    }
  }

  // 日期水印：crop/resize 之后、rotate 之前；锚在照片原始方向右下角（与保存 outputUrl 一致）
  if (watermark?.text) {
    let outputWidth = watermark.outputWidth
    let outputHeight = watermark.outputHeight
    if (outputWidth == null || outputHeight == null) {
      const size = resolveWatermarkOutputSize(cropInfo, shortWidth)
      outputWidth = size.width
      outputHeight = size.height
    }
    params.push(buildDateWatermarkParam({
      text: watermark.text,
      outputWidth,
      outputHeight,
    }))
  }

  // 列表展示旋转：必须在 watermark 之后，避免水印落在「显示方向」右下角而非照片方向
  if (isLandscape) {
    params.push('rotate,90')
  }

  // 没有新的处理链时：非 OSS 原样返回；OSS 则去掉旧 x-oss-process（避免从 cover 切走后仍带 crop）
  if (params.length === 0) {
    return stripOssImageProcessFromUrl(originalUrl)
  }

  // 移除已有的 x-oss-process 参数，避免冲突
  let cleanUrl = originalUrl
  if (originalUrl.includes('x-oss-process=')) {
    cleanUrl = originalUrl.replace(/[?&]x-oss-process=[^&]+/, '')
    // 清理可能留下的 ? 或 &
    cleanUrl = cleanUrl.replace(/\?$/, '').replace(/\?&/, '?').replace(/&&/, '&')
  }

  const separator = cleanUrl.includes('?') ? '&' : '?'
  return `${cleanUrl}${separator}x-oss-process=image/${params.join('/')}`
}
