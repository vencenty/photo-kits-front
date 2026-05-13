'use client'

import { useEffect, useState } from 'react'
import { preloadSkus } from '@/lib/photo-sizes'

/**
 * SKU 预加载器
 *
 * 作用：在应用启动时从远端拉取一次 SKU 配置（相纸/尺寸/裁剪模式），
 * 让 PAPER_TYPES / SIZE_OPTIONS / getCropConfigForSize 拿到最新数据。
 *
 * 工作方式：
 *  - 客户端挂载时触发 preloadSkus()
 *  - 在数据 ready 之前**短暂阻塞** children 渲染，保证 select-size / upload 等
 *    页面在 mount 时就能拿到正确的 SKU 数据
 *  - 设有 800ms 兜底超时：如果远端慢或失败，自动放行并使用本地兜底常量
 *  - 服务端渲染（SSR）阶段直接渲染 children，不阻塞 HTML 输出
 */
const TIMEOUT_MS = 800

export function SkuPreloader({ children }: { children: React.ReactNode }) {
  // 服务端默认 true（不阻塞 SSR HTML），客户端首屏初始 false（阻塞至 preload 完成 / 超时）
  const [ready, setReady] = useState<boolean>(typeof window === 'undefined')

  useEffect(() => {
    let cancelled = false

    const timer = setTimeout(() => {
      if (!cancelled) setReady(true)
    }, TIMEOUT_MS)

    preloadSkus()
      .catch(() => {
        // preloadSkus 内部已 swallow，留个保险
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timer)
          setReady(true)
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // 阻塞期间渲染一个空白占位（避免页面闪烁），最长 800ms
  if (!ready) {
    return null
  }

  return <>{children}</>
}
