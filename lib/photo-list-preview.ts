import { buildOssCropUrl, buildWatermarkedOutputUrl } from '@/lib/image-config'
import { createFullImageCropInfo, extractWatermarkTextFromOssUrl } from '@/lib/date-watermark'
import type { Image } from '@/lib/types'
import type { CropMode, SimpleCropInfo } from '@/lib/types'

const LIST_PREVIEW_SHORT_EDGE = 300

export interface BuildListPhotoPreviewUrlOptions {
  previewCropMode?: CropMode
  isLandscape?: boolean
  shortWidth?: number
  quality?: number
  format?: string
}

function resolveDisplayMode(image: Image, previewCropMode?: CropMode): CropMode {
  return previewCropMode ?? image.cropMode ?? 'cover'
}

/** 列表预览用的 sizeInfo（crop 链 + 水印比例计算） */
export function resolveListPreviewSizeInfo(
  image: Image,
  displayMode: CropMode,
): SimpleCropInfo | undefined {
  if (displayMode === 'cover' && image.cropInfo) {
    return { ...image.cropInfo, styleType: 'cover' }
  }
  if (image.width && image.height) {
    return createFullImageCropInfo(
      image.width,
      image.height,
      displayMode === 'full' ? 'full' : 'lomo',
    )
  }
  return image.cropInfo
}

/**
 * 上传列表缩略图 URL（与编辑页保存的 outputUrl 水印观感一致）
 * 已调整且 outputUrl 含水印时，按列表短边重新拼接 crop/resize/watermark
 */
export function buildListPhotoPreviewUrl(
  image: Image,
  options?: BuildListPhotoPreviewUrlOptions,
): string {
  const originalUrl = image.originalUrl || image.thumbnailUrl || ''
  if (!originalUrl) return ''

  const {
    previewCropMode,
    isLandscape,
    shortWidth = LIST_PREVIEW_SHORT_EDGE,
    quality = 70,
    format = 'jpg',
  } = options ?? {}

  const displayMode = resolveDisplayMode(image, previewCropMode)
  const cropInfoForPreview =
    previewCropMode === 'full' || previewCropMode === 'lomo' ? undefined : image.cropInfo

  const watermarkText =
    image.isAdjusted ? extractWatermarkTextFromOssUrl(image.outputUrl || '') : null

  if (watermarkText) {
    const sizeInfo = resolveListPreviewSizeInfo(image, displayMode)
    return buildWatermarkedOutputUrl(originalUrl, sizeInfo, {
      forPreview: true,
      previewShortEdge: shortWidth,
      watermark: { text: watermarkText },
      isLandscape,
      quality,
      format,
    })
  }

  return buildOssCropUrl(originalUrl, cropInfoForPreview, {
    isLandscape,
    shortWidth,
    quality,
    format,
  })
}
