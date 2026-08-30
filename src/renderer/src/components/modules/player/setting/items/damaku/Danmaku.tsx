import { DanmakuSetting } from '@renderer/components/modules/settings/views/player/DanmakuSetting'
import { memo } from 'react'

import { DanmakuSourceProvider } from '../../danmaku-source-context'
import { AddDanmaku } from './AddDanmaku'
import { DanmakuSource } from './DanmakuSource'

export const Danmaku = memo(() => {
  return (
    <>
      <DanmakuSetting classNames={{ cardLayout: 'space-y-3' }}>
        <DanmakuSourceProvider>
          <DanmakuSource />
          <AddDanmaku />
        </DanmakuSourceProvider>
      </DanmakuSetting>
    </>
  )
})
