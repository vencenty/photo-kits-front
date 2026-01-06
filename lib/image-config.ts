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
    width: 800,      // 编辑页图片宽度（像素）
    height: 0,      // 0 表示按宽度等比例缩放
    quality: 85,    // 图片质量（0-100）
    format: 'jpg',  // 输出格式：jpg/webp/png，空字符串表示不转换
  } as OssImageConfig,
} as const

/**
 * 构建 OSS 图片处理参数
 * @param config 压缩配置
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
 * @returns 添加了压缩参数的 URL
 */
export function applyOssImageCompress(url: string, config: OssImageConfig): string {
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
 */
export function getListImageUrl(url: string): string {
  return applyOssImageCompress(url, IMAGE_COMPRESS_CONFIG.list)
}

/**
 * 获取编辑页压缩后的图片 URL
 */
export function getEditImageUrl(url: string): string {
  return applyOssImageCompress(url, IMAGE_COMPRESS_CONFIG.edit)
}

