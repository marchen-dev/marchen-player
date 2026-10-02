import { collectDiagnostics, writeLog } from '@main/lib/diagnostic-log'
import * as Sentry from '@sentry/electron/main'

export interface FeedbackInput {
  message: string
  contact?: string
  attachLogs: boolean
  /** 入口：about / menu / playback_error */
  source: string
  /** 从播放失败进入时关联的操作 ID */
  operationId?: string
}

export type FeedbackResult = { ok: true; eventId: string } | { ok: false; reason: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

/** 在线反馈通道是否可用：主进程 Sentry 只在配置 DSN 且遥测开启时初始化 */
export const isFeedbackAvailable = () => Sentry.isInitialized()

/**
 * 在主进程发送用户反馈：日志直接从磁盘读取并压缩为附件，
 * 避免几 MB 的日志在 main 与 renderer 之间往返。
 */
export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  if (!isFeedbackAvailable()) return { ok: false, reason: 'unavailable' }
  writeLog({
    lv: 'info',
    cat: 'feedback',
    msg: 'feedback_send',
    op: input.operationId,
    data: { source: input.source, attachLogs: input.attachLogs },
  })

  const contact = input.contact?.trim()
  const attachments = input.attachLogs
    ? [
        {
          filename: 'marchen-logs.jsonl.gz',
          data: collectDiagnostics(),
          contentType: 'application/gzip',
        },
      ]
    : []
  const eventId = Sentry.captureFeedback(
    {
      message: input.message,
      // 联系方式可能是 Telegram 等非邮箱，非邮箱格式放进 name，避免被当作无效邮箱
      ...(contact ? (EMAIL_PATTERN.test(contact) ? { email: contact } : { name: contact }) : {}),
      source: input.source,
      tags: {
        feedback_source: input.source,
        attach_logs: String(input.attachLogs),
        ...(input.operationId ? { operation_id: input.operationId } : {}),
      },
    },
    { attachments },
  )
  // flush 返回 false 表示超时仍未发出；无法得知服务端是否拒收，以发出为准
  const sent = await Sentry.flush(12_000)
  if (!sent) return { ok: false, reason: 'timeout' }
  return { ok: true, eventId }
}
