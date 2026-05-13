import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface PageCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否使用更明显的阴影 */
  elevated?: boolean
}

/**
 * 通用内容卡片（圆角 + 白底 + 轻边框），与「上传最佳实践」类信息图风格一致。
 */
export function PageCard({ className, elevated, children, ...rest }: PageCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white border border-slate-100/90 shadow-sm',
        elevated && 'shadow-md',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
