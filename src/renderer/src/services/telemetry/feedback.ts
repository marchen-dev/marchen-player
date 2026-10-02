import type { FeedbackSource } from '@renderer/atoms/feedback'
import { ipcClient } from '@renderer/lib/client'
import { isTelemetryEnabled, SENTRY_DSN } from '@renderer/lib/env'

import { captureFeatureUsed } from './features'
import { readWebLocalLog, writeLocalLog } from './local-log'

export interface FeedbackRequest {
  message: string
  contact?: string
  attachLogs: boolean
  source: FeedbackSource
  operationId?: string
}

export type FeedbackResult =
  { ok: true; eventId: string } | { ok: false; reason: 'unavailable' | 'timeout' | 'failed' }

/** 反馈联系邮箱，兜底时供用户手动发送 */
export const FEEDBACK_EMAIL = 'suemor233@outlook.com'

const SEND_TIMEOUT_MS = 15_000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

/**
 * 在线反馈通道是否可用。弹窗打开时即判断，不可用直接展示兜底方式，
 * 避免用户填完内容点击发送后才失败。
 */
export async function isFeedbackAvailable(): Promise<boolean> {
  try {
    if (ipcClient) return await ipcClient.app.feedbackAvailable()
    if (!SENTRY_DSN || !isTelemetryEnabled) return false
    const Sentry = await import('@sentry/react')
    return Sentry.isInitialized()
  } catch {
    return false
  }
}

const withTimeout = <T>(promise: Promise<T>, fallback: T) =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(resolve, SEND_TIMEOUT_MS, fallback)),
  ])

/** Web 端直接经 @sentry/react 发送，附带内存中的最近记录 */
async function sendWebFeedback(request: FeedbackRequest): Promise<FeedbackResult> {
  const Sentry = await import('@sentry/react')
  if (!Sentry.isInitialized()) return { ok: false, reason: 'unavailable' }
  const contact = request.contact?.trim()
  const eventId = Sentry.captureFeedback(
    {
      message: request.message,
      ...(contact ? (EMAIL_PATTERN.test(contact) ? { email: contact } : { name: contact }) : {}),
      source: request.source,
      tags: {
        feedback_source: request.source,
        attach_logs: String(request.attachLogs),
        ...(request.operationId ? { operation_id: request.operationId } : {}),
      },
    },
    {
      attachments: request.attachLogs
        ? [
            {
              filename: 'marchen-logs.jsonl',
              data: readWebLocalLog(),
              contentType: 'application/x-ndjson',
            },
          ]
        : [],
    },
  )
  const sent = await Sentry.flush(12_000)
  return sent ? { ok: true, eventId } : { ok: false, reason: 'timeout' }
}

/**
 * 发送用户反馈。Electron 交给 main 读取并压缩日志后发送，避免日志在进程间往返；
 * Web 直接发送。15 秒内无结果按超时处理。
 */
export async function sendFeedback(request: FeedbackRequest): Promise<FeedbackResult> {
  writeLocalLog({
    lv: 'info',
    cat: 'feedback',
    msg: 'feedback_submit',
    op: request.operationId,
    data: { source: request.source, attachLogs: request.attachLogs },
  })
  let result: FeedbackResult
  try {
    const sending: Promise<FeedbackResult> = ipcClient
      ? ipcClient.app
          .sendFeedback(request)
          .then((value) =>
            value.ok
              ? value
              : { ok: false, reason: value.reason === 'unavailable' ? 'unavailable' : 'timeout' },
          )
      : sendWebFeedback(request)
    result = await withTimeout(sending, { ok: false, reason: 'timeout' })
  } catch (error) {
    writeLocalLog({
      lv: 'warn',
      cat: 'feedback',
      msg: 'feedback_failed',
      data: { error: String(error) },
    })
    result = { ok: false, reason: 'failed' }
  }
  if (result.ok) captureFeatureUsed('feedback', 'sent', request.attachLogs)
  else
    writeLocalLog({
      lv: 'warn',
      cat: 'feedback',
      msg: 'feedback_failed',
      data: { reason: result.reason },
    })
  return result
}

/** Web 兜底：复制诊断信息（最近记录）到剪贴板 */
export async function copyDiagnostics(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(readWebLocalLog())
    return true
  } catch {
    return false
  }
}
