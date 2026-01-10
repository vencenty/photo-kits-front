/**
 * 主题配置
 * 支持亮色和暗色主题，可以一键切换
 */

export type ThemeMode = 'light' | 'dark'

export interface ThemeColors {
  // 背景色
  background: string
  surface: string // 卡片、面板背景
  header: string // Header 背景
  footer: string // Footer 背景
  
  // 文字颜色
  text: string
  textSecondary: string
  textMuted: string
  
  // 边框颜色
  border: string
  borderLight: string
  
  // 交互元素
  primary: string
  primaryHover: string
  secondary: string
  
  // 状态颜色
  success: string
  warning: string
  error: string
  info: string
  
  // 特殊用途
  paperBackground: string // 相纸背景（白色）
  paperBorder: string // 相纸边框
}

export const themes: Record<ThemeMode, ThemeColors> = {
  light: {
    background: '#f5f5f5',
    surface: '#ffffff',
    header: '#ffffff',
    footer: '#ffffff',
    text: '#1f2937',
    textSecondary: '#4b5563',
    textMuted: '#9ca3af',
    border: '#e5e7eb',
    borderLight: '#f3f4f6',
    primary: '#ff4d6d',
    primaryHover: '#ff6b9d',
    secondary: '#6b7280',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    paperBackground: '#ffffff',
    paperBorder: '#d1d5db',
  },
  dark: {
    background: '#1a1a1a',
    surface: '#2d2d2d',
    header: '#2d2d2d',
    footer: '#2d2d2d',
    text: '#f9fafb',
    textSecondary: '#d1d5db',
    textMuted: '#9ca3af',
    border: '#404040',
    borderLight: '#333333',
    primary: '#ff4d6d',
    primaryHover: '#ff6b9d',
    secondary: '#9ca3af',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    paperBackground: '#ffffff', // 相纸始终是白色
    paperBorder: '#666666', // 深色主题下相纸边框更明显
  },
}

/**
 * 当前主题模式
 * 可以通过修改这个值来切换主题
 */
export const THEME_MODE: ThemeMode = 'dark' // 改为 'light' 使用亮色主题

/**
 * 获取当前主题颜色
 */
export function getThemeColors(): ThemeColors {
  return themes[THEME_MODE]
}

/**
 * 获取主题类名（用于 Tailwind CSS）
 */
export function getThemeClasses() {
  const theme = getThemeColors()
  
  return {
    // 背景
    bg: `bg-[${theme.background}]`,
    bgSurface: `bg-[${theme.surface}]`,
    bgHeader: `bg-[${theme.header}]`,
    bgFooter: `bg-[${theme.footer}]`,
    
    // 文字
    text: `text-[${theme.text}]`,
    textSecondary: `text-[${theme.textSecondary}]`,
    textMuted: `text-[${theme.textMuted}]`,
    
    // 边框
    border: `border-[${theme.border}]`,
    borderLight: `border-[${theme.borderLight}]`,
    
    // 相纸
    paperBg: `bg-[${theme.paperBackground}]`,
    paperBorder: `border-[${theme.paperBorder}]`,
  }
}
