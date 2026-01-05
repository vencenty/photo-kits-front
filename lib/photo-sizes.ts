import { PhotoSize } from './store'

/**
 * 相纸类型配置
 */
export interface PaperType {
  id: string
  name: string
  description?: string
}

export const PAPER_TYPES: PaperType[] = [
  { id: 'fuji-glossy', name: '富士光面', description: '光泽亮丽，色彩鲜艳' },
  { id: 'fuji-matte', name: '富士绒面', description: '柔和质感，不反光' },
  { id: 'pantone-glossy', name: '泛太克光面', description: '专业级色彩还原' },
]

/**
 * 照片尺寸配置
 */
export interface SizeOption {
  id: string
  name: string
  width: number  // mm
  height: number // mm
  ratio: number
}

export const SIZE_OPTIONS: SizeOption[] = [
  { "id": "3inch", "name": "3寸", "width": 63.5, "height": 89, "ratio": 63.5/89 },
  { "id": "4inch", "name": "4寸", "width": 76, "height": 102, "ratio": 76/102 },
  { "id": "5inch", "name": "5寸", "width": 89, "height": 127, "ratio": 89/127 },
  { "id": "6inch", "name": "6寸", "width": 102, "height": 152, "ratio": 102/152 },
  { "id": "7inch", "name": "7寸", "width": 127, "height": 178, "ratio": 127/178 },
  { "id": "8inch", "name": "8寸", "width": 152, "height": 203, "ratio": 152/203 },
  { "id": "10inch", "name": "10寸", "width": 203, "height": 254, "ratio": 203/254 },
  { "id": "A4", "name": "A4", "width": 210, "height": 297, "ratio": 210/297 }
]


/**
 * 生成完整的照片规格 ID
 */
export function generateSizeId(paperId: string, sizeId: string): string {
  return `${paperId}-${sizeId}`
}

/**
 * 解析照片规格 ID
 */
export function parseSizeId(fullId: string): { paperId: string; sizeId: string } | null {
  const parts = fullId.split('-')
  if (parts.length < 2) return null
  
  // 格式: fuji-glossy-5inch
  const sizeId = parts[parts.length - 1]
  const paperId = parts.slice(0, -1).join('-')
  
  return { paperId, sizeId }
}

/**
 * 根据相纸类型和尺寸生成完整的 PhotoSize 配置
 */
export function createPhotoSize(paperType: PaperType, sizeOption: SizeOption): PhotoSize {
  const id = generateSizeId(paperType.id, sizeOption.id)
  return {
    id,
    name: `${paperType.name} ${sizeOption.name}`,
    width: sizeOption.width,
    height: sizeOption.height,
    unit: '毫米',
    ratio: sizeOption.ratio,
    description: `${sizeOption.width}×${sizeOption.height}mm`,
  }
}

/**
 * 根据 ID 获取完整的照片规格配置
 */
export function getPhotoSizeById(id: string): PhotoSize | undefined {
  const parsed = parseSizeId(id)
  if (!parsed) return undefined
  
  const paperType = PAPER_TYPES.find(p => p.id === parsed.paperId)
  const sizeOption = SIZE_OPTIONS.find(s => s.id === parsed.sizeId)
  
  if (!paperType || !sizeOption) return undefined
  
  return createPhotoSize(paperType, sizeOption)
}

/**
 * 旧的 PHOTO_SIZES 兼容（保留用于向后兼容）
 */
export const PHOTO_SIZES: PhotoSize[] = [
  {
    id: 'fuji-glossy-5inch',
    name: '富士光面 5寸',
    width: 127,
    height: 89,
    unit: '毫米',
    ratio: 127/89,
    icon: '📸',
    description: '127×89mm',
    recommended: true,
  },
]
