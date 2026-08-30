import type { PlaybackError } from './types'

const getErrorName = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null || !('name' in value)) return
  return typeof value.name === 'string' ? value.name : undefined
}

export const isAutoplayBlocked = (cause: unknown): boolean =>
  getErrorName(cause) === 'NotAllowedError'

export const normalizePlayError = (cause: unknown): PlaybackError => {
  const name = getErrorName(cause)
  const message = cause instanceof Error ? cause.message : '播放失败'

  if (name === 'NotSupportedError') {
    return {
      code: 'not-supported',
      message: message || '当前环境不支持该媒体格式或编码',
      recoverable: false,
      cause,
    }
  }
  if (name === 'AbortError') {
    return { code: 'aborted', message: message || '播放请求已取消', recoverable: true, cause }
  }
  if (name === 'NotAllowedError') {
    return { code: 'unknown', message: message || '浏览器阻止了播放请求', recoverable: true, cause }
  }

  return { code: 'unknown', message, recoverable: true, cause }
}
