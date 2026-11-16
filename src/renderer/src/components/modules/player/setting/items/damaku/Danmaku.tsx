import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { DanmakuSourceProvider } from '../../danmaku-source-context'
import { PanelCard, PanelSection } from '../../panel-layout'
import { AddDanmaku } from './AddDanmaku'
import { DanmakuBlock } from './block/DanmakuBlockDialog'
import { DanmakuAppearanceSettings, DanmakuDisplaySettings } from './DanmakuSetting'
import { DanmakuSource } from './DanmakuSource'
import { DanmakuList } from './list/DanmakuListDialog'
import { MatchInfo } from './MatchInfo'

/**
 * 弹幕页分四组：匹配 / 显示 / 外观 / 来源与规则。
 * 每组内部只用一种排布（开关行、上下排的滑块、入口行），组标题与间距和播放页一致。
 */
export const Danmaku = memo(() => {
  const { t } = useTranslation('danmaku')
  return (
    <div className="space-y-7">
      <MatchInfo />
      <DanmakuDisplaySettings />
      <DanmakuAppearanceSettings />
      <DanmakuSourceProvider>
        <PanelSection title={t('settings.groups.sources')}>
          <PanelCard>
            <DanmakuSource />
            <DanmakuList />
            <DanmakuBlock />
          </PanelCard>
          <AddDanmaku />
        </PanelSection>
      </DanmakuSourceProvider>
    </div>
  )
})
