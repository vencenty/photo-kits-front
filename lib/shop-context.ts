/**
 * 店铺上下文：仅从 URL ?code= 解析，无兜底。
 * 请求通过 X-Shop-Code 识别店铺，服务端内部仍用 shop_id。
 */

export const SHOP_CODE_HEADER = 'X-Shop-Code'
export const SHOP_CODE_QUERY_KEY = 'code'

export function isValidShopCode(code: string | null | undefined): code is string {
  const v = code?.trim() ?? ''
  return v.length >= 3 && v.length <= 32 && /^[a-zA-Z0-9]+$/.test(v)
}

/** 从 query string 读取店铺 code（SSR 可传入 search） */
export function readShopCodeFromSearch(search: string): string {
  const v = new URLSearchParams(search).get(SHOP_CODE_QUERY_KEY)
  return isValidShopCode(v) ? v.trim() : ''
}

export function readShopCodeFromUrl(): string {
  if (typeof window === 'undefined') return ''
  return readShopCodeFromSearch(window.location.search)
}

export function hasShopCodeInUrl(): boolean {
  return !!readShopCodeFromUrl()
}

export function getShopCode(): string {
  return readShopCodeFromUrl()
}

/** 为路径追加/覆盖 code 查询参数 */
export function withShopQuery(path: string, code?: string): string {
  const shopCode = code ?? getShopCode()
  if (!shopCode) return path

  const qIndex = path.indexOf('?')
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path
  const search = qIndex >= 0 ? path.slice(qIndex + 1) : ''
  const params = new URLSearchParams(search)
  params.set(SHOP_CODE_QUERY_KEY, shopCode)
  return `${pathname}?${params.toString()}`
}

export function getShopHeaders(): Record<string, string> {
  const code = getShopCode()
  if (!code) return {}
  return { [SHOP_CODE_HEADER]: code }
}
