import { tipcClient } from '@renderer/lib/client'
import { useTheme } from 'next-themes'
import { useCallback } from 'react'

export type AppTheme = 'cmyk' | 'dark' | 'system'
export const useAppTheme = () => {
  const { setTheme, theme } = useTheme()
  const isDarkMode = theme === 'dark'
  const toggleMode = useCallback(
    (themes: AppTheme) => {
      setTheme(themes)
      if (window.electron) {
        tipcClient?.setTheme(themes)
      }
    },
    [setTheme],
  )

  return { toggleMode, theme, isDarkMode }
}
