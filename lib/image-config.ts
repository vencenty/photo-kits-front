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
 * - 源文件最大支持 20MB
 * - 格式转换（format）会消耗额外的处理时间
 */

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
}

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
    width: 300,      // 列表页缩略图宽度（像素）
    height: 0,      // 0 表示按宽度等比例缩放
    quality: 80,    // 图片质量（0-100）
    format: 'jpg',  // 输出格式：jpg/webp/png，空字符串表示不转换
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
  } as OssImageConfig,
} as const

/**
 * 构建 OSS 图片处理参数
 * @param config 压缩配置
 * @param autoRotated 是否自动旋转（横图转竖图，旋转90度）
 * @returns OSS 图片处理参数字符串
 */
export function buildOssImageParams(config: OssImageConfig): string {
  const params: string[] = []


  // 添加尺寸参数
  if (config.width > 0 && config.height > 0) {
    params.push(`resize,w_${config.width},h_${config.height}`)
  } else if (config.width > 0) {
    params.push(`resize,w_${config.width}`)
  } else if (config.height > 0) {
    params.push(`resize,h_${config.height}`)
  }

  // 添加质量参数
  if (config.quality > 0) {
    params.push(`quality,q_${config.quality}`)
  }

  // 添加格式转换参数
  if (config.format) {
    params.push(`format,${config.format}`)
  }

  return params.length > 0 ? `image/${params.join('/')}` : ''
}

/**
 * 给 OSS URL 添加压缩参数
 * @param url 原始图片 URL
 * @param config 压缩配置
 * @param autoRotated 是否自动旋转（横图转竖图，旋转90度）
 * @returns 添加了压缩参数的 URL
 */
export function applyOssImageCompress(url: string, config: OssImageConfig, autoRotated?: boolean): string {
  if (!url) return url

  // 如果是 data URL 或本地文件，不处理
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }

  // 判断是否为 OSS URL
  const isOssUrl = url.includes('aliyuncs.com') || 
                   url.includes('oss-proxy') || 
                   url.includes('vencenty.cc')

  if (!isOssUrl) {
    return url
  }

  // 构建 OSS 图片处理参数
  const ossParams = buildOssImageParams(config)
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
 * @param autoRotated 是否自动旋转（横图转竖图，旋转90度）
 */
export function getListImageUrl(url: string, autoRotated?: boolean): string {
  return applyOssImageCompress(url, IMAGE_COMPRESS_CONFIG.list, autoRotated)
}

/**
 * 获取编辑页压缩后的图片 URL
 * @param url 原始图片 URL
 * @param autoRotated 是否自动旋转（横图转竖图，旋转90度）
 */
export function getEditImageUrl(url: string, autoRotated?: boolean): string {
  return applyOssImageCompress(url, IMAGE_COMPRESS_CONFIG.edit, autoRotated)
}

// ==================== OSS 裁剪相关 ====================

/**
 * 简化的裁剪信息（用于 react-easy-crop）
 */
export interface SimpleCropInfo {
  /** 裁剪起始 X（原图像素） */
  offsetX: number
  /** 裁剪起始 Y（原图像素） */
  offsetY: number
  /** 裁剪宽度（原图像素） */
  cropWidth: number
  /** 裁剪高度（原图像素） */
  cropHeight: number
  /** 原图宽度 */
  sourceWidth: number
  /** 原图高度 */
  sourceHeight: number
  /** 样式类型 */
  styleType: 'cover' | 'full' | 'lomo'
}

/**
 * 构建 OSS 裁剪 URL
 * @param originalUrl 原图 URL
 * @param cropInfo 裁剪信息
 * @param autoRotated 是否自动旋转（横图转竖图，旋转90度）
 * @returns 带裁剪参数的 URL
 */
