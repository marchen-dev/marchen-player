import { atom } from 'jotai'

import { jotaiStore } from './store'

/** 反馈入口，写入 Sentry 反馈的 source 与 tags */
export type FeedbackSource = 'about' | 'menu' | 'playback_error'

export interface FeedbackDialogState {
  open: boolean
  source: FeedbackSource
  /** 关联的播放操作 ID（从播放失败进入时） */
  operationId?: string
}

export const feedbackDialogAtom = atom<FeedbackDialogState>({ open: false, source: 'about' })

/** 草稿只在本次运行内保留：关闭弹窗不丢内容，重启后清空 */
export const feedbackDraftAtom = atom({ message: '', contact: '' })

/** 最近一次成功发送的时间，用于短时间重复发送确认 */
export const lastFeedbackSentAtAtom = atom<number | null>(null)

/** 最近一次自动预填的内容，用于判断草稿是否被用户改过 */
let lastPrefill: string | undefined

/**
 * 打开反馈弹窗。可在组件外调用（菜单事件、播放失败页）。
 * 预填规则：草稿为空，或草稿仍是上次未修改的预填内容时，替换为本次预填；
 * 用户编辑过的草稿保留，避免覆盖其输入，也避免旧错误信息残留到新的失败里。
 */
export function openFeedbackDialog(options: {
  source: FeedbackSource
  prefill?: string
  operationId?: string
}) {
  const draft = jotaiStore.get(feedbackDraftAtom)
  const untouched = !draft.message.trim() || draft.message === lastPrefill
  if (options.prefill && untouched) {
    jotaiStore.set(feedbackDraftAtom, { ...draft, message: options.prefill })
    lastPrefill = options.prefill
  }
  jotaiStore.set(feedbackDialogAtom, {
    open: true,
    source: options.source,
    operationId: options.operationId,
  })
}
