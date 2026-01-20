import { PhotoSize } from './store'

/**
 * 相纸类型配置
 */
export interface PaperType {
  id: string
  name: string
  description?: string
  supportedSizes: string[] // 支持的尺寸ID列表
}

export const PAPER_TYPES: PaperType[] = [
  {
    id: 'fuji-glossy',
    name: '富士光面',
    description: '光泽亮丽，色彩鲜艳',
    supportedSizes: ['3inch', '4inch', '5inch', '6inch', 'large6inch', '7inch', '8inch', '10inch', 'A4']
  },
  {
    id: 'fuji-matte',
    name: '富士绒面',
    description: '柔和质感，不反光',
    supportedSizes: ['3inch', '4inch', '5inch', '6inch', 'large6inch', '7inch', '8inch', '10inch', 'A4']
  },
  {
    id: 'pantone-glossy',
    name: '泛太克光面',
    description: '专业级色彩还原',
    supportedSizes: ['5inch', '6inch', 'large6inch', '7inch', '8inch', '10inch', 'A4'] // 不支持3寸和4寸
  },
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
  { "id": "large5inch", "name": "大5寸", "width": 95, "height": 127, "ratio": 95/127 },
  { "id": "6inch", "name": "6寸", "width": 102, "height": 152, "ratio": 102/152 },
  { "id": "large6inch", "name": "大6寸", "width": 114, "height": 152, "ratio": 114/152 },
  { "id": "7inch", "name": "7寸", "width": 127, "height": 178, "ratio": 127/178 },
  { "id": "7inch-large", "name": "大7寸", "width": 127, "height": 178, "ratio": 127/178 },
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
 * 获取纸张类型支持的尺寸选项
 */
export function getSupportedSizesForPaper(paperId: string): SizeOption[] {
  const paperType = PAPER_TYPES.find(p => p.id === paperId)
  if (!paperType) return []

  return SIZE_OPTIONS.filter(size => paperType.supportedSizes.includes(size.id))
}

/**
 * 获取支持某个尺寸的纸张类型
 */
export function getPapersSupportingSize(sizeId: string): PaperType[] {
  return PAPER_TYPES.filter(paper => paper.supportedSizes.includes(sizeId))
}

/**
 * 检查纸张类型和尺寸组合是否有效
 */
export function isValidPaperSizeCombination(paperId: string, sizeId: string): boolean {
  const paperType = PAPER_TYPES.find(p => p.id === paperId)
  return paperType ? paperType.supportedSizes.includes(sizeId) : false
}

/**
 * 根据相纸类型和尺寸生成完整的 PhotoSize 配置
 */
export function createPhotoSize(paperType: PaperType, sizeOption: SizeOption): PhotoSize {
  // 先验证组合是否有效
  if (!isValidPaperSizeCombination(paperType.id, sizeOption.id)) {
    throw new Error(`纸张类型 ${paperType.name} 不支持尺寸 ${sizeOption.name}`)
  }

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
 * 获取所有有效的纸张尺寸组合
 */
export function getAllValidPhotoSizes(): PhotoSize[] {
  const validSizes: PhotoSize[] = []

  for (const paperType of PAPER_TYPES) {
    for (const sizeId of paperType.supportedSizes) {
      const sizeOption = SIZE_OPTIONS.find(s => s.id === sizeId)
      if (sizeOption) {
        validSizes.push(createPhotoSize(paperType, sizeOption))
      }
    }
  }

  return validSizes
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

  // 验证组合是否有效
  if (!isValidPaperSizeCombination(paperType.id, sizeOption.id)) return undefined

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
