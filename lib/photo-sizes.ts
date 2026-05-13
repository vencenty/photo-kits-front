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

/**
 * 裁剪模式类型
 */
export type CropModeType = 'cover' | 'full' | 'lomo'

/**
 * 裁剪样式配置
 */
export interface CropStyleConfig {
  defaultMode: CropModeType        // 默认裁剪模式
  availableModes: CropModeType[]  // 可选的裁剪模式列表
}

/**
 * 照片尺寸配置
 */
export interface SizeOption {
  id: string
  name: string
  width: number  // mm
  height: number // mm
  ratio: number
  cropConfig?: CropStyleConfig  // 可选：裁剪样式配置，不配置则使用默认（所有模式可选，默认lomo）
}

// ============================================================================
// 本地兜底数据（远端 SKU 接口不可用时使用，与 admin 后台数据保持一致）
// 仅在远端 /v1/sku/list 加载失败 / 慢响应时回退到这份默认配置。
// ============================================================================

const FALLBACK_PAPER_TYPES: PaperType[] = [
  {
    id: 'fuji-glossy',
    name: '富士光面',
    description: '光泽亮丽，色彩鲜艳',
    supportedSizes: ['5inch', 'large5inch', 'square5inch', '6inch', 'square6inch', 'large6inch', '7inch', '8inch', 'A4'],
  },
  {
    id: 'fuji-matte',
    name: '富士绒面',
    description: '柔和质感，不反光',
    supportedSizes: ['5inch', 'large5inch', 'square5inch', '6inch', 'square6inch', 'large6inch', '7inch', '8inch', 'A4'],
  },
  {
    id: 'pantone-glossy',
    name: '泛太克光面',
    description: '专业级色彩还原',
    supportedSizes: ['3inch', '4inch', '5inch', 'square5inch', '6inch', '7inch', '8inch', '10inch'],
  },
]

const FALLBACK_SIZE_OPTIONS: SizeOption[] = [
  { id: '3inch',        name: '3寸',       width: 63.5, height: 89,  ratio: 63.5 / 89 },
  { id: '4inch',        name: '4寸',       width: 76,   height: 102, ratio: 76 / 102 },
  { id: '5inch',        name: '5寸',       width: 89,   height: 127, ratio: 89 / 127 },
  { id: 'large5inch',   name: '大5寸',     width: 95,   height: 127, ratio: 95 / 127 },
  { id: 'square5inch',  name: '5寸正方形', width: 127,  height: 127, ratio: 1 },
  { id: '6inch',        name: '6寸',       width: 102,  height: 152, ratio: 102 / 152 },
  { id: 'square6inch',  name: '6寸正方形', width: 152,  height: 152, ratio: 1 },
  { id: 'large6inch',   name: '大6寸',     width: 114,  height: 152, ratio: 114 / 152 },
  { id: '7inch',        name: '7寸',       width: 127,  height: 178, ratio: 127 / 178 },
  { id: '8inch',        name: '8寸',       width: 152,  height: 203, ratio: 152 / 203 },
  { id: '10inch',       name: '10寸',      width: 203,  height: 254, ratio: 203 / 254 },
  { id: 'A4',           name: 'A4',        width: 210,  height: 297, ratio: 210 / 297 },
]

/**
 * 默认裁剪配置（仅在 SKU 表中没有指定时回退使用）
 * - 默认模式：四周留白（lomo）
 * - 可用模式：留白 + 满版 + 整图打印
 */
const DEFAULT_CROP_CONFIG: CropStyleConfig = {
  defaultMode: 'lomo',
  availableModes: ['cover', 'lomo', 'full'],
}

// ============================================================================
// 模块级"可变"数据源
//
// ES Module 的 named export 是 live binding：消费方 `import { PAPER_TYPES }`
// 后，每次访问拿到的都是当前最新值。所以我们用 `let` 持有数据，
// `preloadSkus()` 在启动时从远端拉取并覆盖。
// ============================================================================

export let PAPER_TYPES: PaperType[] = FALLBACK_PAPER_TYPES
export let SIZE_OPTIONS: SizeOption[] = FALLBACK_SIZE_OPTIONS

// fullSizeId('paperId-sizeId') -> CropStyleConfig
let CROP_CONFIG_MAP: Record<string, CropStyleConfig> = {}

// 单飞 promise，避免并发多次拉取
let _loadingPromise: Promise<void> | null = null
let _loaded = false

/**
 * 标识 SKU 数据是否已经从远端加载成功（用于调试/可选 UI 提示）。
 */
export function isSkusLoaded(): boolean {
  return _loaded
}

/**
 * 从远端预加载 SKU 数据并覆盖本地常量。
 * - 启动时由 layout 调用一次
 * - 多次调用安全（共享同一个 promise）
 * - 任何错误都 swallow 掉（保留本地兜底）
 */
