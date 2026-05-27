/**
 * 当前活跃订单（用户 init 后写入，多标签页共享）
 */
import { normalizeOrderOrPhoneInput } from './utils'

export const ACTIVE_ORDER_NO_KEY = 'active-order-no'
export const ORDER_NO_HEADER = 'X-Order-No'

/** 不需要注入订单上下文的 API 路径前缀 */
export const ORDER_CONTEXT_SKIP_PREFIXES = [
  '/v1/order/init',
  '/v1/oss/',
  '/v1/sku/',
  '/api/admin/',
] as const

export function setActiveOrderNo(orderNo: string): void {
  const normalized = normalizeOrderOrPhoneInput(orderNo)
  if (!normalized || typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_ORDER_NO_KEY, normalized)
}

export function getActiveOrderNo(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(ACTIVE_ORDER_NO_KEY) ?? ''
}

export function clearActiveOrderNo(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTIVE_ORDER_NO_KEY)
}
