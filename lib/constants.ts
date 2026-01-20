/**
 * 订单状态常量
 * 与后端保持一致：server/internal/logic/common.go
 */
export const ORDER_STATUS = {
  /** 草稿/编辑中 */
  DRAFT: 0,
  /** 已锁定/已提交/生产中 */
  LOCKED: 1,
  /** 已完成 */
  COMPLETED: 2,
} as const

/**
 * 检查订单是否已锁定
 * @param status 订单状态
 * @returns true 表示订单已锁定，不允许修改
 */
export function isOrderLocked(status: number): boolean {
  return status >= ORDER_STATUS.LOCKED
}