export function buildOssCropUrl(originalUrl: string, cropInfo: SimpleCropInfo, autoRotated?: boolean): string {
  if (!originalUrl) return originalUrl

  // 如果是 data URL 或本地文件，不处理
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl
  }

  // 判断是否为 OSS URL
  const isOssUrl = originalUrl.includes('aliyuncs.com') || 
                   originalUrl.includes('oss-proxy') || 
                   originalUrl.includes('vencenty.cc')

  if (!isOssUrl) {
    return originalUrl
  }

  const { offsetX, offsetY, cropWidth, cropHeight, styleType, sourceWidth, sourceHeight } = cropInfo

  // full 和 lomo 模式不需要裁剪
  if (styleType !== 'cover') {
    return originalUrl
  }

  const params: string[] = []

  // 如果 autoRotated 为 true，先添加旋转参数（旋转应该在裁剪之前）
  if (autoRotated) {
    params.push('rotate,90')
    
    // 当 autoRotated 为 true 时，传入的坐标是基于旋转后的图片的
    // 需要转换为原图坐标系（因为 OSS 是先旋转再裁剪）
    // 原图尺寸：sourceWidth x sourceHeight
    // 旋转后尺寸：sourceHeight x sourceWidth
    // 坐标转换：旋转后图片上的 (x, y, w, h) 转换为原图上的 (y, sourceWidth - x - w, h, w)
    const originalX = Math.round(offsetY)
    const originalY = Math.round(sourceWidth - offsetX - cropWidth)
    const originalW = Math.round(cropHeight)
    const originalH = Math.round(cropWidth)
    
    params.push(`crop,x_${originalX},y_${originalY},w_${originalW},h_${originalH}`)
  } else {
    // 构建裁剪参数（未旋转的情况）
    const x = Math.round(offsetX)
    const y = Math.round(offsetY)
    const w = Math.round(cropWidth)
    const h = Math.round(cropHeight)
    params.push(`crop,x_${x},y_${y},w_${w},h_${h}`)
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

/**
 * 构建带裁剪和压缩的 OSS URL（用于列表页预览）
 * @param originalUrl 原图 URL
 * @param cropInfo 裁剪信息
 * @param targetWidth 目标宽度（用于压缩）
 * @param autoRotated 是否自动旋转（横图转竖图，旋转90度）
 * @returns 带裁剪和压缩参数的 URL
 */
export function buildOssCropAndResizeUrl(
  originalUrl: string, 
  cropInfo: SimpleCropInfo,
  targetWidth: number = 300,
  autoRotated?: boolean
): string {
  if (!originalUrl) return originalUrl

  // 如果是 data URL 或本地文件，不处理
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl
  }

  // 判断是否为 OSS URL
  const isOssUrl = originalUrl.includes('aliyuncs.com') || 
                   originalUrl.includes('oss-proxy') || 
                   originalUrl.includes('vencenty.cc')

  if (!isOssUrl) {
    return originalUrl
  }

  const { offsetX, offsetY, cropWidth, cropHeight, styleType, sourceWidth, sourceHeight } = cropInfo
  const params: string[] = []

  // 如果 autoRotated 为 true，先添加旋转参数（旋转应该在裁剪之前）
  if (autoRotated) {
    params.push('rotate,90')
  }

  // cover 模式需要裁剪
  if (styleType === 'cover') {
    if (autoRotated) {
      // 当 autoRotated 为 true 时，传入的坐标是基于旋转后的图片的
      // 需要转换为原图坐标系（因为 OSS 是先旋转再裁剪）
      // 原图尺寸：sourceWidth x sourceHeight
      // 旋转后尺寸：sourceHeight x sourceWidth
      // 坐标转换：旋转后图片上的 (x, y, w, h) 转换为原图上的 (y, sourceWidth - x - w, h, w)
      const originalX = Math.round(offsetY)
      const originalY = Math.round(sourceWidth - offsetX - cropWidth)
      const originalW = Math.round(cropHeight)
      const originalH = Math.round(cropWidth)
      params.push(`crop,x_${originalX},y_${originalY},w_${originalW},h_${originalH}`)
    } else {
      // 未旋转的情况，直接使用传入的坐标
      const x = Math.round(offsetX)
      const y = Math.round(offsetY)
      const w = Math.round(cropWidth)
      const h = Math.round(cropHeight)
      params.push(`crop,x_${x},y_${y},w_${w},h_${h}`)
    }
  }

  // 添加压缩参数
  params.push(`resize,w_${targetWidth}`)
  params.push('quality,q_80')
  params.push('format,jpg')

  // 移除已有的 x-oss-process 参数
  let cleanUrl = originalUrl
  if (originalUrl.includes('x-oss-process=')) {
    cleanUrl = originalUrl.replace(/[?&]x-oss-process=[^&]+/, '')
    cleanUrl = cleanUrl.replace(/\?$/, '').replace(/\?&/, '?').replace(/&&/, '&')
  }

  const separator = cleanUrl.includes('?') ? '&' : '?'
  return `${cleanUrl}${separator}x-oss-process=image/${params.join('/')}`
}

