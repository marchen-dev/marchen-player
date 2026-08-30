import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import { Button } from '@renderer/components/ui/button'
import { useCurrentModal } from '@renderer/components/ui/modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import { captureStablePageView } from '@renderer/services/telemetry/navigation'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

import { setCurrentSetting, useCurrentSetting } from './provider'
import { settingTabs } from './tabs'

export const SettingModal = () => {
  const currentSection = useCurrentSetting()
  const { dismiss } = useCurrentModal()
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  const returnRouteRef = useRef(location.pathname === '/library' ? '/library' : '/player')

  useEffect(() => {
    captureStablePageView(`/settings/${currentSection}`)
  }, [currentSection])

  useEffect(
    () => () => {
      captureStablePageView(returnRouteRef.current)
    },
    [],
  )

  const handleSectionChange = (value: string) => {
    setCurrentSetting(value as AppSettingsSection)
    requestAnimationFrame(() => {
      const viewport = contentRef.current?.querySelector<HTMLElement>(
        '[data-radix-scroll-area-viewport]',
      )
      viewport?.scrollTo({ top: 0 })
    })
  }

  return (
    <Tabs
      value={currentSection}
      onValueChange={handleSectionChange}
      orientation="vertical"
      className="app-settings-layout"
    >
      <aside className="app-settings-navigation" aria-label="设置分类">
        <div className="app-settings-brand">
          <i className="icon-[mingcute--settings-7-line]" aria-hidden="true" />
          <span>设置</span>
        </div>
        <TabsList className="app-settings-tabs" aria-label="设置分类">
          {settingTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="app-settings-tab"
              aria-label={tab.label}
            >
              <i className={cn(tab.icon, 'text-lg')} aria-hidden="true" />
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </aside>

      <div ref={contentRef} className="app-settings-content">
        {settingTabs.map(({ id, component: CurrentView }) => (
          <TabsContent key={id} value={id} className="app-settings-tab-content">
            <CurrentView />
          </TabsContent>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="app-settings-close"
        aria-label="关闭设置"
        onClick={dismiss}
      >
        <i className="icon-[mingcute--close-line] text-xl" aria-hidden="true" />
      </Button>
    </Tabs>
  )
}
