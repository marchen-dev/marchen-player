/** 所有来源共用的播放器弹幕格式，平台原始响应不跨 IPC。 */
export interface CommentModel {
  cid: number
  m: string
  p: string
}
export interface CommentsData {
  count: number
  comments: CommentModel[]
}
export interface LinkIdentity {
  provider: string
  videoId: string
  canonicalUrl: string
}
interface EntryBase {
  source: string
  selected?: boolean
  content: CommentsData
}
export type DanmakuEntry =
  | (EntryBase & { type: 'auto' | 'local' })
  | (EntryBase & LinkIdentity & { type: 'link'; title: string; offsetSeconds: number })
export type LinkDanmakuEntry = Extract<DanmakuEntry, { type: 'link' }>
export interface LinkProgress {
  requestId: string
  stage: 'metadata' | 'comments'
  title?: string
  completed: number
  total?: number
  count: number
}
export interface LinkResult {
  identity: LinkIdentity
  title: string
  content: CommentsData
  skipped: number
  segments: number
}
export type LinkResponse = { ok: true; result: LinkResult } | { ok: false; message: string }
export const linkSourceId = (identity: LinkIdentity) =>
  `link:${identity.provider}:${identity.videoId}`
export function validateOffset(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 3600)
    throw new Error('时间偏移须在 -3600 到 3600 秒之间')
  return Math.round(value * 10) / 10
}
/** 原始数据永不改写，避免反复调整累加偏移；零秒之前的弹幕只在派生列表隐藏。 */
export function mergeSources(entries: DanmakuEntry[]): CommentModel[] {
  return entries
    .filter((entry) => entry.selected)
    .flatMap((entry) => {
      if (entry.type !== 'link') return entry.content.comments
      const offset = validateOffset(entry.offsetSeconds ?? 0)
      return entry.content.comments.flatMap((comment) => {
        const fields = comment.p.split(',')
        const time = Number(fields[0]) + offset
        if (!Number.isFinite(time) || time < 0) return []
        return [{ ...comment, p: [Math.round(time * 1000) / 1000, ...fields.slice(1)].join(',') }]
      })
    })
    .sort((a, b) => Number(a.p.split(',')[0]) - Number(b.p.split(',')[0]))
}
