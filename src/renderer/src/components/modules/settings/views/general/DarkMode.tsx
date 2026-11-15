import type { AppTheme } from '@renderer/hooks/theme'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useAppTheme } from '@renderer/hooks/theme'
import { useTranslation } from 'react-i18next'

export const DarkModeToggle = () => {
  const { toggleMode, theme } = useAppTheme()
  const { t } = useTranslation('settings')
  return (
    <div className="text-center">
      <Tabs
        className="w-full"
        value={theme}
        onValueChange={(value: string) => toggleMode(value as AppTheme)}
        aria-label={t('general.appearance.theme.ariaLabel')}
      >
        <TabsList className="bg-muted h-8">
          {themes.map((item) => (
            <TabsTrigger
              className="flex items-center space-x-0.5 rounded-sm py-0.5 text-sm"
              key={item.value}
              value={item.value}
            >
              <i className={item.icon} aria-hidden="true" />
              <span>{t(`general.appearance.theme.options.${item.value}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

// 模块顶层的常量不存文字：名称在渲染时按 value 取对应文案，语言切换后才会更新
const themes = [
  { value: 'system', icon: 'icon-[mingcute--monitor-line]' },
  { value: 'light', icon: 'icon-[mingcute--sun-line]' },
  { value: 'dark', icon: 'icon-[mingcute--moon-line]' },
] as const
