import { ipcClient } from '@renderer/lib/client'
import { useTheme } from 'next-themes'
import { useCallback } from 'react'

export type AppTheme = 'light' | 'dark' | 'system'
export const useAppTheme = () => {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const themePreference: AppTheme =
    theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system'
  // 首帧未解析时采用偏好中的显式值；system 暂按浅色绘制但不改变任何布局。
  const effectiveTheme = resolvedTheme ?? (themePreference === 'dark' ? 'dark' : 'light')
  const isDarkMode = effectiveTheme === 'dark'
  const toggleMode = useCallback(
    (themes: AppTheme) => {
      setTheme(themes)
      if (window.electron) {
        ipcClient?.setting.setTheme(themes)
      }
    },
    [setTheme],
  )

  return {
    toggleMode,
    theme: themePreference,
    resolvedTheme: effectiveTheme,
    isDarkMode,
  }
}
