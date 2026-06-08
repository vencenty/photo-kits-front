import { BusinessError } from './error-handler'
import type { CropMode } from './types'
import type { PublicSkuItem, PublicSkuListResponse } from './api'

export type { PublicSkuItem, PublicSkuListResponse }

const DEFAULT_CROP_MODES: CropMode[] = ['cover', 'lomo', 'full']

export interface SkuCropConfig {
  defaultMode: CropMode
  availableModes: CropMode[]
}

let catalog: PublicSkuListResponse | null = null
let loading: Promise<PublicSkuListResponse> | null = null

export function getCatalog(): PublicSkuListResponse | null {
  return catalog
}

export function isCatalogLoaded(): boolean {
  return catalog !== null
}

/** paperTypeId|photoSizeId */
export function skuKey(paperTypeId: number, photoSizeId: number): string {
  return `${paperTypeId}|${photoSizeId}`
}

export function getSkuById(skuId: number): PublicSkuItem | undefined {
  return catalog?.skus.find((s) => s.id === skuId)
}

export function getSkuByPaperAndSize(
  paperTypeId: number,
  photoSizeId: number,
): PublicSkuItem | undefined {
  return catalog?.skus.find(
    (s) => s.paperTypeId === paperTypeId && s.photoSizeId === photoSizeId,
  )
}

export function getCropConfigForSku(skuId: number): SkuCropConfig {
  const sku = getSkuById(skuId)
  if (!sku) {
    return { defaultMode: 'lomo', availableModes: DEFAULT_CROP_MODES }
  }
  const available = (sku.cropAvailableModes?.length
    ? sku.cropAvailableModes
    : DEFAULT_CROP_MODES) as CropMode[]
  const defaultMode = available.includes(sku.cropDefaultMode as CropMode)
    ? (sku.cropDefaultMode as CropMode)
    : available[0] ?? 'lomo'
  return { defaultMode, availableModes: available }
}

/**
 * 启动时预加载店铺 SKU 目录（layout 调用一次，页面可 await 复用同一 promise）
 */
export async function preloadCatalog(): Promise<PublicSkuListResponse> {
  if (catalog) return catalog
  if (loading) return loading

  loading = (async () => {
    try {
      const { getPublicSkuList } = await import('./api')
      catalog = await getPublicSkuList()
      return catalog
    } catch (err) {
      if (err instanceof BusinessError) {
        catalog = null
      }
      throw err
    } finally {
      loading = null
    }
  })()

  return loading
}

export function clearCatalogCache(): void {
  catalog = null
  loading = null
}
