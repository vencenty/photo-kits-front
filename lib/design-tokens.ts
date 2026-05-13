/**
 * 设计令牌（与 tailwind.config 中 `primary`、`app` 保持一致）
 * 用于内联 style、Canvas、第三方组件等无法使用 Tailwind class 的场景。
 *
 * 新页面建议：
 * - 页面底：`min-h-screen bg-app`
 * - 主按钮：`bg-primary-600 hover:bg-primary-700 text-white rounded-full`
 * - 卡片：`rounded-2xl bg-white border border-slate-100/90 shadow-sm`，或直接用 `<PageCard>`
 */
export const designTokens = {
  appBg: '#f0f7ff',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: '#eff6ff',
  surface: '#ffffff',
  borderSubtle: 'rgba(15, 23, 42, 0.08)',
} as const
