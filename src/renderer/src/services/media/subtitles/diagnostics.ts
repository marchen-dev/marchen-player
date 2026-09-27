import type { SubtitleSource } from './matroska'

interface SubtitleReadDiagnostic {
  phase: 'catalog' | 'text' | 'fonts'
  remote: boolean
  readCalls: number
  bytes: number
  elapsedMs: number
  status: 'loading' | 'completed' | 'cancelled' | 'failed'
}

// 仅保留内存中的有限诊断，不保存 URL、文件名或字幕内容。
const recent: SubtitleReadDiagnostic[] = []
export const getSubtitleReadDiagnostics = () => recent.map((entry) => ({ ...entry }))

export async function measureSubtitleRead<T>(
  phase: SubtitleReadDiagnostic['phase'],
  source: SubtitleSource,
  remote: boolean,
  action: (measured: SubtitleSource) => Promise<T>,
) {
  const started = performance.now()
  const diagnostic: SubtitleReadDiagnostic = {
    phase,
    remote,
    readCalls: 0,
    bytes: 0,
    elapsedMs: 0,
    status: 'loading',
  }
  recent.push(diagnostic)
  if (recent.length > 32) recent.shift()
  try {
    const result = await action({
      size: source.size,
      read: async (start, end, signal) => {
        diagnostic.readCalls++
        const bytes = await source.read(start, end, signal)
        diagnostic.bytes += bytes.byteLength
        diagnostic.elapsedMs = performance.now() - started
        return bytes
      },
    })
    diagnostic.status = 'completed'
    return result
  } catch (error) {
    diagnostic.status =
      error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed'
    throw error
  } finally {
    diagnostic.elapsedMs = performance.now() - started
  }
}
