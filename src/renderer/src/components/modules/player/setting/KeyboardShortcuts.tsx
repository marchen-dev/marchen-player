import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useTranslation } from 'react-i18next'
import { RIGHT_HOLD_RATE } from '../controls/usePlayerShortcuts'
import { EntryRow } from './EntryRow'

export const KeyboardShortcuts = ({ fullscreenAvailable }: { fullscreenAvailable: boolean }) => {
  const { t } = useTranslation('player')
  const portalContainer = usePlayerPortalContainer()
  const title = t('settingsPanel.shortcuts.title')
  const rows: { label: string; keys: string[]; gesture?: string }[] = [
    {
      label: t('settingsPanel.shortcuts.playPause'),
      keys: [t('settingsPanel.shortcuts.space'), 'K'],
    },
    { label: t('controls.back'), keys: ['←'] },
    {
      label: t('settingsPanel.shortcuts.seekForward'),
      gesture: t('settingsPanel.shortcuts.press'),
      keys: ['→'],
    },
    {
      label: t('settingsPanel.shortcuts.holdSpeed', { rate: RIGHT_HOLD_RATE }),
      gesture: t('settingsPanel.shortcuts.hold'),
      keys: ['→'],
    },
    { label: t('settingsPanel.shortcuts.volume'), keys: ['↑', '↓'] },
    { label: t('settingsPanel.shortcuts.mute'), keys: ['M'] },
    { label: t('settingsPanel.shortcuts.danmaku'), keys: ['D'] },
  ]
  if (fullscreenAvailable) {
    rows.push(
      { label: t('settingsPanel.shortcuts.fullscreen'), keys: ['F'] },
      { label: t('controls.exitFullscreen'), keys: ['Esc'] },
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <EntryRow label={title} className="rounded-b-xl" />
      </DialogTrigger>
      <DialogContent
        container={portalContainer}
        aria-describedby={undefined}
        className="flex max-h-[80vh] w-[calc(100%-2rem)] max-w-md flex-col"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <dl className="divide-border min-h-0 divide-y overflow-y-auto text-sm">
          {rows.map(({ label, gesture, keys }) => (
            <div key={label} className="flex min-h-10 items-center justify-between gap-3 py-2">
              <dt className="min-w-0">{label}</dt>
              <dd className="flex shrink-0 items-center gap-1.5">
                {gesture && <span className="text-muted-foreground text-xs">{gesture}</span>}
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="border-border bg-muted inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border px-1.5 font-sans text-xs font-medium"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