export async function preloadSkus(): Promise<void> {
  if (_loaded) return
  if (_loadingPromise) return _loadingPromise

  // 动态 import 避免 photo-sizes <-> api 互相 import 的循环依赖风险
  _loadingPromise = (async () => {
    try {
      const { getSkuList } = await import('./api')
      const data = await getSkuList()
      applySkuData(data)
      _loaded = true
    } catch (err) {
      // 静默：保留兜底常量
      // eslint-disable-next-line no-console
      console.warn('[photo-sizes] preloadSkus failed, fallback used:', err)
    } finally {
      _loadingPromise = null
    }
  })()

  return _loadingPromise
}

/**
 * 远端返回结构（与 server `PublicSkuListResponse` 对应）
 */
export interface SkuListResponse {
  paperTypes: Array<{
    paperId: string
    name: string
    description?: string
    supportedSizes: string[] | null
    sortOrder: number
  }>
  sizes: Array<{
    sizeId: string
    name: string
    width: number
    height: number
    aspectRatio: number
    sortOrder: number
  }>
  skus: Array<{
    id: number
    paperId: string
    paperName: string
    paperDescription?: string
    sizeId: string
    sizeName: string
    width: number
    height: number
    aspectRatio: number
    cropDefaultMode: CropModeType
    cropAvailableModes: CropModeType[]
    unitPrice: number
    sortOrder: number
  }>
}

/**
 * 用远端数据覆盖本地常量
 * - 只在收到非空数据时覆盖，避免空响应清空数据
 */
function applySkuData(data: SkuListResponse) {
  if (!data) return

  if (Array.isArray(data.paperTypes) && data.paperTypes.length > 0) {
    PAPER_TYPES = data.paperTypes
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        id: p.paperId,
        name: p.name,
        description: p.description || '',
        supportedSizes: Array.isArray(p.supportedSizes) ? p.supportedSizes : [],
      }))
  }

  if (Array.isArray(data.sizes) && data.sizes.length > 0) {
    SIZE_OPTIONS = data.sizes
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        id: s.sizeId,
        name: s.name,
        width: s.width,
        height: s.height,
        ratio: s.aspectRatio,
      }))
  }

  // 裁剪配置 map（key 用完整 sizeId：paperId-sizeId）
  const nextCropMap: Record<string, CropStyleConfig> = {}
  if (Array.isArray(data.skus)) {
    for (const sku of data.skus) {
      const key = generateSizeId(sku.paperId, sku.sizeId)
      const available = Array.isArray(sku.cropAvailableModes) && sku.cropAvailableModes.length > 0
        ? sku.cropAvailableModes
        : DEFAULT_CROP_CONFIG.availableModes
      const defaultMode = sku.cropDefaultMode && available.includes(sku.cropDefaultMode)
        ? sku.cropDefaultMode
        : (available[0] || DEFAULT_CROP_CONFIG.defaultMode)
      nextCropMap[key] = {
        defaultMode,
        availableModes: available,
      }
    }
  }
  CROP_CONFIG_MAP = nextCropMap
}

// ============================================================================
// 工具方法（对外接口保持不变）
// ============================================================================

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
  const paperType = PAPER_TYPES.find((p) => p.id === paperId)
  if (!paperType) return []
  return SIZE_OPTIONS.filter((size) => paperType.supportedSizes.includes(size.id))
}

/**
 * 获取支持某个尺寸的纸张类型
 */
export function getPapersSupportingSize(sizeId: string): PaperType[] {
  return PAPER_TYPES.filter((paper) => paper.supportedSizes.includes(sizeId))
}

/**
 * 检查纸张类型和尺寸组合是否有效
 */
export function isValidPaperSizeCombination(paperId: string, sizeId: string): boolean {
  const paperType = PAPER_TYPES.find((p) => p.id === paperId)
  return paperType ? paperType.supportedSizes.includes(sizeId) : false
}

/**
 * 根据相纸类型和尺寸生成完整的 PhotoSize 配置
 */
export function createPhotoSize(paperType: PaperType, sizeOption: SizeOption): PhotoSize {
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
      const sizeOption = SIZE_OPTIONS.find((s) => s.id === sizeId)
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
  const paperType = PAPER_TYPES.find((p) => p.id === parsed.paperId)
  const sizeOption = SIZE_OPTIONS.find((s) => s.id === parsed.sizeId)
  if (!paperType || !sizeOption) return undefined
  if (!isValidPaperSizeCombination(paperType.id, sizeOption.id)) return undefined
  return createPhotoSize(paperType, sizeOption)
}

/**
 * 获取尺寸的裁剪配置
 * @param fullSizeId 完整的尺寸ID（如：fuji-glossy-5inch）
 * @returns 裁剪配置：优先 SKU 表 → 兜底默认配置
 */
export function getCropConfigForSize(fullSizeId: string): CropStyleConfig {
  if (!fullSizeId) return DEFAULT_CROP_CONFIG
  return CROP_CONFIG_MAP[fullSizeId] || DEFAULT_CROP_CONFIG
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
    ratio: 127 / 89,
    icon: '📸',
    description: '127×89mm',
    recommended: true,
  },
]
