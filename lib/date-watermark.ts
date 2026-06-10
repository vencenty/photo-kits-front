import { stripOssImageProcessFromUrl } from './image-config'
import type { CropMode, SimpleCropInfo } from './types'

/** OSS image/info 返回的 EXIF 字段 */
interface OssInfoField {
  value?: string
}

interface OssImageInfo {
  DateTimeOriginal?: OssInfoField
  DateTime?: OssInfoField
}

// ── 日期水印视觉参数（改这里即可，保存热更新后编辑页/留白/整图 OSS 预览与冲印 outputUrl 同步）──
/** 距画面右、下边距（占输出图宽/高比例） */
export const DATE_WATERMARK_MARGIN_RATIO = 0.05
/** 字号 = 输出图短边 × 此比例（如 0.05 = 短边 5%） */
export const DATE_WATERMARK_SHORT_EDGE_RATIO = 0.05
/** 数码相机日期戳黄色（OSS color 参数，不含 #） */
//export const DATE_WATERMARK_COLOR = 'FFCC00'
export const DATE_WATERMARK_COLOR = 'FFFFFF'

const DATE_WATERMARK_MIN_SIZE = 10

/**
 * 将 EXIF 日期字符串格式化为日期水印文本
 * 例：2023:09:10 10:20:02 → 2023年9月10日 10:20
 */
export function formatShootDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{4})[:\-/](\d{1,2})[:\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/)
  if (!m) return null
  const y = m[1]
  const mo = Number(m[2])
  const d = Number(m[3])
  const dateStr = `${y}年${mo}月${d}日`
  if (m[4] != null && m[5] != null) {
    const hh = m[4].padStart(2, '0')
    const mm = m[5].padStart(2, '0')
    return `${dateStr} ${hh}:${mm}`
  }
  return dateStr
}

/** 同一原图 URL 的 EXIF 请求合并（避免 Strict Mode / 编辑器重挂载时重复打 image/info） */
const exifDateRequestCache = new Map<string, Promise<string | null>>()

/**
 * 通过阿里云 OSS image/info 获取 EXIF 拍摄日期
 */
export async function fetchOssExifDate(originalUrl: string): Promise<string | null> {
  if (!originalUrl || originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return null
  }
  const base = stripOssImageProcessFromUrl(originalUrl)
  const cached = exifDateRequestCache.get(base)
  if (cached) return cached

  const separator = base.includes('?') ? '&' : '?'
  const infoUrl = `${base}${separator}x-oss-process=image/info`

  const request = (async () => {
    try {
      const res = await fetch(infoUrl)
      if (!res.ok) return null
      const data = (await res.json()) as OssImageInfo
      const raw = data.DateTimeOriginal?.value || data.DateTime?.value
      if (!raw) return null
      return formatShootDate(raw)
    } catch {
      return null
    }
  })()

  exifDateRequestCache.set(base, request)
  return request
}

/** 从已保存的 outputUrl 解析 OSS 水印文字（列表预览复用编辑页同款水印） */
export function decodeOssWatermarkText(encoded: string): string | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (b64.length % 4)) % 4
    const padded = b64 + '='.repeat(padLen)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function extractWatermarkTextFromOssUrl(url: string): string | null {
  if (!url || !url.includes('watermark,text_')) return null
  const match = url.match(/watermark,text_([^/,]+)/)
  if (!match?.[1]) return null
  return decodeOssWatermarkText(match[1])
}

/** OSS 水印文字 URL-safe Base64 编码 */
export function encodeOssWatermarkText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export interface DateWatermarkOptions {
  text: string
  /** 水印施加时处理结果的宽高（与 OSS 链 crop/resize 之后一致） */
  outputWidth?: number
  outputHeight?: number
}

/** 满版裁剪：按裁剪框输出尺寸附加水印比例参数（保存用原图 crop 像素，预览用 resolveWatermarkOutputSize 缩放） */
export function attachCoverWatermarkSize(
  watermark: DateWatermarkOptions | undefined,
  cropInfo: SimpleCropInfo,
  forPreview?: boolean,
  previewShortEdge?: number,
): DateWatermarkOptions | undefined {
  if (!watermark?.text) return undefined
  const size = resolveWatermarkOutputSize(
    cropInfo,
    forPreview ? previewShortEdge : undefined,
  )
  return {
    text: watermark.text,
    outputWidth: size.width,
    outputHeight: size.height,
  }
}

/** 留白/整图：用原图尺寸参与水印比例计算（不参与 OSS crop） */
export function createFullImageCropInfo(
  sourceWidth: number,
  sourceHeight: number,
  styleType: Extract<CropMode, 'lomo' | 'full'> = 'lomo',
): SimpleCropInfo {
  return {
    offsetX: 0,
    offsetY: 0,
    cropWidth: sourceWidth,
    cropHeight: sourceHeight,
    sourceWidth,
    sourceHeight,
    styleType,
  }
}

/**
 * 推算 OSS 链在水印步骤时的输出尺寸（crop 后、resize,s_N 后）
 */
export function resolveWatermarkOutputSize(
  cropInfo?: SimpleCropInfo,
  shortWidth?: number,
): { width: number; height: number } {
  let w = 1200
  let h = 1200

  if (cropInfo?.styleType === 'cover' && cropInfo.cropWidth && cropInfo.cropHeight) {
    w = cropInfo.cropWidth
    h = cropInfo.cropHeight
  } else if (cropInfo?.sourceWidth && cropInfo?.sourceHeight) {
    w = cropInfo.sourceWidth
    h = cropInfo.sourceHeight
  }

  if (!shortWidth || shortWidth <= 0) {
    return { width: Math.round(w), height: Math.round(h) }
  }

  const short = Math.min(w, h)
  if (short <= 0) {
    return { width: Math.round(w), height: Math.round(h) }
  }

  const scale = shortWidth / short
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  }
}

/** 字号：输出图短边 × 固定比例 */
export function resolveDateWatermarkFontSize(outputWidth: number, outputHeight: number): number {
  const shortEdge = Math.max(1, Math.min(outputWidth, outputHeight))
  return Math.max(DATE_WATERMARK_MIN_SIZE, Math.round(shortEdge * DATE_WATERMARK_SHORT_EDGE_RATIO))
}

/** 边距：右、下各 5% 输出图宽/高（OSS g_se 锚点向内偏移） */
export function resolveDateWatermarkOffset(outputWidth: number, outputHeight: number): { x: number; y: number } {
  return {
    x: Math.max(1, Math.round(outputWidth * DATE_WATERMARK_MARGIN_RATIO)),
    y: Math.max(1, Math.round(outputHeight * DATE_WATERMARK_MARGIN_RATIO)),
  }
}

/**
 * 构建 OSS 日期水印处理段（不含 image/ 前缀）
 * 放在 crop/resize 之后，锚点为处理结果图右下角（内容区域）
 */
export function buildDateWatermarkParam(options: DateWatermarkOptions): string {
  const w = options.outputWidth ?? 1200
  const h = options.outputHeight ?? 1200
  const fontSize = resolveDateWatermarkFontSize(w, h)
  const { x, y } = resolveDateWatermarkOffset(w, h)
  const encoded = encodeOssWatermarkText(options.text)
  return `watermark,text_${encoded},size_${fontSize},color_${DATE_WATERMARK_COLOR},g_se,t_88,x_${x},y_${y},shadow_50`
}
