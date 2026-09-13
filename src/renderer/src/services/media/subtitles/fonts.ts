import type { SubtitleSource } from './matroska'
import { AttachedFile, CustomSource, Input, MATROSKA } from 'mediabunny'
import { FONT_ATTACHMENT_BUDGET, preflightMatroskaAttachments } from './matroska'

export interface SubtitleFonts {
  urls: string[]
  warning?: string
  bytes: number
  close: () => void
}

/** 附件查询使用独立 Input，可取消释放元数据，不 dispose 播放者的共享来源。 */
export async function loadSubtitleFonts(
  source: SubtitleSource,
  signal?: AbortSignal,
): Promise<SubtitleFonts> {
  const urls: string[] = []
  const close = () => {
    for (const url of urls.splice(0)) URL.revokeObjectURL(url)
  }
  const fallback = (warning: string): SubtitleFonts => {
    close()
    return { urls, bytes: 0, warning, close }
  }
  let input: Input | undefined
  const onAbort = () => {
    input?.dispose()
    close()
  }
  signal?.throwIfAborted()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const preflight = await preflightMatroskaAttachments(source, signal)
    if (!preflight.allowed) return fallback('内嵌附件超过 32 MiB，已使用默认字体')
    if (!preflight.bytes) return { urls, bytes: 0, close }
    input = new Input({
      formats: [MATROSKA],
      source: new CustomSource({
        getSize: () => source.size,
        maxCacheSize: FONT_ATTACHMENT_BUDGET,
        read: async (start, end) => {
          signal?.throwIfAborted()
          if (end - start > FONT_ATTACHMENT_BUDGET) throw new Error('附件读取请求超过预算')
          const data = await source.read(start, end, signal)
          signal?.throwIfAborted()
          if (data.byteLength !== end - start) throw new Error('附件读取不完整')
          return data
        },
      }),
    })
    const tags = await input.getMetadataTags()
    signal?.throwIfAborted()
    let bytes = 0
    let rejected = false
    for (const file of Object.values(tags.raw ?? {})) {
      if (!(file instanceof AttachedFile)) continue
      if (
        !/\.(?:ttf|otf|ttc|woff2?)$/i.test(file.name ?? '') &&
        !/font|opentype/i.test(file.mimeType ?? '')
      )
        continue
      const signature = String.fromCharCode(...file.data.subarray(0, 4))
      if (!['\0\x01\0\0', 'OTTO', 'ttcf', 'wOFF', 'wOF2'].includes(signature)) {
        rejected = true
        continue
      }
      bytes += file.data.byteLength
      if (bytes > FONT_ATTACHMENT_BUDGET) return fallback('内嵌字体超过预算，已使用默认字体')
      urls.push(
        URL.createObjectURL(
          new Blob([new Uint8Array(file.data)], { type: 'application/octet-stream' }),
        ),
      )
    }
    return {
      urls,
      bytes,
      close,
      warning: rejected ? '部分内嵌字体无效，缺失字体使用默认字体' : undefined,
    }
  } catch {
    if (signal?.aborted) {
      close()
      signal.throwIfAborted()
    }
    return fallback('内嵌字体读取失败，已使用默认字体')
  } finally {
    input?.dispose()
    signal?.removeEventListener('abort', onAbort)
  }
}
