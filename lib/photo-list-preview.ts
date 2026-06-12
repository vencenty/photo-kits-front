import { buildOssCropUrl, buildWatermarkedOutputUrl } from '@/lib/image-config'
import {
  attachCoverWatermarkSize,
  createFullImageCropInfo,
  extractWatermarkTextFromOssUrl,
} from '@/lib/date-watermark'
import {
  buildDefaultCoverCropInfo,
  isFullImageCrop,
} from '@/lib/auto-photo-output'
import type { Image } from '@/lib/types'
import type { CropMode, SimpleCropInfo } from '@/lib/types'

const LIST_PREVIEW_SHORT_EDGE = 300

export interface BuildListPhotoPreviewUrlOptions {
  previewCropMode?: CropMode
  isLandscape?: boolean
  shortWidth?: number
  quality?: number
  format?: string
  /** 相纸尺寸（mm），满版预览/水印需按此重算裁剪框 */
  canvasWidth?: number
  canvasHeight?: number
}

function resolveDisplayMode(image: Image, previewCropMode?: CropMode): CropMode {
  return previewCropMode ?? image.cropMode ?? 'cover'
}

/** 当前展示模式下的有效 cover cropInfo（批量切满版时不能沿用留白整图 crop） */
export function resolveListPreviewSizeInfo(
  image: Image,
  displayMode: CropMode,
  canvas?: { canvasWidth: number; canvasHeight: number },
): SimpleCropInfo | undefined {
  const sourceWidth = image.width || image.cropInfo?.sourceWidth || 0
  const sourceHeight = image.height || image.cropInfo?.sourceHeight || 0

  if (displayMode === 'cover' && sourceWidth && sourceHeight) {
    const cropInfo = image.cropInfo
    const hasValidCoverCrop =
      cropInfo?.styleType === 'cover' && !isFullImageCrop(cropInfo)

    if (hasValidCoverCrop) {
      return { ...cropInfo, styleType: 'cover' }
    }

    if (canvas?.canvasWidth && canvas?.canvasHeight) {
      return buildDefaultCoverCropInfo(
        sourceWidth,
        sourceHeight,
        canvas.canvasWidth,
        canvas.canvasHeight,
      )
    }

    if (cropInfo) {
      return { ...cropInfo, styleType: 'cover' }
    }
  }

  if (sourceWidth && sourceHeight) {
    return createFullImageCropInfo(
      sourceWidth,
      sourceHeight,
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
    canvasWidth,
    canvasHeight,
  } = options ?? {}

  const displayMode = resolveDisplayMode(image, previewCropMode)
  const canvas =
    canvasWidth && canvasHeight ? { canvasWidth, canvasHeight } : undefined

  const coverSizeInfo =
    displayMode === 'cover'
      ? resolveListPreviewSizeInfo(image, 'cover', canvas)
      : undefined

  const watermarkText =
    image.isAdjusted ? extractWatermarkTextFromOssUrl(image.outputUrl || '') : null

  if (watermarkText) {
    const sizeInfo = resolveListPreviewSizeInfo(image, displayMode, canvas)
    let watermark = (sizeInfo
      ? attachCoverWatermarkSize({ text: watermarkText }, sizeInfo, true, shortWidth)
      : undefined) ?? { text: watermarkText }

    const watermarkAfterRotate = displayMode === 'cover' && !!isLandscape
    if (watermarkAfterRotate && watermark.outputWidth && watermark.outputHeight) {
      watermark = {
        text: watermark.text,
        outputWidth: watermark.outputHeight,
        outputHeight: watermark.outputWidth,
      }
    }

    return buildWatermarkedOutputUrl(originalUrl, sizeInfo, {
      forPreview: true,
      previewShortEdge: shortWidth,
      watermark,
      isLandscape,
      watermarkAfterRotate,
      quality,
      format,
    })
  }

  const cropInfoForPreview =
    displayMode === 'full' || displayMode === 'lomo'
      ? undefined
      : coverSizeInfo ?? image.cropInfo

  return buildOssCropUrl(originalUrl, cropInfoForPreview, {
    isLandscape,
    shortWidth,
    quality,
    format,
  })
}
