import type { RemoteRangeSource } from '@marchen/shared/media/remote'

export const REMOTE_PREFIX_SIZE = 16 * 1024 * 1024

/** 预算包含正在填充的前缀；不足时降级读取，不驱逐正在播放的来源。 */
export class RemotePrefixBudget {
  private used = 0
  constructor(private readonly limit = 64 * 1024 * 1024) {}
  reserve(size: number): (() => void) | undefined {
    if (this.used + size > this.limit) return
    this.used += size
    let released = false
    return () => {
      if (released) return
      released = true
      this.used -= size
    }
  }
}

const sharedBudget = new RemotePrefixBudget()

/** 只缓存完整识别前缀，其他范围保持反压与流式传输，不引入通用范围缓存。 */
export function cacheRemotePrefix(
  source: RemoteRangeSource,
  lifetime: AbortSignal,
  budget = sharedBudget,
): RemoteRangeSource {
  const length = Math.min(source.size, REMOTE_PREFIX_SIZE)
  let prefix: Uint8Array<ArrayBuffer> | undefined
  let release: (() => void) | undefined
  const clear = () => {
    prefix = undefined
    release?.()
    release = undefined
  }
  lifetime.addEventListener('abort', clear, { once: true })
  const stream: RemoteRangeSource['stream'] = async (start, end, caller) => {
    const signal = caller ? AbortSignal.any([lifetime, caller]) : lifetime
    signal.throwIfAborted()
    if (prefix && start < prefix.length) {
      // 不在流闭包中保留整个缓存，租约撤销即可释放；取消一个消费者不影响其他消费者。
      const consumer = new AbortController()
      const reading = AbortSignal.any([signal, consumer.signal])
      let offset = start
      let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined
      return new ReadableStream<Uint8Array<ArrayBuffer>>(
        {
          async pull(output) {
            try {
              reading.throwIfAborted()
              if (offset < Math.min(length, end)) {
                const next = Math.min(offset + 64 * 1024, length, end)
                output.enqueue(prefix!.slice(offset, next))
                offset = next
                return
              }
              if (offset === end) {
                output.close()
                return
              }
              // 跨过缓存边界后才建立上游请求，避免缓存返回期间占用连接额度。
              reader ??= (await source.stream(offset, end, reading)).getReader()
              const chunk = await reader.read()
              if (chunk.done) {
                reader.releaseLock()
                reader = undefined
                output.close()
              } else output.enqueue(chunk.value)
            } catch (error) {
              await reader?.cancel().catch(() => {})
              output.error(error)
            }
          },
          async cancel() {
            consumer.abort()
            await reader?.cancel().catch(() => {})
          },
        },
        { highWaterMark: 0 },
      )
    }
    // 只接住识别器的精确前缀请求；普通播放的大 Range 不触发额外下载。
    const reservation =
      start === 0 && end === length && !release ? budget.reserve(length) : undefined
    if (!reservation) return source.stream(start, end, signal)
    release = reservation
    let bytes: Uint8Array<ArrayBuffer> | undefined = new Uint8Array(length)
    let offset = 0
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>
    const discard = () => {
      bytes = undefined
      reservation()
      if (release === reservation) release = undefined
    }
    const abort = () => discard()
    signal.addEventListener('abort', abort, { once: true })
    try {
      reader = (await source.stream(start, end, signal)).getReader()
    } catch (error) {
      signal.removeEventListener('abort', abort)
      discard()
      throw error
    }
    return new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        async pull(output) {
          try {
            signal.throwIfAborted()
            const chunk = await reader.read()
            signal.throwIfAborted()
            if (chunk.done) {
              if (offset !== length) throw new Error('媒体前缀读取不完整')
              prefix = bytes
              bytes = undefined
              signal.removeEventListener('abort', abort)
              reader.releaseLock()
              output.close()
            } else {
              bytes!.set(chunk.value, offset)
              offset += chunk.value.byteLength
              output.enqueue(chunk.value)
            }
          } catch (error) {
            signal.removeEventListener('abort', abort)
            discard()
            await reader.cancel().catch(() => {})
            output.error(error)
          }
        },
        async cancel() {
          signal.removeEventListener('abort', abort)
          discard()
          await reader.cancel().catch(() => {})
        },
      },
      { highWaterMark: 0 },
    )
  }
  return {
    ...source,
    stream,
    close: () => {
      clear()
      lifetime.removeEventListener('abort', clear)
      source.close()
    },
  }
}
