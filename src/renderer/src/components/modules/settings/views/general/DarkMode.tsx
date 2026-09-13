import type { AppTheme } from '@renderer/hooks/theme'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useAppTheme } from '@renderer/hooks/theme'

export const DarkModeToggle = () => {
  const { toggleMode, theme } = useAppTheme()
  return (
    <div className="text-center">
      <Tabs
        className="w-full"
        value={theme}
        onValueChange={(value: string) => toggleMode(value as AppTheme)}
        aria-label="主题偏好"
      >
        <TabsList className="bg-muted h-8">
          {themes.map((item) => (
            <TabsTrigger
              className="flex items-center space-x-0.5 rounded-sm py-0.5 text-sm"
              key={item.value}
              value={item.value}
            >
              <i className={item.icon} aria-hidden="true" />
              <span>{item.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

const themes = [
  {
    name: '系统',
    value: 'system',
    icon: 'icon-[mingcute--monitor-line]',
  },
  {
    name: '白天',
    value: 'light',
    icon: 'icon-[mingcute--sun-line]',
  },
  {
    name: '夜间',
    value: 'dark',
    icon: 'icon-[mingcute--moon-line]',
  },
]
