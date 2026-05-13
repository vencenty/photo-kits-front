import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant
  /** 全宽（常见于底部主操作） */
  block?: boolean
}

const variants: Record<AppButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.99] shadow-sm hover:shadow-md disabled:opacity-50 disabled:shadow-none',
  secondary:
    'bg-white text-primary-700 border-2 border-primary-200 hover:bg-primary-50 active:scale-[0.99] disabled:opacity-50',
  ghost: 'bg-transparent text-primary-700 hover:bg-primary-50 active:scale-[0.99] disabled:opacity-50',
}

/**
 * 主操作按钮（圆角胶囊 + 品牌蓝），与全局主题一致。
 */
export function AppButton({
  className,
  variant = 'primary',
  block,
  type = 'button',
  ...rest
}: AppButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 px-5 py-3 text-sm md:text-base',
        variants[variant],
        block && 'w-full',
        className
      )}
      {...rest}
    />
  )
}
