import type { PlayerCapabilities } from '@renderer/services/player-runtime'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@renderer/components/ui/sheet'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const ROTATIONS = [0, 90, 180, 270] as const

export type PlayerRotation = (typeof ROTATIONS)[number]

interface PlayerInspectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilities: PlayerCapabilities
  rate: number
  rotation: PlayerRotation
  onRateChange: (rate: number) => void
  onRotationChange: (rotation: PlayerRotation) => void
  onDanmaku?: () => void
  onSubtitle?: () => void
  onPlaylist?: () => void
  onExit?: () => void
}

/** IINA 风格的低频操作面板；具体字幕和弹幕实现通过入口解耦。 */
export const PlayerInspector = ({
  open,
  onOpenChange,
  capabilities,
  rate,
  rotation,
  onRateChange,
  onRotationChange,
  onDanmaku,
  onSubtitle,
  onPlaylist,
  onExit,
}: PlayerInspectorProps) => {
  const portalContainer = usePlayerPortalContainer()
  const invokeAndClose = (action?: () => void) => {
    if (!action) return
    onOpenChange(false)
    window.setTimeout(action, 0)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        container={portalContainer}
        classNames={{ sheetOverlay: 'bg-black/35' }}
        className="border-white/10 bg-[var(--player-surface-solid)] text-[var(--player-fg)] sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle className="text-[var(--player-fg)]">设置</SheetTitle>
        </SheetHeader>

        <InspectorSection title="播放速度">
          <div className="grid grid-cols-3 gap-2">
            {PLAYBACK_RATES.map((value) => (
              <InspectorChoice
                key={value}
                active={value === rate}
                onClick={() => onRateChange(value)}
              >
                {value === 1 ? '正常' : `${value}x`}
              </InspectorChoice>
            ))}
          </div>
        </InspectorSection>

        <InspectorSection title="画面旋转">
          <div className="grid grid-cols-4 gap-2">
            {ROTATIONS.map((value) => (
              <InspectorChoice
                key={value}
                active={value === rotation}
                onClick={() => onRotationChange(value)}
              >
                {value}°
              </InspectorChoice>
            ))}
          </div>
        </InspectorSection>

        <InspectorSection title="播放内容">
          <InspectorAction
            icon="icon-[mingcute--danmaku-line]"
            onClick={() => invokeAndClose(onDanmaku)}
          >
            弹幕设置
          </InspectorAction>
          {capabilities.externalSubtitle && (
            <InspectorAction
              icon="icon-[mingcute--subtitle-line]"
              onClick={() => invokeAndClose(onSubtitle)}
            >
              字幕与外挂字幕
            </InspectorAction>
          )}
          {capabilities.directoryPlaylist && (
            <InspectorAction
              icon="icon-[mingcute--playlist-2-line]"
              onClick={() => invokeAndClose(onPlaylist)}
            >
              播放列表
            </InspectorAction>
          )}
        </InspectorSection>

        <InspectorSection title="会话">
          <InspectorAction
            icon="icon-[mingcute--exit-door-line]"
            danger
            onClick={() => invokeAndClose(onExit)}
          >
            退出当前播放
          </InspectorAction>
        </InspectorSection>
      </SheetContent>
    </Sheet>
  )
}

const InspectorSection = ({ title, children }: React.PropsWithChildren<{ title: string }>) => (
  <section className="mt-6 space-y-2">
    <h3 className="text-xs font-semibold tracking-wide text-[var(--player-fg-muted)] uppercase">
      {title}
    </h3>
    {children}
  </section>
)

const InspectorChoice = ({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button
    type="button"
    aria-pressed={active}
    className={cn(
      'min-h-11 rounded-lg border border-white/10 px-3 text-sm transition-colors',
      'focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none',
      active
        ? 'bg-white/18 text-white'
        : 'bg-white/5 text-[var(--player-fg-muted)] hover:bg-white/10',
      className,
    )}
    {...props}
  />
)

const InspectorAction = ({
  icon,
  danger,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string
  danger?: boolean
}) => (
  <button
    type="button"
    className={cn(
      'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors',
      'focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none',
      danger ? 'text-red-300 hover:bg-red-500/10' : 'text-[var(--player-fg)] hover:bg-white/8',
      className,
    )}
    {...props}
  >
    <i className={cn(icon, 'text-xl')} aria-hidden />
    <span>{children}</span>
  </button>
)
