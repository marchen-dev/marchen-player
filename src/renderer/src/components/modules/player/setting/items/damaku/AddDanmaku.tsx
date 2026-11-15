import { Label } from '@renderer/components/ui/label'
import { isWeb } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import { LinkDanmaku } from './LinkDanmaku'
import { LocalDanmakuFileButton } from './LocalDanmakuFileButton'

export const AddDanmaku = () => {
  const { t } = useTranslation('danmaku')
  return (
    <div className="space-y-6 pt-1">
      <div className="flex flex-col gap-3">
        <Label className="leading-5 text-[var(--player-settings-muted)]">
          {t('localImport.hint')}
        </Label>
        <LocalDanmakuFileButton className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white" />
      </div>
      {!isWeb && <LinkDanmaku />}
    </div>
  )
}
