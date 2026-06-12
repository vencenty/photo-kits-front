/**
 * 上传 / 批量裁剪时自动生成与编辑页保存一致的 cropInfo + outputUrl（含可选日期水印）
 */

import { buildOssCropUrl, buildWatermarkedOutputUrl } from './image-config'
import {
  attachCoverWatermarkSize,
  createFullImageCropInfo,
  fetchOssExifDate,
} from './date-watermark'
import { calculateCoverCropSize } from './utils'
import type { CropInfo, CropMode, SimpleCropInfo } from './types'

export interface BuildPhotoOutputParams {
  originalUrl: string
  sourceWidth: number
  sourceHeight: number
  canvasWidth: number
  canvasHeight: number
  mode: CropMode
  /** 为 true 时尝试读 EXIF 并拼接 OSS 水印 */
  dateWatermarkEnabled: boolean
  /** 已有裁剪（编辑页 / 先前保存），cover 满版时优先保留 */
  existingCropInfo?: SimpleCropInfo | null
}

/** 是否为有效的满版裁剪框（非整图） */
export function isValidCoverCropInfo(cropInfo?: SimpleCropInfo | null): boolean {
  if (!cropInfo || cropInfo.styleType !== 'cover') return false
  if (!cropInfo.cropWidth || !cropInfo.cropHeight) return false
  return !isFullImageCrop(cropInfo)
}

/** 按模式解析用于 outputUrl 的 cropInfo（保留已有满版裁切） */
export function resolvePhotoOutputCropInfo(
  mode: CropMode,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  existingCropInfo?: SimpleCropInfo | null,
): SimpleCropInfo | undefined {
  if (mode === 'cover' && sourceWidth && sourceHeight) {
    if (isValidCoverCropInfo(existingCropInfo)) {
      return { ...existingCropInfo!, styleType: 'cover' }
    }
    return buildDefaultCoverCropInfo(sourceWidth, sourceHeight, canvasWidth, canvasHeight)
  }
  if ((mode === 'full' || mode === 'lomo') && sourceWidth && sourceHeight) {
    return createFullImageCropInfo(
      sourceWidth,
      sourceHeight,
      mode === 'full' ? 'full' : 'lomo',
    )
  }
  return undefined
}

/** 批量开关水印后是否视为「已调整」 */
export function resolveIsAdjustedAfterOutput(
  cropInfo: SimpleCropInfo | undefined,
  outputUrl: string,
): boolean {
  if (isValidCoverCropInfo(cropInfo)) return true
  if (outputUrl.includes('watermark,text_')) return true
  return false
}

export interface BuildPhotoOutputResult {
  cropInfo: SimpleCropInfo | undefined
  outputUrl: string
}

/** 是否为整图裁剪（留白/整图或未切过的 cover） */
export function isFullImageCrop(cropInfo: SimpleCropInfo): boolean {
  if (!cropInfo.sourceWidth || !cropInfo.sourceHeight) return false
  const w = cropInfo.cropWidth ?? cropInfo.sourceWidth
  const h = cropInfo.cropHeight ?? cropInfo.sourceHeight
  return (
    cropInfo.offsetX <= 1 &&
    cropInfo.offsetY <= 1 &&
    w >= cropInfo.sourceWidth * 0.99 &&
    h >= cropInfo.sourceHeight * 0.99
  )
}

/** 生成与 ImageEditor 默认满版一致的居中 cropInfo */
export function buildDefaultCoverCropInfo(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): SimpleCropInfo {
  const cropAspectRatio = resolveCropAspectRatio(
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
  )
  const { cropWidth, cropHeight, offsetX, offsetY } = calculateCoverCropSize(
    sourceWidth,
    sourceHeight,
    cropAspectRatio,
  )
  return {
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    cropWidth: Math.round(cropWidth),
    cropHeight: Math.round(cropHeight),
    sourceWidth,
    sourceHeight,
    styleType: 'cover',
    croppedAreaPercent: {
      x: (offsetX / sourceWidth) * 100,
      y: (offsetY / sourceHeight) * 100,
      width: (cropWidth / sourceWidth) * 100,
      height: (cropHeight / sourceHeight) * 100,
    },
  }
}

/** 与 ImageEditor 一致的裁剪框宽高比（横竖图与相纸方向不一致时反转） */
export function resolveCropAspectRatio(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const paperAspectRatio = canvasWidth / canvasHeight
  if (!sourceWidth || !sourceHeight) return paperAspectRatio
  const imageRatio = sourceWidth / sourceHeight
  const isImageLandscape = imageRatio > 1
  const isPaperLandscape = paperAspectRatio > 1
  if ((isImageLandscape && !isPaperLandscape) || (!isImageLandscape && isPaperLandscape)) {
    return 1 / paperAspectRatio
  }
  return paperAspectRatio
}

/**
 * 按默认裁剪模式生成 outputUrl（逻辑对齐 ImageEditor.handleSave）
 */
export async function buildPhotoOutput(
  params: BuildPhotoOutputParams,
): Promise<BuildPhotoOutputResult> {
  const {
    originalUrl,
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    mode,
    dateWatermarkEnabled,
    existingCropInfo,
  } = params

  if (!originalUrl || originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return { cropInfo: undefined, outputUrl: originalUrl }
  }

  let watermark: { text: string } | undefined
  if (dateWatermarkEnabled) {
    const text = await fetchOssExifDate(originalUrl)
    if (text) watermark = { text }
  }

  if (mode === 'cover' && sourceWidth && sourceHeight) {
    const cropInfo = resolvePhotoOutputCropInfo(
      mode,
      sourceWidth,
      sourceHeight,
      canvasWidth,
      canvasHeight,
      existingCropInfo,
    )!
    const outputUrl = watermark
      ? buildWatermarkedOutputUrl(originalUrl, cropInfo, {
          watermark: attachCoverWatermarkSize(watermark, cropInfo),
        })
      : buildOssCropUrl(originalUrl, cropInfo, {})
    return { cropInfo, outputUrl }
  }

  if ((mode === 'full' || mode === 'lomo') && sourceWidth && sourceHeight) {
    const cropInfo = resolvePhotoOutputCropInfo(
      mode,
      sourceWidth,
      sourceHeight,
      canvasWidth,
      canvasHeight,
      existingCropInfo,
    )!
    const outputUrl = watermark
      ? buildWatermarkedOutputUrl(originalUrl, cropInfo, { watermark })
      : buildOssCropUrl(originalUrl, undefined, {})
    return { cropInfo, outputUrl }
  }

  return { cropInfo: undefined, outputUrl: originalUrl }
}

/** SimpleCropInfo → 服务端 CropInfo */
export function simpleCropInfoToServerCropInfo(
  cropInfo: SimpleCropInfo,
  canvasWidth: number,
  canvasHeight: number,
  originalUrl: string,
  isLandscape: boolean,
): CropInfo {
  return {
    canvasWidth,
    canvasHeight,
    sourceWidth: cropInfo.sourceWidth,
    sourceHeight: cropInfo.sourceHeight,
    offsetX: cropInfo.offsetX,
    offsetY: cropInfo.offsetY,
    cropWidth: cropInfo.cropWidth,
    cropHeight: cropInfo.cropHeight,
    rotateAngle: isLandscape ? 90 : 0,
    originalUrl,
    styleType: cropInfo.styleType,
    croppedAreaPercent: cropInfo.croppedAreaPercent,
  }
}
