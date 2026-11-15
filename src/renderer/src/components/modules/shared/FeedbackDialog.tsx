import type { FeedbackResult } from '@renderer/services/telemetry/feedback'
import {
  feedbackDialogAtom,
  feedbackDraftAtom,
  lastFeedbackSentAtAtom,
} from '@renderer/atoms/feedback'
import { useAppSettings } from '@renderer/atoms/settings/app'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { useToast } from '@renderer/components/ui/toast'
import { ipcClient } from '@renderer/lib/client'
import { cn, isWeb } from '@renderer/lib/utils'
import {
  copyDiagnostics,
  FEEDBACK_EMAIL,
  isFeedbackAvailable,
  sendFeedback,
} from '@renderer/services/telemetry/feedback'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 成功发送后该时间内再次发送需确认，避免重复提交 */
const REPEAT_CONFIRM_MS = 30_000

type Phase =
  | { kind: 'editing' }
  | { kind: 'sending' }
  | { kind: 'success'; eventId: string }
  | { kind: 'failed'; reason: Exclude<FeedbackResult, { ok: true }>['reason'] }

/**
 * 全局反馈弹窗：设置 › 关于、macOS 应用菜单、播放失败页共用。
 * 使用 shadcn Dialog（层级高于设置所在的 ModalStack），以便发送中拦截关闭。
 */
export const FeedbackDialog = () => {
  const [dialog, setDialog] = useAtom(feedbackDialogAtom)
  // 发送中锁定关闭；由内容组件上报，外层据此拦截关闭操作
  const [sending, setSending] = useState(false)
  const close = () => setDialog((current) => ({ ...current, open: false }))
  const { t } = useTranslation('app')

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        // 发送中不允许关闭，避免用户误以为已取消
        if (!open && !sending) close()
      }}
    >
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(event) => sending && event.preventDefault()}
        // 点击遮罩不关闭：表单有输入内容，误触遮罩不应打断填写，只能通过取消 / ✕ / Esc 关闭
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('feedback.title')}</DialogTitle>
          <DialogDescription>{t('feedback.description')}</DialogDescription>
        </DialogHeader>
        {/* 内容只在打开时挂载：每次打开自动重置发送状态与在线检查 */}
        <FeedbackForm onSendingChange={setSending} onClose={close} />
      </DialogContent>
    </Dialog>
  )
}

