import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import type { AppTheme } from '@renderer/hooks/theme'
import { useAppTheme } from '@renderer/hooks/theme'

export const DarkModeToggle = () => {
  const { toggleMode, theme } = useAppTheme()
  return (
    <div className="text-center">
      <Tabs
        className="w-full "
        defaultValue={theme}
        onValueChange={(value: string) => toggleMode(value as AppTheme)}
      >
        <TabsList className="h-8 bg-base-200">
          {themes.map((item) => (
            <TabsTrigger
              className="flex items-center space-x-0.5 rounded-sm py-0.5 text-sm"
              key={item.value}
              value={item.value}
            >
              {item.icon}
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
    icon: <i className="icon-[mingcute--monitor-line]" />,
  },
  {
    name: '白天',
    value: 'cmyk',
    icon: <i className="icon-[mingcute--sun-line]" />,
  },
  {
    name: '夜间',
    value: 'dark',
    icon: <i className="icon-[mingcute--moon-line]" />,
  },
]
