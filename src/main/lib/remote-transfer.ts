import type { RemoteRangeSource } from '@marchen/shared/media/remote'

/** 只累加已接收字节，不复制数据，不额外请求；采样窗口约一秒。 */
export class RemoteTransferMeter {
  private received = 0
  private buckets = new Map<number, number>()
  constructor(private now = () => performance.now()) {}
  add(bytes: number) {
    this.received += bytes
    const bucket = Math.floor(this.now() / 250)
    this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + bytes)
    for (const key of this.buckets.keys()) if (key < bucket - 3) this.buckets.delete(key)
  }
  snapshot() {
    const bucket = Math.floor(this.now() / 250)
    let speed = 0
    for (const [key, bytes] of this.buckets) if (key > bucket - 4 && key <= bucket) speed += bytes
    return { received: this.received, speed }
  }
}

/** 包装在前缀缓存之前，缓存命中不计入网络流量，保留流的反压和取消。 */
export function trackRemoteTransfer(
  source: RemoteRangeSource,
  meter: RemoteTransferMeter,
): RemoteRangeSource {
  return {
    ...source,
    stream: async (...args) => {
      const reader = (await source.stream(...args)).getReader()
      return new ReadableStream<Uint8Array<ArrayBuffer>>(
        {
          async pull(controller) {
            try {
              const chunk = await reader.read()
              if (chunk.done) {
                reader.releaseLock()
                controller.close()
                return
              }
              meter.add(chunk.value.byteLength)
              controller.enqueue(chunk.value)
            } catch (error) {
              controller.error(error)
              await reader.cancel().catch(() => {})
              reader.releaseLock()
            }
          },
          async cancel(reason) {
            try {
              await reader.cancel(reason)
            } finally {
              reader.releaseLock()
            }
          },
        },
        { highWaterMark: 0 },
      )
    },
  }
}