const FeedbackForm = ({
  onSendingChange,
  onClose,
}: {
  onSendingChange: (sending: boolean) => void
  onClose: () => void
}) => {
  const dialog = useAtomValue(feedbackDialogAtom)
  const [draft, setDraft] = useAtom(feedbackDraftAtom)
  const lastSentAt = useAtomValue(lastFeedbackSentAtAtom)
  const setLastSentAt = useSetAtom(lastFeedbackSentAtAtom)
  const [appSettings, setAppSettings] = useAppSettings()
  const { toast } = useToast()
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [available, setAvailable] = useState<boolean | null>(null)
  const [confirmRepeat, setConfirmRepeat] = useState(false)
  const { t } = useTranslation(['app', 'common'])

  // 打开即检查在线通道，不可用时直接展示兜底方式
  useEffect(() => {
    let active = true
    void isFeedbackAvailable().then((value) => active && setAvailable(value))
    return () => {
      active = false
    }
  }, [])

  const sending = phase.kind === 'sending'
  const attachLogs = appSettings.feedbackAttachLogs

  const submit = async () => {
    if (sending || available !== true) return
    if (!confirmRepeat && lastSentAt && Date.now() - lastSentAt < REPEAT_CONFIRM_MS) {
      setConfirmRepeat(true)
      return
    }
    setPhase({ kind: 'sending' })
    onSendingChange(true)
    const result = await sendFeedback({
      // 描述可留空（只想提交日志）；Sentry 反馈要求非空消息，用占位文案代替
      // eslint-disable-next-line marchen/no-hardcoded-ui-text -- 发给开发者的占位内容，不是界面文字
      message: draft.message.trim() || '（未填写描述）',
      contact: draft.contact.trim() || undefined,
      attachLogs,
      source: dialog.source,
      operationId: dialog.operationId,
    })
    onSendingChange(false)
    if (result.ok) {
      setPhase({ kind: 'success', eventId: result.eventId })
      setLastSentAt(Date.now())
      setDraft({ message: '', contact: '' })
    } else {
      // 保留输入，允许重试或使用兜底方式
      setPhase({ kind: 'failed', reason: result.reason })
    }
  }

  const copy = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title })
    } catch {
      toast({ title: t('common:copyFailed'), variant: 'destructive' })
    }
  }

  const fallback = (
    <div className="flex flex-wrap gap-2">
      {isWeb ? (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const ok = await copyDiagnostics()
            toast(
              ok
                ? { title: t('feedback.diagnosticsCopied') }
                : { title: t('common:copyFailed'), variant: 'destructive' },
            )
          }}
        >
          {t('feedback.copyDiagnostics')}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void ipcClient?.app.openLogDirectory()}>
          {t('feedback.openLogs')}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => copy(FEEDBACK_EMAIL, t('feedback.emailCopied'))}
      >
        {t('feedback.copyEmail')}
      </Button>
    </div>
  )

  return (
    <>
      {phase.kind === 'success' ? (
        <div className="space-y-3 text-sm">
          <p>{t('feedback.success')}</p>
          <div className="bg-muted flex items-center justify-between rounded-lg px-3 py-2">
            <span>
              {t('feedback.referenceLabel')}{' '}
              <span className="font-mono">#{phase.eventId.slice(0, 8)}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy(phase.eventId, t('feedback.referenceCopied'))}
            >
              {t('common:action.copy')}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t('feedback.referenceHint')}</p>
          <DialogFooter>
            <Button onClick={onClose}>{t('common:action.done')}</Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4">
          {available === false && (
            <div className="bg-muted space-y-2 rounded-lg p-3 text-sm">
              <p>{t('feedback.unavailable')}</p>
              {fallback}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="feedback-message" className="text-sm font-medium">
              {t('feedback.messageLabel')}
            </label>
            <textarea
              id="feedback-message"
              value={draft.message}
              disabled={sending}
              rows={5}
              placeholder={t('feedback.messagePlaceholder')}
              onChange={(event) => setDraft({ ...draft, message: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void submit()
                }
              }}
              className={cn(
                'border-input placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50',
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-contact" className="text-sm font-medium">
              {t('feedback.contactLabel')}
            </label>
            <Input
              id="feedback-contact"
              value={draft.contact}
              disabled={sending}
              placeholder={t('feedback.contactPlaceholder')}
              onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="feedback-attach-logs"
              checked={attachLogs}
              disabled={sending}
              className="mt-0.5"
              onCheckedChange={(checked) =>
                setAppSettings((prev) => ({ ...prev, feedbackAttachLogs: checked === true }))
              }
            />
            <label htmlFor="feedback-attach-logs" className="text-sm">
              {t('feedback.attachLogs')}
              <span className="text-muted-foreground block text-xs">
                {t('feedback.attachLogsDescription')}
              </span>
            </label>
          </div>

          {phase.kind === 'failed' && (
            <div role="alert" className="bg-destructive/10 space-y-2 rounded-lg p-3 text-sm">
              <p>
                {phase.reason === 'timeout'
                  ? t('feedback.failed.timeout')
                  : isWeb
                    ? t('feedback.failed.blocked')
                    : t('feedback.failed.other')}
              </p>
              {fallback}
            </div>
          )}

          {confirmRepeat && (
            <p className="text-muted-foreground text-sm">{t('feedback.confirmRepeat')}</p>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={sending} onClick={onClose}>
              {t('common:action.cancel')}
            </Button>
            <Button disabled={sending || available !== true} onClick={submit}>
              {sending
                ? t('feedback.sending')
                : confirmRepeat
                  ? t('feedback.sendAnyway')
                  : t('feedback.send')}
            </Button>
          </DialogFooter>
        </div>
      )}
    </>
  )
}
