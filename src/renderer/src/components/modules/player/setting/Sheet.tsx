import type { DB_History } from '@renderer/database/schemas/history'
import { playerSettingSectionAtom, playerSettingSheetAtom, videoAtom } from '@renderer/atoms/player'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@renderer/components/ui/accordion'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@renderer/components/ui/sheet'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useQuery } from '@tanstack/react-query'
import { useAtom, useAtomValue } from 'jotai'
import { createContext, lazy, use, useEffect } from 'react'

import { MatchDanmakuDialog } from '../../shared/MatchDanmakuDialog'
import { Danmaku } from './items/damaku/Danmaku'
import { Subtitle } from './items/subtitle/Subtitle'

export const SettingSheet = () => {
  const [show, setShow] = useAtom(playerSettingSheetAtom)
  const selectedSection = useAtomValue(playerSettingSectionAtom)
  const portalContainer = usePlayerPortalContainer()
  return (
    <>
      <Sheet
        open={show}
        onOpenChange={(open) => {
          setShow(open)
        }}
      >
        <SheetContent
          data-player-setting-sheet
          container={portalContainer}
          classNames={{ sheetOverlay: 'bg-black/35 backdrop-blur-[2px]' }}
          className="border-white/10 bg-[var(--player-surface-solid)] p-0 text-[var(--player-fg)] sm:max-w-md"
          aria-describedby="播放器设置"
        >
          <ScrollArea className="h-full p-5">
            <SheetHeader>
              <SheetTitle className="text-[var(--player-fg)]">设置</SheetTitle>
              <SettingProvider>
                <Accordion
                  key={`${selectedSection}-${show}`}
                  type="multiple"
                  className="w-full"
                  defaultValue={[selectedSection]}
                >
                  {settingSheetList.map((item) => (
                    <AccordionItem key={item.value} value={item.value}>
                      <AccordionTrigger className="font-semibold">{item.title}</AccordionTrigger>
                      <AccordionContent className="px-1 pt-1">
                        <item.component />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </SettingProvider>
            </SheetHeader>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <MatchDanmakuDialog />
    </>
  )
}

const settingSheetList = [
  {
    title: '播放列表',
    value: 'playList',
    component: lazy(() => import('./items/playList/PlayList')),
  },
  {
    title: '弹幕设置',
    value: 'danmaku',
    component: Danmaku,
  },
  {
    title: '字幕设置',
    value: 'subtitle',
    component: Subtitle,
  },
  // {
  //   title: '音频设置',
  //   value: 'audio',
  //   component: Audio,
  // },
]

const SettingContext = createContext<DB_History | null>(null)
export const SettingProviderQueryKey = 'SettingProvider'
export const SettingProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { hash } = useAtomValue(videoAtom)
  const toast = useToast()

  const { data } = useQuery({
    queryKey: [SettingProviderQueryKey, hash],
    queryFn: () => db.history.get(hash),
  })
  useEffect(() => {
    // 确保 toast 不会遮住设置 setting
    toast.dismiss()
  }, [])
  if (!data) {
    return
  }
  return <SettingContext value={data}>{children}</SettingContext>
}

export const useSettingConfig = () => {
  const context = use(SettingContext)
  if (!context) {
    throw new Error('useSettingConfig must be used within a SettingProvider')
  }
  return context
}
