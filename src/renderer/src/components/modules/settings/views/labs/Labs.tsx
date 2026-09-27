import { useLabsSettings } from '@renderer/atoms/settings/labs'
import { BetaBadge } from '@renderer/components/common/BetaBadge'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { isWeb } from '@renderer/lib/utils'

import { SettingsGroup, SettingsPage, SettingsRow, SettingsSection } from '../../components'

export const LabsView = () => {
  const [labsSettings, setLabsSettings] = useLabsSettings()

  return (
    <SettingsPage
      sectionId="labs"
      title="实验室"
      description="抢先体验仍在开发中的功能，可能不稳定或随时调整"
    >
      {isWeb ? (
        <p className="text-muted-foreground text-sm">暂无可用的实验功能</p>
      ) : (
        <SettingsSection title="播放" description="遇到问题可在「关于」中反馈">
          <SettingsGroup>
            <SettingsRow
              label={
                <span className="inline-flex items-center gap-2">
                  通过 URL 播放
                  <BetaBadge />
                </span>
              }
              description={
                <>
                  在首页显示“通过 URL 播放”，打开 HTTP/HTTPS 视频直链，来源需支持 Range 请求
                  {/* Web 直接从浏览器读取远端，受跨域策略约束 */}
                  {isWeb && '；网页版还需来源允许跨域访问'}
                </>
              }
              labelId="labs-remote-url-playback-label"
              descriptionId="labs-remote-url-playback-description"
            >
              <SettingSwitch
                value={labsSettings.remoteUrlPlayback}
                aria-labelledby="labs-remote-url-playback-label"
                aria-describedby="labs-remote-url-playback-description"
                onCheckedChange={(checked) =>
                  setLabsSettings((prev) => ({ ...prev, remoteUrlPlayback: checked }))
                }
              />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      )}
    </SettingsPage>
  )
}
