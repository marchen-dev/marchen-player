import type { DB_Danmaku } from '@renderer/database/schemas/history'
import type { CommentModel } from '@renderer/request/models/comment'
import SparkMD5 from 'spark-md5'

/** 可预期的文件校验拒绝，不作为运行异常上报。 */
export class LocalDanmakuValidationError extends Error {}
const invalidFormat = () =>
  new LocalDanmakuValidationError('弹幕格式不正确，请选择 B 站格式的 XML 或 JSON 文件')

const makeComment = (
  time: number,
  mode: number,
  color: number,
  text: unknown,
  id: number,
): CommentModel | null => {
  if (
    !Number.isFinite(time) ||
    time < 0 ||
    !Number.isInteger(mode) ||
    mode < 1 ||
    mode > 5 ||
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xFFFFFFFF ||
    !Number.isFinite(id) ||
    id < 0 ||
    typeof text !== 'string' ||
    !text.trim()
  )
    return null
  // 引擎支持普通滚动、顶部、底部；逆向和高级弹幕不能当作普通文本显示。
  return {
    cid: id,
    m: text,
    p: `${time},${mode},#${(color & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()},${id}`,
  }
}

/** 文件结构错误整份拒绝，条目错误只跳过；统计不写入历史记录。 */
export function parseLocalDanmaku(text: string, extension: string) {
  const comments: CommentModel[] = []
  let skippedCount = 0
  const append = (comment: CommentModel | null) => {
    if (comment) comments.push(comment)
    else skippedCount++
  }
  if (extension === 'xml') {
    const document = new DOMParser().parseFromString(text, 'application/xml')
    if (document.querySelector('parsererror') || document.documentElement.tagName !== 'i') {
      throw invalidFormat()
    }
    for (const element of Array.from(document.documentElement.children)) {
      // 元信息不是弹幕，不能算作跳过条目。
      if (element.tagName !== 'd') continue
      const values = element.getAttribute('p')?.split(',')
      if (!values || values.length < 5 || values.slice(0, 5).some((v) => !v.trim())) {
        append(null)
        continue
      }
      const [time, mode, , color, timestamp] = values.map(Number)
      append(makeComment(time, mode, color, element.textContent, timestamp))
    }
  } else if (extension === 'json') {
    let rows: unknown
    try {
      rows = JSON.parse(text.replace(/^\uFEFF/, ''))
    } catch (error) {
      if (error instanceof SyntaxError) throw invalidFormat()
      throw error
    }
    if (!Array.isArray(rows)) throw invalidFormat()
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        append(null)
        continue
      }
      const item = row as Record<string, unknown>
      const progress = item.progress ?? 0
      const id = item.ctime ?? item.id ?? 0
      if (
        typeof progress !== 'number' ||
        typeof item.mode !== 'number' ||
        typeof item.color !== 'number' ||
        typeof id !== 'number'
      ) {
        append(null)
        continue
      }
      append(makeComment(progress / 1000, item.mode, item.color, item.content, id))
    }
  } else {
    throw invalidFormat()
  }
  if (!comments.length) throw new LocalDanmakuValidationError('文件中没有可导入的弹幕')
  return { comments, skippedCount }
}

export async function readLocalDanmaku(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'xml' && extension !== 'json') throw invalidFormat()
  const text = await file.text()
  const { comments, skippedCount } = parseLocalDanmaku(text, extension)
  const entry: DB_Danmaku = {
    type: 'local',
    selected: true,
    source: `local-file:${SparkMD5.hash(text)}/${encodeURIComponent(file.name)}`,
    content: { count: comments.length, comments },
  }
  return { entry, skippedCount }
}
