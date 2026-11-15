import { playerSettingAtom } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { ToastAction } from '@renderer/components/ui/toast/toast'
import { toast } from '@renderer/components/ui/toast/use-toast'
/**
 * 「屏蔽这条弹幕」的界面动作：画面悬停工具条与弹幕列表共用。
 *
 * 状态变更在 danmaku-block.ts 的纯函数里完成，这里只负责读写设置、提示和埋点。
 * 经 jotaiStore 访问设置，是因为画面上的调用方是不在 React 树内的弹幕渲染器。
 */
import { t } from '@renderer/lib/i18n'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'

import { blockDanmakuText } from './danmaku-block'
import { MAX_DANMAKU_BLOCK_RULES } from './danmaku-block-settings'

/** 屏蔽入口，仅用于埋点区分 */
export type DanmakuBlockEntry = 'dialog' | 'hover' | 'list'

const TOAST_TEXT_LIMIT = 20

export const notifyBlockRuleLimit = () =>
  toast({
    title: t('danmaku:block.limitTitle', { max: MAX_DANMAKU_BLOCK_RULES }),
    description: t('danmaku:block.limitDescription'),
    variant: 'destructive',
    duration: 3000,
  })

export const blockDanmakuByText = (text: string, entry: DanmakuBlockEntry) => {
  const result = blockDanmakuText(jotaiStore.get(playerSettingAtom).danmakuBlock, text)
  if (result.status === 'empty') return
  if (result.status === 'limit') {
    notifyBlockRuleLimit()
    return
  }

  jotaiStore.set(playerSettingAtom, (current) => ({ ...current, danmakuBlock: result.settings }))
  captureFeatureUsed('danmaku_block', 'add_keyword', entry)

  const { pattern } = result.rule
  const shown =
    pattern.length > TOAST_TEXT_LIMIT ? `${pattern.slice(0, TOAST_TEXT_LIMIT)}…` : pattern
  const handle = toast({
    title: t('danmaku:block.blocked', { text: shown }),
    duration: 5000,
    action: (
      <ToastAction
        altText={t('danmaku:block.undoAlt')}
        onClick={() => {
          jotaiStore.set(playerSettingAtom, (current) => ({
            ...current,
            danmakuBlock: result.revert(current.danmakuBlock),
          }))
          captureFeatureUsed('danmaku_block', 'undo', entry)
          handle.dismiss()
        }}
      >
        {t('danmaku:block.undo')}
      </ToastAction>
    ),
  })
}
