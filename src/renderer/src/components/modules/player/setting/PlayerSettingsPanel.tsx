import type { PlayerSettingsSection } from '@renderer/atoms/player-settings-state'
import type { PlayerCapabilities } from '@renderer/services/player-runtime'
import { playerSettingsPanelAtom } from '@renderer/atoms/player'
import {
  getAvailablePlayerSettingsSections,
  normalizePlayerSettingsSection,
} from '@renderer/atoms/player-settings-state'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { Sheet, SheetContent, SheetTitle } from '@renderer/components/ui/sheet'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useAtom } from 'jotai'
import { lazy, useEffect } from 'react'

import { withControllerPosition } from '../controls/controller-position'
import { Danmaku } from './items/damaku/Danmaku'
import { Subtitle } from './items/subtitle/Subtitle'

const PlayList = lazy(() => import('./items/playList/PlayList'))

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const ROTATIONS = [0, 90, 180, 270] as const

export type PlayerRotation = (typeof ROTATIONS)[number]

interface PlayerSettingsPanelProps {
  capabilities: PlayerCapabilities
  rate: number
  rotation: PlayerRotation
  onRateChange: (rate: number) => void
  onRotationChange: (rotation: PlayerRotation) => void
}

const sectionMetadata: Record<PlayerSettingsSection, { label: string; icon: string }> = {
  playback: { label: '播放', icon: 'icon-[mingcute--play-circle-line]' },
  danmaku: { label: '弹幕', icon: 'icon-[mingcute--danmaku-line]' },
  subtitle: { label: '字幕', icon: 'icon-[mingcute--subtitle-line]' },
  playlist: { label: '播放列表', icon: 'icon-[mingcute--playlist-2-line]' },
}

export const PlayerSettingsPanel = ({
  capabilities,
  rate,
  rotation,
  onRateChange,
  onRotationChange,
}: PlayerSettingsPanelProps) => {
  const [panel, setPanel] = useAtom(playerSettingsPanelAtom)
  const portalContainer = usePlayerPortalContainer()
  const sections = getAvailablePlayerSettingsSections(capabilities)

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
            'bg-[var(--player-settings-panel)] text-[var(--player-settings-fg)] shadow-[-20px_0_60px_rgb(0_0_0/28%)]',
            'backdrop-blur-[26px] backdrop-saturate-125 sm:max-w-none',
          )}
          closeIcon={<i className="icon-[mingcute--close-line] block text-lg" aria-hidden />}
          closeLabel="关闭播放器设置"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">播放器设置</SheetTitle>
          <Tabs
            value={panel.section}
            className="flex h-full min-h-0 min-w-0 flex-col"
            onValueChange={(section) =>
              setPanel((state) => ({ ...state, section: section as PlayerSettingsSection }))
            }
          >
            <TabsList
              aria-label="播放器设置分类"
              className="no-drag-region h-16 shrink-0 justify-start gap-1 rounded-none border-b border-white/11 bg-transparent px-5 pr-14"
            >
              {sections.map((section) => {
                const metadata = sectionMetadata[section]
                return (
                  <TabsTrigger
                    key={section}
                    value={section}
                    className={cn(
                      'no-drag-region h-10 flex-1 gap-2 rounded-lg px-2 text-[var(--player-settings-muted)] shadow-none',
                      'hover:bg-white/6 hover:text-[var(--player-settings-fg)]',
                      'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0',
                      'data-[state=active]:bg-white/14 data-[state=active]:text-[var(--player-settings-fg)] data-[state=active]:shadow-none',
                    )}
                  >
                    <i className={cn(metadata.icon, 'text-lg')} aria-hidden />
                    <span>{metadata.label}</span>
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
                    rate={rate}
                    rotation={rotation}
                    onRateChange={onRateChange}
                    onRotationChange={onRotationChange}
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
                    <PlayList />
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
  rate,
  rotation,
  onRateChange,
  onRotationChange,
}: PlayerSettingsPanelProps) => {
  const [settings, setSettings] = usePlayerSettings()
  const positionPresets = [
    { label: '上方', xRatio: 0.5, yRatio: 0.18 },
    { label: '默认', xRatio: 0.5, yRatio: 0.72 },
    { label: '下方', xRatio: 0.5, yRatio: 0.92 },
  ]

  return (
    <div className="space-y-7">
      <PanelSection title="媒体兼容">
        <PanelCard>
          <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-3 text-sm">
            <span>FFmpeg 兼容播放</span>
            <span className="text-[var(--player-settings-muted)]">
              {capabilities.ffmpegPlaybackStatus === 'available'
                ? '可用'
                : capabilities.ffmpegPlaybackStatus === 'checking'
                  ? '检查中'
                  : capabilities.ffmpegPlaybackStatus === 'native-only'
                    ? '仅原生播放'
                    : '不可用，已回退直放'}
            </span>
          </div>
        </PanelCard>
      </PanelSection>

      <PanelSection title="播放速度">
        <div className="grid grid-cols-3 gap-2">
          {PLAYBACK_RATES.map((value) => (
            <PanelChoice key={value} active={value === rate} onClick={() => onRateChange(value)}>
              {value === 1 ? '正常' : `${value}x`}
            </PanelChoice>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="画面旋转">
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

      <PanelSection title="连续播放">
        <PanelCard>
          {capabilities.directoryPlaylist && (
            <PanelSwitchRow
              label="自动续播下一集"
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
            label="控制器隐藏时显示底部进度"
            checked={settings.enableMiniProgress}
            onCheckedChange={(checked) =>
              setSettings((current) => ({ ...current, enableMiniProgress: checked }))
            }
          />
        </PanelCard>
      </PanelSection>

      <PanelSection title="控制器位置">
        <div className="grid grid-cols-4 gap-2">
          {positionPresets.map((preset) => (
            <PanelChoice
              key={preset.label}
              onClick={() => setSettings((current) => withControllerPosition(current, preset))}
            >
              {preset.label}
            </PanelChoice>
          ))}
          <PanelChoice
            aria-label="重置控制器位置"
            onClick={() =>
              setSettings((current) =>
                withControllerPosition(current, { xRatio: 0.5, yRatio: 0.72 }),
              )
            }
          >
            <i className="icon-[mingcute--refresh-2-line] text-lg" aria-hidden />
            重置
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
