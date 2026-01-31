import { videoAtom } from '@renderer/atoms/player'
import { SettingSlider } from '@renderer/components/modules/shared/setting/SettingSlider'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { useAtomValue } from 'jotai'
import { memo } from 'react'

import { useSubtitleInstance } from '../../../Context'
import { useSettingConfig } from '../../Sheet'

export const SubtitleTimeOff = memo(() => {
  const [subtitleInstance] = useSubtitleInstance()
  const setting = useSettingConfig()
  const { toast } = useToast()
  const { hash } = useAtomValue(videoAtom)
  return (
    <SettingSlider
      defaultValue={[setting.subtitles?.timeOffset ?? 0]}
      max={9}
      step={1}
      min={-9}
      onValueChangeWithDebounce={async (value) => {
        const timeOffset = value[0] ?? 0
        if (!subtitleInstance) {
          toast({
            title: '设置失败，字幕未加载',
          })
          return
        }
        // @ts-ignore
        subtitleInstance.timeOffset = timeOffset

        const history = await db.history.get(hash)
        if (!history?.subtitles) {
          return
        }
        db.history.update(hash, {
          subtitles: {
            ...history.subtitles,
            timeOffset,
          },
        })
      }}
    />
  )
})
