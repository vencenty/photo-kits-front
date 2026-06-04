/**
 * 统一错误处理工具
 * 根据服务端返回的错误码进行统一处理
 */

// 错误类型定义
export interface ApiErrorResponse {
  code: number
  msg: string
}

/** SKU 相关业务错误码（与 server/internal/ecode 保持一致） */
export const SKU_ERROR = {
  /** 暂无可用的相纸规格（相纸/尺寸/SKU 未配置或未启用） */
  CATALOG_EMPTY: 10025,
} as const

/** 订单相关业务错误码（与 server/internal/errors 保持一致） */
export const ORDER_ERROR = {
  /** 需要绑定关联订单号（11 位手机号时必填 19 位淘宝订单号） */
  NEED_BIND_RELATED_ORDER: 10008,
  /** 关联订单号格式错误（应为 19 位） */
  RELATED_ORDER_INVALID: 10009,
  /** 订单已超出可在线查看有效期 */
  ORDER_EXPIRED: 10010,
} as const

// 业务错误类
export class BusinessError extends Error {
  code: number
  msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'BusinessError'
    this.code = code
    this.msg = msg
  }
}

// 系统错误类
export class SystemError extends Error {
  code: number
  msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'SystemError'
    this.code = code
    this.msg = msg
  }
}

// 网络错误类
export class NetworkError extends Error {
  constructor(message: string = '网络异常，请检查网络连接') {
    super(message)
    this.name = 'NetworkError'
  }
}

/**
 * 错误码范围定义
 */
const ERROR_CODE_RANGES = {
  // 业务错误码范围 (10000-49999)
  BUSINESS_MIN: 10000,
  BUSINESS_MAX: 49999,
  // 系统错误码范围 (50000+)
  SYSTEM_MIN: 50000,
} as const

/**
 * 判断是否为业务错误
 */
export function isBusinessError(code: number): boolean {
  return code >= ERROR_CODE_RANGES.BUSINESS_MIN && code <= ERROR_CODE_RANGES.BUSINESS_MAX
}

/**
 * 判断是否为系统错误
 */
export function isSystemError(code: number): boolean {
  return code >= ERROR_CODE_RANGES.SYSTEM_MIN
}

/**
 * 特殊错误码处理配置
 * 某些错误码需要特殊处理（如跳转页面、特殊提示等）
 */
interface SpecialErrorHandler {
  code: number
  handler: (msg: string) => void | Promise<void>
}

// 特殊错误码处理列表（示例）
// TODO: 根据实际需求添加特殊处理逻辑
const specialErrorHandlers: SpecialErrorHandler[] = [
  {
    code: 10001, // 订单不存在
    handler: (msg: string) => {
      // 示例：订单不存在时跳转到首页
      // 注意：这里需要动态导入，避免 SSR 问题
      if (typeof window !== 'undefined') {
        // 可以在这里添加路由跳转逻辑
        // import('next/navigation').then(({ useRouter }) => {
        //   const router = useRouter()
        //   router.push('/')
        // })
        console.log('订单不存在，应该跳转到首页')
      }
    },
  },
  // 订单已锁定：目前仅做日志记录，可按需扩展
  {
    code: 10002,
    handler: (msg: string) => {
      console.log('订单已锁定，可能需要跳转到订单详情页')
    },
  },
  // 订单已超出在线查看有效期：统一跳转到过期页
  {
    code: ORDER_ERROR.ORDER_EXPIRED,
    handler: () => {
      if (typeof window !== 'undefined') {
        window.location.href = '/order-expired'
      }
    },
  },
  {
    code: 40100, // 未授权
    handler: (msg: string) => {
      // 示例：未授权时跳转到登录页
      if (typeof window !== 'undefined') {
        console.log('未授权，应该跳转到登录页')
        // router.push('/login')
      }
    },
  },
  // 可以继续添加其他需要特殊处理的错误码
]

/**
 * 处理特殊错误码
 */
export function handleSpecialError(code: number, msg: string): void {
  const handler = specialErrorHandlers.find((h) => h.code === code)
  if (handler) {
    try {
      handler.handler(msg)
    } catch (error) {
      console.error(`处理特殊错误码 ${code} 时出错:`, error)
    }
  }
}

/**
 * 上报错误到监控系统（可选）
 * TODO: 集成 Sentry 或其他监控平台
 */
export function reportErrorToMonitoring(error: ApiErrorResponse | Error, context?: Record<string, unknown>): void {
  // 只在生产环境上报
  if (process.env.NODE_ENV !== 'production') {
    console.warn('开发环境：错误上报', { error, context })
    return
  }

  // TODO: 集成 Sentry
  // import * as Sentry from '@sentry/nextjs'
  // Sentry.captureException(error, { extra: context })

  // 或者上报到其他监控平台
  console.error('生产环境错误上报:', { error, context })
}
