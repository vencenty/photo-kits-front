/**
 * 特殊错误码处理示例
 * 
 * 这个文件展示了如何为特定错误码添加特殊处理逻辑
 * 实际使用时，请将相关代码添加到 lib/error-handler.ts 的 specialErrorHandlers 数组中
 */

import { useRouter } from 'next/navigation'

/**
 * 示例 1: 订单不存在时跳转到首页
 */
export const handleOrderNotFound = (msg: string) => {
  if (typeof window !== 'undefined') {
    // 方式 1: 使用 Next.js App Router
    // import { useRouter } from 'next/navigation'
    // const router = useRouter()
    // router.push('/')
    
    // 方式 2: 直接使用 window.location
    // window.location.href = '/'
    
    // 方式 3: 使用 Next.js Pages Router
    // import { useRouter } from 'next/router'
    // const router = useRouter()
    // router.push('/')
    
    console.log('订单不存在，跳转到首页')
  }
}

/**
 * 示例 2: 订单已锁定时的处理
 */
export const handleOrderLocked = (msg: string) => {
  if (typeof window !== 'undefined') {
    // 可以跳转到订单详情页，或者显示一个模态框
    // router.push(`/order/${orderSn}`)
    console.log('订单已锁定，跳转到订单详情页')
  }
}

/**
 * 示例 3: 未授权时跳转到登录页
 */
export const handleUnauthorized = (msg: string) => {
  if (typeof window !== 'undefined') {
    // 清除本地存储的 token
    // localStorage.removeItem('token')
    // sessionStorage.clear()
    
    // 跳转到登录页
    // window.location.href = '/login'
    console.log('未授权，跳转到登录页')
  }
}

/**
 * 示例 4: 需要显示确认对话框的错误
 */
export const handleNeedConfirm = async (msg: string) => {
  if (typeof window !== 'undefined') {
    // 显示确认对话框
    const confirmed = window.confirm(`${msg}\n\n是否继续操作？`)
    if (!confirmed) {
      // 用户取消操作
      return
    }
    // 继续执行后续逻辑
  }
}

/**
 * 示例 5: 需要记录日志的特殊错误
 */
export const handleSpecialErrorWithLog = (msg: string) => {
  // 记录到本地存储（用于调试）
  if (typeof window !== 'undefined') {
    const errorLog = {
      code: 10001,
      msg,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    }
    
    // 保存到 localStorage（最多保存最近 10 条）
    try {
      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]')
      logs.unshift(errorLog)
      logs.splice(10) // 只保留最近 10 条
      localStorage.setItem('error_logs', JSON.stringify(logs))
    } catch (e) {
      console.error('保存错误日志失败:', e)
    }
  }
}

/**
 * 示例 6: 需要调用其他 API 的错误处理
 */
export const handleErrorWithApiCall = async (msg: string) => {
  // 例如：订单不存在时，可能需要调用接口记录用户行为
  try {
    // await fetch('/api/track-event', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     event: 'order_not_found',
    //     message: msg,
    //   }),
    // })
    console.log('记录用户行为:', msg)
  } catch (error) {
    console.error('记录用户行为失败:', error)
  }
}

/**
 * 使用示例：在 lib/error-handler.ts 中这样配置
 * 
 * const specialErrorHandlers: SpecialErrorHandler[] = [
 *   {
 *     code: 10001, // 订单不存在
 *     handler: handleOrderNotFound,
 *   },
 *   {
 *     code: 10002, // 订单已锁定
 *     handler: handleOrderLocked,
 *   },
 *   {
 *     code: 40100, // 未授权
 *     handler: handleUnauthorized,
 *   },
 *   // ... 其他错误码
 * ]
 */
