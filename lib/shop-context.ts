/**
 * 店铺上下文：仅从 URL ?shop_id= 解析，无兜底。
 */

export const SHOP_ID_HEADER = 'X-Shop-Id'
export const SHOP_CODE_HEADER = 'X-Shop-Code'
export const SHOP_ID_QUERY_KEY = 'shop_id'

export function isValidShopId(id: string | null | undefined): id is string {
  const v = id?.trim() ?? ''
  return /^\d+$/.test(v) && v !== '0'
}

/** 从 query string 读取 shop_id（SSR 可传入 search） */
export function readShopIdFromSearch(search: string): string {
  const v = new URLSearchParams(search).get(SHOP_ID_QUERY_KEY)
  return isValidShopId(v) ? v.trim() : ''
}

export function readShopIdFromUrl(): string {
  if (typeof window === 'undefined') return ''
  return readShopIdFromSearch(window.location.search)
}

export function hasShopIdInUrl(): boolean {
  return !!readShopIdFromUrl()
}

export function getShopId(): string {
  return readShopIdFromUrl()
}

export function getShopCode(): string {
  return process.env.NEXT_PUBLIC_SHOP_CODE?.trim() ?? ''
}

/** 为路径追加/覆盖 shop_id 查询参数 */
export function withShopQuery(path: string, shopId?: string): string {
  const id = shopId ?? getShopId()
  if (!id) return path

  const qIndex = path.indexOf('?')
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path
  const search = qIndex >= 0 ? path.slice(qIndex + 1) : ''
  const params = new URLSearchParams(search)
  params.set(SHOP_ID_QUERY_KEY, id)
  return `${pathname}?${params.toString()}`
}

export function getShopHeaders(): Record<string, string> {
  const shopId = getShopId()
  const headers: Record<string, string> = {}
  if (shopId) {
    headers[SHOP_ID_HEADER] = shopId
  }
  const code = getShopCode()
  if (code) {
    headers[SHOP_CODE_HEADER] = code
  }
  return headers
}
