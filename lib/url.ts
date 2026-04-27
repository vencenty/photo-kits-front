/**
 * 统一 URL 处理工具
 * 集中管理 OSS、CDN 等 URL 的转换逻辑
 */

// ==================== 常量定义 ====================

/** 固定的 OSS 代理域名，用于上传后存储的 URL（后端/数据库中的地址） */
export const OSS_PROXY_DOMAIN = 'https://bucket.vencenty.cc'

/** CDN 域名，用于前端展示时加速访问（将 OSS 域名替换为 CDN） */
export const IMG_CDN_DOMAIN = 'https://img.vencenty.cc'

/** 已知的 OSS 主机名列表 */
const KNOWN_OSS_HOSTS = [
  'bucket.vencenty.cc',
  'oss-proxy.vencenty.cc',
  'img.vencenty.cc',
]

/** 判断是否为已知的主机名 */
function isKnownHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return (
    lower === 'img.vencenty.cc' ||
    lower === 'bucket.vencenty.cc' ||
    lower === 'oss-proxy.vencenty.cc' ||
    lower.endsWith('.aliyuncs.com')
  )
}

// ==================== URL 转换函数 ====================

/**
 * 将 OSS 图片 URL 转为 CDN URL，用于加速展示
 * 仅替换已知的 OSS 源站域名，其它 URL 原样返回
 */
export function toCdnUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const u = new URL(url)
    if (isKnownHost(u.hostname)) {
      return IMG_CDN_DOMAIN + u.pathname + u.search
    }
  } catch {
    // 非合法 URL 则原样返回
  }
  return url
}

/**
 * 将 CDN/任意 OSS 展示 URL 转回 bucket 源站 URL，用于发给服务端存储
 * 服务端下载用 bucket 地址可避免走 CDN 产生费用
 */
export function toBucketUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const u = new URL(url)
    if (isKnownHost(u.hostname)) {
      return OSS_PROXY_DOMAIN + u.pathname + u.search
    }
  } catch {
    // 非合法 URL 则原样返回
  }
  return url
}

/**
 * 获取图片完整 URL（用于显示，走 CDN 加速）
 */
export function getImageUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return toCdnUrl(path)
  }
  return `${IMG_CDN_DOMAIN}/${path.replace(/^\//, '')}`
}

/**
 * 判断是否为 OSS URL
 */
export function isOssUrl(url: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return isKnownHost(u.hostname)
  } catch {
    return false
  }
}
