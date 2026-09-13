import type { DB_Danmaku } from '@renderer/database/schemas/history'
import type { CommentModel } from '@renderer/request/models/comment'
import SparkMD5 from 'spark-md5'

// DOMParser/JSON.parse 在渲染线程执行，限制输入避免大文件长时间阻塞播放。
export const MAX_DANMAKU_FILE_SIZE = 10 * 1024 * 1024
const invalidFormat = () => new Error('弹幕格式不正确，请选择 B 站格式的 XML 或 JSON 文件')

const makeComment = (
  time: number,
  mode: number,
  color: number,
  text: unknown,
  id: number,
): CommentModel => {
  if (
    !Number.isFinite(time) ||
    time < 0 ||
    !Number.isInteger(mode) ||
    mode < 1 ||
    mode > 9 ||
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xFFFFFFFF ||
    !Number.isFinite(id) ||
    id < 0 ||
    typeof text !== 'string' ||
    !text.trim()
  ) {
    throw invalidFormat()
  }
  // 部分转换文件携带 ARGB 整数，播放颜色只取低 24 位 RGB。
  return {
    cid: id,
    m: text,
    p: `${time},${mode},#${(color & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()},${id}`,
  }
}

/** 两端共用 B 站格式转换；所有字段在进入播放和持久化流程前校验。 */
export function parseLocalDanmaku(text: string, extension: string): CommentModel[] {
  let comments: CommentModel[]
  try {
    if (extension === 'xml') {
      const document = new DOMParser().parseFromString(text, 'application/xml')
      if (document.querySelector('parsererror') || document.documentElement.tagName !== 'i') {
        throw invalidFormat()
      }
      comments = Array.from(document.documentElement.children)
        .filter((element) => element.tagName === 'd')
        .map((element) => {
          const values = element.getAttribute('p')?.split(',')
          if (!values || values.length < 5 || values.slice(0, 5).some((v) => !v.trim())) {
            throw invalidFormat()
          }
          const [time, mode, , color, timestamp] = values.map(Number)
          return makeComment(time, mode, color, element.textContent, timestamp)
        })
    } else if (extension === 'json') {
      const rows: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
      if (!Array.isArray(rows)) throw invalidFormat()
      comments = rows.map((row: unknown) => {
        if (!row || typeof row !== 'object') throw invalidFormat()
        const item = row as Record<string, unknown>
        const progress = item.progress ?? 0
        const id = item.ctime ?? item.id ?? 0
        if (
          typeof progress !== 'number' ||
          typeof item.mode !== 'number' ||
          typeof item.color !== 'number' ||
          typeof id !== 'number'
        )
          throw invalidFormat()
        return makeComment(progress / 1000, item.mode, item.color, item.content, id)
      })
    } else {
      throw invalidFormat()
    }
  } catch {
    throw invalidFormat()
  }
  if (!comments.length) throw new Error('文件中没有可导入的弹幕')
  return comments
}

// 文件名与内容标识分开：同内容改名仍可去重，同名不同内容可共存。
export const localDanmakuIdentity = (source: string) =>
  source.startsWith('local-file:') ? source.split('/')[0] : source

export async function readLocalDanmaku(file: File): Promise<DB_Danmaku> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'xml' && extension !== 'json') throw invalidFormat()
  if (file.size > MAX_DANMAKU_FILE_SIZE) throw new Error('弹幕文件不能超过 10 MB')
  const text = await file.text()
  const comments = parseLocalDanmaku(text, extension)
  return {
    type: 'local',
    selected: true,
    source: `local-file:${SparkMD5.hash(text)}/${encodeURIComponent(file.name)}`,
    content: { count: comments.length, comments },
  }
}
