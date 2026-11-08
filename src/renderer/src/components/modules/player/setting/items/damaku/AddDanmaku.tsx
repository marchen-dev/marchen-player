import { Label } from '@renderer/components/ui/label'
import { isWeb } from '@renderer/lib/utils'
import { LinkDanmaku } from './LinkDanmaku'
import { LocalDanmakuFileButton } from './LocalDanmakuFileButton'

export const AddDanmaku = () => (
  <div className="space-y-6 pt-1">
    <div className="flex flex-col gap-3">
      <Label className="leading-5 text-[var(--player-settings-muted)]">
        从弹幕文件导入，支持 B 站 XML / JSON 格式
      </Label>
      <LocalDanmakuFileButton className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white" />
    </div>
    {!isWeb && <LinkDanmaku />}
  </div>
)
