/**
 * 店铺上下文：URL ?shop_id= > localStorage > 环境变量
 */

export const SHOP_ID_HEADER = 'X-Shop-Id'
export const SHOP_CODE_HEADER = 'X-Shop-Code'
export const SHOP_ID_QUERY_KEY = 'shop_id'
export const ACTIVE_SHOP_ID_KEY = 'active-shop-id'

const DEFAULT_SHOP_ID = '1'

export function setActiveShopId(shopId: string): void {
  const id = shopId.trim()
  if (!id || !/^\d+$/.test(id) || id === '0' || typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_SHOP_ID_KEY, id)
}

function readShopIdFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const v = new URLSearchParams(window.location.search).get(SHOP_ID_QUERY_KEY)
  const id = v?.trim() ?? ''
  if (id && /^\d+$/.test(id) && id !== '0') return id
  return ''
}

/** 从 URL 参数初始化（也可在 ShopUrlSync 中调用） */
export function initShopFromQuery(shopId: string | null | undefined): void {
  if (shopId && /^\d+$/.test(shopId.trim()) && shopId.trim() !== '0') {
    setActiveShopId(shopId.trim())
  }
}

export function getShopId(): string {
  const fromUrl = readShopIdFromUrl()
  if (fromUrl) {
    setActiveShopId(fromUrl)
    return fromUrl
  }

  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(ACTIVE_SHOP_ID_KEY)
    if (stored && /^\d+$/.test(stored) && stored !== '0') {
      return stored
    }
  }

  const fromEnv = process.env.NEXT_PUBLIC_SHOP_ID?.trim()
  if (fromEnv && /^\d+$/.test(fromEnv) && fromEnv !== '0') {
    return fromEnv
  }
  return DEFAULT_SHOP_ID
}

export function getShopCode(): string {
  return process.env.NEXT_PUBLIC_SHOP_CODE?.trim() ?? ''
}

export function getShopHeaders(): Record<string, string> {
  const shopId = getShopId()
  const headers: Record<string, string> = {
    [SHOP_ID_HEADER]: shopId,
  }
  const code = getShopCode()
  if (code) {
    headers[SHOP_CODE_HEADER] = code
  }
  return headers
}
