import type { MediaPresentation } from '@marchen/playback-core'
import type { PlayerSettingsSection } from '@renderer/atoms/player-settings-state'
import type { PlayerCapabilities, PlaylistEntry } from '@renderer/services/player-runtime'
import type { PictureInPictureControl } from '../usePictureInPicture'
import { playerSettingsPanelAtom } from '@renderer/atoms/player'
import {
  getAvailablePlayerSettingsSections,
  normalizePlayerSettingsSection,
} from '@renderer/atoms/player-settings-state'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { PlayerEngineSetting } from '@renderer/components/modules/shared/setting/PlayerEngineSetting'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { Sheet, SheetContent, SheetTitle } from '@renderer/components/ui/sheet'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { createPlaybackInfoRows } from '@renderer/services/player-runtime/playback-info'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useAtom, useSetAtom } from 'jotai'
import { lazy, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { withControllerPosition } from '../controls/controller-position'
import { AudioTrackSetting } from './items/AudioTrackSetting'

import { Danmaku } from './items/damaku/Danmaku'
import { Subtitle } from './items/subtitle/Subtitle'
import { MediaTransferRows } from './MediaTransferRows'

const PlayList = lazy(() => import('./items/playList/PlayList'))

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const ROTATIONS = [0, 90, 180, 270] as const

export type PlayerRotation = (typeof ROTATIONS)[number]

interface PlayerSettingsPanelProps {
  capabilities: PlayerCapabilities
  playlist?: readonly PlaylistEntry[]
  onSelectPlaylist?: (entry: PlaylistEntry) => void
  /** 打开播放列表时重新读取，让同一集播放期间新增的剧集也能出现 */
  onRefreshPlaylist?: () => void
  playbackInfo?: MediaPresentation
  readPlaybackInfo?: () => MediaPresentation | undefined
  rate: number
  rotation: PlayerRotation
  onRateChange: (rate: number) => void
  onRotationChange: (rotation: PlayerRotation) => void
  pictureInPicture?: PictureInPictureControl
}

/** 分类名称不超过这么多个字符时，标签上同时显示图标 */
const TAB_ICON_MAX_LABEL_LENGTH = 4

// 分类名称在渲染时取 `settingsPanel.tabs.<分类>`，不放在这个模块顶层的常量里
const sectionIcons: Record<PlayerSettingsSection, string> = {
  playback: 'icon-[mingcute--play-circle-line]',
  danmaku: 'icon-[mingcute--danmaku-line]',
  subtitle: 'icon-[mingcute--subtitle-line]',
  playlist: 'icon-[mingcute--playlist-2-line]',
}

export const PlayerSettingsPanel = ({
  capabilities,
  playlist,
  onSelectPlaylist,
  onRefreshPlaylist,
  playbackInfo,
  readPlaybackInfo,
  rate,
  rotation,
  onRateChange,
  onRotationChange,
  pictureInPicture,
}: PlayerSettingsPanelProps) => {
  const { t } = useTranslation('player')
  // 面板只有约 400px 宽，四个标签并排。名称较长时（英文等）图标加文字放不下，
  // 这时只显示文字；简体中文的名称都很短，图标照常显示。按文字长度判断，不按语言判断。
  const showTabIcons = (['playback', 'danmaku', 'subtitle', 'playlist'] as const).every(
    (section) => t(`settingsPanel.tabs.${section}`).length <= TAB_ICON_MAX_LABEL_LENGTH,
  )
  const [panel, setPanel] = useAtom(playerSettingsPanelAtom)
  const portalContainer = usePlayerPortalContainer()
  const sections = getAvailablePlayerSettingsSections(capabilities)
  const [livePlaybackInfo, setLivePlaybackInfo] = useState(playbackInfo)

  useEffect(() => {
    if (!panel.open || !readPlaybackInfo) return
    // 只在设置面板打开时刷新，暂停播放后也能看到解码速率归零。
    const refresh = () => setLivePlaybackInfo(readPlaybackInfo())
    refresh()
    const timer = setInterval(refresh, 500)
    return () => clearInterval(timer)
  }, [panel.open, readPlaybackInfo])

  useEffect(() => {
    const normalized = normalizePlayerSettingsSection(panel.section, capabilities)
    if (normalized !== panel.section) setPanel((state) => ({ ...state, section: normalized }))
  }, [capabilities, panel.section, setPanel])

  return (
    <>
      <Sheet open={panel.open} onOpenChange={(open) => setPanel((state) => ({ ...state, open }))}>
        <SheetContent
          data-player-settings-panel
          container={portalContainer}
          classNames={{ sheetOverlay: 'no-drag-region bg-black/30' }}
          className={cn(
            'no-drag-region w-[var(--player-settings-width)] max-w-none gap-0 overflow-hidden border-white/11 p-0',
            'bg-player-surface text-[var(--player-settings-fg)] shadow-[-20px_0_60px_rgb(0_0_0/28%)]',
            'player-glass sm:max-w-none',
          )}
          closeIcon={<i className="icon-[mingcute--close-line] block text-lg" aria-hidden />}
          closeLabel={t('settingsPanel.close')}
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{t('settingsPanel.title')}</SheetTitle>
          <Tabs
            value={panel.section}
            className="flex h-full min-h-0 min-w-0 flex-col"
            onValueChange={(section) =>
              setPanel((state) => ({ ...state, section: section as PlayerSettingsSection }))
            }
          >
            <TabsList
              aria-label={t('settingsPanel.tabsLabel')}
              className="no-drag-region h-16 shrink-0 justify-start gap-1 rounded-none border-b border-white/11 bg-transparent px-5 pr-14"
            >
              {sections.map((section) => {
                const label = t(`settingsPanel.tabs.${section}`)
                return (
                  <TabsTrigger
                    key={section}
                    value={section}
                    // 只显示文字的时候名称可能被截断，悬停能看到完整名称
                    title={showTabIcons ? undefined : label}
                    className={cn(
                      'no-drag-region h-10 flex-1 gap-2 rounded-lg px-2 text-[var(--player-settings-muted)] shadow-none',
                      // 名称较长、只显示文字时：允许在自己的格子里截断，不伸到右上角的关闭按钮下面。
                      // 名称短（简体中文）时不加：四个标签等宽，加了会把四个字的「播放列表」截掉
                      !showTabIcons && 'min-w-0',
                      'hover:bg-white/6 hover:text-[var(--player-settings-fg)]',
                      'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0',
                      'data-[state=active]:bg-white/14 data-[state=active]:text-[var(--player-settings-fg)] data-[state=active]:shadow-none',
                    )}
                  >
                    {showTabIcons && (
                      <i className={cn(sectionIcons[section], 'text-lg')} aria-hidden />
                    )}
                    <span className={showTabIcons ? undefined : 'truncate'}>{label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            <ScrollArea
              className="min-h-0 min-w-0 flex-1"
              classNames={{
                viewport: 'overflow-x-hidden [&>div]:!block [&>div]:w-full [&>div]:min-w-0',
              }}
            >
              <div className="max-w-full min-w-0 overflow-hidden px-6 py-5">
                <TabsContent value="playback" className="mt-0 focus-visible:ring-0">
                  <PlaybackSettings
                    capabilities={capabilities}
                    playbackInfo={readPlaybackInfo ? livePlaybackInfo : playbackInfo}
                    rate={rate}
                    rotation={rotation}
                    onRateChange={onRateChange}
                    onRotationChange={onRotationChange}
                    pictureInPicture={pictureInPicture}
                  />
                </TabsContent>
                <TabsContent value="danmaku" className="mt-0 focus-visible:ring-0">
                  <Danmaku />
                </TabsContent>
                {sections.includes('subtitle') && (
                  <TabsContent value="subtitle" className="mt-0 focus-visible:ring-0">
                    <Subtitle />
                  </TabsContent>
                )}
                {sections.includes('playlist') && (
                  <TabsContent
                    value="playlist"
                    className="mt-0 max-w-full min-w-0 overflow-hidden focus-visible:ring-0"
                  >
                    <PlayList
                      entries={playlist ?? []}
                      onSelect={onSelectPlaylist}
                      onRefresh={onRefreshPlaylist}
                    />
                  </TabsContent>
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>
      <MatchDanmakuDialog />
    </>
  )
}

const PlaybackSettings = ({
  capabilities,
  playbackInfo,
  rate,
  rotation,
  onRateChange,
  onRotationChange,
  pictureInPicture,
}: PlayerSettingsPanelProps) => {
  const [settings, setSettings] = usePlayerSettings()
  const setPanel = useSetAtom(playerSettingsPanelAtom)
  const portalContainer = usePlayerPortalContainer()
  const playbackInfoRows = createPlaybackInfoRows(playbackInfo)
  const { t } = useTranslation('player')
  const positionPresets = [
    { id: 'top', xRatio: 0.5, yRatio: 0.18 },
    { id: 'default', xRatio: 0.5, yRatio: 0.72 },
    { id: 'bottom', xRatio: 0.5, yRatio: 0.92 },
  ] as const

  return (
    <div className="space-y-7">
      <PanelSection title={t('settingsPanel.compat')}>
        <PanelCard>
          <div className="px-4 py-3">
            <PlayerEngineSetting playerMaterial container={portalContainer} />
          </div>
          <AudioTrackSetting />
          <MediaTransferRows />
          {playbackInfoRows.map((row) => (
            <div
              key={row.label}
              className="flex min-h-11 items-start justify-between gap-4 px-4 py-3 text-sm"
            >
              <span className="shrink-0">{row.label}</span>
              <span className="min-w-0 text-right break-words text-[var(--player-settings-muted)]">
                {row.value}
              </span>
            </div>
          ))}
        </PanelCard>
      </PanelSection>

      <PanelSection title={t('settingsPanel.speed')}>
        <div className="grid grid-cols-3 gap-2">
          {PLAYBACK_RATES.map((value) => (
            <PanelChoice key={value} active={value === rate} onClick={() => onRateChange(value)}>
              {value === 1 ? t('settingsPanel.speedNormal') : `${value}x`}
            </PanelChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={t('settingsPanel.rotation')}>
        <div className="grid grid-cols-4 gap-2">
          {ROTATIONS.map((value) => (
            <PanelChoice
              key={value}
              active={value === rotation}
              onClick={() => onRotationChange(value)}
            >
              {value}°
            </PanelChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={t('settingsPanel.preferences')}>
        <PanelCard>
          {capabilities.playlist && (
            <PanelSwitchRow
              label={t('settingsPanel.autoNext')}
              checked={settings.enableAutomaticEpisodeSwitching}
              onCheckedChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  enableAutomaticEpisodeSwitching: checked,
                }))
              }
            />
          )}
          <PanelSwitchRow
            label={t('settingsPanel.bottomProgress')}
            checked={settings.enableMiniProgress}
            onCheckedChange={(checked) =>
              setSettings((current) => ({ ...current, enableMiniProgress: checked }))
            }
          />
          <PanelSwitchRow
            label={t('settingsPanel.clickToToggle')}
            checked={settings.enableClickToTogglePlay}
            onCheckedChange={(checked) => {
              captureFeatureUsed('click_to_toggle_play', checked ? 'enable' : 'disable')
              setSettings((current) => ({ ...current, enableClickToTogglePlay: checked }))
            }}
          />
          {pictureInPicture && (
            <div className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">
              <div className="min-w-0">
                <div>{t('settingsPanel.pip.title')}</div>
                {/* 退出始终可用，只有进入受内核与浏览器能力限制 */}
                {!pictureInPicture.active && pictureInPicture.unavailableReason && (
                  <div className="mt-0.5 text-xs text-[var(--player-settings-muted)]">
                    {t(`settingsPanel.pip.unavailable.${pictureInPicture.unavailableReason}`)}
                  </div>
                )}
              </div>
              <PanelChoice
                className="shrink-0 disabled:opacity-50 disabled:hover:bg-white/6 disabled:hover:text-[var(--player-settings-muted)]"
                active={pictureInPicture.active}
                disabled={!pictureInPicture.active && !!pictureInPicture.unavailableReason}
                onClick={() => {
                  const entering = !pictureInPicture.active
                  pictureInPicture.toggle()
                  // 进入后用户关注点转到画中画窗口，收起面板避免回到主窗口时仍遮挡画面
                  if (entering) setPanel((state) => ({ ...state, open: false }))
                }}
              >
                {pictureInPicture.active
                  ? t('settingsPanel.pip.exit')
                  : t('settingsPanel.pip.enter')}
              </PanelChoice>
            </div>
          )}
        </PanelCard>
      </PanelSection>

      <PanelSection title={t('settingsPanel.controllerPosition.title')}>
        <div className="grid grid-cols-4 gap-2">
          {positionPresets.map((preset) => (
            <PanelChoice
              key={preset.id}
              onClick={() => setSettings((current) => withControllerPosition(current, preset))}
            >
              {t(`settingsPanel.controllerPosition.${preset.id}`)}
            </PanelChoice>
          ))}
          <PanelChoice
            aria-label={t('settingsPanel.controllerPosition.resetLabel')}
            onClick={() =>
              setSettings((current) =>
                withControllerPosition(current, { xRatio: 0.5, yRatio: 0.72 }),
              )
            }
          >
            <i className="icon-[mingcute--refresh-2-line] text-lg" aria-hidden />
            {t('settingsPanel.controllerPosition.reset')}
          </PanelChoice>
        </div>
      </PanelSection>
    </div>
  )
}

export const PanelSection = ({ title, children }: React.PropsWithChildren<{ title: string }>) => (
  <section className="space-y-3">
    <h3 className="text-sm font-semibold text-[var(--player-settings-fg)]">{title}</h3>
    {children}
  </section>
)

export const PanelCard = ({ children }: React.PropsWithChildren) => (
  <div className="divide-y divide-white/11 rounded-xl bg-white/8 px-4">{children}</div>
)

export const PanelChoice = ({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button
    type="button"
    aria-pressed={active}
    className={cn(
      'flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-white/11 px-3 text-sm transition-colors',
      'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none',
      active
        ? 'bg-white/14 text-[var(--player-settings-fg)]'
        : 'bg-white/6 text-[var(--player-settings-muted)] hover:bg-white/10 hover:text-[var(--player-settings-fg)]',
      className,
    )}
    {...props}
  />
)

const PanelSwitchRow = ({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) => (
  <label className="flex min-h-12 items-center justify-between gap-4 text-sm">
    <span>{label}</span>
    <Switch
      checked={checked}
      aria-label={label}
      className="bg-white/18 focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0 data-[state=checked]:bg-[var(--player-settings-accent)] data-[state=unchecked]:bg-white/18"
      thumbClassName="bg-white"
      onCheckedChange={onCheckedChange}
    />
  </label>
)
