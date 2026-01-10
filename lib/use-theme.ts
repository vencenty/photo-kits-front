/**
 * 主题 Hook
 * 用于在组件中使用主题配置
 */

import { useMemo } from 'react'
import { getThemeColors, THEME_MODE, type ThemeColors, type ThemeMode } from './theme-config'

export function useTheme() {
  const theme = useMemo(() => getThemeColors(), [])
  
  return {
    theme,
    mode: THEME_MODE,
    isDark: THEME_MODE === 'dark',
    isLight: THEME_MODE === 'light',
  }
}

/**
 * 获取主题样式对象（用于内联样式）
 */
export function useThemeStyles() {
  const { theme } = useTheme()
  
  return useMemo(() => ({
    background: { backgroundColor: theme.background },
    surface: { backgroundColor: theme.surface },
    header: { backgroundColor: theme.header },
    footer: { backgroundColor: theme.footer },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    textMuted: { color: theme.textMuted },
    border: { borderColor: theme.border },
    borderLight: { borderColor: theme.borderLight },
    paperBg: { backgroundColor: theme.paperBackground },
    paperBorder: { borderColor: theme.paperBorder },
  }), [theme])
}
